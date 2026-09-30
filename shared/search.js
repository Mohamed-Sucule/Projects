/* shared/search.js — the retrieval behind the navigator.

   BM25 over a thirty-one document collection, plus intent routing. That is a
   comically large hammer for a list this short, and it is the right one for a
   reason that has nothing to do with scale: a `.includes()` filter can only
   match what somebody typed, and people do not type the words on the page.
   They type "the ai stuff", "something fun", "i have two minutes", "whats the
   hardest thing here". Ranking with a proper term weighting lets a document
   win on the strength of ONE rare word rather than needing an exact substring,
   and the intent layer catches the queries that are not about words at all.

   BM25 in one sentence: a term is worth more when it is rare across the whole
   collection, worth more when it appears often in this document, but with
   sharply diminishing returns, and worth less when the document is long enough
   that a hit was always likely. The three ideas are IDF, saturation and length
   normalisation, and the formula below is all three.

   No DOM in here, so it is tested from a terminal. */

/* ── normalising ────────────────────────────────────────────────────────────
   Light stemming, deliberately. Aggressive stemmers collapse "training" and
   "trained" onto "train" — useful — and also "physics" onto "physic", which
   then fails to match the word on the page. At this collection size the cost
   of a missed match is far higher than the cost of a loose one. */

const STOP_WORDS = [
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'in', 'on',
  'for', 'with', 'and', 'or', 'but', 'that', 'this', 'it', 'its', 'as', 'at', 'by',
  'from', 'i', 'me', 'my', 'you', 'your', 'we', 'us', 'show', 'find', 'want', 'get',
  'give', 'can', 'do', 'does', 'have', 'has', 'something', 'anything', 'thing',
  'things', 'please', 'whats', 'what', 'where', 'which', 'some', 'any', 'here',
  'own', 'look', 'see', 'like', 'about', 'there', 'would', 'should', 'could',
  'off', 'out', 'up', 'one', 'good', 'nice', 'cool',
  /* Filler that is generic in English and, in a thirty-document collection,
     accidentally RARE — which is the worst combination, because IDF then hands
     it more weight than the word that carried the actual meaning. "the ai work"
     was returning the restaurant booking system, because one of its tags is
     "client work" and "work" scored higher than "ai". */
  'work', 'works', 'stuff', 'bit', 'way', 'really', 'quite', 'very', 'much',
];

/* Stored in BOTH spellings, raw and stemmed. The first version held only the
   raw words and the check ran after normalise(), so "something" arrived as
   "someth", missed the set entirely, and became a real search term — which is
   why "something fun" returned things whose blurbs said "make something"
   ahead of anything actually fun. */
const STOP = new Set([...STOP_WORDS, ...STOP_WORDS.map(rawNormalise)]);

function rawNormalise(word) {
  let w = word.toLowerCase().replace(/[^a-z0-9+#]/g, '');
  if (w.length > 4) {
    if (w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
    else if (w.endsWith('sses')) w = w.slice(0, -2);
    /* Not after -ss, -us or -ics: "physics", "graphics" and "analytics" are
       not plurals of anything, and stemming them produces a word that appears
       nowhere on the site. */
    else if (w.endsWith('s') && !/(ss|us|ics)$/.test(w)) w = w.slice(0, -1);
  }
  if (w.length > 5) {
    if (w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.endsWith('ed')) w = w.slice(0, -2);
  }
  return w;
}

export const normalise = rawNormalise;

export function tokenise(text, { keepStop = false } = {}) {
  return String(text)
    .split(/[^a-zA-Z0-9+#]+/)
    .map(normalise)
    .filter((w) => w.length > 0 && (keepStop || !STOP.has(w)));
}

/* ── the index ──────────────────────────────────────────────────────────── */

/* Field weights. Title hardest, because a document whose NAME is the query is
   almost always what was meant; tags next, because they are the deliberate
   synonym list; prose last, because a word appearing in a sentence about
   something is weaker evidence than a word chosen to label it. */
const FIELDS = [
  ['title', 5],
  ['tags', 2.6],
  ['hook', 1.4],
  ['blurb', 1],
  ['kindLabel', 1.6],
];

const K1 = 1.4;  /* how fast repeated terms stop helping */
const B = 0.55;  /* how much document length is held against it */

export function buildIndex(entries, kinds = {}) {
  const docs = entries.map((entry) => {
    const counts = new Map();
    let length = 0;
    for (const [field, weight] of FIELDS) {
      const raw = field === 'tags'
        ? (entry.tags ?? []).join(' ')
        : field === 'kindLabel'
          ? (kinds[entry.kind]?.label ?? entry.kind ?? '')
          : (entry[field] ?? '');
      for (const term of tokenise(raw)) {
        counts.set(term, (counts.get(term) ?? 0) + weight);
        length += weight;
      }
    }
    /* The document as one normalised string, for phrase matching below. */
    const phrase = [
      entry.title, (entry.tags ?? []).join(' '), entry.hook, entry.blurb,
    ].map((t) => tokenise(t, { keepStop: true }).join(' ')).join(' ');
    return { entry, counts, length, phrase };
  });

  const df = new Map();
  for (const doc of docs) {
    for (const term of doc.counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / (docs.length || 1);
  return { docs, df, avgLength, size: docs.length, vocabulary: new Set(df.keys()) };
}

/* ── intent ─────────────────────────────────────────────────────────────────
   The queries that are not really about words. "I have two minutes" contains
   no term that any document holds, and a pure text search answers it with
   nothing — which is the moment somebody decides the search box is broken and
   goes back to scrolling. */

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
};

const TIME = /(\d+|[a-z]+)\s*(?:-|\s)?\s*(?:min|mins|minute|minutes)\b/;

export function detectIntent(query) {
  const q = String(query).toLowerCase();
  const intent = {};

  /* "I have 2 minutes", "five minutes", "a couple of minutes" */
  const minutes = q.match(TIME);
  if (minutes) {
    const n = /^\d+$/.test(minutes[1]) ? Number(minutes[1]) : NUMBER_WORDS[minutes[1]];
    if (n) intent.maxMinutes = n;
  }
  if (/\b(quick|quickly|fast|short|shortest|brief|briefly|instant|snack|skim)\b/.test(q)) {
    intent.maxMinutes = Math.min(intent.maxMinutes ?? 3, 3);
  }
  if (/\b(deep|deepest|depth|longest|meaty|substantial|properly|really dig)\b/.test(q)) {
    intent.depth = 'study';
  }
  if (/\b(surprise|random|anything|whatever|lucky|dunno|dont know|no idea|shuffle)\b/.test(q)) {
    intent.random = true;
  }
  /* "what should I look at", "where do I start", "impress me" */
  if (/\b(best|hardest|impressive|impress|show off|showcase|proudest|flagship|standout|wow)\b/.test(q)) {
    intent.featured = true;
  }
  if (/\b(start|begin|first|new here|where do i)\b/.test(q)) intent.featured = true;
  return intent;
}

/* Which pieces answer "show me the best thing here". Hand-picked, because the
   honest answer to that question is a judgement and pretending a ranking
   function made it would be a small lie. */
export const FEATURED = ['attention', 'covers', 'room', 'evals'];

/* ── searching ──────────────────────────────────────────────────────────── */

/**
 * Rank the collection against a query.
 *
 * Returns entries with the score and, importantly, WHICH terms matched — the
 * navigator shows those, because a result list that explains itself is the
 * difference between a search box people trust and one they poke twice and
 * abandon.
 */
export function search(query, index, { limit = 8, entries = null } = {}) {
  const intent = detectIntent(query);
  /* A time budget is a filter, not words to match: "10 minutes" should offer
     everything that fits in ten, not the few pieces tagged "two minutes". */
  const terms = tokenise(intent.maxMinutes ? String(query).toLowerCase().replace(TIME, ' ') : query);
  const pool = index.docs.filter((d) => matchesIntent(d.entry, intent));
  const source = pool.length ? pool : index.docs;

  /* Checked BEFORE the terms, not after. "surprise me" stems to the real word
     "surpris", which matched exactly one document that happened to have
     "surprising" in its tags — so the one query in the whole set that means
     "do not think about this, just pick something" was being answered with a
     careful, considered, single result. */
  if (intent.random || terms.length === 0) {
    return fallback(source, intent, limit);
  }

  /* A term nobody has is usually a typo. One edit away from a term somebody
     DOES have is worth trying before giving up on the whole query. */
  const resolved = terms.map((t) => (index.vocabulary.has(t) ? t : nearest(t, index.vocabulary) ?? t));

  const scored = source.map((doc) => {
    let score = 0;
    const why = [];
    for (const term of resolved) {
      const f = doc.counts.get(term);
      if (!f) continue;
      const n = index.df.get(term) ?? 0;
      /* +1 inside the log keeps this positive even for a term that appears in
         every document; without it a universal term scores negative and
         actively pushes documents down for containing it. */
      const idf = Math.log(1 + (index.size - n + 0.5) / (n + 0.5));
      const norm = 1 - B + B * (doc.length / index.avgLength);
      score += idf * ((f * (K1 + 1)) / (f + K1 * norm));
      why.push(term);
    }
    /* A query that matched every one of its words beats one that matched half,
       even when the half was rarer. "attention head" should not be beaten by a
       document that only knows the word "head". */
    if (why.length === resolved.length && resolved.length > 1) score *= 1.35;
    /* A phrase beats the sum of its words. "machine learning" is one concept
       and matching it whole is far stronger evidence than matching "machine"
       somewhere and "learn" somewhere else — which is how a regular-expression
       visualiser came second for it, on the strength of the tag "learn". */
    if (resolved.length > 1 && doc.phrase.includes(resolved.join(' '))) score *= 1.9;
    /* A gentle standing preference for the flagship pieces: several documents
       legitimately tie on a broad word like "ai", something has to break it,
       and "the one I would put first" is a more useful tie-break than
       whichever happened to be shorter. */
    const rank = FEATURED.indexOf(doc.entry.id);
    if (rank !== -1) score *= 1.07;
    /* When the query IS the request for a recommendation, the bonus has to be
       ADDITIVE. "show off" leaves no usable search term behind — multiplying a
       score of zero by anything is still zero, so the featured pieces were
       losing to whichever document happened to contain the word "off". */
    if (intent.featured && rank !== -1) score += 4 - rank * 0.5;
    return { entry: doc.entry, score, why: [...new Set(why)] };
  });

  const hits = scored.filter((h) => h.score > 0).sort((a, b) => b.score - a.score);
  if (hits.length === 0) return fallback(source, intent, limit);
  return hits.slice(0, limit);
}

function matchesIntent(entry, intent) {
  if (intent.maxMinutes && entry.minutes > intent.maxMinutes) return false;
  if (intent.depth && entry.depth !== intent.depth) return false;
  return true;
}

function fallback(docs, intent, limit) {
  if (intent.random) {
    const shuffled = docs.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit).map((d) => ({ entry: d.entry, score: 0, why: [] }));
  }
  const ranked = docs.slice().sort((a, b) => {
    const af = FEATURED.indexOf(a.entry.id), bf = FEATURED.indexOf(b.entry.id);
    if (af !== bf) return (af === -1 ? 99 : af) - (bf === -1 ? 99 : bf);
    return a.entry.minutes - b.entry.minutes;
  });
  return ranked.slice(0, limit).map((d) => ({ entry: d.entry, score: 0, why: [] }));
}

/**
 * The closest vocabulary term within one edit, or null.
 *
 * Bounded at distance 1 and only for words long enough for an edit to be a
 * plausible typo rather than a different word — at three letters, "cat" is one
 * edit from "car", "bat" and "can", and correcting into one of those is worse
 * than returning nothing.
 */
export function nearest(term, vocabulary) {
  if (term.length < 5) return null;
  let best = null;
  for (const candidate of vocabulary) {
    if (Math.abs(candidate.length - term.length) > 1) continue;
    if (withinOneEdit(term, candidate)) {
      /* Prefer the shortest match, which is the likeliest root. */
      if (!best || candidate.length < best.length) best = candidate;
    }
  }
  return best;
}

export function withinOneEdit(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (short.length === long.length) { i++; j++; } else { j++; }
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

/**
 * A one-line explanation of why this result is here.
 *
 * Written from the intent when there is one, because "because you have two
 * minutes" is a better reason than "matched: minute".
 */
export function explain(hit, query) {
  const intent = detectIntent(query);
  if (intent.random) return 'picked at random';
  if (intent.maxMinutes) return `about ${hit.entry.minutes} minutes`;
  if (hit.why.length) return `matched ${hit.why.slice(0, 3).join(', ')}`;
  if (intent.featured) return 'one of the strongest things here';
  return `${hit.entry.minutes} min`;
}
