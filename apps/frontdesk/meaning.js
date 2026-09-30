/* ───────────────────────────────────────────────────────────────────────────
   frontdesk/meaning.js — the second opinion.

   The parser in understand.js knows the few thousand ways people ask for a
   table. It does not know "fancy grabbing some food at yours on Friday?" —
   no "book", no "table", nothing it was written to look for. For those, and
   only those, a small sentence-embedding model (MiniLM, 23 MB, running on
   the visitor's own device) compares what was said with a handful of example
   requests and says which one it means most nearly.

   It is only ever asked when the parser has nothing, and it only ever
   answers with an intent — never a party size, a time or a name. The details
   that end up in the book still come from code that can be tested line by
   line; the model's job is to notice that somebody wants a table at all.
   ─────────────────────────────────────────────────────────────────────────── */

export const EXAMPLES = {
  book: [
    'I would like to book a table', 'can we come for dinner', 'do you have space for us',
    'fancy eating at yours one evening', 'can you fit a few of us in', 'we want to come and eat',
    'is it possible to get a reservation', 'save us a table',
  ],
  cancel: [
    'we need to cancel', 'something has come up and we cannot come', 'please take our booking off',
    'we have to drop out tonight', 'scrap our reservation',
  ],
  late: [
    'we are going to be late', 'we are on our way but held up', 'our train is delayed',
    'we will be there a bit after our time',
  ],
  change: [
    'can we move our booking', 'we need a different time for our reservation', 'there will be more of us than we said',
    'could we come on another day instead',
  ],
  human: [
    'let me speak to someone', 'I want to talk to a manager', 'I have a complaint', 'is there a person I can talk to',
  ],
  'topic:hours': ['when are you open', 'what time do you shut', 'are you open late'],
  'topic:location': ['how do I find you', 'where is the restaurant', 'what street are you on'],
  'topic:parking': ['where can I leave the car', 'is there somewhere to park'],
  'topic:dietary': ['do you cater for allergies', 'is there food for vegans', 'can you do gluten free'],
  'topic:menu': ['what kind of food do you do', 'what is on the menu tonight'],
};

let anchors = null;

/**
 * The nearest example's intent, or null if nothing is near enough.
 * `embed` is shared/ai.js's embed(); it resolves to null if the model could
 * not be loaded, and so does this.
 */
export async function classify(text, embed) {
  if (!anchors) {
    const labels = [], sentences = [];
    for (const [label, list] of Object.entries(EXAMPLES)) for (const s of list) { labels.push(label); sentences.push(s); }
    const vecs = await embed(sentences);
    if (!vecs) return null;
    anchors = vecs.map((v, i) => ({ label: labels[i], v }));
  }
  const q = await embed([text]);
  if (!q) return null;
  let best = null, bestScore = -1;
  for (const a of anchors) {
    let s = 0;
    for (let i = 0; i < a.v.length; i++) s += a.v[i] * q[0][i];
    if (s > bestScore) { bestScore = s; best = a.label; }
  }
  /* Below this, "nearest" means nothing: every sentence is nearest to
     something. Chosen so the example sentences' paraphrases clear it and
     "what's the weather like" does not. */
  return bestScore >= 0.5 ? { label: best, score: bestScore } : null;
}
