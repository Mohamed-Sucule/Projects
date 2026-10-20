/* Live editing across tabs. Open the sheet in two tabs and an edit in one appears in the
   other, with each tab's selection shown to the rest, over a BroadcastChannel: no server.

   Two tabs can change the same cell at the same moment, and both must end up agreeing. So
   every cell carries a Lamport timestamp (a counter that every tab moves past any value it
   sees) with the tab's id to break ties, and a change is only applied if it is newer than
   the one the cell already has. Whatever order the messages arrive in, every tab keeps the
   same winner: a last-writer-wins register per cell.

   Inserting or deleting rows moves every cell below, which no per-cell rule can merge. Those
   are rare, so the tab that makes one sends the whole sheet, and the others replace theirs
   (losing their undo history, which no longer describes the sheet). A tab that opens asks
   the others for the sheet in the same way. */

import { cellKey, type Rect } from '../engine/address';
import type { Change, Format } from '../engine/sheet';
import type { Pos } from './selection';
import type { Workbook } from './workbook';

type Stamp = [clock: number, tab: string];

const newer = (a: Stamp, b: Stamp | undefined) =>
  !b || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

export interface Peer {
  id: string;
  name: string;
  colour: string;
  rect: Rect | null;
  active: Pos | null;
}

type Message =
  | { t: 'hello'; from: string; name: string; colour: string }
  | { t: 'here'; from: string; name: string; colour: string; rect: Rect | null; active: Pos | null }
  | { t: 'cells'; from: string; changes: [Change, Stamp][] }
  | {
      t: 'sheet';
      from: string;
      to: string | null;
      clock: number;
      cells: [number, number, string | null, Format | null][];
      widths: [number, number][];
    }
  | { t: 'presence'; from: string; rect: Rect; active: Pos }
  | { t: 'bye'; from: string };

const NAMES = [
  'Otter',
  'Heron',
  'Fox',
  'Wren',
  'Badger',
  'Hare',
  'Kestrel',
  'Newt',
  'Lynx',
  'Puffin',
];
const COLOURS = [
  '#e8590c',
  '#0ca678',
  '#7048e8',
  '#d6336c',
  '#1c7ed6',
  '#f08c00',
  '#2f9e44',
  '#ae3ec9',
];

export class TabSync {
  readonly id = Math.random().toString(36).slice(2, 10);
  readonly name = NAMES[Math.floor(Math.random() * NAMES.length)]!;
  readonly colour = COLOURS[Math.floor(Math.random() * COLOURS.length)]!;
  readonly peers = new Map<string, Peer>();
  private readonly channel: BroadcastChannel | null;
  private clock = 0;
  private readonly stamps = new Map<number, Stamp>();
  private joined = false;
  /** whether another tab's sheet has replaced this one's */
  received = false;
  private here: { rect: Rect; active: Pos } | null = null;

  constructor(
    private readonly wb: Workbook,
    private readonly onPeers: () => void,
    private readonly onReplaced: () => void,
  ) {
    this.channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('cells-v1');
    if (!this.channel) return;
    this.channel.onmessage = (e: MessageEvent<Message>) => this.receive(e.data);
    this.post({ t: 'hello', from: this.id, name: this.name, colour: this.colour });
    // the first tab to answer a hello sends the sheet; with nobody there, this tab's own copy stands
    this.timer = setTimeout(() => (this.joined = true), 1500);
    addEventListener('pagehide', this.leave);
  }

  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly leave = () => this.post({ t: 'bye', from: this.id });

  close() {
    this.leave();
    clearTimeout(this.timer);
    removeEventListener('pagehide', this.leave);
    this.channel?.close();
  }

  get available() {
    return !!this.channel;
  }

  private post(m: Message) {
    try {
      this.channel?.postMessage(m);
    } catch {
      /* a closed channel, as the page goes away */
    }
  }

  /** Called with every change made in this tab: cells, or null for "the whole sheet". */
  local(changes: Change[] | null) {
    if (!this.channel) return;
    if (!changes) {
      this.sendSheet(null);
      return;
    }
    const stamped = changes.map((ch): [Change, Stamp] => {
      const s: Stamp = [++this.clock, this.id];
      this.stamps.set(cellKey(ch.row, ch.col), s);
      return [ch, s];
    });
    this.post({ t: 'cells', from: this.id, changes: stamped });
  }

  presence(rect: Rect, active: Pos) {
    this.here = { rect, active };
    this.post({ t: 'presence', from: this.id, rect, active });
  }

  private sendSheet(to: string | null) {
    this.clock++;
    this.post({
      t: 'sheet',
      from: this.id,
      to,
      clock: this.clock,
      cells: [...this.wb.sheet.dump()],
      widths: [...this.wb.sheet.widths],
    });
  }

  private receive(m: Message) {
    if (m.from === this.id) return;
    switch (m.t) {
      case 'hello':
        this.peers.set(m.from, {
          id: m.from,
          name: m.name,
          colour: m.colour,
          rect: null,
          active: null,
        });
        this.post({
          t: 'here',
          from: this.id,
          name: this.name,
          colour: this.colour,
          rect: this.here?.rect ?? null,
          active: this.here?.active ?? null,
        });
        this.sendSheet(m.from);
        this.onPeers();
        break;
      case 'here':
        this.peers.set(m.from, {
          id: m.from,
          name: m.name,
          colour: m.colour,
          rect: m.rect,
          active: m.active,
        });
        this.onPeers();
        break;
      case 'presence': {
        const p = this.peers.get(m.from);
        if (p) {
          p.rect = m.rect;
          p.active = m.active;
          this.onPeers();
        }
        break;
      }
      case 'bye':
        this.peers.delete(m.from);
        this.onPeers();
        break;
      case 'cells': {
        const accepted: Change[] = [];
        for (const [ch, s] of m.changes) {
          this.clock = Math.max(this.clock, s[0]);
          const k = cellKey(ch.row, ch.col);
          if (newer(s, this.stamps.get(k))) {
            this.stamps.set(k, s);
            accepted.push(ch);
          }
        }
        if (accepted.length) this.wb.remote(accepted);
        break;
      }
      case 'sheet': {
        // a new tab takes the first sheet offered; everyone takes a sheet sent to all
        if (m.to !== null && (m.to !== this.id || this.joined)) break;
        this.joined = true;
        this.received = true;
        this.clock = Math.max(this.clock, m.clock);
        this.stamps.clear();
        const sheet = this.wb.sheet;
        sheet.reset();
        for (const [c, w] of m.widths) sheet.widths.set(c, w);
        sheet.load(m.cells);
        this.wb.forget();
        this.onReplaced();
        break;
      }
    }
  }
}
