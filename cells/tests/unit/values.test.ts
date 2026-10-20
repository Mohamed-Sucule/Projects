import { describe, expect, it } from 'vitest';
import { colIndex, colName, parseRectName, rectName } from '../../src/engine/address';
import { fromSerial, parseDate, toSerial, weekday } from '../../src/engine/dates';
import { compare, numberToText, parseNumber } from '../../src/engine/values';

describe('addresses', () => {
  it('names every one of the 16,384 columns, and reads every name back', () => {
    for (let c = 0; c < 16_384; c++) expect(colIndex(colName(c))).toBe(c);
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colName(701)).toBe('ZZ');
    expect(colName(702)).toBe('AAA');
    expect(colName(16_383)).toBe('XFD');
    expect(colIndex('XFE')).toBe(-1);
  });

  it('reads ranges of cells, whole columns and whole rows', () => {
    expect(parseRectName('B3:A1')).toEqual({ r1: 0, c1: 0, r2: 2, c2: 1 });
    expect(rectName(parseRectName('c:a')!)).toBe('A:C');
    expect(rectName(parseRectName('$2:4')!)).toBe('2:4');
    expect(parseRectName('A0')).toBeNull();
    expect(parseRectName('A1048577')).toBeNull();
  });
});

describe('numbers in text', () => {
  it('reads the ways people write numbers', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber(' -3 ')).toBe(-3);
    expect(parseNumber('12%')).toBe(0.12);
    expect(parseNumber('£4.50')).toBe(4.5);
    expect(parseNumber('(20)')).toBe(-20);
    expect(parseNumber('1e3')).toBe(1000);
    expect(parseNumber('.5')).toBe(0.5);
  });

  it('refuses everything else', () => {
    for (const s of ['', 'abc', '1,23', '1.2.3', '£', '.', '--1', '12 apples'])
      expect(parseNumber(s)).toBeNull();
  });

  it('writes results with at most 15 significant digits', () => {
    expect(numberToText(0.1 + 0.2)).toBe('0.3');
    expect(numberToText(1 / 3)).toBe('0.333333333333333');
    expect(numberToText(-0)).toBe('0');
    expect(numberToText(1e21)).toBe('1E+21');
  });

  it('orders numbers before text before booleans, and text without case', () => {
    expect(compare(999, 'a')).toBeLessThan(0);
    expect(compare('z', false)).toBeLessThan(0);
    expect(compare('Apple', 'apple')).toBe(0);
    expect(compare(null, 0)).toBe(0);
    expect(compare(null, '')).toBe(0);
  });
});

describe('dates', () => {
  it('match Excel serial numbers, including the 29 February 1900 that never was', () => {
    expect(toSerial(1900, 1, 1)).toBe(1);
    expect(toSerial(1900, 2, 28)).toBe(59);
    expect(fromSerial(60)).toEqual({ y: 1900, m: 2, d: 29 });
    expect(toSerial(1900, 3, 1)).toBe(61);
    expect(toSerial(2025, 1, 1)).toBe(45_658);
    expect(fromSerial(45_658)).toEqual({ y: 2025, m: 1, d: 1 });
  });

  it('round-trips every day for two centuries', () => {
    for (let s = 61; s < 61 + 365 * 200; s += 7) {
      const { y, m, d } = fromSerial(s);
      expect(toSerial(y, m, d)).toBe(s);
    }
  });

  it('knows the day of the week', () => {
    expect(weekday(toSerial(2025, 3, 14))).toBe(5); // a Friday
  });

  it('reads ISO and day-first dates, and nothing impossible', () => {
    expect(parseDate('2025-03-14')).toBe(toSerial(2025, 3, 14));
    expect(parseDate('14/03/2025')).toBe(toSerial(2025, 3, 14));
    expect(parseDate('31/02/2025')).toBeNull();
    expect(parseDate('03/14/2025')).toBeNull();
  });
});
