/* ───────────────────────────────────────────────────────────────────────────
   callcoach/analyse.js — listening to a sales call the way a sales manager
   would, one line at a time.

   Three jobs, in the order a rep feels them:

     DURING THE CALL — put the right thing on screen at the right moment. The
     prospect says "that's more than double what we pay now" and, before the
     rep has finished breathing in, a card says what that objection usually
     means, the question to ask back, and one way to answer. A competitor is
     named and the card for that competitor appears. The rep has been talking
     for a minute straight and a nudge says so.

     AT THE END — the notes nobody wants to write. What hurts, in the
     prospect's own words and numbers; who signs; what it has to do; what
     happens next and by when. Filled into the qualification fields a sales
     team actually uses, each one with the line it came from, and the empty
     ones marked as the questions to ask next time.

     AND HONESTLY — a call that went nowhere is summarised as a call that went
     nowhere, with the reason and the one thing still worth doing.

   Everything is read from the words: nothing here knows which sample call is
   playing, and a call typed in live gets the same treatment.
   ─────────────────────────────────────────────────────────────────────────── */

import { CARDS, COMPETITORS, PRODUCT, MEDDICC } from './playbook.js';

/* ── tagging a line ──────────────────────────────────────────────────────── */

const COMPETITOR_NAMES = Object.keys(COMPETITORS);
const COMPETITOR_RE = new RegExp(`\\b(${COMPETITOR_NAMES.join('|')})\\b`, 'i');

const RULES = {
  'objection:price': /\b(?:expensive|pricey|steep|too much|can(?:'|no)?t afford|out of our price range|sticking point|(?:don'?t|do not) (?:really )?have (?:the )?budget|budget (?:is )?(?:tight|limited)|more than (?:double |twice )?(?:what )?we(?:'re| are)? (?:currently )?(?:pay|paying|spend)|a lot more than we (?:were )?expect|costs? against|compared (?:to|with) what we pay|price is (?:the |an? )?(?:issue|problem|high))/,
  'objection:competitor': COMPETITOR_RE,
  'objection:timing': /\b(?:not (?:really )?(?:the |a )?(?:right|good|great) time|now'?s not (?:great|good|the time)|bad time|flat out|in the middle of (?:a |the )?(?:refurb|refurbishment|renovation|move)|refurb(?:ishment)?|revisit (?:this|it)|circle back|after (?:christmas|summer|the new year|easter)|later in the year|next year|when things calm down|not a priority|short[- ]staffed|bit mad)\b/,
  'objection:authority': /\b(?:run (?:it|this) (?:past|by)|(?:check|talk|speak) (?:with|to) (?:my|our) (?:boss|business partner|partner|owners?|director|finance director|fd|cfo|ceo|operations director|ops director|md|board))|\bnot my (?:decision|call)\b|\b(?:owners?|board|boss) (?:decides?|decide)\b|\bsigns? off\b|\bfinal say\b|\bgoes to (?:priya|our|the|my)\b|\bbefore we commit\b|\bneed (?:our|my) [^.?!]{0,30}\b(?:director|boss|partner|owners?) to (?:see|approve|sign)/,
  'objection:contract': /\blocked in(?:to)?\b|\btied in\b|\bcancellation fee|\bearly termination|\block-?in\b|\bnotice period\b|\b(?:\w+[- ])?year deal\b|\bcontract\b[^.?!]{0,40}\b(?:to run|until|runs|ends)\b|\b(?:signed|sign up for) a (?:\w+[- ])?(?:year|month) (?:deal|contract)/,
  'objection:integration': /\bintegrat\w*|\bwork with our (?:tills?|pos|epos|system|software)|\btalk to our (?:tills?|pos|epos|system)|\bsync(?:s)? with\b|\bconnect (?:to|with) our\b|\b(?:epos|pos)\b|\btills?\b[^.?!]{0,20}\b(?:work|talk|sync|connect|link)\b|\b(?:work|talk|sync|connect|link)\b[^.?!]{0,20}\btills?\b/,
  'objection:change': /\b(?:staff|team|managers|people) (?:hate|won'?t (?:like|use|get on)|will (?:hate|struggle)|are used to|like the (?:paper|old))|\bnot (?:very )?techy\b|\bget on with it\b|\blearning curve\b|\bbed in\b|\bmoving (?:all )?(?:our|the) (?:bookings|data) over\b|\bmigrat\w*|\bnightmare\b|\bwent badly\b|\btried (?:something like this|this) before\b|\bused to the (?:paper|old)/,
  'objection:trust': /\b(?:goes|go|went|going) down\b|\boutage|\bdowntime|\bdata (?:stored|protection|security)|\bgdpr\b|\bsecure\b|\bsecurity\b|\bguest data\b|\bour data\b|\bsupport (?:like|at|hours)\b|\bif (?:it|your system) (?:crashes|fails)/,
  'signal:timeline': /\b(?:want|need|have to have|has to be|must be|like to have|hoping to have)\b[^.?!]{0,40}\b(?:before|by|in time for)\b|\bhow (?:quickly|soon|fast) (?:could|can|would)\b|\bhow long (?:does|would|will) it take\b|\bup and running\b|\bget going\b/,
  'signal:implementation': /\bhow (?:does|would|do) (?:the )?(?:setup|set-up|set up|onboarding|implementation|training|migration|rollout)\b|\bwho (?:would )?(?:trains?|set(?:s)? (?:it )?up)\b|\bwhat does (?:onboarding|setup|implementation|training) look like\b|\b(?:get|getting) set up\b/,
  'signal:pricing': /\bhow much (?:would|is|does|will)\b|\bwhat(?:'s| is| does| would)(?: the)? (?:monthly |annual |yearly )?(?:cost|price|pricing)\b|\bdiscount\b|\bprices in writing\b/,
  'signal:positive': /\b(?:that'?s|that is|sounds|looks) (?:really |very |so )?(?:great|brilliant|useful|interesting|clever|impressive|amazing|fantastic|exactly what)|\blove (?:that|the|it)\b|\bvery interesting\b|\bi can see (?:that|this|it) working\b|\bexactly what we need\b|\bthat would (?:save|help|be (?:huge|great|brilliant))\b/,
  'signal:next-step': /\b(?:can|could|would) you (?:send|put)\b|\bsend (?:it|that|them) over\b|\bsend (?:me|us) (?:something|the|a|some)\b|\bproposal\b|\bquote\b|\btrial\b|\bpilot\b|\bdemo\b|\b(?:book|set up|schedule|arrange) (?:a|another|the|some) (?:call|meeting|demo|time)\b|\blet'?s (?:do (?:that|it)|book|get|set)\b|\bcheck (?:her|his|their|my) diary\b|\bsend you (?:a couple of|some) times\b|\b(?:monday|tuesday|wednesday|thursday|friday) at \w+ works\b|\bcase study\b/,
  'pain:no-shows': /\bno[- ]shows?\b|\b(?:don'?t|do not|didn'?t) (?:just )?turn up\b|\bempty tables\b/,
  'pain:double-booking': /\bdouble[- ]?book\w*|\boverbook\w*|\bsame table to two\b/,
  'pain:phones': /\bphones? (?:rings?|ringing)\b|\bnon-stop\b[^.?!]{0,20}\b(?:phone|calls?)\b|\b(?:lose|losing|miss|missing|lost|missed) (?:so many |lots of )?calls\b|\bpicks? up the phone\b|\bnobody can get to it\b|\banswer(?:ing)? the phone\b/,
  'pain:admin': /\badmin\b|\bspreadsheets?\b|\breconcil\w*|\bcopying bookings\b|\bspends? (?:ages|hours|too long)\b/,
};

/* "Just send me an email and I'll have a look when things calm down" asks
   for something to be sent, and is not a next step. Every rep learns to hear
   the difference; the tagger has to be told. */
const BRUSH_OFF = /\bjust (?:send|email) (?:me|us)\b|\bwhen things calm down\b|\bi'?ll have a look\b/;

/** The moments in one line of what the prospect said. */
export function tag(text) {
  const t = String(text).toLowerCase().replace(/[’]/g, "'");
  const out = [];
  for (const [name, re] of Object.entries(RULES)) if (re.test(t)) out.push(name);
  if (BRUSH_OFF.test(t)) {
    const i = out.indexOf('signal:next-step');
    if (i >= 0) out.splice(i, 1);
    if (!out.includes('objection:timing')) out.push('objection:timing');
  }
  /* A question about cost is interest, not an objection. */
  if (out.includes('signal:pricing')) {
    const i = out.indexOf('objection:price');
    if (i >= 0 && !/\bexpensive|steep|too much|afford|sticking point|more than\b/.test(t)) out.splice(i, 1);
  }
  return out;
}

/* ── numbers as they are said ────────────────────────────────────────────── */

const SMALL = { a: 1, an: 1, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/**
 * Every number in a sentence, spoken or written, with where it is.
 * "a hundred and eighty-nine" → 189; "two thousand four hundred" → 2400;
 * "twelve, fifteen" → 12 and 15.
 */
export function numbers(text) {
  const out = [];
  const re = /£?\d[\d,]*(?:\.\d+)?k?|[a-z]+(?:-[a-z]+)?|[^a-z\d£]+/gi;
  const toks = [];
  let m;
  while ((m = re.exec(text))) toks.push({ t: m[0], lo: m[0].toLowerCase(), i: m.index });
  let k = 0;
  while (k < toks.length) {
    const tk = toks[k];
    if (/^£?\d/.test(tk.t)) {
      let v = parseFloat(tk.t.replace(/[£,k]/gi, ''));
      if (/k$/i.test(tk.t)) v *= 1000;
      out.push({ value: v, start: tk.i, end: tk.i + tk.t.length, pound: tk.t.startsWith('£') });
      k++; continue;
    }
    const isWord = (x) => x && (x.lo in SMALL || x.lo in TENS || x.lo === 'hundred' || x.lo === 'thousand' || /^(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-[a-z]+$/.test(x.lo));
    if (!isWord(tk) || ((tk.lo === 'a' || tk.lo === 'an') && !['hundred', 'thousand'].includes(toks[k + 2]?.lo))) { k++; continue; }
    let total = 0, cur = 0, j = k, end = tk.i;
    while (j < toks.length) {
      const x = toks[j];
      if (/^\s+$/.test(x.t) || (x.lo === 'and' && isWord(toks[j + 2]) && cur >= 100)) { j++; continue; }
      if (!isWord(x)) break;
      if ((x.lo === 'a' || x.lo === 'an') && j !== k) break;
      const hy = /^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-([a-z]+)$/.exec(x.lo);
      if (hy) cur += TENS[hy[1]] + (SMALL[hy[2]] ?? 0);
      else if (x.lo in SMALL) cur += SMALL[x.lo];
      else if (x.lo in TENS) cur += TENS[x.lo];
      else if (x.lo === 'hundred') cur = (cur || 1) * 100;
      else if (x.lo === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
      end = x.i + x.t.length;
      j++;
    }
    out.push({ value: total + cur, start: tk.i, end, pound: false });
    k = Math.max(j, k + 1);
  }
  return out;
}

/** Sums of money: "£189", "a hundred and eighty-nine pounds a site a month". */
export function money(text) {
  const out = [];
  for (const n of numbers(text)) {
    const after = text.slice(n.end, n.end + 40).toLowerCase();
    if (!n.pound && !/^\s*(?:pounds|quid|grand)\b/.test(after)) continue;
    const per = /^\s*(?:pounds|quid|grand)?\s*(?:a|per) (month|year|site|head|cover|night|week|restaurant)\b/.exec(after)?.[1] ?? null;
    const value = /^\s*grand/.test(after) ? n.value * 1000 : n.value;
    out.push({ value, per, text: text.slice(n.start, n.end + (/^\s*(?:pounds|quid|grand)/.exec(after)?.[0].length ?? 0)).trim() });
  }
  return out;
}

/* ── people ──────────────────────────────────────────────────────────────── */

const ROLE = '(?:finance director|operations director|ops director|head of operations|managing director|business partner|general manager|owner|owners|md|cfo|ceo|fd|boss|dad|mum|board)';

/** Who else was mentioned, and as what: "Priya, our finance director". */
export function people(text) {
  const out = [];
  const a = new RegExp(`\\b([A-Z][a-z]+),? (?:our|my|the) (${ROLE})\\b`, 'g');
  const b = new RegExp(`\\b(?:our|my|the) (${ROLE}),? ([A-Z][a-z]+)\\b`, 'g');
  const c = new RegExp(`\\b(?:our|my|the) (${ROLE})\\b`, 'gi');
  let m;
  while ((m = a.exec(text))) out.push({ name: m[1], role: m[2] });
  while ((m = b.exec(text))) out.push({ name: m[2], role: m[1] });
  while ((m = c.exec(text))) if (!out.some((p) => p.role.toLowerCase() === m[1].toLowerCase())) out.push({ name: null, role: m[1].toLowerCase() });
  return out;
}

/* ── how it sounded ──────────────────────────────────────────────────────── */

const GOOD = new Set('great brilliant useful interesting clever love like helpful perfect good excellent amazing fantastic sure yes okay ok absolutely definitely keen happy exactly works sense impressive save attention'.split(' '));
const BAD = new Set("killer chaos nightmare expensive steep hate worried problem problems stuck lost lose losing no not never mad badly embarrassing annoying frustrating difficult hard busy afraid doubt".split(' '));

/** −1 to 1, from the words. Crude on purpose: it is a trend line, not a verdict. */
export function tone(text) {
  const words = String(text).toLowerCase().match(/[a-z']+/g) ?? [];
  let s = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/'s$/, '');
    const neg = /^(?:not|no|never|don't|isn't|wasn't|won't|can't)$/.test(words[i - 1] ?? '');
    if (GOOD.has(w)) s += neg ? -1 : 1;
    else if (BAD.has(w) && !['no', 'not'].includes(w)) s += neg ? 0.5 : -1;
  }
  return Math.max(-1, Math.min(1, s / 3));
}

/* ── the rep's side ──────────────────────────────────────────────────────── */

export function questions(text) {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  const qs = parts.filter((p) => /\?\s*$/.test(p));
  return qs.map((q) => ({ text: q, open: /^\s*(?:\w+,\s*)?(?:what|how|why|tell me|walk me|talk me|describe|which|who|where|when)\b/i.test(q) || /\bwhat\b|\bhow\b/i.test(q.split(/\s+/).slice(0, 4).join(' ')) }));
}

const words = (t) => (String(t).match(/\S+/g) ?? []).length;

/* ── a call, as it happens ───────────────────────────────────────────────── */

export function createAnalysis(meta) {
  const buyerOnCall = /finance|owner|founder|ceo|managing director|cfo/i.test(meta.prospect?.role ?? '');
  return {
    meta,
    lines: [],
    words: { rep: 0, prospect: 0 },
    run: { who: null, words: 0 },
    questions: [],
    moments: [],                 // { line, tag }
    covered: new Set(buyerOnCall ? ['decision'] : []),   // checklist items
    competitorsShown: new Set(),
    cardsShown: new Set(),
    nudged: new Set(),
    tones: [],
  };
}

export const CHECKLIST = [
  ['pain', 'Found the pain'],
  ['numbers', 'Put a number on it'],
  ['decision', 'Who decides'],
  ['budget', 'Talked about price'],
  ['timeline', 'Their deadline'],
  ['next', 'Agreed a next step'],
];

/**
 * One line of the call has been said. Returns what the screen should do
 * about it: tags on the line, cards to show, nudges, and the running numbers.
 */
export function hear(state, line) {
  const { who, text } = line;
  const idx = state.lines.length;
  const n = words(text);
  const entry = { ...line, i: idx, tags: [], tone: null, money: money(text), people: people(text) };
  state.lines.push(entry);
  state.words[who] += n;
  if (state.run.who === who) state.run.words += n; else state.run = { who, words: n };

  const cards = [], nudges = [];
  const lo = text.toLowerCase();

  if (who === 'prospect') {
    entry.tags = tag(text);
    entry.tone = tone(text);
    state.tones.push({ i: idx, v: entry.tone });
    for (const t of entry.tags) state.moments.push({ line: idx, tag: t });

    for (const t of entry.tags) {
      const kind = t.split(':')[1];
      if (t.startsWith('objection:') && kind !== 'competitor' && !state.cardsShown.has(kind)) {
        state.cardsShown.add(kind);
        cards.push({ type: 'objection', key: kind, ...CARDS[kind], quote: text });
      }
    }
    const comp = COMPETITOR_RE.exec(text)?.[1];
    if (comp) {
      const name = COMPETITOR_NAMES.find((c) => c.toLowerCase() === comp.toLowerCase());
      if (!state.competitorsShown.has(name)) {
        state.competitorsShown.add(name);
        cards.push({ type: 'competitor', key: name, title: name, ...COMPETITORS[name], quote: text });
      }
    }
    const pains = entry.tags.filter((t) => t.startsWith('pain:'));
    if (pains.length) {
      state.covered.add('pain');
      const nums = numbers(text).filter((x) => x.value > 1);
      if (nums.length) {
        state.covered.add('numbers');
        const where = bestSentence(text, RULES[pains[0]]);
        const n = numbers(where).find((x) => x.value > 1) ?? nums[0];
        const said = where.slice(n.start).split(/[.;!?]| and | but /)[0].trim().split(/\s+/).slice(0, 9).join(' ').replace(/,\s*(?:just|which|and|but)\b.*$/, '').replace(/[,\s]+$/, '');
        nudges.push({ kind: 'good', text: `They put a number on it: “${said}”. Keep it for when price comes up.` });
      } else if (!state.nudged.has(`quantify:${pains[0]}`)) {
        /* nothing to quote */
        state.nudged.add(`quantify:${pains[0]}`);
        nudges.push({ kind: 'ask', text: `Pain: ${pains[0].split(':')[1].replace('-', ' ')}. Ask how often it happens and what it costs.` });
      }
    }
    if (entry.tags.includes('objection:authority') || entry.people.length) state.covered.add('decision');
    if (entry.tags.some((t) => t === 'objection:price' || t === 'signal:pricing') || entry.money.length) state.covered.add('budget');
    if (entry.tags.includes('signal:timeline') || /\b(?:before|by) (?:summer|christmas|may|june|april|march|september)\b/.test(lo)) state.covered.add('timeline');
    if (entry.tags.includes('signal:next-step')) state.covered.add('next');
    const signals = entry.tags.filter((t) => t.startsWith('signal:') && t !== 'signal:next-step');
    if (signals.length && !state.covered.has('next')) {
      nudges.push({ kind: 'go', text: `Buying signal — ${signals.map((s) => s.split(':')[1]).join(', ')}. Good moment to propose a next step.` });
    }
    if (/\bnumbers?\b|\bdecid|\bsigns? off\b/.test(lo) && !entry.tags.length) state.covered.add('decision');
  } else {
    const qs = questions(text);
    for (const q of qs) state.questions.push({ line: idx, ...q });
    if (entry.money.length) state.covered.add('budget');
    if (/\b(?:pilot|trial|book|send|review|demo)\b[^.?!]*\b(?:next week|thursday|wednesday|monday|tuesday|friday|today|tomorrow)\b/i.test(text)) {
      /* The rep proposed a dated next step; it counts once the prospect agrees. */
      entry.proposes = true;
    }
    if (n >= 35 && !qs.length && !state.covered.has('pain') && !state.nudged.has('pitch')) {
      state.nudged.add('pitch');
      nudges.push({ kind: 'warn', text: "That's a pitch, and there's no problem on the table yet. Ask what's hard about bookings for them first." });
    }
    if (state.run.words > 70 && !state.nudged.has(`monologue:${idx}`)) {
      state.nudged.add(`monologue:${idx}`);
      nudges.push({ kind: 'warn', text: `That's ${state.run.words} words without a breath — hand it back with a question.` });
    }
    if (!qs.length && state.lines.filter((l) => l.who === 'rep').length === 3 && state.questions.length === 0) {
      nudges.push({ kind: 'warn', text: "Three turns in and you haven't asked a question yet." });
    }
  }

  const total = state.words.rep + state.words.prospect;
  const repShare = total ? state.words.rep / total : 0;
  if (state.lines.length >= 8 && repShare > 0.62 && !state.nudged.has('talk')) {
    state.nudged.add('talk');
    nudges.push({ kind: 'warn', text: `You're doing ${Math.round(repShare * 100)}% of the talking. The best calls are closer to half.` });
  }

  entry.cards = cards;
  entry.nudges = nudges;
  return { line: entry, cards, nudges, metrics: metrics(state) };
}

export function metrics(state) {
  const total = state.words.rep + state.words.prospect;
  const qs = state.questions;
  const recent = state.tones.slice(-4);
  return {
    repShare: total ? state.words.rep / total : 0,
    questions: qs.length,
    open: qs.filter((q) => q.open).length,
    moments: state.moments.length,
    objections: state.moments.filter((m) => m.tag.startsWith('objection:')).length,
    signals: state.moments.filter((m) => m.tag.startsWith('signal:')).length,
    mood: recent.length ? recent.reduce((s, x) => s + x.v, 0) / recent.length : 0,
    covered: [...state.covered],
  };
}

/* ── after the call ──────────────────────────────────────────────────────── */

const clip = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
const firstSentenceWith = (text, re) => text.split(/(?<=[.!?])\s+/).find((s) => re.test(s.toLowerCase())) ?? text;
/* The sentence that says it with a number, if there is one: "fifteen
   no-shows at forty pounds a head" beats "no-shows are the other killer". */
const bestSentence = (text, re) => {
  const all = text.split(/(?<=[.!?])\s+/);
  const hits = all.filter((s) => re.test(s.toLowerCase()));
  const numbered = hits.find((s) => numbers(s).some((n) => n.value > 1));
  return numbered ?? hits[0] ?? text;
};
/* A short sentence on its own loses its meaning — "Maybe four hundred
   pounds a site." — so it keeps the sentence before it. */
const withContext = (text, sentence) => {
  if (sentence.length >= 45) return sentence;
  const all = text.split(/(?<=[.!?])\s+/);
  const i = all.indexOf(sentence);
  return i > 0 ? `${all[i - 1]} ${sentence}` : sentence;
};

const ANSWERED_BY = {
  price: /£|pounds|cost|fees?|subscription|price|pays for itself/i,
  timing: /pilot|before|by|when|date|finish|reopen/i,
  authority: /book|meet|minutes with|business case|what would|show/i,
  contract: /notice|pilot|in time|when|until/i,
  integration: /export|test|integrat|link|till/i,
  change: /training|shift|pilot|next to|who would use/i,
  trust: /offline|sync|run sheet|data|uk|belongs/i,
  competitor: /difference|pilot|contract|fees|floor plan|what would you change/i,
};

/**
 * The notes. Everything in here is a line from the call or a number read off
 * one; where the call did not cover something, the field says so and turns
 * into the question to ask next time.
 */
export function summarise(state) {
  const { meta } = state;
  const P = state.lines.filter((l) => l.who === 'prospect');
  const R = state.lines.filter((l) => l.who === 'rep');
  const has = (t) => P.filter((l) => l.tags.includes(t));
  const withPrefix = (p) => P.filter((l) => l.tags.some((t) => t.startsWith(p)));

  /* What hurts */
  const pains = [];
  for (const t of ['pain:no-shows', 'pain:double-booking', 'pain:phones', 'pain:admin']) {
    const ls = has(t);
    if (ls.length) pains.push({ tag: t, line: ls[0].i, quote: clip(bestSentence(ls[0].text, RULES[t])) });
  }

  /* Numbers said by the prospect, with the words round them */
  const metricsFound = [];
  for (const l of P) {
    for (const s of l.text.split(/(?<=[.!?])\s+/)) {
      const nums = numbers(s).filter((x) => x.value > 1);
      const talksCost = /\b(?:no-shows?|hours?|pounds|fees?|covers?|admin|a head|per site|a site)\b/i.test(s);
      if (nums.length && talksCost && !/\bminutes before\b|\btwenty minutes\b/.test(s)) metricsFound.push({ line: l.i, quote: clip(withContext(l.text, s)) });
    }
  }

  /* Objections, and whether the next thing the rep said dealt with them */
  const objections = [];
  for (const l of withPrefix('objection:')) {
    for (const t of l.tags.filter((x) => x.startsWith('objection:'))) {
      const kind = t.split(':')[1];
      const seen = objections.find((o) => o.kind === kind);
      if (seen) { seen.times++; continue; }
      const reply = state.lines.slice(l.i + 1).find((x) => x.who === 'rep');
      const answered = !!reply && (ANSWERED_BY[kind]?.test(reply.text) || /\?\s*$/.test(reply.text));
      objections.push({ kind, title: kind === 'competitor' ? 'Already using a competitor' : CARDS[kind].title, line: l.i, quote: clip(bestSentence(l.text, RULES[t])), answered, reply: reply?.text ?? null, times: 1 });
    }
  }

  /* People */
  const mentioned = P.flatMap((l) => l.people.map((p) => ({ ...p, line: l.i })));
  const buyerLine = has('objection:authority')[0];
  const signer = mentioned.find((p) => /finance|owner|md|cfo|ceo|fd|board|business partner|dad|mum/i.test(p.role));
  const prospectIsBuyer = /finance|owner|founder|ceo|managing director|cfo/i.test(meta.prospect.role);

  const signals = withPrefix('signal:');
  const nextSteps = [];
  for (const l of state.lines) {
    if (l.who === 'rep') {
      for (const s of l.text.split(/(?<=[.!?])\s+/)) {
        if (/\b(?:i'?ll|i will|we'?ll|let'?s|could we|can we)\b[^.?!]*\b(?:send|book|review|pilot|call|meet|demo|set up)\b/i.test(s)) {
          const agreed = state.lines.slice(l.i + 1).find((x) => x.who === 'prospect');
          nextSteps.push({ who: meta.rep.name, line: l.i, text: clip(s), agreed: !!agreed && agreed.tags.includes('signal:next-step') });
        }
      }
    } else if (l.tags.includes('signal:next-step')) {
      const s = firstSentenceWith(l.text, /\bi'?ll (?:check|send|book|talk|speak|ask|get|set|introduce|share)\b/);
      if (/\bi'?ll (?:check|send|book|talk|speak|ask|get|set|introduce|share)\b/i.test(s)) nextSteps.push({ who: meta.prospect.name.split(' ')[0], line: l.i, text: clip(s), agreed: true });
    }
  }
  const agreedStep = nextSteps.some((s) => s.agreed);
  const brushOff = P.some((l) => BRUSH_OFF.test(l.text.toLowerCase()));

  const quoteOf = (l, re) => (l ? { line: l.i, quote: clip(re ? firstSentenceWith(l.text, re) : l.text) } : null);
  const criteriaLines = P.filter((l) => l.tags.some((t) => ['objection:integration', 'objection:trust', 'objection:change'].includes(t)) || /\b(?:has to|must|need it to|needs to)\b/i.test(l.text));
  const processLines = P.filter((l) => l.tags.includes('objection:authority') || l.tags.includes('objection:contract') || /\bnotice\b|\btell them by\b|\bboard\b|\bapproval\b/i.test(l.text) || (l.tags.includes('signal:next-step') && /\b(?:her|his|priya|diary|show)\b/i.test(l.text)));
  const champion = signals.length >= 2 && !prospectIsBuyer ? { name: meta.prospect.name, why: `${signals.length} buying signals${P.some((l) => /\bshow (?:priya|her|him|them|the)\b/i.test(l.text)) ? ', and asked for something to show the person who signs' : ''}` } : null;
  const competitors = [...state.competitorsShown];

  const fields = {
    metrics: metricsFound.length ? metricsFound.slice(0, 3) : null,
    buyer: prospectIsBuyer ? [{ line: 0, note: true, quote: `${meta.prospect.name}, ${meta.prospect.role} — on this call.` }]
      : signer ? [{ line: signer.line, note: true, quote: `${signer.name ? `${signer.name}, ` : ''}${signer.role}${buyerLine ? ` — “${clip(firstSentenceWith(buyerLine.text, /signs? off|final say|decid/) === buyerLine.text ? firstSentenceWith(buyerLine.text, /goes to|past|commit/) : firstSentenceWith(buyerLine.text, /signs? off|final say|decid/), 110)}”` : ''}` }]
        : buyerLine ? [quoteOf(buyerLine)] : null,
    criteria: criteriaLines.length ? criteriaLines.slice(0, 3).map((l) => quoteOf(l, /has to|must|need|work with|down|data|staff|till/)) : null,
    process: processLines.length ? processLines.slice(0, 3).map((l) => quoteOf(l, /locked|contract|notice|tell them|signs?|goes to|show|diary|commit|final/)) : null,
    pain: pains.length ? pains.map((p) => ({ line: p.line, quote: p.quote })) : null,
    champion: champion ? [{ line: null, note: true, quote: `${champion.name} — ${champion.why}.` }] : null,
    competition: competitors.length ? competitors.map((c) => ({ line: P.find((l) => new RegExp(c, 'i').test(l.text))?.i ?? null, note: true, quote: `${c}: ${COMPETITORS[c].summary}` })) : null,
  };
  const ASK_NEXT = {
    metrics: 'What does the problem cost them — in covers, hours or pounds?',
    buyer: 'Who signs off on something like this?',
    criteria: 'What does it have to do for them to say yes?',
    process: 'What happens between here and a decision, and who is involved?',
    pain: "What's the one thing about bookings that costs them most?",
    champion: 'Who inside would push for this if you were not in the room?',
    competition: 'What are they using today, and what would they keep?',
  };
  const meddicc = MEDDICC.map(([key, label, hint]) => ({ key, label, hint, found: fields[key], ask: fields[key] ? null : ASK_NEXT[key] }));

  /* Where the deal stands, said plainly */
  const gaps = meddicc.filter((f) => !f.found).map((f) => f.label.toLowerCase());
  const openObjections = objections.filter((o) => !o.answered);
  let verdict, stage;
  if (brushOff || (!pains.length && !agreedStep)) {
    stage = 'Nurture';
    verdict = `Not progressing. ${pains.length ? '' : 'No pain came out of the call. '}${competitors.length ? `They're happy with ${competitors.join(' and ')}. ` : ''}${brushOff ? 'It ended on "just send me an email" — a polite no for now, not a next step.' : 'No next step was agreed.'}`;
  } else if (agreedStep && (fields.buyer && (prospectIsBuyer || nextSteps.some((s) => /\b(?:priya|her|him|them)\b/i.test(s.text))))) {
    stage = prospectIsBuyer ? 'Proposal' : 'Qualified';
    const good = [
      pains.length ? `real pain (${pains.map((p) => p.tag.split(':')[1].replace('-', ' ')).join(', ')})` : null,
      fields.buyer ? (prospectIsBuyer ? 'the person who signs was on the call' : 'the person who signs is known') : null,
      'a dated next step was agreed',
    ].filter(Boolean);
    verdict = `Moving: ${good.slice(0, -1).join(', ')}${good.length > 1 ? ' and ' : ''}${good[good.length - 1]}.${pains.length ? '' : ' No pain came out of this call, though — ask for it next time.'}`;
  } else {
    stage = 'Discovery';
    verdict = `Early. ${agreedStep ? 'A next step was agreed, ' : 'No next step yet, '}but ${gaps.length ? gaps.slice(0, 2).join(' and ') : 'some of the basics'} still to find out.`;
  }

  /* The follow-up, in the prospect's own words where possible */
  const first = meta.prospect.name.split(' ')[0];
  const sites = (() => {
    for (const l of P) {
      const m = /\b(\w+) (?:sites|restaurants|venues)\b/i.exec(l.text);
      if (m) { const n = numbers(m[1])[0]?.value ?? parseInt(m[1], 10); if (n > 0) return n; }
    }
    for (const l of state.lines) { const m = /\b(\w+) sites\b/i.exec(l.text); if (m) { const n = numbers(m[1])[0]?.value; if (n) return n; } }
    return null;
  })();
  const repSteps = nextSteps.filter((s) => s.who === meta.rep.name);
  const email = brushOff || stage === 'Nurture'
    ? {
      subject: `${PRODUCT.name} — for when things calm down`,
      body: [
        `Hi ${first},`,
        '',
        `Thanks for giving me a couple of minutes today — I know it's a busy time${P.some((l) => /refurb/i.test(l.text)) ? ' with the refurbishment' : ''}.`,
        '',
        `In one line: ${PRODUCT.name} puts your real floor plan and turn times behind every booking, so a table can't be double-booked, and it texts every guest the day before so no-shows give their table back.`,
        ...(P.some((l) => /\bapril|may|reopen|finish/i.test(l.text)) ? ['', `You mentioned the work should be finished ${P.find((l) => /\bapril|may\b/i.test(l.text))?.text.match(/end of \w+|april|may/i)?.[0].toLowerCase().replace(/\b(april|may)\b/, (m) => m[0].toUpperCase() + m.slice(1)) ?? 'soon'}. If it's useful, I could show you the floor plan with your new room in it before you reopen — twenty minutes, whenever suits.`] : []),
        '',
        'No need to reply if the timing is wrong; I will not chase.',
        '',
        `${meta.rep.name}`,
      ].join('\n'),
    }
    : {
      subject: `${PRODUCT.name} × ${meta.prospect.company} — recap and next steps`,
      body: [
        `Hi ${first},`,
        '',
        'Thanks for your time today. So we are working from the same notes, here is what I heard:',
        '',
        ...pains.map((p) => `• “${p.quote}”`),
        ...metricsFound.filter((m) => !pains.some((p) => p.line === m.line)).slice(0, 2).map((m) => `• “${m.quote}”`),
        ...(criteriaLines.length ? ['', 'What it needs to do:', ...criteriaLines.slice(0, 3).map((l) => `• “${clip(firstSentenceWith(l.text, /has to|must|need|work with|down|data|staff|till/), 120)}”`)] : []),
        '',
        'Next steps:',
        ...(repSteps.length ? repSteps.flatMap((s) => asAgreed(s)) : ['• I will send over the details we discussed.']),
        ...nextSteps.filter((s) => s.who !== meta.rep.name).map((s) => `• ${s.text.replace(/^(?:[\w']+[,.!]\s*)*?I'?ll\b/i, "You'll").replace(/\bsend you\b/i, 'send me')}`),
        '',
        `${meta.rep.name}`,
      ].join('\n'),
    };

  const timelineLine = P.find((l) => l.tags.includes('signal:timeline')) ?? P.find((l) => /\b(?:before|by|until|end of) (?:summer|christmas|may|june|april|march|september|the new year)\b/i.test(l.text));
  const crm = {
    company: meta.prospect.company,
    contact: `${meta.prospect.name}, ${meta.prospect.role}`,
    stage,
    size: sites ? `${sites} sites × £${PRODUCT.pricePerSite} a month = £${(sites * PRODUCT.pricePerSite * 12).toLocaleString('en-GB')} a year` : 'Unknown — ask how many sites',
    competitor: competitors.join(', ') || 'None mentioned',
    timeline: timelineLine ? clip(firstSentenceWith(timelineLine.text, /before|by|until|end of|may|june|april|summer|september/), 90) : 'Not discussed',
    next: nextSteps.find((s) => s.agreed)?.text ?? (brushOff ? 'Send a short email; no chase' : 'None agreed'),
    risks: [...new Set(openObjections.map((o) => o.title))],
  };

  const total = state.words.rep + state.words.prospect;
  return {
    verdict, stage, pains, metrics: metricsFound, objections, meddicc, nextSteps, email, crm,
    stats: {
      repShare: total ? state.words.rep / total : 0,
      questions: state.questions.length,
      open: state.questions.filter((q) => q.open).length,
      signals: signals.length,
      objections: objections.length,
      answered: objections.filter((o) => o.answered).length,
    },
  };
}

/* A question asked on the call and agreed to becomes a statement in the
   email: "Could we book twenty minutes with Priya?" → "We agreed to book…" */
function asAgreed(step) {
  return step.text.replace(/^(?:Absolutely|Brilliant|Great|Perfect)[.!,]\s*/i, '').split(/\s+—\s+/).map((part) => {
    const q = /^(?:could|can|shall) we (.+?)\??$/i.exec(part.trim());
    if (q) return `• ${step.agreed ? 'We agreed to' : 'I suggested we'} ${q[1]}.`;
    const t = part.trim().replace(/^./, (c) => c.toUpperCase());
    return `• ${/[.!?]$/.test(t) ? t : `${t}.`}`;
  });
}

/** Run a whole call through the analyser in one go. */
export function analyseCall(call) {
  const state = createAnalysis(call);
  const events = call.lines.map((l) => hear(state, l));
  return { state, events, summary: summarise(state) };
}
