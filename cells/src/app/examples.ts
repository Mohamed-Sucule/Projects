/* The workbooks it can open with. The first is what a visitor sees: a year of a shop's
   orders, priced by lookup from a product table, summed by region and by month with SUMIFS,
   with a few headline numbers worked out from those. Changing one price recalculates
   hundreds of cells, which is the point. */

import type { Format } from '../engine/sheet';

export type CellSpec = [row: number, col: number, input: string | null, format?: Format | null];

export interface Example {
  id: string;
  name: string;
  about: string;
  widths?: [number, number][];
  cells: () => CellSpec[];
}

/** A small seeded random number generator (mulberry32), so the example is the same every time. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money: Format = { code: '£#,##0.00' };
const head: Format = { bold: true };

const ORDERS = 2000;
const REGIONS = ['North', 'Midlands', 'South', 'Scotland', 'Wales', 'London'];
const PRODUCTS: [string, number, number][] = [
  ['Notebook', 4.5, 0.42],
  ['Pen set', 7.25, 0.55],
  ['Desk lamp', 32, 0.31],
  ['Backpack', 48, 0.36],
  ['Mug', 9.5, 0.6],
  ['Planner', 14, 0.47],
];

function shop(): CellSpec[] {
  const out: CellSpec[] = [];
  const rand = seeded(2025);
  const first = 4; // the first order's row, 1-based
  const last = first + ORDERS - 1;
  const put = (a1: string, input: string, format?: Format) => {
    const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
    let col = 0;
    for (const ch of m[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
    out.push([Number(m[2]) - 1, col - 1, input, format ?? null]);
  };

  put('A1', 'Shop sales, 2025', { bold: true });
  put(
    'A2',
    `${ORDERS.toLocaleString('en-GB')} orders. Change a price in column J and everything that depends on it recalculates.`,
    {
      italic: true,
    },
  );
  ['Date', 'Region', 'Product', 'Units', 'Price', 'Revenue', 'Profit'].forEach((h, i) =>
    put(`${'ABCDEFG'[i]}3`, h, i >= 3 ? { ...head, align: 'right' } : head),
  );

  // orders, in date order across the year
  for (let i = 0; i < ORDERS; i++) {
    const r = first + i;
    const day = Math.floor((i * 365) / ORDERS);
    const date = new Date(Date.UTC(2025, 0, 1 + day));
    put(`A${r}`, date.toISOString().slice(0, 10));
    put(`B${r}`, REGIONS[Math.floor(rand() * REGIONS.length)]!);
    put(`C${r}`, PRODUCTS[Math.floor(rand() * PRODUCTS.length)]![0]);
    put(`D${r}`, String(1 + Math.floor(rand() ** 2 * 40)));
    put(`E${r}`, `=VLOOKUP(C${r},$I$4:$K$9,2,FALSE)`, money);
    put(`F${r}`, `=D${r}*E${r}`, money);
    put(`G${r}`, `=F${r}*VLOOKUP(C${r},$I$4:$K$9,3,FALSE)`, money);
  }

  // the product table the prices come from
  put('I3', 'Product', head);
  put('J3', 'Price', { ...head, align: 'right' });
  put('K3', 'Margin', { ...head, align: 'right' });
  PRODUCTS.forEach(([name, price, margin], i) => {
    put(`I${4 + i}`, name);
    put(`J${4 + i}`, String(price), money);
    put(`K${4 + i}`, String(margin), { code: '0%' });
  });

  // by region
  const orders = (col: string) => `$${col}$${first}:$${col}$${last}`;
  put('M3', 'Region', head);
  put('N3', 'Revenue', { ...head, align: 'right' });
  put('O3', 'Orders', { ...head, align: 'right' });
  put('P3', 'Average order', { ...head, align: 'right' });
  REGIONS.forEach((region, i) => {
    const r = 4 + i;
    put(`M${r}`, region);
    put(`N${r}`, `=SUMIFS(${orders('F')},${orders('B')},M${r})`, money);
    put(`O${r}`, `=COUNTIF(${orders('B')},M${r})`);
    put(`P${r}`, `=N${r}/O${r}`, money);
  });
  put('M10', 'Total', head);
  put('N10', '=SUM(N4:N9)', { ...money, bold: true });
  put('O10', '=SUM(O4:O9)', { bold: true });
  put('P10', '=N10/O10', { ...money, bold: true });

  // by month
  put('M12', 'Month', head);
  put('N12', 'Revenue', { ...head, align: 'right' });
  put('O12', 'Profit', { ...head, align: 'right' });
  for (let m = 1; m <= 12; m++) {
    const r = 12 + m;
    put(`M${r}`, `=DATE(2025,${m},1)`, { code: 'mmm yyyy', align: 'left' });
    const within = `${orders('A')},">="&M${r},${orders('A')},"<"&EDATE(M${r},1)`;
    put(`N${r}`, `=SUMIFS(${orders('F')},${within})`, money);
    put(`O${r}`, `=SUMIFS(${orders('G')},${within})`, money);
  }

  // headlines
  put('M26', 'Best month', head);
  put('N26', '=INDEX(M13:M24,MATCH(MAX(N13:N24),N13:N24,0))', { code: 'mmmm', align: 'right' });
  put('M27', 'Top region', head);
  put('N27', '=INDEX(M4:M9,MATCH(MAX(N4:N9),N4:N9,0))', { align: 'right' });
  put('M28', 'Largest order', head);
  put('N28', `=MAX(${orders('F')})`, money);
  put('M29', 'Orders over £500', head);
  put('N29', `=COUNTIF(${orders('F')},">500")`);
  put('M30', 'Profit margin', head);
  put('N30', `=SUM(${orders('G')})/SUM(${orders('F')})`, { code: '0.0%' });
  return out;
}

function budget(): CellSpec[] {
  const rows: [string, string, string?][] = [
    ['Monthly budget', ''],
    ['', ''],
    ['Income', ''],
    ['Salary', '2650'],
    ['Side work', '320'],
    ['Total income', '=SUM(B4:B5)'],
    ['', ''],
    ['Spending', ''],
    ['Rent', '950'],
    ['Bills', '=145+38+22'],
    ['Food', '410'],
    ['Travel', '120'],
    ['Phone and internet', '49'],
    ['Going out', '180'],
    ['Total spending', '=SUM(B9:B14)'],
    ['', ''],
    ['Left over', '=B6-B15'],
    ['Saved over a year', '=B17*12'],
    ['Share of income saved', '=IF(B6=0,0,B17/B6)'],
  ];
  const out: CellSpec[] = [];
  rows.forEach(([label, value], r) => {
    const bold = /^(Monthly budget|Income|Spending|Total|Left over)/.test(label);
    if (label) out.push([r, 0, label, bold ? { bold: true } : null]);
    if (value)
      out.push([r, 1, value, r === 18 ? { code: '0.0%', bold } : { code: '£#,##0.00', bold }]);
  });
  return out;
}

function stress(): CellSpec[] {
  const n = 100_000;
  const out: CellSpec[] = [
    [0, 3, 'A hundred thousand numbers in A, and a formula for each in B.', { bold: true }],
    [1, 3, 'Change A1 and all 100,000 formulas in B, and the total below, recalculate.'],
    [3, 3, 'Total of B', { bold: true }],
    [3, 4, '=SUM(B:B)'],
    [4, 3, 'Formulas', { bold: true }],
    [4, 4, '=COUNT(B:B)'],
  ];
  for (let r = 0; r < n; r++) {
    out.push([r, 0, r === 0 ? '1' : `=A${r}+1`]);
    out.push([r, 1, `=A${r + 1}*2`]);
  }
  return out;
}

export const EXAMPLES: Example[] = [
  {
    id: 'shop',
    name: 'Shop sales',
    about: 'A year of orders, priced by lookup and summed by region and month',
    widths: [
      [0, 92],
      [1, 84],
      [2, 96],
      [3, 60],
      [4, 76],
      [5, 92],
      [6, 88],
      [7, 28],
      [8, 92],
      [9, 70],
      [10, 66],
      [11, 28],
      [12, 120],
      [13, 104],
      [14, 92],
      [15, 116],
    ],
    cells: shop,
  },
  {
    id: 'budget',
    name: 'Monthly budget',
    about: 'Income and spending, and what is left over',
    widths: [
      [0, 180],
      [1, 110],
    ],
    cells: budget,
  },
  {
    id: 'stress',
    name: '200,000 formulas',
    about: 'A chain of 100,000 formulas and 100,000 more that read it',
    widths: [
      [3, 120],
      [4, 120],
    ],
    cells: stress,
  },
  { id: 'blank', name: 'Blank sheet', about: 'Nothing at all', cells: () => [] },
];
