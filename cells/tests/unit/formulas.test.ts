import { describe, expect, it } from 'vitest';
import { calc, code } from './helpers';

describe('operators', () => {
  it.each([
    ['=1+2*3', 7],
    ['=(1+2)*3', 9],
    ['=-2^2', 4], // negation binds tighter than ^, as in Excel
    ['=2^3^2', 64], // ^ is left-associative, as in Excel
    ['=2^-1', 0.5],
    ['=10%', 0.1],
    ['=50%*4', 2],
    ['=7/2', 3.5],
    ['=1=1', true],
    ['=1<>1', false],
    ['="a"<"B"', true],
    ['=2<"1"', true], // numbers sort before text
    ['="a"&1+2', 'a3'],
    ['="x"&TRUE', 'xTRUE'],
    ['=0.1+0.2=0.3', false],
    ['="3"+1', 4],
    ['=TRUE+TRUE', 2],
  ])('%s is %s', (f, expected) => {
    expect(calc(f)).toBe(expected);
  });

  it.each([
    ['=1/0', '#DIV/0!'],
    ['="a"+1', '#VALUE!'],
    ['=NOSUCHFUNCTION(1)', '#NAME?'],
    ['=undefinedname', '#NAME?'],
    ['=SQRT(-1)', '#NUM!'],
    ['=1+', '#ERROR!'],
    ['=SUM(1,2', '#ERROR!'],
    ['=#N/A+1', '#N/A'],
    ['=10^400', '#NUM!'],
  ])('%s is %s', (f, expected) => {
    expect(code(calc(f))).toBe(expected);
  });

  it('reads an empty cell as 0 to arithmetic and "" to text', () => {
    expect(calc('=A1+1')).toBe(1);
    expect(calc('=A1&"x"')).toBe('x');
    expect(calc('=A1')).toBe(0);
    expect(calc('=A1=""')).toBe(true);
    expect(calc('=A1=0')).toBe(true);
  });

  it('treats a reference as a reference, so SUM skips text in it', () => {
    expect(calc('=SUM(A1)', { A1: 'abc' })).toBe(0);
    expect(code(calc('=SUM("abc")'))).toBe('#VALUE!');
    expect(calc('=SUM("3", TRUE, A1:A2)', { A1: '4', A2: 'x' })).toBe(8);
  });
});

describe('functions', () => {
  const data = {
    A1: '10',
    A2: '20',
    A3: '30',
    A4: 'text',
    A5: 'TRUE',
    B1: 'apple',
    B2: 'banana',
    B3: 'Apricot',
  };

  it.each([
    ['=SUM(A1:A5)', 60],
    ['=AVERAGE(A1:A5)', 20],
    ['=COUNT(A1:A5)', 3],
    ['=COUNTA(A1:A5)', 5],
    ['=COUNTBLANK(A1:A6)', 1],
    ['=MIN(A1:A3)', 10],
    ['=MAX(A1:A3, 99)', 99],
    ['=MEDIAN(A1:A3, 100)', 25],
    ['=PRODUCT(A1:A2)', 200],
    ['=ROUND(STDEV(A1:A3), 6)', 10],
    ['=VAR.P(A1:A3)', 200 / 3],
    ['=LARGE(A1:A3, 1)', 30],
    ['=SMALL(A1:A3, 2)', 20],
    ['=RANK(20, A1:A3)', 2],
    ['=SUMPRODUCT(A1:A3, A1:A3)', 1400],
    ['=COUNTIF(A1:A5, ">15")', 2],
    ['=COUNTIF(B1:B3, "a*")', 2],
    ['=COUNTIF(B1:B3, "?????")', 1],
    ['=COUNTIF(B1:B9, "")', 6],
    ['=COUNTIF(B1:B9, "<>")', 3],
    ['=SUMIF(A1:A3, "<>20")', 40],
    ['=SUMIF(B1:B3, "a*", A1:A3)', 40],
    ['=SUMIFS(A1:A3, B1:B3, "a*", A1:A3, ">10")', 30],
    ['=COUNTIFS(B1:B3, "a*", A1:A3, "<30")', 1],
    ['=AVERAGEIF(B1:B3, "a*", A1:A3)', 20],
    ['=MAXIFS(A1:A3, B1:B3, "a*")', 30],
  ])('%s is %s', (f, expected) => {
    expect(calc(f, data)).toBeCloseTo(expected, 10);
  });

  it.each([
    ['=AVERAGE(A9:A10)', '#DIV/0!'],
    ['=MOD(1, 0)', '#DIV/0!'],
    ['=SUM(A1, 1/0)', '#DIV/0!'],
    ['=COUNT(1/0, 2)', 1],
  ])('%s is %s', (f, expected) => {
    expect(code(calc(f))).toBe(expected);
  });

  it.each([
    ['=ROUND(2.5, 0)', 3],
    ['=ROUND(-2.5, 0)', -3],
    ['=ROUND(1.005, 2)', 1.01],
    ['=ROUND(1234.5, -2)', 1200],
    ['=ROUNDUP(2.31, 1)', 2.4],
    ['=ROUNDDOWN(-2.39, 1)', -2.3],
    ['=INT(-1.5)', -2],
    ['=TRUNC(-1.5)', -1],
    ['=MOD(-3, 2)', 1], // the sign of the divisor
    ['=MOD(3, -2)', -1],
    ['=POWER(2, 10)', 1024],
    ['=CEILING(2.1, 0.5)', 2.5],
    ['=FLOOR(2.9, 1)', 2],
    ['=MROUND(7, 3)', 6],
    ['=ABS(-4)', 4],
    ['=SIGN(-0.1)', -1],
    ['=LOG(8, 2)', 3],
    ['=LOG10(1000)', 3],
  ])('%s is %s', (f, expected) => {
    expect(calc(f)).toBeCloseTo(expected, 10);
  });

  it.each([
    ['=IF(1>2, "yes", "no")', 'no'],
    ['=IF(TRUE, , "no")', 0],
    ['=IF(FALSE, 1)', false],
    ['=IF(1, 1/0, 2)', '#DIV/0!'],
    ['=IF(0, 1/0, 2)', 2], // the branch not taken is never worked out
    ['=IFERROR(1/0, "safe")', 'safe'],
    ['=IFNA(NA(), "none")', 'none'],
    ['=IFS(1>2, "a", 2>1, "b")', 'b'],
    ['=AND(TRUE, 1, A1:A2)', true],
    ['=OR(FALSE, 0)', false],
    ['=XOR(TRUE, TRUE, TRUE)', true],
    ['=NOT(0)', true],
    ['=SWITCH(2, 1, "one", 2, "two", "other")', 'two'],
    ['=SWITCH(9, 1, "one", "other")', 'other'],
    ['=CHOOSE(2, "a", "b", "c")', 'b'],
    ['=ISBLANK(C9)', true],
    ['=ISNUMBER("1")', false],
    ['=ISERR(NA())', false],
    ['=ISEVEN(-4)', true],
  ])('%s is %s', (f, expected) => {
    expect(code(calc(f, { A1: '1', A2: 'TRUE' }))).toBe(expected);
  });

  it.each([
    ['=LEN("héllo")', 5],
    ['=LEN("👍🏽")', 2],
    ['=LEFT("abc")', 'a'],
    ['=RIGHT("abc", 2)', 'bc'],
    ['=MID("abcdef", 2, 3)', 'bcd'],
    ['=UPPER("abc")', 'ABC'],
    ['=PROPER("o\'brien and smith")', "O'Brien And Smith"],
    ['=TRIM("  a   b ")', 'a b'],
    ['=SUBSTITUTE("a-b-c", "-", "+")', 'a+b+c'],
    ['=SUBSTITUTE("a-b-c", "-", "+", 2)', 'a-b+c'],
    ['=REPLACE("abcdef", 2, 3, "X")', 'aXef'],
    ['=FIND("b", "abcb")', 2],
    ['=FIND("b", "abcb", 3)', 4],
    ['=SEARCH("B?", "abcb")', 2],
    ['=REPT("ab", 3)', 'ababab'],
    ['=EXACT("a", "A")', false],
    ['=VALUE("1,234.5")', 1234.5],
    ['=TEXT(1234.567, "#,##0.00")', '1,234.57'],
    ['=TEXT(0.256, "0.0%")', '25.6%'],
    ['=TEXT(DATE(2025,3,14), "dddd d mmmm yyyy")', 'Friday 14 March 2025'],
    ['=CONCAT("a", A1:B2, "z")', 'a12ABz'],
    ['=TEXTJOIN(", ", TRUE, A1:B2, "", "end")', '1, 2, A, B, end'],
    ['=CHAR(65)&CODE("a")', 'A97'],
  ])('%s is %s', (f, expected) => {
    expect(code(calc(f, { A1: '1', B1: '2', A2: 'A', B2: 'B' }))).toBe(expected);
  });

  it.each([
    ['=DATE(2025, 3, 14)', 45_730],
    ['=DATE(2025, 13, 1)', 46_023], // months overflow into the next year
    ['=DATE(2025, 3, 0)', 45_716], // day 0 is the last day of the month before
    ['=YEAR(45730)&"-"&MONTH(45730)&"-"&DAY(45730)', '2025-3-14'],
    ['=WEEKDAY(45730)', 6],
    ['=WEEKDAY(45730, 2)', 5],
    ['=EDATE(DATE(2025,1,31), 1)', 45_716], // 28 February
    ['=EOMONTH(DATE(2024,2,10), 0)', 45_351], // 29 February in a leap year
    ['=DAYS(DATE(2025,12,25), DATE(2025,3,14))', 286],
    ['=TODAY()', 45_730],
    ['=HOUR(NOW())', 12],
  ])('%s is %s', (f, expected) => {
    expect(calc(f)).toBe(expected);
  });
});

describe('lookups', () => {
  const table = {
    A1: '1',
    B1: 'one',
    A2: '5',
    B2: 'five',
    A3: '10',
    B3: 'ten',
    A4: '20',
    B4: 'twenty',
    D1: 'Banana',
    D2: 'apple',
    D3: 'cherry',
  };

  it.each([
    ['=VLOOKUP(10, A1:B4, 2, FALSE)', 'ten'],
    ['=VLOOKUP(7, A1:B4, 2)', 'five'], // approximate: the last value not over 7
    ['=VLOOKUP(99, A1:B4, 2)', 'twenty'],
    ['=VLOOKUP(0, A1:B4, 2)', '#N/A'],
    ['=VLOOKUP(7, A1:B4, 2, FALSE)', '#N/A'],
    ['=VLOOKUP(1, A1:B4, 3, FALSE)', '#REF!'],
    ['=HLOOKUP("apple", D2:D3, 2, FALSE)', 'cherry'],
    ['=MATCH(10, A1:A4, 0)', 3],
    ['=MATCH(11, A1:A4)', 3],
    ['=MATCH("APPLE", D1:D3, 0)', 2],
    ['=MATCH("ch*", D1:D3, 0)', 3],
    ['=INDEX(A1:B4, 2, 2)', 'five'],
    ['=INDEX(B1:B4, 4)', 'twenty'],
    ['=SUM(INDEX(A1:B4, 0, 1))', 36],
    ['=INDEX(A1:B4, 5, 1)', '#REF!'],
    ['=XLOOKUP(20, A1:A4, B1:B4)', 'twenty'],
    ['=XLOOKUP(7, A1:A4, B1:B4, "none")', 'none'],
    ['=XLOOKUP(7, A1:A4, B1:B4, , -1)', 'five'],
    ['=XLOOKUP(7, A1:A4, B1:B4, , 1)', 'ten'],
    ['=XLOOKUP("*rr*", D1:D3, A1:A3, , 2)', 10],
    ['=ROWS(A1:B4)*COLUMNS(A1:B4)', 8],
    ['=ROW()&","&COLUMN(C7)', '1,3'],
  ])('%s is %s', (f, expected) => {
    expect(code(calc(f, table))).toBe(expected);
  });
});
