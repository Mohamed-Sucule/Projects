/* The sheet: its cells, the graph of which formula reads which cell, and recalculation.

   Storage is sparse, a map per column, so an empty sheet of 1,048,576 × 16,384 cells costs
   nothing and a column's cells can be walked in order without visiting its empty rows.

   Recalculation is incremental. When cells change, the graph gives every formula downstream
   of them, and only those are worked out again, each after everything it reads (a
   topological order, found with Tarjan's algorithm). The same pass finds circular
   references: any group of formulas that read each other is a strongly connected component,
   and every member gets #CYCLE! instead of looping.

   Ranges are indexed by the lines they cover, not cell by cell: =SUM(A:A) is one entry
   against column A, not a million. A tall range is filed under its columns and a wide one
   under its rows, whichever is fewer. */

import { cellKey, colOf, contains, rowOf, type Rect } from './address';
import { nowSerial, parseDate } from './dates';
import { evaluate, finish, isVolatile, references } from './evaluate';
import { formatValue } from './format';
import { lex, readRef } from './lexer';
import { parse, type Node } from './parser';
import type { Env, Source } from './range';
import {
  colsChanged,
  deletion,
  insertion,
  remap,
  rewrite,
  rowsChanged,
  type Remap,
} from './rewrite';
import {
  ERROR_CODES,
  MAX_COLS,
  MAX_ROWS,
  err,
  isError,
  numberToText,
  parseNumber,
  type ErrorCode,
  type Scalar,
} from './values';

export interface Format {
  /** an Excel number format code; absent means General */
  code?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface Formula {
  node: Node | null;
  /** why it would not parse, for the formula bar */
  error: string | null;
  volatile: boolean;
  refs: [number, number, number, number][];
  /** where the formula is, as a cell key */
  key: number;
  /** scratch for a recalculation: which pass last reached this formula, and its number in it */
  mark: number;
  slot: number;
}

export interface Cell {
  /** text or a formula as typed (with its "="); null when the value says it all */
  input: string | null;
  value: Scalar;
  formula: Formula | null;
  format: Format | null;
}

/**
 * One cell's new contents. `input` undefined leaves the contents alone and null clears them;
 * `format` undefined leaves the format alone and null clears it.
 */
export interface Change {
  row: number;
  col: number;
  input?: string | null;
  format?: Format | null;
}

export type Structure = {
  kind: 'insertRows' | 'deleteRows' | 'insertCols' | 'deleteCols';
  at: number;
  count: number;
};

export const inverseOf = (s: Structure): Structure => ({
  ...s,
  kind: (
    {
      insertRows: 'deleteRows',
      deleteRows: 'insertRows',
      insertCols: 'deleteCols',
      deleteCols: 'insertCols',
    } as const
  )[s.kind],
});

interface Span {
  a: number;
  b: number;
  owner: Cell;
}

/** A column's cells, with their rows kept in order for walking. */
class Column {
  readonly cells = new Map<number, Cell>();
  // the rows in order, and their cells in the same order, worked out again only after rows
  // are added in bulk: a SUM down 100,000 rows walks the arrays without a lookup per cell
  private order: number[] | null = [];
  private list: Cell[] | null = [];

  sorted(): number[] {
    this.order ??= [...this.cells.keys()].sort((a, b) => a - b);
    return this.order;
  }
  inOrder(): Cell[] {
    this.list ??= this.sorted().map((r) => this.cells.get(r)!);
    return this.list;
  }
  put(row: number, cell: Cell, bulk = false) {
    const had = this.cells.get(row);
    this.cells.set(row, cell);
    if (had === cell) return;
    if (!this.order || bulk) {
      this.order = this.list = null;
      return;
    }
    const i = lowerBound(this.order, row);
    if (had) {
      if (this.list) this.list[i] = cell;
      return;
    }
    this.order.splice(i, 0, row);
    this.list?.splice(i, 0, cell);
  }
  remove(row: number) {
    if (!this.cells.delete(row) || !this.order) return;
    const i = lowerBound(this.order, row);
    this.order.splice(i, 1);
    this.list?.splice(i, 1);
  }
}

/** The first index whose value is not less than x. */
export function lowerBound(a: readonly number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface RecalcStats {
  /** how many formulas were worked out */
  evaluated: number;
  ms: number;
}

export class Sheet implements Source {
  private readonly columns = new Map<number, Column>();
  /* Which formulas read which cells: those that read a single cell by column and then row,
     and those that read a range by the columns (or, for a wide range, the rows) it covers.
     They hold the formulas' cells themselves, so following an edge needs no lookup. */
  private readonly single = new Map<number, Map<number, Set<Cell>>>();
  private readonly byCol = new Map<number, Span[]>();
  private readonly byRow = new Map<number, Span[]>();
  private readonly formulas = new Set<number>();
  private readonly volatiles = new Set<number>();
  /** parsed trees by their relative form, so a filled-down column shares one tree */
  private readonly trees = new Map<string, Node>();

  /** column widths in pixels, kept here so they move with inserted and deleted columns */
  readonly widths = new Map<number, number>();
  /** bumped on every change, for anything that caches what it drew */
  version = 0;
  last: RecalcStats = { evaluated: 0, ms: 0 };
  /** how many recalculations there have been, to tell this one's marks from old ones */
  private passes = 0;

  random: () => number = Math.random;
  clock: () => Date = () => new Date();

  // ── reading ───────────────────────────────────────────────────────────

  cell(row: number, col: number): Cell | undefined {
    return this.columns.get(col)?.cells.get(row);
  }

  value(row: number, col: number): Scalar {
    return this.columns.get(col)?.cells.get(row)?.value ?? null;
  }

  each(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    visit: (v: Scalar, row: number, col: number) => void,
  ) {
    const width = c2 - c1 + 1;
    const visitColumn = (c: number, column: Column) => {
      if (r2 - r1 < 16) {
        for (let r = r1; r <= r2; r++) {
          const cell = column.cells.get(r);
          if (cell && cell.value !== null) visit(cell.value, r, c);
        }
        return;
      }
      const rows = column.sorted();
      const list = column.inOrder();
      for (let i = lowerBound(rows, r1); i < rows.length && rows[i]! <= r2; i++) {
        const v = list[i]!.value;
        if (v !== null) visit(v, rows[i]!, c);
      }
    };
    if (width > this.columns.size) {
      const cols = [...this.columns.keys()].filter((c) => c >= c1 && c <= c2).sort((a, b) => a - b);
      for (const c of cols) visitColumn(c, this.columns.get(c)!);
    } else {
      for (let c = c1; c <= c2; c++) {
        const column = this.columns.get(c);
        if (column) visitColumn(c, column);
      }
    }
  }

  rowsIn(col: number, r1: number, r2: number): number[] {
    const column = this.columns.get(col);
    if (!column) return [];
    const rows = column.sorted();
    const list = column.inOrder();
    const out: number[] = [];
    for (let i = lowerBound(rows, r1); i < rows.length && rows[i]! <= r2; i++) {
      if (list[i]!.value !== null) out.push(rows[i]!);
    }
    return out;
  }

  /** The columns that hold something in a row, in order: for Ctrl+→ and Ctrl+←. */
  colsIn(row: number): number[] {
    const out: number[] = [];
    for (const [c, column] of this.columns) {
      const cell = column.cells.get(row);
      if (cell && cell.value !== null) out.push(c);
    }
    return out.sort((a, b) => a - b);
  }

  /** The smallest rectangle from A1 that holds every cell with something in it. */
  usedRange(): Rect | null {
    let r2 = -1;
    let c2 = -1;
    for (const [c, column] of this.columns) {
      const rows = column.sorted();
      if (!rows.length) continue;
      c2 = Math.max(c2, c);
      r2 = Math.max(r2, rows[rows.length - 1]!);
    }
    return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 };
  }

  get size() {
    let n = 0;
    for (const column of this.columns.values()) n += column.cells.size;
    return n;
  }

  get formulaCount() {
    return this.formulas.size;
  }

  /** What the cell shows. */
  display(row: number, col: number): string {
    const cell = this.cell(row, col);
    return cell ? formatValue(cell.value, cell.format?.code) : '';
  }

  /** What the editor starts with: the formula, or the value written so it reads back the same. */
  editText(row: number, col: number): string {
    const cell = this.cell(row, col);
    if (!cell) return '';
    if (cell.input !== null) return cell.input;
    const v = cell.value;
    if (typeof v === 'number') {
      const code = cell.format?.code;
      if (code && /[dmy]/i.test(code.replace(/"[^"]*"/g, '')) && !/[#0]/.test(code)) {
        return formatValue(v, Number.isInteger(v) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm');
      }
      if (code?.includes('%')) return `${numberToText(v * 100)}%`;
      return numberToText(v);
    }
    return formatValue(v, null);
  }

  /** The contents as text that recreates them exactly (for undo, copying and saving). */
  snapshot(row: number, col: number): string | null {
    const cell = this.cell(row, col);
    if (!cell) return null;
    if (cell.input !== null) return cell.input;
    const v = cell.value;
    if (v === null) return null;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return isError(v) ? v.code : v;
  }

  /** Why a formula would not parse, if it would not. */
  problem(row: number, col: number): string | null {
    return this.cell(row, col)?.formula?.error ?? null;
  }

  // ── writing ───────────────────────────────────────────────────────────

  /** Change cells, recalculate what depends on them, and return the changes that undo it. */
  apply(changes: readonly Change[]): Change[] {
    const inverse: Change[] = [];
    const touched: number[] = [];
    for (const ch of changes) {
      const before = this.cell(ch.row, ch.col);
      const back: Change = { row: ch.row, col: ch.col };
      if (ch.input !== undefined) back.input = this.snapshot(ch.row, ch.col);
      // a typed number can bring a format with it ("12%"), so the format is always kept
      back.format = before?.format ? { ...before.format } : null;
      inverse.push(back);
      this.write(ch.row, ch.col, ch.input, ch.format);
      touched.push(cellKey(ch.row, ch.col));
    }
    this.recalc(touched);
    this.version++;
    return inverse.reverse();
  }

  /** Clear the contents (not the formats) of every cell in the rectangle. */
  clear(rect: Rect): Change[] {
    const changes: Change[] = [];
    // formulas always have a value once worked out, so walking the values finds every one
    this.each(rect.r1, rect.c1, rect.r2, rect.c2, (_, row, col) =>
      changes.push({ row, col, input: null }),
    );
    return this.apply(changes);
  }

  private write(
    row: number,
    col: number,
    input: string | null | undefined,
    format: Format | null | undefined,
  ) {
    const key = cellKey(row, col);
    let column = this.columns.get(col);
    let cell = column?.cells.get(row);
    if (input !== undefined) {
      if (cell?.formula) this.forget(key, cell, cell.formula);
      const text = input ?? '';
      if (text.length > 1 && text.startsWith('=')) {
        const formula = this.compile(text.slice(1), row, col);
        cell ??= { input: null, value: null, formula: null, format: null };
        cell.input = text;
        cell.formula = formula;
        cell.value = formula.node ? null : err('#ERROR!');
      } else {
        const lit = literal(text);
        if (lit.value === null && !cell?.format && format === undefined) {
          column?.remove(row);
          return;
        }
        cell ??= { input: null, value: null, formula: null, format: null };
        cell.input = lit.input;
        cell.formula = null;
        cell.value = lit.value;
        if (lit.code && !(format ?? cell.format)?.code)
          cell.format = { ...cell.format, code: lit.code };
      }
    }
    if (format !== undefined) {
      if (!cell) {
        if (!format) return;
        cell = { input: null, value: null, formula: null, format: null };
      }
      cell.format = format && Object.keys(format).length ? { ...format } : null;
    }
    if (!cell) return;
    if (cell.value === null && !cell.formula && !cell.format) {
      column?.remove(row);
      return;
    }
    if (!column) {
      column = new Column();
      this.columns.set(col, column);
    }
    column.put(row, cell);
    if (input !== undefined && cell.formula) this.remember(key, cell);
  }

  private compile(body: string, row: number, col: number): Formula {
    const key = relativeKey(body, row, col);
    let node = this.trees.get(key);
    if (!node) {
      try {
        node = parse(body, row, col);
      } catch (e) {
        const error = (e as Error).message;
        return {
          node: null,
          error,
          volatile: false,
          refs: [],
          key: cellKey(row, col),
          mark: 0,
          slot: 0,
        };
      }
      if (this.trees.size > 200_000) this.trees.clear();
      this.trees.set(key, node);
    }
    const refs = references(node, row, col);
    const volatile = isVolatile(node);
    return { node, error: null, volatile, refs, key: cellKey(row, col), mark: 0, slot: 0 };
  }

  // ── the dependency graph ──────────────────────────────────────────────

  private remember(key: number, cell: Cell) {
    const f = cell.formula!;
    this.formulas.add(key);
    if (f.volatile) this.volatiles.add(key);
    for (const [r1, c1, r2, c2] of f.refs) {
      if (r1 === r2 && c1 === c2) {
        let column = this.single.get(c1);
        if (!column) this.single.set(c1, (column = new Map<number, Set<Cell>>()));
        let set = column.get(r1);
        if (!set) column.set(r1, (set = new Set()));
        set.add(cell);
      } else if (c2 - c1 <= r2 - r1) {
        for (let c = c1; c <= c2; c++) push(this.byCol, c, { a: r1, b: r2, owner: cell });
      } else {
        for (let r = r1; r <= r2; r++) push(this.byRow, r, { a: c1, b: c2, owner: cell });
      }
    }
  }

  private forget(key: number, cell: Cell, f: Formula) {
    this.formulas.delete(key);
    this.volatiles.delete(key);
    for (const [r1, c1, r2, c2] of f.refs) {
      if (r1 === r2 && c1 === c2) this.single.get(c1)?.get(r1)?.delete(cell);
      else if (c2 - c1 <= r2 - r1) for (let c = c1; c <= c2; c++) drop(this.byCol, c, cell);
      else for (let r = r1; r <= r2; r++) drop(this.byRow, r, cell);
    }
  }

  /** The formulas that read a cell. */
  private dependents(row: number, col: number, out: Cell[]) {
    const s = this.single.get(col)?.get(row);
    if (s) for (const d of s) out.push(d);
    const cs = this.byCol.get(col);
    if (cs) for (const sp of cs) if (row >= sp.a && row <= sp.b) out.push(sp.owner);
    const rs = this.byRow.get(row);
    if (rs) for (const sp of rs) if (col >= sp.a && col <= sp.b) out.push(sp.owner);
  }

  /** The cells a formula reads, as rectangles, for the formula bar's colours and for tests. */
  precedents(row: number, col: number): Rect[] {
    const f = this.cell(row, col)?.formula;
    return f ? f.refs.map(([r1, c1, r2, c2]) => ({ r1, c1, r2, c2 })) : [];
  }

  /** Everything downstream of some changed cells, worked out again in order.

     Every cell downstream of the seeds gets a small number, in the order it is found, and
     the edges between them go into one flat list. The ordering below then runs on typed
     arrays rather than on maps keyed by cell, which at 200,000 cells is most of the cost:
     a cell key past row 65,536 is too big for V8's small integers, so every map operation
     on one hashes a boxed number. */
  private recalc(seeds: Iterable<number>) {
    const t0 = performance.now();
    const pass = ++this.passes;
    const keys: number[] = [];
    const cells: (Cell | undefined)[] = [];
    // a changed cell that holds no formula (a number, or nothing now) is only a starting point
    const plain = new Set<number>();
    const reach = (cell: Cell): number => {
      const f = cell.formula!;
      if (f.mark === pass) return f.slot;
      f.mark = pass;
      f.slot = keys.length;
      keys.push(f.key);
      cells.push(cell);
      return f.slot;
    };
    const start = (k: number) => {
      const cell = this.cell(rowOf(k), colOf(k));
      if (cell?.formula) reach(cell);
      else if (!plain.has(k)) {
        plain.add(k);
        keys.push(k);
        cells.push(cell);
      }
    };
    for (const k of seeds) start(k);
    for (const k of this.volatiles) start(k);

    // breadth first, so each cell's edges are found once and lie together: edges[first[i]]
    // up to edges[first[i + 1]] are the formulas that read cell i
    const first: number[] = [];
    const edges: number[] = [];
    const found: Cell[] = [];
    for (let i = 0; i < keys.length; i++) {
      first.push(edges.length);
      found.length = 0;
      this.dependents(rowOf(keys[i]!), colOf(keys[i]!), found);
      for (const d of found) edges.push(reach(d));
    }
    first.push(edges.length);

    const order = topological(keys.length, first, edges);
    const env: Env = {
      src: this,
      row: 0,
      col: 0,
      now: nowSerial(this.clock()),
      random: this.random,
    };
    let evaluated = 0;
    for (let i = 0; i < order.ids.length; i++) {
      const id = order.ids[i]!;
      const cell = cells[id];
      if (!cell?.formula) continue;
      const node = cell.formula.node;
      if (order.cyclic[id]) cell.value = err('#CYCLE!');
      else if (!node) cell.value = err('#ERROR!');
      else {
        env.row = rowOf(keys[id]!);
        env.col = colOf(keys[id]!);
        cell.value = finish(evaluate(node, env));
        evaluated++;
      }
    }
    this.last = { evaluated, ms: performance.now() - t0 };
  }

  /** Work out every formula again, as after loading. */
  recalcAll() {
    this.recalc([...this.formulas]);
    this.version++;
  }

  // ── loading and saving ────────────────────────────────────────────────

  /** Empty the sheet, as a new workbook. */
  reset() {
    this.columns.clear();
    this.widths.clear();
    this.trees.clear();
    this.relink();
    this.version++;
  }

  /** Many cells at once, without keeping order or the graph up to date until the end. */
  load(cells: Iterable<[row: number, col: number, input: string | null, format?: Format | null]>) {
    for (const [row, col, input, format] of cells) {
      let column = this.columns.get(col);
      if (!column) this.columns.set(col, (column = new Column()));
      const text = input ?? '';
      const cell: Cell = {
        input: null,
        value: null,
        formula: null,
        format: format ? { ...format } : null,
      };
      if (text.length > 1 && text.startsWith('=')) {
        cell.input = text;
        cell.formula = this.compile(text.slice(1), row, col);
        if (!cell.formula.node) cell.value = err('#ERROR!');
      } else {
        const lit = literal(text);
        cell.input = lit.input;
        cell.value = lit.value;
        if (lit.code && !cell.format?.code) cell.format = { ...cell.format, code: lit.code };
      }
      if (cell.value === null && !cell.formula && !cell.format) continue;
      column.put(row, cell, true);
    }
    this.relink();
    this.recalcAll();
  }

  /** Every cell, as load() takes them. */
  *dump(): Generator<[number, number, string | null, Format | null]> {
    for (const c of [...this.columns.keys()].sort((a, b) => a - b)) {
      const column = this.columns.get(c)!;
      for (const r of column.sorted())
        yield [r, c, this.snapshot(r, c), column.cells.get(r)!.format];
    }
  }

  private relink() {
    this.single.clear();
    this.byCol.clear();
    this.byRow.clear();
    this.formulas.clear();
    this.volatiles.clear();
    for (const [c, column] of this.columns) {
      for (const [r, cell] of column.cells) if (cell.formula) this.remember(cellKey(r, c), cell);
    }
  }

  // ── rows and columns ──────────────────────────────────────────────────

  /**
   * Insert or delete rows or columns. Every formula on the sheet is rewritten to follow the
   * cells it points at. Returns the changes that, applied after the opposite operation,
   * put back exactly what was there: deleted cells, and formulas that became #REF!.
   */
  restructure(s: Structure): Change[] {
    const rows = s.kind === 'insertRows' || s.kind === 'deleteRows';
    const inserting = s.kind === 'insertRows' || s.kind === 'insertCols';
    const limit = rows ? MAX_ROWS : MAX_COLS;
    const op = inserting ? insertion(s.at, s.count, limit) : deletion(s.at, s.count);
    const m: Remap = rows ? rowsChanged(op) : colsChanged(op);
    const restore: Change[] = [];
    const placed: [number, number, Cell][] = [];
    for (const [c, column] of this.columns) {
      for (const [r, cell] of column.cells) {
        const tr = rows ? op.one(r) : r;
        const tc = rows ? c : op.one(c);
        if (tr === null || tc === null) {
          restore.push({ row: r, col: c, input: this.snapshot(r, c), format: cell.format });
          continue;
        }
        if (cell.formula && cell.input) {
          const body = cell.input.slice(1);
          const moved = remap(body, m);
          if (moved !== body) {
            restore.push({ row: r, col: c, input: cell.input });
            cell.input = `=${moved}`;
          }
        }
        placed.push([tr, tc, cell]);
      }
    }
    this.columns.clear();
    for (const [r, c, cell] of placed) {
      let column = this.columns.get(c);
      if (!column) this.columns.set(c, (column = new Column()));
      if (cell.formula && cell.input) cell.formula = this.compile(cell.input.slice(1), r, c);
      column.put(r, cell, true);
    }
    if (!rows) {
      const widths = [...this.widths];
      this.widths.clear();
      for (const [c, w] of widths) {
        const to = op.one(c);
        if (to !== null) this.widths.set(to, w);
      }
    }
    this.relink();
    this.recalcAll();
    return restore;
  }

  /**
   * Move a block of cells (cut and paste). Formulas anywhere that pointed into the block now
   * point where it went; ones that pointed at cells it lands on become #REF!. Returns the
   * changes that undo it.
   */
  move(src: Rect, dr: number, dc: number): Change[] {
    if (dr === 0 && dc === 0) return [];
    const dest: Rect = { r1: src.r1 + dr, c1: src.c1 + dc, r2: src.r2 + dr, c2: src.c2 + dc };
    const inSrc = (r: number, c: number) => contains(src, r, c);
    const inDest = (r: number, c: number) => contains(dest, r, c);
    const follow = (body: string) =>
      rewrite(body, {
        ref: (p) =>
          inSrc(p.row, p.col)
            ? { ...p, row: p.row + dr, col: p.col + dc }
            : inDest(p.row, p.col)
              ? null
              : p,
        range: (a, b) =>
          inSrc(a.row, a.col) && inSrc(b.row, b.col)
            ? [
                { ...a, row: a.row + dr, col: a.col + dc },
                { ...b, row: b.row + dr, col: b.col + dc },
              ]
            : [a, b],
      });
    const changes = new Map<number, Change>();
    const set = (ch: Change) => changes.set(cellKey(ch.row, ch.col), ch);
    // what lands, read before anything moves
    const landing: Change[] = [];
    for (const [r, c, input, format] of this.cellsIn(src)) {
      const text = input?.startsWith('=') ? `=${follow(input.slice(1))}` : input;
      landing.push({ row: r + dr, col: c + dc, input: text, format });
    }
    for (const [r, c] of this.cellsIn(src)) set({ row: r, col: c, input: null, format: null });
    for (const [r, c] of this.cellsIn(dest)) set({ row: r, col: c, input: null, format: null });
    for (const k of this.formulas) {
      const r = rowOf(k);
      const c = colOf(k);
      if (inSrc(r, c) || inDest(r, c)) continue;
      const input = this.cell(r, c)!.input!;
      const moved = `=${follow(input.slice(1))}`;
      if (moved !== input) set({ row: r, col: c, input: moved });
    }
    for (const ch of landing) set(ch);
    return this.apply([...changes.values()]);
  }

  /** The cells in a rectangle that have anything in them, contents or format. */
  *cellsIn(rect: Rect): Generator<[number, number, string | null, Format | null]> {
    const cols = [...this.columns.keys()]
      .filter((c) => c >= rect.c1 && c <= rect.c2)
      .sort((a, b) => a - b);
    for (const c of cols) {
      const column = this.columns.get(c)!;
      const rows = column.sorted();
      for (let i = lowerBound(rows, rect.r1); i < rows.length && rows[i]! <= rect.r2; i++) {
        const r = rows[i]!;
        yield [r, c, this.snapshot(r, c), column.cells.get(r)!.format];
      }
    }
  }
}

function push(index: Map<number, Span[]>, line: number, span: Span) {
  let list = index.get(line);
  if (!list) index.set(line, (list = []));
  list.push(span);
}

function drop(index: Map<number, Span[]>, line: number, owner: Cell) {
  const list = index.get(line);
  if (!list) return;
  const kept = list.filter((s) => s.owner !== owner);
  if (kept.length) index.set(line, kept);
  else index.delete(line);
}

/* Tarjan's strongly connected components, without recursion (a chain of 100,000 formulas
   would overflow the call stack). Cells are numbered 0 to n - 1, and edges[first[i]] up to
   edges[first[i + 1]] lead from cell i to the formulas that read it. Tarjan finishes a
   component only after everything reachable from it, so its output is readers first;
   reversed, it is an order in which every formula comes after what it reads. A component of
   more than one cell, or a cell that reads itself, is a circular reference. */
export function topological(
  n: number,
  first: readonly number[],
  edges: readonly number[],
): { ids: Int32Array; cyclic: Uint8Array } {
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const cyclic = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  // the depth-first walk, without recursion (a chain of 100,000 cells would overflow it):
  // the cell, and how far through its edges the walk has got
  const work = new Int32Array(n);
  const at = new Int32Array(n);
  const out = new Int32Array(n);
  let emitted = 0;
  let counter = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    let depth = 0;
    work[0] = root;
    at[0] = first[root]!;
    index[root] = low[root] = counter++;
    stack[top++] = root;
    onStack[root] = 1;
    while (depth >= 0) {
      const v = work[depth]!;
      const e = at[depth]!;
      if (e < first[v + 1]!) {
        at[depth] = e + 1;
        const w = edges[e]!;
        if (w === v) cyclic[v] = 1;
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack[top++] = w;
          onStack[w] = 1;
          depth++;
          work[depth] = w;
          at[depth] = first[w]!;
        } else if (onStack[w] && index[w]! < low[v]!) low[v] = index[w]!;
        continue;
      }
      depth--;
      if (depth >= 0) {
        const parent = work[depth]!;
        if (low[v]! < low[parent]!) low[parent] = low[v]!;
      }
      if (low[v] === index[v]) {
        // v heads a strongly connected group: everything above it on the stack
        const start = emitted;
        let w: number;
        do {
          w = stack[--top]!;
          onStack[w] = 0;
          out[emitted++] = w;
        } while (w !== v);
        if (emitted - start > 1) for (let i = start; i < emitted; i++) cyclic[out[i]!] = 1;
      }
    }
  }
  // groups come out dependents first; a cell has to be worked out before what reads it
  out.reverse();
  return { ids: out, cyclic };
}

/* A formula's relative form: its tokens with each reference written as an offset from the
   cell it is in. =A1*2 in B1 and =A2*2 in B2 have the same one. */
function relativeKey(body: string, row: number, col: number): string {
  let key = '';
  for (const t of lex(body)) {
    if (t.type === 'space') continue;
    if (t.type === 'ref') {
      const p = readRef(t.text);
      key += `R${p.rowAbs ? p.row : `[${p.row - row}]`}C${p.colAbs ? p.col : `[${p.col - col}]`}`;
    } else if (t.type === 'cols' || t.type === 'rows') {
      key += `${t.type}(${t.text.toUpperCase()}@${t.type === 'cols' ? col : row})`;
    } else if (t.type === 'string') key += t.text;
    else key += t.text.toUpperCase();
    key += '\u0001';
  }
  return key;
}

/* What typed text means: a number (with a format if it was written as one: "12%", "£4.50",
   "1,234"), a date, TRUE or FALSE, an error, or text. A leading apostrophe forces text. */
export function literal(text: string): { value: Scalar; input: string | null; code?: string } {
  if (text === '') return { value: null, input: null };
  if (text.startsWith("'")) return { value: text.slice(1), input: text };
  const t = text.trim();
  const n = parseNumber(t);
  if (n !== null) {
    const decimals = /\.(\d+)/.exec(t)?.[1]?.length ?? 0;
    if (t.endsWith('%'))
      return { value: n, input: null, code: decimals ? `0.${'0'.repeat(decimals)}%` : '0%' };
    const symbol = /[£$€]/.exec(t)?.[0];
    if (symbol) return { value: n, input: null, code: `${symbol}#,##0.00` };
    if (/\d,\d{3}/.test(t))
      return { value: n, input: null, code: decimals ? `#,##0.${'0'.repeat(decimals)}` : '#,##0' };
    return { value: n, input: null };
  }
  const date = parseDate(t);
  if (date !== null) return { value: date, input: null, code: 'dd/mm/yyyy' };
  const upper = t.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') return { value: upper === 'TRUE', input: null };
  if ((ERROR_CODES as readonly string[]).includes(upper))
    return { value: err(upper as ErrorCode), input: null };
  return { value: text, input: text };
}
