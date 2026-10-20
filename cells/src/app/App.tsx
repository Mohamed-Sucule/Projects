/* The spreadsheet: the grid, the formula bar, the toolbar and everything they do to the
   sheet. Editing follows Excel closely, because that is what people's hands already know:

   - Typing into a cell replaces it; F2, Enter-to-edit or a double click edits what is there.
   - While a formula is being typed, and the caret is where a reference could go (after "=",
     an operator, a bracket or a comma), the arrow keys and the mouse point at cells and write
     their references in. Shift stretches the reference into a range.
   - Enter and Tab move down and across, and inside a selection of several cells they walk
     through it. Ctrl+Enter writes the same entry into every selected cell.
   - Every change can be undone, and undo takes you back to where it happened. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { flushSync } from 'react-dom';
import {
  cellCount,
  cellName,
  normalize,
  parseRectName,
  rectName,
  type Rect,
} from '../engine/address';
import { parseCSV, parseTSV, writeCSV, writeTSV } from '../engine/delimited';
import { fill } from '../engine/fill';
import { adjustDecimals, formatValue, PRESETS } from '../engine/format';
import { shift } from '../engine/rewrite';
import type { Change, Format, Structure } from '../engine/sheet';
import { hasHeader, sortRows } from '../engine/sort';
import { isError, MAX_COLS, MAX_ROWS, type ErrorCode } from '../engine/values';
import { Columns, DEFAULT_W, GUTTER_W } from '../grid/geometry';
import { Grid, type GridHandle, type Presence } from '../grid/Grid';
import { textWidth } from '../grid/measure';
import { EXAMPLES, type Example } from './examples';
import { FormulaInput } from './FormulaInput';
import {
  argIndex,
  canPoint,
  completion,
  highlight,
  signatureAt,
  signatureParts,
} from './formula-ui';
import { Icon, type IconName } from './Icon';
import { Menu, type MenuEntry } from './Menu';
import * as persist from './persist';
import {
  clampPos,
  cycle,
  isSingle,
  jump,
  rectOf,
  single,
  step,
  type Pos,
  type Selection,
} from './selection';
import { TabSync } from './sync';
import { Workbook } from './workbook';

interface Edit {
  row: number;
  col: number;
  text: string;
  caret: number;
  /** "enter": typing replaced the cell, and arrows leave it; "edit": arrows move the caret */
  mode: 'enter' | 'edit';
  where: 'cell' | 'bar';
  point: { start: number; end: number; from: Pos; to: Pos } | null;
  /** which suggestion is highlighted, and whether the list was dismissed with Escape */
  pick: number;
  dismissed: boolean;
  original: string;
}

interface Clip {
  rect: Rect;
  cut: boolean;
  text: string;
  cells: { dr: number; dc: number; input: string | null; format: Format | null }[];
}

const PORTFOLIO =
  (import.meta.env.VITE_PORTFOLIO_URL as string | undefined) ??
  'https://mohamed-sucule.github.io/Projects/';
const BIG = 200_000; // the most cells one formatting action will touch individually
const CAN_SYNC = typeof BroadcastChannel !== 'undefined';

/** What each error means, said in the status bar when a formula gives one. */
const MEANINGS: Record<ErrorCode, string> = {
  '#NULL!': 'asks for the overlap of two ranges that do not overlap',
  '#DIV/0!': 'divides by zero, or by an empty cell',
  '#VALUE!': 'uses a value of the wrong kind, such as text where a number belongs',
  '#REF!': 'refers to a cell that is no longer there',
  '#NAME?': 'uses a name the sheet does not know; check the spelling of the function',
  '#NUM!': 'works out to a number too big, too small or impossible',
  '#N/A': 'looked for something that is not there',
  '#CYCLE!': 'depends on its own result, through the cells it refers to',
  '#ERROR!': 'could not be read as a formula',
};

export function App() {
  const [wb] = useState(() => new Workbook());
  const sheet = wb.sheet;
  const version = useSyncExternalStore(wb.subscribe, wb.getVersion);
  const [selection, setSelection] = useState<Selection>(() => single(0, 0));
  const [edit, setEdit] = useState<Edit | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  // which menu is open, and where; its items are built afresh on each render, from the selection as it is now
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'cell' | 'open' } | null>(null);
  const [message, setMessage] = useState('');
  const [name, setName] = useState(wb.name);
  const [showFormulas, setShowFormulas] = useState(false);
  const [finding, setFinding] = useState(false);
  const [peers, setPeers] = useState<Presence[]>([]);
  const [widthsVersion, setWidthsVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const grid = useRef<GridHandle>(null);
  const cellInput = useRef<HTMLInputElement>(null);
  const barInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sync = useRef<TabSync | null>(null);

  const cols = useMemo(() => new Columns(sheet.widths), [sheet]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => cols.update(sheet.widths), [cols, sheet, widthsVersion, version]);

  const say = useCallback((text: string) => setMessage(text), []);
  const rename = (n: string) => {
    wb.rename(n);
    setName(n);
  };

  // ── opening, saving and other tabs ────────────────────────────────────

  const openExample = (ex: Example) => {
    sheet.reset();
    for (const [c, w] of ex.widths ?? []) sheet.widths.set(c, w);
    sheet.load(ex.cells());
    wb.forget();
    rename(ex.name);
    setSelection(single(0, 0));
    setWidthsVersion((v) => v + 1);
    setClip(null);
    wb.onLocalChange(null);
  };

  useEffect(() => {
    const link = connect(wb, {
      peers: setPeers,
      replaced: () => {
        setName(wb.name);
        setWidthsVersion((v) => v + 1);
      },
      loaded: () => {
        setName(wb.name);
        setWidthsVersion((v) => v + 1);
        setReady(true);
      },
    });
    sync.current = link.sync;
    return () => {
      link.stop();
      sync.current = null;
    };
  }, [wb]);

  useEffect(() => {
    sync.current?.presence(rectOf(selection), selection.active);
  }, [selection]);

  // ── selection ─────────────────────────────────────────────────────────

  // Focus moves at once, never a frame later: a key pressed in between would be lost.
  const focusGrid = () => grid.current?.focus();

  const select = (s: Selection, scroll = true) => {
    if (edit) commit(null);
    setSelection(s);
    if (scroll)
      grid.current?.scrollIntoView(
        s.focus.row !== s.active.row || s.focus.col !== s.active.col ? s.focus : s.active,
      );
  };

  // ── editing ───────────────────────────────────────────────────────────

  const startEdit = (initial: string | null, mode: Edit['mode'], where: Edit['where'] = 'cell') => {
    const { row, col } = selection.active;
    const original = sheet.editText(row, col);
    const text = initial ?? original;
    // rendered and focused inside the key press or tap that asked for it: a phone only opens
    // its keyboard for a focus that happens during the person's own gesture
    flushSync(() =>
      setEdit({
        row,
        col,
        text,
        caret: text.length,
        mode,
        where,
        point: null,
        pick: 0,
        dismissed: false,
        original,
      }),
    );
    (where === 'cell' ? cellInput : barInput).current?.focus({ preventScroll: true });
    grid.current?.scrollIntoView(selection.active);
  };

  // the editor takes focus as soon as it is in the page, before the next key arrives
  const editing = edit?.where ?? null;
  useLayoutEffect(() => {
    if (editing === 'cell') cellInput.current?.focus({ preventScroll: true });
    else if (editing === 'bar') barInput.current?.focus();
  }, [editing]);

  /** Close brackets the person forgot, as Excel does: =SUM(A1:A3 becomes =SUM(A1:A3). */
  const finishFormula = (text: string) => {
    if (!text.startsWith('=')) return text;
    let depth = 0;
    let quoted = false;
    for (const ch of text) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === '(') depth++;
      else if (!quoted && ch === ')') depth = Math.max(0, depth - 1);
    }
    return text + ')'.repeat(depth);
  };

  function commit(move: [number, number] | null, everywhere = false) {
    if (!edit) return;
    const text = finishFormula(edit.text);
    const before = selection;
    const r = rectOf(selection);
    let changes: Change[] = [];
    if (everywhere && cellCount(r) <= BIG) {
      for (let row = r.r1; row <= r.r2; row++) {
        for (let col = r.c1; col <= r.c2; col++) {
          const input = text.startsWith('=')
            ? `=${shift(text.slice(1), row - edit.row, col - edit.col)}`
            : text;
          changes.push({ row, col, input });
        }
      }
    } else if (text !== edit.original) changes = [{ row: edit.row, col: edit.col, input: text }];
    let next = selection;
    if (move)
      next =
        isSingle(selection) || everywhere
          ? step(selection, move[0], move[1], false)
          : cycle(selection, move[0], move[1]);
    if (everywhere) next = selection;
    setEdit(null);
    if (changes.length) {
      wb.change(`typing in ${cellName(edit.row, edit.col)}`, changes, before, next);
      const problem = sheet.problem(edit.row, edit.col);
      const v = sheet.value(edit.row, edit.col);
      const where = cellName(edit.row, edit.col);
      if (problem) say(`${where}: ${problem}`);
      else if (isError(v)) say(`${where} shows ${v.code}: it ${MEANINGS[v.code]}`);
      else say('');
    }
    setSelection(next);
    grid.current?.scrollIntoView(next.active);
    focusGrid();
  }

  const cancel = () => {
    setEdit(null);
    focusGrid();
  };

  const pointable = !!edit && (!!edit.point || canPoint(edit.text, edit.caret));

  const point = (from: Pos, to: Pos) =>
    setEdit((e) => {
      if (!e) return e;
      const ref = rectName(normalize({ r1: from.row, c1: from.col, r2: to.row, c2: to.col }));
      const start = e.point ? e.point.start : e.caret;
      const end = e.point ? e.point.end : e.caret;
      const text = e.text.slice(0, start) + ref + e.text.slice(end);
      return {
        ...e,
        text,
        caret: start + ref.length,
        point: { start, end: start + ref.length, from, to },
      };
    });

  const suggestions = edit && !edit.dismissed ? completion(edit.text, edit.caret) : null;
  const signature = edit ? signatureAt(edit.text, edit.caret) : null;

  const accept = (i: number) => {
    if (!edit || !suggestions) return;
    const fn = suggestions.matches[i];
    if (!fn) return;
    const insert = `${fn.name}(`;
    const text =
      edit.text.slice(0, suggestions.start) +
      insert +
      edit.text.slice(suggestions.end).replace(/^\(/, '');
    setEdit({ ...edit, text, caret: suggestions.start + insert.length, point: null, pick: 0 });
  };

  const onEditorKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!edit) return;
    const key = e.key;
    if (suggestions && !edit.dismissed) {
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        const n = suggestions.matches.length;
        setEdit({ ...edit, pick: (edit.pick + (key === 'ArrowDown' ? 1 : n - 1)) % n });
        return;
      }
      if (key === 'Tab' || (key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        accept(edit.pick);
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        setEdit({ ...edit, dismissed: true });
        return;
      }
    }
    if (key === 'Enter') {
      e.preventDefault();
      commit(e.ctrlKey || e.metaKey ? null : [e.shiftKey ? -1 : 1, 0], e.ctrlKey || e.metaKey);
    } else if (key === 'Tab') {
      e.preventDefault();
      commit([0, e.shiftKey ? -1 : 1]);
    } else if (key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (key === 'F2') {
      e.preventDefault();
      setEdit({ ...edit, mode: edit.mode === 'enter' ? 'edit' : 'enter', point: null });
      say(
        edit.mode === 'enter'
          ? 'Edit mode: the arrow keys move the caret'
          : 'Enter mode: the arrow keys point at cells',
      );
    } else if (key.startsWith('Arrow') && edit.mode === 'enter' && edit.where === 'cell') {
      const [dr, dc] = arrow(key);
      if (pointable) {
        e.preventDefault();
        const base = edit.point?.to ?? { row: edit.row, col: edit.col };
        const to = clampPos({ row: base.row + dr, col: base.col + dc });
        const from = e.shiftKey ? (edit.point?.from ?? { row: edit.row, col: edit.col }) : to;
        point(from, to);
        grid.current?.scrollIntoView(to);
      } else {
        e.preventDefault();
        commit([dr, dc]);
      }
    }
  };

  const onEditorChange = (text: string, caret: number) => {
    if (!edit) return;
    setEdit({ ...edit, text, caret, point: null, dismissed: false, pick: 0 });
  };

  // ── changing cells ────────────────────────────────────────────────────

  const change = (label: string, changes: Change[], after: Selection = selection) => {
    if (!changes.length) return;
    wb.change(label, changes, selection, after);
    say(`${label[0]!.toUpperCase()}${label.slice(1)}`);
  };

  /** The cells a formatting action touches: every cell in a normal selection, only filled ones in a huge one. */
  const formatTargets = (r: Rect): Pos[] => {
    const out: Pos[] = [];
    if (cellCount(r) <= BIG) {
      for (let row = r.r1; row <= r.r2; row++)
        for (let col = r.c1; col <= r.c2; col++) out.push({ row, col });
    } else for (const [row, col] of sheet.cellsIn(r)) out.push({ row, col });
    return out;
  };

  const setFormat = (label: string, patch: (f: Format, p: Pos) => Format) => {
    finishEditing();
    const changes = formatTargets(rectOf(selection)).map((p) => {
      const f = sheet.cell(p.row, p.col)?.format ?? {};
      return { row: p.row, col: p.col, format: patch({ ...f }, p) };
    });
    change(label, changes);
  };

  const activeFormat = sheet.cell(selection.active.row, selection.active.col)?.format ?? null;

  const toggle = (key: 'bold' | 'italic') => {
    const on = !activeFormat?.[key];
    setFormat(on ? `${key} on` : `${key} off`, (f) => {
      if (on) f[key] = true;
      else delete f[key];
      return f;
    });
  };

  const align = (a: NonNullable<Format['align']>) =>
    setFormat(`align ${a}`, (f) => {
      if (f.align === a) delete f.align;
      else f.align = a;
      return f;
    });

  const numberFormat = (code: string, label: string) =>
    setFormat(`format as ${label.toLowerCase()}`, (f) => {
      if (code === 'General') delete f.code;
      else f.code = code;
      return f;
    });

  const decimals = (delta: 1 | -1) =>
    setFormat(delta > 0 ? 'more decimal places' : 'fewer decimal places', (f, p) => {
      const v = sheet.value(p.row, p.col);
      f.code = adjustDecimals(f.code, delta, typeof v === 'number' ? v : 0);
      return f;
    });

  const finishEditing = () => {
    if (edit) commit(null);
  };

  const clearContents = () => {
    finishEditing();
    const r = rectOf(selection);
    const undo = sheet.clear(r);
    wb.changed(
      `clearing ${rectName(r)}`,
      undo,
      undo.map((c) => ({ row: c.row, col: c.col, input: null })),
      selection,
      selection,
    );
    say(`Cleared ${rectName(r)}`);
  };

  const fillTo = (src: Rect, target: Rect) => {
    const changes = fill(sheet, src, target);
    const after: Selection = {
      anchor: { row: target.r1, col: target.c1 },
      focus: { row: target.r2, col: target.c2 },
      active: selection.active,
    };
    if (changes.length) change(`filling ${rectName(target)}`, changes, after);
    setSelection(after);
  };

  const fillDown = (right: boolean) => {
    const r = rectOf(selection);
    if (right ? r.c1 === r.c2 : r.r1 === r.r2) return;
    const src = right ? { ...r, c2: r.c1 } : { ...r, r2: r.r1 };
    // Ctrl+D copies rather than counting on, so build it from a copy of the first line
    const changes: Change[] = [];
    for (const p of formatTargets(r)) {
      if (right ? p.col === r.c1 : p.row === r.r1) continue;
      const from = right ? { row: p.row, col: r.c1 } : { row: r.r1, col: p.col };
      const input = sheet.snapshot(from.row, from.col);
      const moved = input?.startsWith('=')
        ? `=${shift(input.slice(1), p.row - from.row, p.col - from.col)}`
        : input;
      changes.push({
        row: p.row,
        col: p.col,
        input: moved,
        format: sheet.cell(from.row, from.col)?.format ?? null,
      });
    }
    if (changes.length)
      change(
        right ? `filling right from ${rectName(src)}` : `filling down from ${rectName(src)}`,
        changes,
      );
  };

  const restructure = (op: Structure, label: string) => {
    finishEditing();
    const r = rectOf(selection);
    let after = selection;
    if (op.kind === 'insertRows' && op.at <= r.r1)
      after = {
        anchor: { ...selection.anchor, row: selection.anchor.row + op.count },
        focus: { ...selection.focus, row: selection.focus.row + op.count },
        active: { ...selection.active, row: selection.active.row + op.count },
      };
    if (op.kind === 'insertCols' && op.at <= r.c1)
      after = {
        anchor: { ...selection.anchor, col: selection.anchor.col + op.count },
        focus: { ...selection.focus, col: selection.focus.col + op.count },
        active: { ...selection.active, col: selection.active.col + op.count },
      };
    if (op.kind === 'deleteRows' || op.kind === 'deleteCols')
      after = single(Math.min(r.r1, MAX_ROWS - 1), Math.min(r.c1, MAX_COLS - 1));
    wb.restructure(label, op, selection, after);
    setSelection(after);
    setWidthsVersion((v) => v + 1);
    setClip(null);
    say(label[0]!.toUpperCase() + label.slice(1));
  };

  const rowsOf = (r: Rect) => r.r2 - r.r1 + 1;
  const colsOf = (r: Rect) => r.c2 - r.c1 + 1;
  const insertRows = (below: boolean) => {
    const r = rectOf(selection);
    const n = Math.min(rowsOf(r), 10_000);
    restructure(
      { kind: 'insertRows', at: below ? r.r2 + 1 : r.r1, count: n },
      `inserting ${n === 1 ? 'a row' : `${n} rows`} ${below ? 'below' : 'above'}`,
    );
  };
  const deleteRows = () => {
    const r = rectOf(selection);
    restructure(
      { kind: 'deleteRows', at: r.r1, count: rowsOf(r) },
      `deleting ${rowsOf(r) === 1 ? `row ${r.r1 + 1}` : `rows ${r.r1 + 1}–${r.r2 + 1}`}`,
    );
  };
  const insertCols = (right: boolean) => {
    const r = rectOf(selection);
    const n = Math.min(colsOf(r), 1000);
    restructure(
      { kind: 'insertCols', at: right ? r.c2 + 1 : r.c1, count: n },
      `inserting ${n === 1 ? 'a column' : `${n} columns`} ${right ? 'to the right' : 'to the left'}`,
    );
  };
  const deleteCols = () => {
    const r = rectOf(selection);
    restructure(
      { kind: 'deleteCols', at: r.c1, count: colsOf(r) },
      `deleting ${colsOf(r) === 1 ? 'a column' : `${colsOf(r)} columns`}`,
    );
  };

  const sort = (descending: boolean) => {
    finishEditing();
    let r = rectOf(selection);
    const used = sheet.usedRange();
    if (!used) return;
    if (isSingle(selection)) r = { r1: 0, c1: 0, r2: used.r2, c2: used.c2 };
    r = { ...r, r2: Math.min(r.r2, used.r2), c2: Math.min(r.c2, used.c2) };
    const header = hasHeader(sheet, r);
    const changes = sortRows(sheet, r, selection.active.col, descending, header);
    change(
      `sorting ${rectName(r)} by column ${cellName(0, selection.active.col).replace(/\d+$/, '')}${descending ? ', largest first' : ''}`,
      changes,
    );
  };

  // ── clipboard ─────────────────────────────────────────────────────────

  const copyOut = (cut: boolean): Clip | null => {
    let r = rectOf(selection);
    const used = sheet.usedRange();
    if (cellCount(r) > BIG) {
      if (!used) return null;
      r = { ...r, r2: Math.min(r.r2, used.r2), c2: Math.min(r.c2, used.c2) };
    }
    const lines: string[][] = [];
    const cells: Clip['cells'] = [];
    for (let row = r.r1; row <= r.r2; row++) {
      const line: string[] = [];
      for (let col = r.c1; col <= r.c2; col++) {
        line.push(sheet.display(row, col));
        const input = sheet.snapshot(row, col);
        const format = sheet.cell(row, col)?.format ?? null;
        if (input !== null || format) cells.push({ dr: row - r.r1, dc: col - r.c1, input, format });
      }
      lines.push(line);
    }
    return { rect: r, cut, text: writeTSV(lines), cells };
  };

  const toHtml = (c: Clip) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = c.text.split('\n').map(
      (line) =>
        `<tr>${line
          .split('\t')
          .map((t) => `<td>${esc(t)}</td>`)
          .join('')}</tr>`,
    );
    return `<table>${rows.join('')}</table>`;
  };

  const onCopy = (e: React.ClipboardEvent, cut = false) => {
    if (edit) return;
    e.preventDefault();
    const c = copyOut(cut);
    if (!c) return;
    e.clipboardData.setData('text/plain', c.text);
    e.clipboardData.setData('text/html', toHtml(c));
    setClip(c);
    say(`${cut ? 'Cut' : 'Copied'} ${rectName(c.rect)}`);
  };

  const pasteText = (text: string) => {
    const at = selection.active;
    if (clip && text === clip.text) {
      if (clip.cut) {
        const dr = at.row - clip.rect.r1;
        const dc = at.col - clip.rect.c1;
        const undo = sheet.move(clip.rect, dr, dc);
        const target = {
          r1: clip.rect.r1 + dr,
          c1: clip.rect.c1 + dc,
          r2: clip.rect.r2 + dr,
          c2: clip.rect.c2 + dc,
        };
        const after: Selection = {
          anchor: { row: target.r1, col: target.c1 },
          focus: { row: target.r2, col: target.c2 },
          active: { row: target.r1, col: target.c1 },
        };
        wb.changed(
          `moving ${rectName(clip.rect)} to ${rectName(target)}`,
          undo,
          [],
          selection,
          after,
        );
        setSelection(after);
        setClip(null);
        say(`Moved ${rectName(clip.rect)} to ${rectName(target)}`);
        return;
      }
      // a selection that is a whole number of copies of the clip gets it tiled across it
      const sel = rectOf(selection);
      const h = rowsOf(clip.rect);
      const w = colsOf(clip.rect);
      const tile =
        rowsOf(sel) % h === 0 && colsOf(sel) % w === 0 && cellCount(sel) <= BIG
          ? [rowsOf(sel) / h, colsOf(sel) / w]
          : [1, 1];
      const origin = tile[0]! * tile[1]! > 1 ? { row: sel.r1, col: sel.c1 } : at;
      const changes: Change[] = [];
      for (let ti = 0; ti < tile[0]!; ti++) {
        for (let tj = 0; tj < tile[1]!; tj++) {
          const top = { row: origin.row + ti * h, col: origin.col + tj * w };
          // clear the block first, so empty cells in the copy are pasted as empty
          for (let i = 0; i < h; i++)
            for (let j = 0; j < w; j++)
              changes.push({ row: top.row + i, col: top.col + j, input: null, format: null });
          for (const c of clip.cells) {
            const row = top.row + c.dr;
            const col = top.col + c.dc;
            if (row >= MAX_ROWS || col >= MAX_COLS) continue;
            const src = { row: clip.rect.r1 + c.dr, col: clip.rect.c1 + c.dc };
            const input = c.input?.startsWith('=')
              ? `=${shift(c.input.slice(1), row - src.row, col - src.col)}`
              : c.input;
            changes.push({ row, col, input, format: c.format });
          }
        }
      }
      const pasted = {
        r1: origin.row,
        c1: origin.col,
        r2: origin.row + h * tile[0]! - 1,
        c2: origin.col + w * tile[1]! - 1,
      };
      const after: Selection = {
        anchor: { row: pasted.r1, col: pasted.c1 },
        focus: { row: Math.min(pasted.r2, MAX_ROWS - 1), col: Math.min(pasted.c2, MAX_COLS - 1) },
        active: { row: pasted.r1, col: pasted.c1 },
      };
      change(`pasting into ${rectName(pasted)}`, dedupe(changes), after);
      setSelection(after);
      return;
    }
    // from another program: tab-separated rows
    const rows = parseTSV(text);
    const changes: Change[] = [];
    rows.forEach((line, i) =>
      line.forEach((field, j) => {
        const row = at.row + i;
        const col = at.col + j;
        if (row < MAX_ROWS && col < MAX_COLS)
          changes.push({ row, col, input: field === '' ? null : field });
      }),
    );
    if (!changes.length) return;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const after: Selection = {
      anchor: at,
      focus: clampPos({ row: at.row + h - 1, col: at.col + w - 1 }),
      active: at,
    };
    change(`pasting ${h * w === 1 ? 'a value' : `${h} × ${w} cells`}`, changes, after);
    setSelection(after);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (edit) return;
    e.preventDefault();
    pasteText(e.clipboardData.getData('text/plain'));
  };

  const pasteFromMenu = async () => {
    try {
      pasteText(await navigator.clipboard.readText());
    } catch {
      say(
        'The browser would not share the clipboard from a menu. Press Ctrl+V (⌘V on a Mac) to paste.',
      );
    }
  };

  const copyFromMenu = async (cut: boolean) => {
    const c = copyOut(cut);
    if (!c) return;
    setClip(c);
    try {
      await navigator.clipboard.writeText(c.text);
      say(`${cut ? 'Cut' : 'Copied'} ${rectName(c.rect)}`);
    } catch {
      say(
        `${cut ? 'Cut' : 'Copied'} ${rectName(c.rect)} inside the sheet. Press Ctrl+C to copy it for other programs.`,
      );
    }
  };

  // ── files ─────────────────────────────────────────────────────────────

  const exportCSV = () => {
    finishEditing();
    const used = sheet.usedRange();
    const rows: string[][] = [];
    if (used) {
      for (let r = 0; r <= used.r2; r++) {
        const line: string[] = [];
        for (let c = 0; c <= used.c2; c++) line.push(sheet.display(r, c));
        rows.push(line);
      }
    }
    const blob = new Blob(['﻿', writeCSV(rows), '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${name.trim() || 'sheet'}.csv`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    say(`Saved ${name}.csv`);
  };

  const importCSV = async (file: File) => {
    const rows = parseCSV(await file.text());
    sheet.reset();
    const cells: [number, number, string][] = [];
    rows.forEach((line, r) =>
      line.forEach(
        (field, c) => field !== '' && r < MAX_ROWS && c < MAX_COLS && cells.push([r, c, field]),
      ),
    );
    sheet.load(cells);
    // columns as wide as their contents, within reason
    const widths = new Map<number, number>();
    for (const [, c, v] of cells.slice(0, 20_000))
      widths.set(c, Math.max(widths.get(c) ?? 0, textWidth(v)));
    for (const [c, w] of widths)
      if (w + 16 > DEFAULT_W) sheet.widths.set(c, Math.min(320, Math.ceil(w + 16)));
    wb.forget();
    rename(file.name.replace(/\.csv$/i, ''));
    setSelection(single(0, 0));
    setWidthsVersion((v) => v + 1);
    wb.onLocalChange(null);
    say(`Opened ${file.name}: ${rows.length.toLocaleString('en-GB')} rows`);
  };

  // ── keyboard ──────────────────────────────────────────────────────────

  const onGridKey = (e: KeyboardEvent) => {
    if (edit) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const s = selection;
    const go = (next: Selection) => {
      e.preventDefault();
      setSelection(next);
      grid.current?.scrollIntoView(
        next.focus.row !== s.focus.row || next.focus.col !== s.focus.col ? next.focus : next.active,
      );
    };
    if (key.startsWith('Arrow')) {
      const [dr, dc] = arrow(key);
      if (mod) {
        const from = e.shiftKey ? s.focus : s.active;
        const to = jump(sheet, from, dr, dc);
        go(e.shiftKey ? { ...s, focus: to } : single(to.row, to.col));
      } else go(step(s, dr, dc, e.shiftKey));
      return;
    }
    if (key === 'Enter' || key === 'Tab') {
      const back = e.shiftKey ? -1 : 1;
      const [dr, dc] = key === 'Enter' ? [back, 0] : [0, back];
      go(isSingle(s) ? step(s, dr, dc, false) : cycle(s, dr, dc));
      return;
    }
    if (key === 'PageDown' || key === 'PageUp') {
      const n = (grid.current?.pageRows() ?? 20) * (key === 'PageDown' ? 1 : -1);
      if (e.altKey) go(step(s, 0, Math.sign(n) * 8, e.shiftKey));
      else go(step(s, n, 0, e.shiftKey));
      return;
    }
    if (key === 'Home') {
      if (mod) go(e.shiftKey ? { ...s, focus: { row: 0, col: 0 } } : single(0, 0));
      else go(e.shiftKey ? { ...s, focus: { row: s.focus.row, col: 0 } } : single(s.active.row, 0));
      return;
    }
    if (key === 'End' && mod) {
      const used = sheet.usedRange();
      const to = used ? { row: used.r2, col: used.c2 } : { row: 0, col: 0 };
      go(e.shiftKey ? { ...s, focus: to } : single(to.row, to.col));
      return;
    }
    if (mod && !e.altKey) {
      const k = key.toLowerCase();
      if (k === 'z' && !e.shiftKey) return void (e.preventDefault(), undo());
      if (k === 'y' || (k === 'z' && e.shiftKey)) return void (e.preventDefault(), redo());
      if (k === 'b') return void (e.preventDefault(), toggle('bold'));
      if (k === 'i') return void (e.preventDefault(), toggle('italic'));
      if (k === 'd') return void (e.preventDefault(), fillDown(false));
      if (k === 'r') return void (e.preventDefault(), fillDown(true));
      if (k === 'f') return void (e.preventDefault(), setFinding(true));
      if (k === 'a')
        return go({
          anchor: { row: 0, col: 0 },
          focus: { row: MAX_ROWS - 1, col: MAX_COLS - 1 },
          active: s.active,
        });
      if (k === ' ')
        return go({
          anchor: { row: 0, col: rectOf(s).c1 },
          focus: { row: MAX_ROWS - 1, col: rectOf(s).c2 },
          active: s.active,
        });
      if (key === '`') return void (e.preventDefault(), setShowFormulas((v) => !v));
      if (key === ';') {
        e.preventDefault();
        const d = new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        change(`today's date in ${cellName(s.active.row, s.active.col)}`, [
          { ...s.active, input: iso },
        ]);
        return;
      }
      if (key === '+' || key === '=') return void (e.preventDefault(), insertRows(false));
      if (key === '-') return void (e.preventDefault(), deleteRows());
      return;
    }
    if (e.altKey && key === '=') return void (e.preventDefault(), autoSum());
    if (key === ' ' && e.shiftKey)
      return go({
        anchor: { row: rectOf(s).r1, col: 0 },
        focus: { row: rectOf(s).r2, col: MAX_COLS - 1 },
        active: s.active,
      });
    if (key === 'F2') return void (e.preventDefault(), startEdit(null, 'edit'));
    if (key === 'Delete') return void (e.preventDefault(), clearContents());
    if (key === 'Backspace') return void (e.preventDefault(), startEdit('', 'enter'));
    if (key === 'Escape') {
      if (clip) setClip(null);
      return;
    }
    if ((key === 'F10' && e.shiftKey) || key === 'ContextMenu') {
      e.preventDefault();
      const b = grid.current?.cellBox(s.active);
      openMenu(b ? b.left + 8 : 100, b ? b.bottom : 100);
      return;
    }
    if (key.length === 1 && !e.altKey) {
      e.preventDefault();
      startEdit(key, 'enter');
    }
  };

  /** Σ: a SUM of the run of numbers above the cell, ready to be checked and entered. */
  const autoSum = () => {
    const { row, col } = selection.active;
    let top = row - 1;
    while (top > 0 && typeof sheet.value(top - 1, col) === 'number') top--;
    const above = row > 0 && typeof sheet.value(row - 1, col) === 'number';
    startEdit(above ? `=SUM(${cellName(top, col)}:${cellName(row - 1, col)})` : '=SUM(', 'enter');
  };

  const undo = () => {
    finishEditing();
    const label = wb.undoLabel;
    const s = wb.undo();
    if (s) {
      setSelection(s);
      grid.current?.scrollIntoView(s.active);
      setWidthsVersion((v) => v + 1);
      say(`Undid ${label}`);
    }
  };
  const redo = () => {
    finishEditing();
    const label = wb.redoLabel;
    const s = wb.redo();
    if (s) {
      setSelection(s);
      grid.current?.scrollIntoView(s.active);
      setWidthsVersion((v) => v + 1);
      say(`Redid ${label}`);
    }
  };

  // ── menus ─────────────────────────────────────────────────────────────

  const r = rectOf(selection);
  const mod =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  const openMenu = (x: number, y: number) => setMenu({ x, y, kind: 'cell' });
  const openExamples = (x: number, y: number) => setMenu({ x, y, kind: 'open' });

  // Menus list what they offer, worked out from the selection as it is now, and say which
  // item was chosen; what each one does lives in one place, below.
  const cellMenu: MenuEntry[] = [
    { id: 'cut', label: 'Cut', hint: `${mod}X` },
    { id: 'copy', label: 'Copy', hint: `${mod}C` },
    { id: 'paste', label: 'Paste', hint: `${mod}V` },
    'separator',
    {
      id: 'rows-above',
      label: rowsOf(r) > 1 ? `Insert ${rowsOf(r)} rows above` : 'Insert row above',
    },
    {
      id: 'rows-below',
      label: rowsOf(r) > 1 ? `Insert ${rowsOf(r)} rows below` : 'Insert row below',
    },
    {
      id: 'rows-delete',
      label: rowsOf(r) > 1 ? `Delete rows ${r.r1 + 1}–${r.r2 + 1}` : `Delete row ${r.r1 + 1}`,
      disabled: rowsOf(r) === MAX_ROWS,
    },
    'separator',
    {
      id: 'cols-left',
      label: colsOf(r) > 1 ? `Insert ${colsOf(r)} columns left` : 'Insert column left',
    },
    {
      id: 'cols-right',
      label: colsOf(r) > 1 ? `Insert ${colsOf(r)} columns right` : 'Insert column right',
    },
    {
      id: 'cols-delete',
      label: colsOf(r) > 1 ? 'Delete columns' : 'Delete column',
      disabled: colsOf(r) === MAX_COLS,
    },
    'separator',
    { id: 'sort-up', label: 'Sort A to Z' },
    { id: 'sort-down', label: 'Sort Z to A' },
    { id: 'fill-down', label: 'Fill down', hint: `${mod}D`, disabled: r.r1 === r.r2 },
    { id: 'clear', label: 'Clear contents', hint: 'Delete' },
  ];

  const openMenuItems: MenuEntry[] = [
    ...EXAMPLES.map((ex, i) => ({ id: `example-${i}`, label: ex.name, hint: ex.about })),
    'separator',
    { id: 'csv-open', label: 'Open a CSV file…' },
    { id: 'csv-save', label: 'Save as CSV' },
  ];

  const choose = (id: string) => {
    const actions: Record<string, () => void> = {
      cut: () => void copyFromMenu(true),
      copy: () => void copyFromMenu(false),
      paste: () => void pasteFromMenu(),
      'rows-above': () => insertRows(false),
      'rows-below': () => insertRows(true),
      'rows-delete': deleteRows,
      'cols-left': () => insertCols(false),
      'cols-right': () => insertCols(true),
      'cols-delete': deleteCols,
      'sort-up': () => sort(false),
      'sort-down': () => sort(true),
      'fill-down': () => fillDown(false),
      clear: clearContents,
      'csv-open': () => fileInput.current?.click(),
      'csv-save': exportCSV,
    };
    const example = /^example-(\d+)$/.exec(id);
    if (example) openExample(EXAMPLES[Number(example[1])]!);
    else actions[id]?.();
  };

  // ── what the screen reader hears about a cell ─────────────────────────

  const describe = useCallback(
    (p: Pos) => {
      const shown = sheet.display(p.row, p.col);
      const input = sheet.cell(p.row, p.col)?.input;
      const v = sheet.value(p.row, p.col);
      const what = shown === '' ? 'empty' : shown;
      const formula = input?.startsWith('=') ? `, formula ${input}` : '';
      const error = isError(v) ? `, error` : '';
      return `${cellName(p.row, p.col)}, ${what}${formula}${error}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, version],
  );

  // ── the formula bar's text ────────────────────────────────────────────

  const barText = edit ? edit.text : sheet.editText(selection.active.row, selection.active.col);
  const highlights = edit && edit.text.startsWith('=') ? highlight(edit.text).rects : [];

  const listId = 'fx-suggestions';
  const optionId = (i: number) => `fx-option-${i}`;
  const suggestionList = suggestions && edit && (
    <ul className="suggest" id={listId} role="listbox" aria-label="Functions">
      {suggestions.matches.map((fn, i) => (
        <li
          key={fn.name}
          id={optionId(i)}
          role="option"
          aria-selected={i === edit.pick}
          onPointerDown={(e) => {
            e.preventDefault();
            accept(i);
          }}
        >
          <b>{fn.name}</b>
          <span>{fn.about}</span>
        </li>
      ))}
    </ul>
  );
  const signatureHint = signature && !suggestions && (
    <div className="signature" role="note">
      {(() => {
        const { name: fname, args } = signatureParts(signature.fn.sig);
        const k = argIndex(args, signature.arg);
        return (
          <>
            <code>
              {fname}(
              {args.map((a, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {i === k ? <b>{a}</b> : a}
                </span>
              ))}
              )
            </code>
            <span>{signature.fn.about}</span>
          </>
        );
      })()}
    </div>
  );

  const { r1, c1, r2, c2 } = r;
  const stats = useMemo(
    () => selectionStats(sheet, { r1, c1, r2, c2 }),
    // the sheet changes in place; its version says when
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, r1, c1, r2, c2, version],
  );

  const presetValue =
    PRESETS.find((p) => p.code === (activeFormat?.code ?? 'General'))?.id ?? 'custom';

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href={PORTFOLIO} title="Back to the portfolio">
          <span className="logo" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          Cells
        </a>
        <label className="name">
          <span className="sr">Workbook name</span>
          <input
            value={name}
            onChange={(e) => rename(e.target.value)}
            onBlur={() => wb.onLocalChange([])}
            spellCheck={false}
          />
        </label>
        <div className="top-actions">
          <button
            type="button"
            className="pill"
            aria-haspopup="menu"
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              openExamples(b.left, b.bottom + 6);
            }}
          >
            <Icon name="book" /> <span>Open</span>
          </button>
          <button type="button" className="pill" onClick={exportCSV}>
            <Icon name="save" /> <span>Save CSV</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCSV(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="toolbar" role="toolbar" aria-label="Formatting and editing">
        <Tool
          icon="undo"
          label={wb.undoLabel ? `Undo ${wb.undoLabel}` : 'Undo'}
          onClick={undo}
          disabled={!wb.canUndo}
          hint={`${mod}Z`}
        />
        <Tool
          icon="redo"
          label={wb.redoLabel ? `Redo ${wb.redoLabel}` : 'Redo'}
          onClick={redo}
          disabled={!wb.canRedo}
          hint={`${mod}Y`}
        />
        <span className="divider" />
        <Tool
          icon="bold"
          label="Bold"
          onClick={() => toggle('bold')}
          pressed={!!activeFormat?.bold}
          hint={`${mod}B`}
        />
        <Tool
          icon="italic"
          label="Italic"
          onClick={() => toggle('italic')}
          pressed={!!activeFormat?.italic}
          hint={`${mod}I`}
        />
        <span className="divider" />
        <Tool
          icon="left"
          label="Align left"
          onClick={() => align('left')}
          pressed={activeFormat?.align === 'left'}
        />
        <Tool
          icon="center"
          label="Align centre"
          onClick={() => align('center')}
          pressed={activeFormat?.align === 'center'}
        />
        <Tool
          icon="right"
          label="Align right"
          onClick={() => align('right')}
          pressed={activeFormat?.align === 'right'}
        />
        <span className="divider" />
        <label className="format">
          <span className="sr">Number format</span>
          <select
            value={presetValue}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.id === e.target.value);
              if (p) numberFormat(p.code, p.label);
              focusGrid();
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {presetValue === 'custom' && <option value="custom">{activeFormat?.code}</option>}
          </select>
        </label>
        <Tool icon="lessDp" label="Fewer decimal places" onClick={() => decimals(-1)} />
        <Tool icon="moreDp" label="More decimal places" onClick={() => decimals(1)} />
        <span className="divider" />
        <Tool
          icon="rowAdd"
          label="Insert row above"
          onClick={() => insertRows(false)}
          hint={`${mod}+`}
        />
        <Tool icon="rowDel" label="Delete row" onClick={deleteRows} hint={`${mod}-`} />
        <Tool icon="colAdd" label="Insert column left" onClick={() => insertCols(false)} />
        <Tool icon="colDel" label="Delete column" onClick={deleteCols} />
        <span className="divider" />
        <Tool icon="sortUp" label="Sort A to Z by this column" onClick={() => sort(false)} />
        <Tool icon="sortDown" label="Sort Z to A by this column" onClick={() => sort(true)} />
        <Tool icon="sigma" label="Add up the cells above" onClick={autoSum} hint="Alt+=" />
        <Tool
          icon="fx"
          label={showFormulas ? 'Show values' : 'Show formulas'}
          onClick={() => setShowFormulas((v) => !v)}
          pressed={showFormulas}
          hint={`${mod}\``}
        />
        <Tool icon="search" label="Find" onClick={() => setFinding(true)} hint={`${mod}F`} />
      </div>

      <div className="bar">
        <NameBox
          selection={selection}
          onGo={(s) => {
            select(s);
            focusGrid();
          }}
        />
        <span className="fx" aria-hidden="true">
          <i>f</i>x
        </span>
        <div className="bar-input">
          <FormulaInput
            id="formula-bar"
            label={`Contents of ${cellName(selection.active.row, selection.active.col)}`}
            value={barText}
            caret={edit?.where === 'bar' ? edit.caret : barText.length}
            inputRef={barInput}
            onFocus={() => {
              if (!edit) startEdit(null, 'edit', 'bar');
              else if (edit.where !== 'bar') setEdit({ ...edit, where: 'bar', mode: 'edit' });
            }}
            onChange={onEditorChange}
            onCaret={(caret) =>
              edit && caret !== edit.caret && setEdit({ ...edit, caret, point: null })
            }
            onKeyDown={onEditorKey}
            listId={edit?.where === 'bar' && suggestions ? listId : undefined}
            expanded={!!(edit?.where === 'bar' && suggestions)}
            activeOption={edit ? optionId(edit.pick) : undefined}
          />
          {edit?.where === 'bar' && (suggestionList || signatureHint)}
        </div>
      </div>

      <main className="sheet">
        {finding && (
          <Find
            sheet={sheet}
            onClose={() => (setFinding(false), focusGrid())}
            onFound={(p) => select(single(p.row, p.col))}
          />
        )}
        <Grid
          ref={grid}
          sheet={sheet}
          version={version + widthsVersion + (showFormulas ? 0.5 : 0)}
          cols={cols}
          selection={selection}
          onSelect={(s) => select(s, false)}
          pointing={pointable && edit?.where === 'cell'}
          onPoint={point}
          highlights={highlights}
          showFormulas={showFormulas}
          editor={
            edit?.where === 'cell'
              ? (box) => {
                  // as wide as its text, and when that runs past the grid's right edge it
                  // grows leftwards instead, so the start of a long formula stays in view
                  const room = box.left + box.maxWidth;
                  const scale = innerWidth <= 640 ? 16 / 13 : 1; // phones edit at 16px, so they do not zoom
                  const need = Math.ceil(textWidth(edit.text) * scale + 24);
                  const width = Math.max(box.width, Math.min(need, room - GUTTER_W));
                  const left = Math.max(GUTTER_W, Math.min(box.left, room - width));
                  return (
                    <div
                      className={`cell-editor${room - left < 320 ? ' flip' : ''}${box.below < 280 ? ' up' : ''}`}
                      style={{ left, top: box.top, width, height: box.height }}
                    >
                      <FormulaInput
                        id="cell-editor"
                        label={`Editing ${cellName(edit.row, edit.col)}`}
                        value={edit.text}
                        caret={edit.caret}
                        inputRef={cellInput}
                        onChange={onEditorChange}
                        onCaret={(caret) =>
                          caret !== edit.caret && setEdit({ ...edit, caret, point: null })
                        }
                        onKeyDown={onEditorKey}
                        listId={suggestions ? listId : undefined}
                        expanded={!!suggestions}
                        activeOption={optionId(edit.pick)}
                      />
                      {suggestionList || signatureHint}
                    </div>
                  );
                }
              : null
          }
          onEdit={() => startEdit(null, 'edit')}
          onFill={fillTo}
          onResize={(col, w) => {
            sheet.widths.set(col, Math.round(w));
            setWidthsVersion((v) => v + 1);
          }}
          onAutofit={(col) => {
            let w = 0;
            for (const row of sheet.rowsIn(col, 0, MAX_ROWS - 1).slice(0, 5000)) {
              const f = sheet.cell(row, col)?.format;
              w = Math.max(w, textWidth(sheet.display(row, col), f?.bold, f?.italic));
            }
            sheet.widths.set(col, Math.max(40, Math.ceil(w + 14)));
            setWidthsVersion((v) => v + 1);
            wb.onLocalChange([]);
          }}
          onContextMenu={openMenu}
          clip={clip ? { rect: clip.rect, cut: clip.cut } : null}
          others={peers}
          label={`${name}, a spreadsheet`}
          onKeyDown={onGridKey}
          onCopy={(e) => onCopy(e)}
          onCut={(e) => onCopy(e, true)}
          onPaste={onPaste}
          describe={describe}
        />
        {!ready && <div className="loading">Opening…</div>}
      </main>

      <footer className="status">
        <p className="stats">{stats}</p>
        <p className="message" role="status">
          {message}
        </p>
        <p className="recalc">
          {sheet.last.evaluated > 0 && (
            <>
              Recalculated {sheet.last.evaluated.toLocaleString('en-GB')}{' '}
              {sheet.last.evaluated === 1 ? 'cell' : 'cells'} in{' '}
              {sheet.last.ms < 1 ? sheet.last.ms.toFixed(2) : sheet.last.ms.toFixed(0)} ms
            </>
          )}
        </p>
        <p
          className="peers"
          title="Open this page in another tab and edit in either: the changes appear in both."
        >
          <Icon name="people" />
          {peers.length
            ? `${peers.length + 1} tabs, live`
            : !CAN_SYNC
              ? 'This tab only'
              : 'Open in another tab to edit in both'}
        </p>
      </footer>

      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          items={menu.kind === 'cell' ? cellMenu : openMenuItems}
          label={menu.kind === 'cell' ? 'Cell actions' : 'Open an example'}
          onChoose={choose}
          onClose={() => (setMenu(null), focusGrid())}
        />
      )}
    </div>
  );
}

interface ToolProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  hint?: string;
}

/** A toolbar button: an icon, with its name for screen readers and as a tooltip. */
function Tool({ icon, label, onClick, pressed, disabled, hint }: ToolProps) {
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={hint ? `${label} (${hint})` : label}
      aria-pressed={pressed}
      disabled={disabled}
      // keep focus (and an edit in progress) where it is
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

function arrow(key: string): [number, number] {
  return key === 'ArrowUp'
    ? [-1, 0]
    : key === 'ArrowDown'
      ? [1, 0]
      : key === 'ArrowLeft'
        ? [0, -1]
        : [0, 1];
}

/** The last change to each cell wins, so a paste that clears and then fills a block stays small. */
function dedupe(changes: Change[]): Change[] {
  const m = new Map<string, Change>();
  for (const c of changes) m.set(`${c.row},${c.col}`, c);
  return [...m.values()];
}

function selectionStats(sheet: Workbook['sheet'], r: Rect): string {
  if (r.r1 === r.r2 && r.c1 === r.c2) {
    const v = sheet.value(r.r1, r.c1);
    return v === null
      ? ''
      : typeof v === 'number'
        ? `${rectName(r)} · ${formatValue(v, null)}`
        : rectName(r);
  }
  let sum = 0;
  let numbers = 0;
  let filled = 0;
  sheet.each(r.r1, r.c1, r.r2, r.c2, (v) => {
    filled++;
    if (typeof v === 'number') {
      sum += v;
      numbers++;
    }
  });
  const size = `${r.r2 - r.r1 + 1} × ${r.c2 - r.c1 + 1}`;
  if (!numbers) return filled ? `${size} · Count ${filled.toLocaleString('en-GB')}` : size;
  // to two places, as a reader wants a total; tiny values keep their own digits
  const fmt = (n: number) =>
    formatValue(Number(n.toPrecision(12)), Math.abs(n) >= 0.01 || n === 0 ? '#,##0.##' : null);
  return `Sum ${fmt(sum)} · Average ${fmt(sum / numbers)} · Count ${filled.toLocaleString('en-GB')}`;
}

/** The box at the left of the formula bar: shows where you are, and takes you anywhere. */
/** Opening the saved copy, saving changes, and keeping other tabs in step. */
function connect(
  wb: Workbook,
  on: { peers: (p: Presence[]) => void; replaced: () => void; loaded: () => void },
) {
  let timer = 0;
  let live = true;
  const save = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const sheet = wb.sheet;
      void persist.save({
        v: 1,
        name: wb.name,
        cells: [...sheet.dump()],
        widths: [...sheet.widths],
        at: Date.now(),
      });
    }, 500);
  };
  const sync = new TabSync(
    wb,
    () =>
      on.peers(
        [...sync.peers.values()]
          .filter((p) => p.rect && p.active)
          .map((p) => ({
            id: p.id,
            name: p.name,
            colour: p.colour,
            rect: p.rect!,
            active: p.active!,
          })),
      ),
    () => {
      on.replaced();
      save();
    },
  );
  wb.onLocalChange = (changes) => {
    sync.local(changes);
    save();
  };
  void persist.load().then((saved) => {
    if (!live) return;
    // a sheet from a tab that was already open is newer than anything saved
    if (!sync.received) {
      const sheet = wb.sheet;
      sheet.reset();
      if (saved && saved.cells.length) {
        for (const [c, w] of saved.widths) sheet.widths.set(c, w);
        sheet.load(saved.cells);
        wb.rename(saved.name);
      } else {
        const ex = EXAMPLES[0]!;
        for (const [c, w] of ex.widths ?? []) sheet.widths.set(c, w);
        sheet.load(ex.cells());
        wb.rename(ex.name);
      }
      wb.forget();
    }
    on.loaded();
  });
  return {
    sync,
    stop() {
      live = false;
      clearTimeout(timer);
      sync.close();
      wb.onLocalChange = () => {};
    },
  };
}

function NameBox({ selection, onGo }: { selection: Selection; onGo: (s: Selection) => void }) {
  const shown = isSingle(selection)
    ? cellName(selection.active.row, selection.active.col)
    : rectName(rectOf(selection));
  // what is being typed, while the box has focus
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? shown;
  return (
    <label className="namebox">
      <span className="sr">Go to a cell or range</span>
      <input
        value={text}
        spellCheck={false}
        onFocus={(e) => {
          setDraft(shown);
          e.currentTarget.select();
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const r = parseRectName(text);
            if (r) {
              e.currentTarget.blur();
              onGo({
                anchor: { row: r.r1, col: r.c1 },
                focus: { row: r.r2, col: r.c2 },
                active: { row: r.r1, col: r.c1 },
              });
            } else setDraft(shown);
          } else if (e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** Find: every cell whose shown value or formula contains the text, in reading order. */
function Find({
  sheet,
  onClose,
  onFound,
}: {
  sheet: Workbook['sheet'];
  onClose: () => void;
  onFound: (p: Pos) => void;
}) {
  const [q, setQ] = useState('');
  // which match is shown; -1 until the first is
  const [i, setI] = useState(-1);
  const matches = useMemo(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    const out: Pos[] = [];
    for (const [row, col, input] of sheet.dump()) {
      const shown = sheet.display(row, col).toLowerCase();
      if (shown.includes(needle) || input?.toLowerCase().includes(needle)) out.push({ row, col });
    }
    return out.sort((a, b) => a.row - b.row || a.col - b.col);
  }, [q, sheet]);
  const go = (k: number) => {
    if (!matches.length) return;
    const n = ((k % matches.length) + matches.length) % matches.length;
    setI(n);
    onFound(matches[n]!);
  };
  return (
    <div className="find" role="search">
      <Icon name="search" />
      <label>
        <span className="sr">Find in the sheet</span>
        <input
          autoFocus
          value={q}
          placeholder="Find"
          onChange={(e) => {
            setQ(e.target.value);
            setI(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go(e.shiftKey ? i - 1 : i + 1);
            } else if (e.key === 'Escape') onClose();
          }}
        />
      </label>
      <span className="count" aria-live="polite">
        {q
          ? matches.length
            ? `${Math.max(0, i) + 1} of ${matches.length.toLocaleString('en-GB')}`
            : 'No matches'
          : ''}
      </span>
      <button
        type="button"
        className="tool"
        aria-label="Previous match"
        onClick={() => go(i - 1)}
        disabled={!matches.length}
      >
        <Icon name="chevron" />
      </button>
      <button
        type="button"
        className="tool flip"
        aria-label="Next match"
        onClick={() => go(i + 1)}
        disabled={!matches.length}
      >
        <Icon name="chevron" />
      </button>
      <button type="button" className="tool" aria-label="Close find" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
