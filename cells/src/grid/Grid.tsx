/* The grid: a window onto 1,048,576 rows and 16,384 columns.

   Only the cells in view are in the page, about a thousand on a desktop screen, positioned
   absolutely inside a layer that stays put (position: sticky) while an empty spacer gives the
   scroller its size. Scrolling moves the window; the layer redraws what is under it.

   It is a real ARIA grid: one focusable element, rows and cells with their indexes in the
   whole sheet (aria-rowindex 1,048,577 is a real row), and aria-activedescendant naming the
   active cell, which is always rendered even when it is scrolled out of sight, so a screen
   reader can follow the cursor anywhere.

   Pointer handling follows the device. With a mouse, pressing selects and dragging stretches
   the selection, scrolling the grid when it reaches an edge. On a touchscreen, dragging has
   to scroll, so a tap selects, a second tap on the same cell edits, and the fill handle is
   big enough for a thumb. */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { colName, type Rect } from '../engine/address';
import type { Sheet } from '../engine/sheet';
import { isError, MAX_COLS, MAX_ROWS } from '../engine/values';
import { REF_COLOURS, type Highlight } from '../app/formula-ui';
import { rectOf, type Pos, type Selection } from '../app/selection';
import {
  type Columns,
  GUTTER_W,
  HEADER_H,
  MIN_W,
  ROW_H,
  scrollScale,
  scrollToCol,
  scrollToRow,
  scrollTopFor,
  sheetY,
  spacerHeight,
  visible,
  type Viewport,
} from './geometry';
import { fits } from './measure';

export interface Presence {
  id: string;
  name: string;
  colour: string;
  rect: Rect;
  active: Pos;
}

export interface GridHandle {
  focus(): void;
  scrollIntoView(p: Pos): void;
  /** the cell's box in the page's coordinates */
  cellBox(p: Pos): DOMRect | null;
  /** how many rows fit in view, for Page Up and Page Down */
  pageRows(): number;
}

export interface EditorBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** room to the right of the cell, and below it, inside the grid */
  maxWidth: number;
  below: number;
}

interface Props {
  sheet: Sheet;
  version: number;
  cols: Columns;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** while a formula is being typed and the caret can take a reference */
  pointing: boolean;
  onPoint: (from: Pos, to: Pos) => void;
  highlights: Highlight[];
  /** show formulas in place of their results */
  showFormulas: boolean;
  editor: ((box: EditorBox) => ReactNode) | null;
  onEdit: () => void;
  onFill: (src: Rect, target: Rect) => void;
  onResize: (col: number, width: number) => void;
  onAutofit: (col: number) => void;
  onContextMenu: (x: number, y: number) => void;
  clip: { rect: Rect; cut: boolean } | null;
  others: Presence[];
  label: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCopy: (e: React.ClipboardEvent) => void;
  onCut: (e: React.ClipboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  describe: (p: Pos) => string;
}

type Drag =
  | { kind: 'select'; from: Pos; headers: 'rows' | 'cols' | null }
  | { kind: 'point'; from: Pos }
  | { kind: 'fill'; src: Rect }
  | { kind: 'resize'; col: number; startX: number; startW: number };

const OVERSCAN = 1;
export const cellId = (r: number, c: number) => `cell-${r}-${c}`;

export const Grid = forwardRef<GridHandle, Props>(function Grid(props, ref) {
  const { sheet, cols, selection, onSelect } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, w: 800, h: 600 });
  // the viewport as of the last scroll, for event handlers that run between renders
  const viewRef = useRef(view);
  const pinned = useRef<{ scrollTop: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [fillTarget, setFillTarget] = useState<Rect | null>(null);
  const [hoverResize, setHoverResize] = useState<number | null>(null);

  // ── viewport ──────────────────────────────────────────────────────────

  const readView = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const w = el.clientWidth - GUTTER_W;
    const h = el.clientHeight - HEADER_H;
    const p = pinned.current;
    const y = p && Math.abs(el.scrollTop - p.scrollTop) < 1 ? p.y : sheetY(el.scrollTop, h);
    if (!p || Math.abs(el.scrollTop - p.scrollTop) >= 1) pinned.current = null;
    const v = viewRef.current;
    if (v.x === el.scrollLeft && v.y === y && v.w === w && v.h === h) return;
    viewRef.current = { x: el.scrollLeft, y, w, h };
    setView(viewRef.current);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current!;
    readView();
    const ro = new ResizeObserver(readView);
    ro.observe(el);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(readView);
    };
    // the wheel moves the sheet by its usual amount, whatever the scroll scale
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const scale = scrollScale(el.clientHeight - HEADER_H);
      const unit = e.deltaMode === 1 ? ROW_H : e.deltaMode === 2 ? el.clientHeight : 1;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY * unit;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY * unit : e.deltaX * unit;
      if (scale <= 1.0001) return;
      e.preventDefault();
      el.scrollTop += dy / scale;
      el.scrollLeft += dx;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
    };
  }, [readView]);

  const scrollToY = useCallback(
    (y: number) => {
      const el = scroller.current!;
      const h = el.clientHeight - HEADER_H;
      const clamped = Math.max(0, Math.min(y, MAX_ROWS * ROW_H - h));
      el.scrollTop = scrollTopFor(clamped, h);
      pinned.current = { scrollTop: el.scrollTop, y: clamped };
      readView();
    },
    [readView],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => scroller.current?.focus({ preventScroll: true }),
      scrollIntoView(p) {
        const el = scroller.current;
        if (!el) return;
        const v = viewRef.current;
        const y = scrollToRow(p.row, v);
        const x = scrollToCol(p.col, v, cols);
        if (x !== null) el.scrollLeft = x;
        if (y !== null) scrollToY(y);
        else if (x !== null) readView();
      },
      cellBox(p) {
        const el = scroller.current;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const v = viewRef.current;
        const left = b.left + GUTTER_W + cols.x(p.col) - v.x;
        const top = b.top + HEADER_H + p.row * ROW_H - v.y;
        return new DOMRect(left, top, cols.width(p.col), ROW_H);
      },
      pageRows: () => Math.max(1, Math.floor(viewRef.current.h / ROW_H) - 1),
    }),
    [cols, readView, scrollToY],
  );

  // ── hit testing ───────────────────────────────────────────────────────

  const hit = useCallback(
    (clientX: number, clientY: number) => {
      const el = scroller.current!;
      const b = el.getBoundingClientRect();
      const v = viewRef.current;
      const x = clientX - b.left;
      const y = clientY - b.top;
      const col = cols.at(v.x + Math.max(0, x - GUTTER_W));
      const row = Math.min(
        MAX_ROWS - 1,
        Math.max(0, Math.floor((v.y + Math.max(0, y - HEADER_H)) / ROW_H)),
      );
      return { x, y, row, col, inHeader: y < HEADER_H, inGutter: x < GUTTER_W };
    },
    [cols],
  );

  /** The column whose right edge is within a few pixels of x, for resizing. */
  const edgeAt = useCallback(
    (x: number) => {
      const v = viewRef.current;
      const sx = v.x + x - GUTTER_W;
      const c = cols.at(sx);
      const right = cols.x(c) + cols.width(c);
      if (Math.abs(sx - right) <= 4) return c;
      if (c > 0 && Math.abs(sx - cols.x(c)) <= 4) return c - 1;
      return null;
    },
    [cols],
  );

  // ── pointer ───────────────────────────────────────────────────────────

  const last = useRef<{ pos: Pos; time: number } | null>(null);
  const tap = useRef<{ x: number; y: number; time: number; pointer: string } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const selectTo = useCallback(
    (d: Drag, h: ReturnType<typeof hit>) => {
      if (d.kind === 'select') {
        const focus: Pos =
          d.headers === 'cols'
            ? { row: MAX_ROWS - 1, col: h.col }
            : d.headers === 'rows'
              ? { row: h.row, col: MAX_COLS - 1 }
              : { row: h.row, col: h.col };
        onSelect({ ...selection, focus });
      } else if (d.kind === 'point') props.onPoint(d.from, { row: h.row, col: h.col });
      else if (d.kind === 'fill') setFillTarget(fillRect(d.src, h.row, h.col));
    },
    [onSelect, selection, props],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const h = hit(e.clientX, e.clientY);
    pointer.current = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType !== 'mouse';
    if (h.inHeader && !h.inGutter && !touch) {
      const edge = edgeAt(h.x);
      if (edge !== null) {
        e.preventDefault();
        setDrag({ kind: 'resize', col: edge, startX: e.clientX, startW: cols.width(edge) });
        scroller.current!.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (touch) {
      tap.current = { x: e.clientX, y: e.clientY, time: e.timeStamp, pointer: e.pointerType };
      return;
    }
    e.preventDefault();
    // while pointing at cells for a formula, the caret stays in the editor
    if (!props.pointing) scroller.current!.focus({ preventScroll: true });
    scroller.current!.setPointerCapture(e.pointerId);
    press(h, e.shiftKey, e.timeStamp);
  };

  /** A press on the grid: by mouse at once, by touch when it turns out to have been a tap. */
  const press = (h: ReturnType<typeof hit>, shift: boolean, time: number) => {
    if (h.inHeader && h.inGutter) {
      onSelect({
        anchor: { row: 0, col: 0 },
        focus: { row: MAX_ROWS - 1, col: MAX_COLS - 1 },
        active: { row: 0, col: 0 },
      });
      return;
    }
    if (h.inHeader) {
      const anchor = shift ? { row: 0, col: selection.anchor.col } : { row: 0, col: h.col };
      onSelect({
        anchor,
        focus: { row: MAX_ROWS - 1, col: h.col },
        active: shift ? selection.active : { row: 0, col: h.col },
      });
      setDrag({ kind: 'select', from: anchor, headers: 'cols' });
      return;
    }
    if (h.inGutter) {
      const anchor = shift ? { row: selection.anchor.row, col: 0 } : { row: h.row, col: 0 };
      onSelect({
        anchor,
        focus: { row: h.row, col: MAX_COLS - 1 },
        active: shift ? selection.active : { row: h.row, col: 0 },
      });
      setDrag({ kind: 'select', from: anchor, headers: 'rows' });
      return;
    }
    const pos = { row: h.row, col: h.col };
    if (props.pointing) {
      props.onPoint(pos, pos);
      setDrag({ kind: 'point', from: pos });
      return;
    }
    const l = last.current;
    if (l && l.pos.row === pos.row && l.pos.col === pos.col && time - l.time < 400) {
      last.current = null;
      props.onEdit();
      return;
    }
    last.current = { pos, time };
    if (shift) onSelect({ ...selection, focus: pos });
    else onSelect({ anchor: pos, focus: pos, active: pos });
    setDrag({ kind: 'select', from: pos, headers: null });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY };
    if (!drag) {
      if (e.pointerType === 'mouse') {
        const h = hit(e.clientX, e.clientY);
        setHoverResize(h.inHeader && !h.inGutter ? edgeAt(h.x) : null);
      }
      return;
    }
    if (drag.kind === 'resize') {
      props.onResize(drag.col, Math.max(MIN_W, drag.startW + e.clientX - drag.startX));
      return;
    }
    selectTo(drag, hit(e.clientX, e.clientY));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const t = tap.current;
    tap.current = null;
    if (
      t &&
      !drag &&
      Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10 &&
      e.timeStamp - t.time < 500
    ) {
      const h = hit(e.clientX, e.clientY);
      const pos = { row: h.row, col: h.col };
      const already =
        !h.inHeader &&
        !h.inGutter &&
        pos.row === selection.active.row &&
        pos.col === selection.active.col;
      if (!props.pointing) scroller.current!.focus({ preventScroll: true });
      if (already && !props.pointing) props.onEdit();
      else press(h, false, -Infinity);
      setDrag(null);
      return;
    }
    if (drag?.kind === 'fill' && fillTarget) props.onFill(drag.src, fillTarget);
    setDrag(null);
    setFillTarget(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const h = hit(e.clientX, e.clientY);
    if (h.inHeader && !h.inGutter) {
      const edge = edgeAt(h.x);
      if (edge !== null) props.onAutofit(edge);
    }
  };

  // dragging past an edge scrolls, faster the further out the pointer is
  useEffect(() => {
    if (!drag || drag.kind === 'resize') return;
    let frame = 0;
    const tick = () => {
      const el = scroller.current;
      if (el) {
        const b = el.getBoundingClientRect();
        const { x, y } = pointer.current;
        const speed = (d: number) => Math.sign(d) * Math.min(40, Math.abs(d) / 2);
        // selecting whole columns only scrolls sideways, whole rows only up and down
        const vertical = !(drag.kind === 'select' && drag.headers === 'cols');
        const sideways = !(drag.kind === 'select' && drag.headers === 'rows');
        let dy = 0;
        let dx = 0;
        if (vertical && y < b.top + HEADER_H) dy = speed(y - b.top - HEADER_H);
        else if (vertical && y > b.bottom - 4) dy = speed(y - b.bottom + 4);
        if (sideways && x < b.left + GUTTER_W) dx = speed(x - b.left - GUTTER_W);
        else if (sideways && x > b.right - 4) dx = speed(x - b.right + 4);
        if (dy) scrollToY(viewRef.current.y + dy * ROW_H * 0.25);
        if (dx) el.scrollLeft += dx;
        if (dx || dy) selectTo(drag, hit(x, y));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag, hit, scrollToY, selectTo]);

  const onFillDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointer.current = { x: e.clientX, y: e.clientY };
    setDrag({ kind: 'fill', src: rectOf(selection) });
    setFillTarget(rectOf(selection));
  };

  const onContextMenu = (e: React.MouseEvent) => {
    // inside the cell editor, the browser's own menu (cut, copy, paste the text) is the right one
    if ((e.target as HTMLElement).closest('.cell-editor')) return;
    e.preventDefault();
    const h = hit(e.clientX, e.clientY);
    const r = rectOf(selection);
    const inside = h.row >= r.r1 && h.row <= r.r2 && h.col >= r.c1 && h.col <= r.c2;
    if (!inside && !h.inHeader && !h.inGutter)
      onSelect({ anchor: h, focus: h, active: { row: h.row, col: h.col } });
    props.onContextMenu(e.clientX, e.clientY);
  };

  // ── drawing ───────────────────────────────────────────────────────────

  const vis = visible(view, cols);
  const r1 = Math.max(0, vis.r1 - OVERSCAN);
  const r2 = Math.min(MAX_ROWS - 1, vis.r2 + OVERSCAN);
  const c1 = Math.max(0, vis.c1 - OVERSCAN);
  const c2 = Math.min(MAX_COLS - 1, vis.c2 + OVERSCAN);
  const sel = rectOf(selection);
  const active = selection.active;
  const left = (c: number) => GUTTER_W + cols.x(c) - view.x;
  const top = (r: number) => HEADER_H + r * ROW_H - view.y;

  const colList = useMemo(() => {
    const out: number[] = [];
    for (let c = c1; c <= c2; c++) out.push(c);
    return out;
  }, [c1, c2]);

  const rows: ReactNode[] = [];
  for (let r = r1; r <= r2; r++) {
    rows.push(
      <Row
        key={r}
        sheet={sheet}
        row={r}
        cols={colList}
        geometry={cols}
        top={top(r)}
        left={left}
        right={c2}
        sel={sel}
        active={active}
        formulas={props.showFormulas}
        describe={props.describe}
      />,
    );
  }
  const activeShown = active.row >= r1 && active.row <= r2 && active.col >= c1 && active.col <= c2;

  const box = (r: Rect, inset = 0) => {
    const x1 = Math.max(left(r.c1), GUTTER_W - 3);
    const y1 = Math.max(top(r.r1), HEADER_H - 3);
    const x2 = Math.min(left(r.c2) + cols.width(r.c2), view.w + GUTTER_W + 3);
    const y2 = Math.min(top(r.r2) + ROW_H, view.h + HEADER_H + 3);
    if (x2 <= x1 || y2 <= y1) return null;
    return {
      left: x1 + inset,
      top: y1 + inset,
      width: x2 - x1 - inset * 2,
      height: y2 - y1 - inset * 2,
    };
  };

  const selBox = box(sel);
  const activeBox = box({ r1: active.row, c1: active.col, r2: active.row, c2: active.col });
  const fillBox = fillTarget ? box(fillTarget) : null;
  const multi = sel.r1 !== sel.r2 || sel.c1 !== sel.c2;
  const handleAt =
    selBox &&
    top(sel.r2) + ROW_H <= view.h + HEADER_H &&
    left(sel.c2) + cols.width(sel.c2) <= view.w + GUTTER_W
      ? { left: left(sel.c2) + cols.width(sel.c2), top: top(sel.r2) + ROW_H }
      : null;

  const headerCells: ReactNode[] = [];
  for (const c of colList) {
    const on = c >= sel.c1 && c <= sel.c2;
    const all = on && sel.r1 === 0 && sel.r2 === MAX_ROWS - 1;
    headerCells.push(
      <div
        key={c}
        role="columnheader"
        aria-colindex={c + 2}
        className={`h col${on ? ' on' : ''}${all ? ' all' : ''}`}
        style={{ left: left(c), width: cols.width(c) }}
      >
        {colName(c)}
      </div>,
    );
  }

  const editorBox: EditorBox | null = props.editor
    ? {
        left: left(active.col),
        top: top(active.row),
        width: cols.width(active.col),
        height: ROW_H,
        maxWidth: view.w + GUTTER_W - left(active.col),
        below: view.h + HEADER_H - top(active.row) - ROW_H,
      }
    : null;

  return (
    <>
      <div
        ref={scroller}
        className={`grid${drag?.kind === 'resize' || hoverResize !== null ? ' resizing' : ''}`}
        role="grid"
        aria-label={props.label}
        aria-rowcount={MAX_ROWS + 1}
        aria-colcount={MAX_COLS + 1}
        aria-multiselectable="true"
        aria-activedescendant={props.editor ? undefined : cellId(active.row, active.col)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDrag(null);
          setFillTarget(null);
          tap.current = null;
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={props.onKeyDown}
        onCopy={props.onCopy}
        onCut={props.onCut}
        onPaste={props.onPaste}
      >
        <div
          className="spacer"
          aria-hidden="true"
          style={{ width: GUTTER_W + cols.total, height: HEADER_H + spacerHeight() }}
        />
        <div className="layer" style={{ width: view.w + GUTTER_W, height: view.h + HEADER_H }}>
          <div role="rowgroup" className="head">
            <div role="row" aria-rowindex={1}>
              <div
                role="columnheader"
                aria-colindex={1}
                className="h corner"
                aria-label="Row numbers"
              />
              {headerCells}
            </div>
          </div>
          <div role="rowgroup" className="body">
            {rows}
            {!activeShown && (
              <div role="row" aria-rowindex={active.row + 2} className="offscreen">
                <div
                  role="gridcell"
                  id={cellId(active.row, active.col)}
                  aria-colindex={active.col + 2}
                  aria-selected="true"
                >
                  {props.describe(active)}
                </div>
              </div>
            )}
          </div>
          <div className="overlay" aria-hidden="true">
            {props.highlights.map((hl, i) => {
              const b = box(hl.rect);
              return b ? (
                <div
                  key={i}
                  className="ref"
                  style={{ ...b, '--c': REF_COLOURS[hl.colour] } as React.CSSProperties}
                />
              ) : null;
            })}
            {props.others.map((o) => {
              const b = box(o.rect);
              return b ? (
                <div
                  key={o.id}
                  className="other"
                  style={{ ...b, '--c': o.colour } as React.CSSProperties}
                >
                  <span>{o.name}</span>
                </div>
              ) : null;
            })}
            {props.clip && box(props.clip.rect) && (
              <div
                className={`clip${props.clip.cut ? ' cut' : ''}`}
                style={box(props.clip.rect)!}
              />
            )}
            {selBox && multi && <div className="sel" style={selBox} />}
            {activeBox && <div className="active" style={activeBox} />}
            {fillBox && <div className="filling" style={fillBox} />}
          </div>
          {handleAt && !props.editor && (
            <div
              className="handle"
              style={{ left: handleAt.left, top: handleAt.top }}
              onPointerDown={onFillDown}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      {/* the editor sits over the grid rather than in it: a grid's children are its rows */}
      {editorBox && props.editor?.(editorBox)}
    </>
  );
});

interface RowProps {
  sheet: Sheet;
  row: number;
  cols: number[];
  geometry: Columns;
  top: number;
  left: (c: number) => number;
  right: number;
  sel: Rect;
  active: Pos;
  formulas: boolean;
  describe: (p: Pos) => string;
}

/* One row of cells. Text that does not fit runs on over empty neighbours, as in every
   spreadsheet, and a number that does not fit shows as ### rather than a misleading part
   of itself. */
function Row({
  sheet,
  row,
  cols,
  geometry,
  top,
  left,
  right,
  sel,
  active,
  formulas,
  describe,
}: RowProps) {
  const inRows = row >= sel.r1 && row <= sel.r2;
  const cells: ReactNode[] = [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]!;
    const cell = sheet.cell(row, c);
    const formula = formulas && !!cell?.input?.startsWith('=');
    const text = !cell ? '' : formula ? cell.input! : sheet.display(row, c);
    const v = cell?.value ?? null;
    const f = cell?.format;
    const kind = formula
      ? 'txt'
      : typeof v === 'number'
        ? 'num'
        : typeof v === 'boolean' || isError(v)
          ? 'mid'
          : 'txt';
    const align = f?.align ?? (kind === 'num' ? 'right' : kind === 'mid' ? 'center' : 'left');
    const width = geometry.width(c);
    const selected = inRows && c >= sel.c1 && c <= sel.c2;
    const isActive = active.row === row && active.col === c;
    let shown = text;
    let spill = 0;
    if (text && !fits(text, width - 8, f?.bold, f?.italic)) {
      if (kind === 'num') shown = '#'.repeat(Math.max(1, Math.floor((width - 8) / 8)));
      else if (align === 'left') {
        // run on over empty cells to the right
        let k = c + 1;
        let w = width;
        while (k <= right + 20 && k < MAX_COLS && sheet.value(row, k) === null) {
          w += geometry.width(k);
          k++;
          if (fits(text, w - 8, f?.bold, f?.italic)) break;
        }
        spill = w - width;
      }
    }
    const classes = ['c', align];
    if (f?.bold) classes.push('b');
    if (f?.italic) classes.push('i');
    if (isError(v)) classes.push('err');
    if (spill) classes.push('spill');
    cells.push(
      <div
        key={c}
        role="gridcell"
        id={cellId(row, c)}
        aria-colindex={c + 2}
        aria-selected={selected || isActive ? 'true' : undefined}
        aria-label={isActive ? describe({ row, col: c }) : undefined}
        className={classes.join(' ')}
        style={{ left: left(c), width }}
      >
        {shown && <span style={spill ? { width: width + spill - 8 } : undefined}>{shown}</span>}
      </div>,
    );
  }
  return (
    <div role="row" aria-rowindex={row + 2} className="r" style={{ top }}>
      <div
        role="rowheader"
        aria-colindex={1}
        className={`h row${row >= 99_999 ? ' long' : ''}${inRows ? ' on' : ''}${inRows && sel.c1 === 0 && sel.c2 === MAX_COLS - 1 ? ' all' : ''}`}
      >
        {row + 1}
      </div>
      {cells}
    </div>
  );
}

function fillRect(src: Rect, row: number, col: number): Rect {
  // extend along whichever axis the pointer has moved further from the source
  const down = row - src.r2;
  const up = src.r1 - row;
  const rightBy = col - src.c2;
  const leftBy = src.c1 - col;
  const v = Math.max(down, up);
  const h = Math.max(rightBy, leftBy);
  if (v <= 0 && h <= 0) return src;
  if (v >= h) return down > 0 ? { ...src, r2: row } : { ...src, r1: row };
  return rightBy > 0 ? { ...src, c2: col } : { ...src, c1: col };
}
