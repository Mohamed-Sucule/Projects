import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseRectName } from '../../src/engine/address';
import { parseCSV, parseTSV, writeCSV, writeTSV } from '../../src/engine/delimited';
import { fill } from '../../src/engine/fill';
import { adjustDecimals, formatValue, general } from '../../src/engine/format';
import { toSerial } from '../../src/engine/dates';
import { sheetOf } from './helpers';

const filled = (cells: Record<string, string>, src: string, target: string) => {
  const s = sheetOf(cells);
  return fill(s, parseRectName(src)!, parseRectName(target)!).map((c) => c.input);
};

describe('the fill handle', () => {
  it('continues a trend of numbers, either way', () => {
    expect(filled({ A1: '1', A2: '2' }, 'A1:A2', 'A1:A5')).toEqual(['3', '4', '5']);
    expect(filled({ A1: '10', A2: '20', A3: '35' }, 'A1:A3', 'A1:A4')).toEqual([
      '46.6666666666667',
    ]); // least squares, as Excel
    expect(filled({ A3: '5', A4: '7' }, 'A3:A4', 'A1:A4')).toEqual(['1', '3']); // A1, A2
    expect(filled({ A1: '0.1', A2: '0.2' }, 'A1:A2', 'A1:A3')).toEqual(['0.3']);
  });

  it('copies a single number, but counts on a single date', () => {
    expect(filled({ A1: '7' }, 'A1', 'A1:A3')).toEqual(['7', '7']);
    const day = toSerial(2025, 3, 14);
    expect(filled({ A1: '14/03/2025' }, 'A1', 'A1:A3')).toEqual([String(day + 1), String(day + 2)]);
  });

  it('counts on text that ends in a number, keeping its zeros', () => {
    expect(filled({ A1: 'Q1' }, 'A1', 'A1:D1')).toEqual(['Q2', 'Q3', 'Q4']);
    expect(filled({ A1: 'Week 08' }, 'A1', 'A1:A3')).toEqual(['Week 09', 'Week 10']);
    expect(filled({ A1: 'Item 2', A2: 'Item 4' }, 'A1:A2', 'A1:A4')).toEqual(['Item 6', 'Item 8']);
  });

  it('follows the calendar', () => {
    expect(filled({ A1: 'Fri' }, 'A1', 'A1:A4')).toEqual(['Sat', 'Sun', 'Mon']);
    expect(filled({ A1: 'NOVEMBER' }, 'A1', 'A1:A3')).toEqual(['DECEMBER', 'JANUARY']);
    expect(filled({ A1: 'Jan', A2: 'Mar' }, 'A1:A2', 'A1:A4')).toEqual(['May', 'Jul']);
  });

  it('copies formulas with their references moved, and repeats anything else', () => {
    expect(filled({ A1: '1', B1: '=A1*2' }, 'B1', 'B1:B3')).toEqual(['=A2*2', '=A3*2']);
    expect(filled({ A1: '=$C$1+C1' }, 'A1', 'A1:C1')).toEqual(['=$C$1+D1', '=$C$1+E1']);
    expect(filled({ A1: 'x', A2: 'y' }, 'A1:A2', 'A1:A5')).toEqual(['x', 'y', 'x']);
  });
});

describe('CSV and the clipboard', () => {
  it('reads quoted fields with commas, quotes and line breaks in them', () => {
    expect(parseCSV('a,"b,c","say ""hi""","two\nlines"\r\n1,2,3,4')).toEqual([
      ['a', 'b,c', 'say "hi"', 'two\nlines'],
      ['1', '2', '3', '4'],
    ]);
    expect(parseCSV('﻿name,age\nAda,36\n')).toEqual([
      ['name', 'age'],
      ['Ada', '36'],
    ]);
  });

  it('reads tab-separated text the way Excel puts it on the clipboard', () => {
    expect(parseTSV('1\t2\n3\t"multi\nline"\n')).toEqual([
      ['1', '2'],
      ['3', 'multi\nline'],
    ]);
  });

  it('writes what it reads', () => {
    const field = fc.string({ unit: fc.constantFrom('a', 'b', ',', '"', '\n', '\t', ' ', 'é') });
    const row = fc
      .array(field, { minLength: 1, maxLength: 4 })
      .filter((r) => !(r.length === 1 && r[0] === ''));
    fc.assert(
      fc.property(fc.array(row, { minLength: 1, maxLength: 5 }), (rows) => {
        expect(parseCSV(writeCSV(rows))).toEqual(rows);
        expect(parseTSV(writeTSV(rows))).toEqual(rows);
      }),
    );
  });
});

describe('number formats', () => {
  it.each([
    [1234.5, '#,##0.00', '1,234.50'],
    [-1234.5, '#,##0.00', '-1,234.50'],
    [0.5, '0%', '50%'],
    [0.125, '0.0%', '12.5%'],
    [4.5, '£#,##0.00', '£4.50'],
    [-4.5, '£#,##0.00;(£#,##0.00)', '(£4.50)'],
    [1234567, '#,##0,', '1,235'],
    [7, '000', '007'],
    [3.1, '0.##', '3.1'],
    [3, '0.##', '3'],
    [0, '0.00;-0.00;"zero"', 'zero'],
    [12, '0 "items"', '12 items'],
    [toSerial(2025, 3, 14), 'dd/mm/yyyy', '14/03/2025'],
    [toSerial(2025, 3, 14), 'ddd d mmm yy', 'Fri 14 Mar 25'],
    [toSerial(2025, 3, 14) + 0.75, 'hh:mm', '18:00'],
    [toSerial(2025, 3, 14) + 0.75, 'h:mm AM/PM', '6:00 PM'],
  ])('%s as %s is %s', (n, c, expected) => {
    expect(formatValue(n, c)).toBe(expected);
  });

  it('shows General numbers in about eleven characters', () => {
    expect(general(1 / 3)).toBe('0.333333333');
    expect(general(123456789012)).toBe('1.23457E+11');
    expect(general(2.5)).toBe('2.5');
    expect(general(-17)).toBe('-17');
  });

  it('adds and takes away decimal places', () => {
    expect(adjustDecimals(null, 1, 2.5)).toBe('0.00');
    expect(adjustDecimals('#,##0.00', 1, 0)).toBe('#,##0.000');
    expect(adjustDecimals('#,##0.0', -1, 0)).toBe('#,##0');
    expect(adjustDecimals('0%', 1, 0)).toBe('0.0%');
  });
});
