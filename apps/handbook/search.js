/* ───────────────────────────────────────────────────────────────────────────
   handbook/search.js — find the sentence that answers the question, or say
   that there isn't one.

   The whole design follows from one rule: an answer is a sentence from the
   documents, shown with where it came from. Nothing here writes new prose
   about a policy, so nothing here can state a policy that does not exist.
   The failure that remains is picking the wrong sentence, and that is
   measurable — see questions.js and the report on the page.

   The pipeline:

     1. Words are reduced to their stems (Porter's algorithm), and to a
        concept where the handbook and the asker use different words for the
        same thing: "holiday", "vacation", "PTO" and "annual leave" are one
        concept; so are "stolen" and "lost".
     2. Every sentence is scored with BM25 — the standard ranking function
        behind most search engines — plus credit for the section it sits in
        and the heading above it.
     3. The kind of question counts: "how much" wants a sentence with an
        amount in it, "when" wants a date, "can I" wants a sentence that says
        what you can or cannot do.
     4. And before answering, it checks that the question is actually about
        something the handbook covers. A question whose key word appears
        nowhere in the documents — "dog", "gym", "canteen" — or whose key
        words never appear together in one section, gets "the handbook
        doesn't say", with the nearest thing it does say.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Porter's stemmer, 1980 ──────────────────────────────────────────────── */

const isCons = (w, i) => {
  const c = w[i];
  if ('aeiou'.includes(c)) return false;
  if (c === 'y') return i === 0 ? true : !isCons(w, i - 1);
  return true;
};
const measure = (w) => {
  let n = 0, i = 0;
  const L = w.length;
  while (i < L && isCons(w, i)) i++;
  while (i < L) {
    while (i < L && !isCons(w, i)) i++;
    if (i >= L) break;
    n++;
    while (i < L && isCons(w, i)) i++;
  }
  return n;
};
const hasVowel = (w) => { for (let i = 0; i < w.length; i++) if (!isCons(w, i)) return true; return false; };
const doubleCons = (w) => w.length >= 2 && w[w.length - 1] === w[w.length - 2] && isCons(w, w.length - 1);
const cvc = (w) => {
  const L = w.length;
  if (L < 3) return false;
  return isCons(w, L - 3) && !isCons(w, L - 2) && isCons(w, L - 1) && !'wxy'.includes(w[L - 1]);
};

export function stem(word) {
  let w = word.toLowerCase();
  if (w.length <= 2) return w;
  // 1a
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -2);
  else if (w.endsWith('ss')) { /* keep */ } else if (w.endsWith('s')) w = w.slice(0, -1);
  // 1b
  let again = false;
  if (w.endsWith('eed')) { if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1); }
  else if (w.endsWith('ed') && hasVowel(w.slice(0, -2))) { w = w.slice(0, -2); again = true; }
  else if (w.endsWith('ing') && hasVowel(w.slice(0, -3))) { w = w.slice(0, -3); again = true; }
  if (again) {
    if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
    else if (doubleCons(w) && !'lsz'.includes(w[w.length - 1])) w = w.slice(0, -1);
    else if (measure(w) === 1 && cvc(w)) w += 'e';
  }
  // 1c
  if (w.endsWith('y') && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + 'i';
  // 2
  const step2 = [['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'], ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'],
    ['entli', 'ent'], ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'], ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'],
    ['fulness', 'ful'], ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble']];
  for (const [a, b] of step2) if (w.endsWith(a)) { if (measure(w.slice(0, -a.length)) > 0) w = w.slice(0, -a.length) + b; break; }
  // 3
  const step3 = [['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'], ['ical', 'ic'], ['ful', ''], ['ness', '']];
  for (const [a, b] of step3) if (w.endsWith(a)) { if (measure(w.slice(0, -a.length)) > 0) w = w.slice(0, -a.length) + b; break; }
  // 4
  const step4 = ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize'];
  for (const a of step4) {
    if (w.endsWith(a)) {
      const base = w.slice(0, -a.length);
      if (measure(base) > 1 && (a !== 'ion' || /[st]$/.test(base))) w = base;
      break;
    }
  }
  // 5
  if (w.endsWith('e')) {
    const base = w.slice(0, -1);
    const m = measure(base);
    if (m > 1 || (m === 1 && !cvc(base))) w = base;
  }
  if (measure(w) > 1 && doubleCons(w) && w.endsWith('l')) w = w.slice(0, -1);
  return w;
}

/* ── words that carry no subject ─────────────────────────────────────────── */

export const STOP = new Set(`a about above after again all also am an and any are aren't as at be because been before being below
  between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each else etc
  few for from further get gets getting got had hadn't has hasn't have haven't having he her here hers him his how i i'd
  i'll i'm i've if in into is isn't it it's its itself just let me might more most must mustn't my myself need needs no
  nor not now of off on once only onto or other our ours out over own per please same shall she should shouldn't so some
  such than that that's the their theirs them then there there's these they this those through to too under until up upon
  us very was wasn't we we'd we're were weren't what what's when where which while who who's whom why will with won't
  would wouldn't you you'd you're your yours yourself hi hello thanks thank ok okay exactly actually currently really
  much many long often happen happens happened allowed allow able possible know tell find want like use go going come
  coming still just anyone someone something anything everyone people staff employee employees company policy policies
  rule rules the handbook say says said tell does do what'd whats hows ever also maybe getting take taking give given
  make made new old other else each every lot lots kind sort way ways thing things mean means right put puts`.split(/\s+/).filter(Boolean));

/* The ordinary words of asking. They are not stop words — "limit" and
   "deadline" can matter to which sentence is best — but they are never the
   subject of a question, so a question is not refused because the handbook
   happens not to use them. This list exists because the first held-out run
   refused "what is the deadline for submitting expense claims?" on the
   grounds that the handbook never says "deadline". */
export const GENERIC = new Set(`maximum minimum max min most least limit limits limited deadline deadlines leftover left remaining
  programme programmes program programs scheme schemes join joining joined joiner entitled entitlement entitlements
  eligible eligibility apply applies applied process procedure procedures option options detail details info information
  rule rules standard usual normally typically generally policy happen happens last lasts lasting long total overall
  exact exactly roughly around approx approximately able need required require requires requirement requirements
  mean means allowed get gets receive receives provide provides offer offers entitle contact contacts employer employee
  whom someone somebody bring brings bringing`.split(/\s+/).filter(Boolean).map((w) => stem(w)));

/* ── the same thing, said differently ────────────────────────────────────── */

/* Each line: a concept, then the words and phrases for it. Phrases are
   matched before single words, so "time off" is leave and not a time. */
const CONCEPTS = `
  leave: holiday holidays leave vacation vacations pto annual-leave time-off days-off day-off bank-holiday annual personal-travel
  allowance: allowance allowances budget budgets
  sick: sick sickness ill illness unwell poorly off-sick call-in-sick calling-in-sick absence absences absent
  fitnote: doctor's-note doctors-note doctor-note sick-note fit-note fit-notes gp medical-certificate
  birth: maternity pregnant pregnancy birth baby newborn arrive arrives arrival born
  partner: paternity partner-leave father dad fathers partner partners
  expense: expense expenses expensed expensing claim claims claiming claimed claimable reimburse reimbursed reimbursement refund refunded
  meal: meal meals food lunch dinner breakfast per-diem subsistence eating
  mileage: mileage mile miles driving drive petrol fuel
  hotel: hotel hotels accommodation overnight
  train: train trains rail railway
  flight: flight flights fly flying plane business-class premium-economy economy long-haul short-haul
  remote: wfh remote remotely work-from-home working-from-home homeworking home-working hybrid
  abroad: abroad overseas another-country other-countries outside-the-uk outside-uk spain france italy portugal germany usa america australia
  device: laptop laptops computer computers phone mobile device devices macbook
  lost: lost stolen theft steal stole missing
  phishing: phishing dodgy suspicious scam spam fake
  usb: usb memory-stick thumb-drive flash-drive usb-stick usb-drive stick
  password: password passwords mfa 2fa two-factor multi-factor authentication authenticator
  pay: pay paid salary salaries wage wages payday pay-day paycheck payslip payslips
  rise: pay-rise pay-rises raise raises rise rises increase increases
  pension: pension pensions retirement
  health: health healthcare medical private-medical bupa
  learning: training learning course courses conference conferences development education study certification
  cycle: bike bikes bicycle cycle cycling cyclescheme
  eye: glasses eye eyes spectacles optician eye-test
  referral: referral refer referring recommend recommending
  gift: gift gifts present presents hospitality tickets ticket football match concert event events
  interest: second-job side-job side-hustle outside-work freelance freelancing moonlighting
  social: linkedin twitter instagram facebook social-media tiktok
  probation: probation probationary
  notice: notice resign resigning resignation quit quitting
  buddy: buddy mentor mentors
  christmas: christmas xmas festive
  dependant: child children kid kids dependant dependants childcare son daughter family families
  receipt: receipt receipts
  card: credit-card company-card corporate-card card cards amex
  equipment: equipment monitor monitors desk chair keyboard
  insurance: insurance insured insure travel-insurance
  meeting: meeting meetings online available
  office: office offices workplace
  sickpay: sick-pay ssp
  start: start starts starting begin begins beginning run runs commence
  expire: expire expires expired expiry lapse lapses lost lose
  carry: carry-over carried-over carry-forward carried-forward roll-over rolls-over rolled-over rollover roll-forward unused leftover left-over
  weekday: monday mondays tuesday tuesdays wednesday wednesdays thursday thursdays friday fridays weekday weekdays
  day: day days daily per-day a-day
  alcohol: alcohol wine beer drink drinks drinking booze
  approval: approval approve approved approves permission permitted sign-off authorise authorised authorize
  online: website websites site online-booking
  uk: elsewhere manchester birmingham bristol glasgow edinburgh cardiff liverpool newcastle sheffield nottingham leicester belfast york oxford cambridge
`;

/* A word can belong to more than one concept: "lost" is a stolen laptop and
   it is holiday you did not take in time. */
const CONCEPT_OF = new Map();
const PHRASES = [];
const addConcept = (key, c) => { const list = CONCEPT_OF.get(key) ?? []; if (!list.includes(c)) list.push(c); CONCEPT_OF.set(key, list); };
for (const line of CONCEPTS.trim().split('\n')) {
  const [name, rest] = line.split(':');
  for (const raw of rest.trim().split(/\s+/)) {
    const words = raw.split('-');
    if (words.length > 1 && !/^(?:two|multi|e)$/.test(words[0])) PHRASES.push([words.join(' '), `@${name.trim()}`]);
    addConcept(stem(raw.replace(/-/g, '')), `@${name.trim()}`);
    addConcept(stem(raw), `@${name.trim()}`);
  }
}
PHRASES.sort((a, b) => b[0].length - a[0].length);

/** Terms for a piece of text: stems, plus a concept token where one applies. */
export function terms(text, { keepStop = false } = {}) {
  let t = ` ${String(text).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9£%'\s-]+/g, ' ').replace(/\s+/g, ' ')} `;
  const out = [];
  out.covered = new Set();
  /* A phrase adds its concept and keeps its words — "private medical" is
     health, and it is also still "private" — but its words do not also bring
     their own concepts: "sick pay" is about pay, not about being sick. */
  for (const [phrase, concept] of PHRASES) {
    for (const form of [phrase, phrase.replace(/ /g, '-')]) {
      if (!t.includes(` ${form} `)) continue;
      out.push(concept);
      for (const w of phrase.split(' ')) if (!STOP.has(w)) { const st = stem(w); out.push(st); out.covered.add(st); }
      t = t.split(` ${form} `).join(' ');
    }
  }
  for (const w of t.match(/£?\d[\d,.]*%?p?|[a-z][a-z'-]*/g) ?? []) {
    let word = w.replace(/'s$/, '').replace(/^'+|'+$/g, '');
    /* "ten years" and "10 years" are the same question. */
    if (NUMBER_WORDS[word] != null) word = String(NUMBER_WORDS[word]);
    if (!word) continue;
    if (!keepStop && STOP.has(word)) continue;
    if (/^£?\d/.test(word)) { out.push(word.replace(/,/g, '')); continue; }
    for (let part of word.split('-')) {
      if (NUMBER_WORDS[part] != null) { out.push(String(NUMBER_WORDS[part])); continue; }
      if (!part || (!keepStop && STOP.has(part))) continue;
      const s = stem(part);
      out.push(s);
      for (const c of CONCEPT_OF.get(s) ?? []) out.push(c);
    }
  }
  return out;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60 };

/* ── splitting documents ─────────────────────────────────────────────────── */

export function sentences(text) {
  const out = [];
  /* A full stop only ends a sentence when a space follows it: an email
     address or a price has full stops inside it. Getting this wrong once
     silently dropped the first half of the lost-laptop rule, email and all. */
  const re = /(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$)|$)/g;
  let m;
  let carry = '';
  while ((m = re.exec(text))) {
    const s = (carry + m[0]).trim();
    /* "e.g." and "£2.50" do not end a sentence. */
    if (/\b(?:e\.g|i\.e|etc|approx|no)\.$/i.test(s) || /\d\.$/.test(s) && /^\d/.test(text.slice(re.lastIndex).trim())) { carry = s + ' '; continue; }
    carry = '';
    if (s) out.push({ text: s, start: m.index });
  }
  return out;
}

/* ── the index ───────────────────────────────────────────────────────────── */

/**
 * Build a searchable index over documents shaped like corpus.js's DOCS.
 * Rebuilt whole when a visitor adds their own documents; it is a few
 * hundred sentences and takes a few milliseconds.
 */
export function buildIndex(docs) {
  const units = [];              // sentences
  const sections = [];
  for (const d of docs) {
    for (const s of d.sections) {
      const at = d.sections.indexOf(s);
      const sec = { ...s, doc: d, order: d.sections.length > 1 ? at / (d.sections.length - 1) : 0, terms: terms(`${d.title} ${s.heading} ${s.text}`), headTerms: new Set(terms(s.heading)), sentences: [] };
      sections.push(sec);
      for (const [i, sn] of sentences(s.text).entries()) {
        const u = { text: sn.text, i, section: sec, terms: terms(sn.text) };
        sec.sentences.push(u);
        units.push(u);
      }
    }
  }
  const df = (list) => {
    const m = new Map();
    for (const u of list) for (const t of new Set(u.terms)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  };
  const vocab = new Set();
  for (const u of units) for (const t of u.terms) vocab.add(t);
  for (const s of sections) for (const t of s.terms) vocab.add(t);
  return {
    docs, units, sections, vocab,
    dfU: df(units), dfS: df(sections),
    avgU: units.reduce((n, u) => n + u.terms.length, 0) / Math.max(1, units.length),
    avgS: sections.reduce((n, s) => n + s.terms.length, 0) / Math.max(1, sections.length),
  };
}

/* BM25 over groups of alternatives. A word and the concepts it belongs to
   are one idea, scored once at whichever form matches best — otherwise every
   word with a synonym counts double, and "office" (which has one) outweighs
   "parking" (which does not) in a question about parking at the office. */
function bm25(qGroups, docTerms, df, N, avg, k1 = 1.3, b = 0.72) {
  const tf = new Map();
  for (const t of docTerms) tf.set(t, (tf.get(t) ?? 0) + 1);
  let s = 0;
  for (const group of qGroups) {
    let best = 0;
    for (const q of group) {
      const f = tf.get(q);
      if (!f) continue;
      const n = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      best = Math.max(best, idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * docTerms.length / avg)));
    }
    s += best;
  }
  return s;
}

/** The query's terms, grouped into ideas: a stem with its concepts. */
function ideaGroups(qTerms) {
  const groups = [];
  const used = new Set();
  for (const t of qTerms) {
    if (t.startsWith('@') || used.has(t)) continue;
    const g = [t, ...(CONCEPT_OF.get(t) ?? [])];
    for (const x of g) used.add(x);
    groups.push(g);
  }
  for (const t of qTerms) if (t.startsWith('@') && !used.has(t)) { used.add(t); groups.push([t]); }
  return groups;
}

/* ── what kind of question ───────────────────────────────────────────────── */

export function questionType(q) {
  const t = q.toLowerCase();
  if (/\b(how (?:much|many)|how long|what percentage|what(?:'s| is) (?:the|my|our) (?:[\w-]+ ){0,3}(?:limit|rate|cap|allowance|budget|amount|bonus|contribution|maximum|minimum|per diem))\b/.test(t)) return 'amount';
  if (/\b(when|what time|what date|what day|which days?|by what time|how often|deadline|how soon)\b/.test(t)) return 'time';
  if (/^\s*(?:can|may|am|is|are|do|does|will|should|must|could|would|have)\b/.test(t)) return 'yesno';
  if (/\b(who)\b/.test(t)) return 'who';
  if (/\b(where|whereabouts)\b/.test(t)) return 'where';
  if (/\bhow (?:do|can|should|to)\b|\bwhat (?:do|should) i do\b|\bwhat now\b/.test(t)) return 'how';
  return 'what';
}

const HAS = {
  amount: /£\s?\d|\d+\s?%|\b\d+p\b|\b\d+\s+(?:days?|weeks?|months?|years?|working days|calendar days|miles?)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\s+(?:days?|weeks?|months?|years?)\b|\bhalf pay\b|\bfull pay\b/i,
  time: /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|weekdays?)\b|\bevery\s+\w+\s+years?\b|\bwithin\b|\blast working day\b|\bfirst day\b|\bby the \d/i,
  yesno: /\b(?:can|cannot|can't|may|may not|allowed|not allowed|must|need|is not|are not|not possible|never|only|no)\b/i,
  who: /\b(?:manager|director|people team|it|finance|legal|hr|buddy|@)\b/i,
  where: /\b(?:pathway|tripwell|intranet|outlook|office|yard|clerkenwell|in the|at the)\b/i,
  how: /\b(?:book|claim|use|report|tell|record|ask|send|call|through|in pathway|in tripwell)\b/i,
  what: /./,
};

/* ── asking ──────────────────────────────────────────────────────────────── */

const NEGATIVE = /\b(?:cannot|can't|can not|may not|not allowed|is not|are not|not possible|not claimable|not reimbursed|never|does not|do not|no\b)/i;

/**
 * Ask a question. Always returns an answer object; `refused` is true when
 * the honest answer is "the handbook doesn't say".
 */
/* The words that make a question a question — "what time", "how long" —
   say what kind of answer is wanted, not what it is about. */
const QUESTION_FORM = /\b(?:(?:by )?what time|what date|which days?|what days?|how (?:much|many|long|often|soon|far|late)|what percentage|at what point|what(?:'s| is) the (?:maximum|minimum|most|least|deadline)|deadline for)\b/gi;

export function ask(index, question, { semantic = null, debug = false } = {}) {
  const qTerms = terms(question.replace(QUESTION_FORM, ' '));
  const qType = questionType(question);
  const content = [...new Set(qTerms.filter((t) => !t.startsWith('@') && !/^£?\d/.test(t)))];
  const concepts = new Set(qTerms.filter((t) => t.startsWith('@')));

  /* Words the documents never use, in any form. One of those is usually the
     whole point of the question — "dog", "gym", "wifi" — and a system that
     answers anyway is answering a different question. */
  /* A word the handbook never uses in that exact form may still be one it
     uses in another: "employer" for "employee" is not, but "arrangement" for
     "arrange" is. Anything sharing its first six letters with a word in the
     documents counts as known. */
  const near = (t) => t.length >= 6 && [...index.vocab].some((v) => !v.startsWith('@') && v.length >= 5 && v.slice(0, 6) === t.slice(0, 6));
  const unknown = content.filter((t) => !index.vocab.has(t) && !CONCEPT_OF.has(t) && !qTerms.covered.has(t) && !GENERIC.has(t) && !near(t));

  const N = index.units.length, NS = index.sections.length;
  const qGroups = ideaGroups(qTerms);
  const sectionScore = new Map();
  for (const s of index.sections) sectionScore.set(s, bm25(qGroups, s.terms, index.dfS, NS, index.avgS));

  /* The last thing asked about is usually the point: "when will my expenses
     be PAID", "can I claim my COMMUTE". */
  const focusWord = [...qTerms].reverse().find((t) => !t.startsWith('@') && !/^£?\d/.test(t));
  const focus = focusWord ? [focusWord, ...(CONCEPT_OF.get(focusWord) ?? [])] : [];
  const wantsWeekdays = /\b(?:which|what) days?\b/i.test(question);

  let best = null;
  const ranked = [];
  for (const u of index.units) {
    const sec = u.section;
    if (sec.doc.supersededBy) continue;
    let score = bm25(qGroups, u.terms, index.dfU, N, index.avgU, 1.3, 0.45) + 0.55 * sectionScore.get(sec);
    let head = 0;
    for (const g of qGroups) if (g.some((t) => sec.headTerms.has(t))) head++;
    score += head * 1.8;
    if (HAS[qType].test(u.text)) score *= 1.22;
    if (focus.some((f) => u.terms.includes(f))) score *= 1.2;
    if (wantsWeekdays && /\b(?:mon|tues|wednes|thurs|fri)days?\b/i.test(u.text)) score *= 1.7;
    if (u.i === 0) score *= 1.2;
    /* A policy opens with its main rule. Between two equally good matches,
       the one nearer the top of its document is usually the rule and the
       other the exception. */
    score *= 1 + 0.08 * (1 - sec.order);
    if (semantic) score += semantic(u) * 4;
    ranked.push({ u, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  best = ranked[0];

  /* How much of what was asked does the best section actually talk about?
     Weighted by how rare each word is, so missing "the" costs nothing and
     missing "Leeds" costs a lot. */
  const secTerms = new Set(best?.u.section.terms ?? []);
  const idf = (t) => Math.log(1 + (NS + 0.5) / ((index.dfS.get(t) ?? 0) + 0.5));
  /* Words the documents never use are judged separately, below; here they
     would only drown out everything else. */
  const wanted = [...new Set(qTerms.filter((t) => !/^£?\d/.test(t) && !qTerms.covered.has(t) && !GENERIC.has(t) && (index.vocab.has(t) || t.startsWith('@') || CONCEPT_OF.has(t))))];
  /* A word and its concept are one idea: "holiday" and @leave count once. */
  const groups = [];
  const seenIdea = new Set();
  for (const t of wanted) {
    const concepts = t.startsWith('@') ? [t] : CONCEPT_OF.get(t) ?? [];
    const key = concepts[0] ?? t;
    if (seenIdea.has(key) || seenIdea.has(t)) continue;
    seenIdea.add(key); seenIdea.add(t);
    for (const c of concepts) seenIdea.add(c);
    const members = [t, ...concepts];
    groups.push({
      t, members,
      w: Math.max(...members.map(idf)),
      df: Math.min(...members.map((m) => index.dfS.get(m) ?? 99)),
      here: members.some((m) => secTerms.has(m)),
    });
  }
  const need = groups.reduce((n, g) => n + g.w, 0);
  const have = groups.reduce((n, g) => n + (g.here ? g.w : 0), 0);
  const coverage = need ? have / need : 0;

  /* The most specific thing asked about — the word the handbook uses least —
     has to be in the section offered as the answer. "Christmas bonus" names
     two rare things; the Christmas closure has one of them, and it is not an
     answer about bonuses. */
  const top = Math.max(0, ...groups.map((g) => g.w));
  const rarestMissing = groups.some((g) => g.w >= top - 1e-9 && !g.here);

  const alternatives = ranked.slice(1, 6).filter((r) => r.u.section !== best?.u.section).slice(0, 2).map((r) => r.u.section);

  const refuse = (why) => ({
    ...(debug ? { debug: ranked.slice(0, 8) } : {}),
    question, refused: true, why, type: qType, coverage, unknown,
    nearest: best ? best.u.section : null, alternatives,
    text: '', section: null, sentence: null, score: best?.score ?? 0,
  });

  if (!best || best.score < 2.2) return refuse('nothing');

  /* Words the handbook never uses are usually the whole question — "dog",
     "gym", "wifi" — and they sink it. But not always: "wine at a client
     dinner" has "wine", and a section that matches everything else about the
     question, including something specific to it, is allowed to answer. */
  const specific = groups.some((g) => g.here && g.df <= 3);
  const matched = groups.filter((g) => g.here).length;
  const unknownOK = coverage >= 0.65 && specific && matched >= 3 && unknown.length === 1;
  if (unknown.length && !unknownOK && !(semantic && semantic(best.u) > 0.62)) return refuse('unknown-words');
  if ((coverage < 0.5 || (rarestMissing && coverage < 0.6)) && !(semantic && semantic(best.u) > 0.62)) return refuse('not-together');

  /* The answer: the best sentence, and the next one if it finishes the
     thought ("…must be used by 31 March. After that they are lost."). */
  const sec = best.u.section;
  const list = sec.sentences;
  let text = best.u.text;
  const next = list[best.u.i + 1];
  if (next && (/^(?:this|these|it|they|that|after that|but|however|if|unless|otherwise|so|then|except)\b/i.test(next.text) || best.u.text.length < 70)) {
    text += ' ' + next.text;
  }

  /* A policy that has been replaced is never the answer — but if the old one
     said something different, say so: people remember the old number. */
  let superseded = null;
  const older = index.docs.find((d) => d.supersededBy === sec.doc.id);
  if (older) {
    const same = older.sections.find((s) => s.heading === sec.heading);
    if (same && same.text !== sec.text) superseded = { doc: older, section: same };
  }

  const short = headline(qType, text, question);
  return {
    ...(debug ? { debug: ranked.slice(0, 8) } : {}),
    question, refused: false, type: qType, coverage, unknown,
    section: sec, sentence: best.u, text, short, superseded, alternatives,
    score: best.score,
  };
}

/** A one-line answer on top of the quoted sentence, where one can be read off it. */
function headline(type, text, question) {
  if (type === 'yesno') {
    const neg = NEGATIVE.test(text);
    const cond = /\b(?:only|unless|except|as long as|if|with|up to|need|must)\b/i.test(text);
    const lead = neg ? (cond && !/^(?:is|are|do|does)\b/i.test(question) ? 'No — with exceptions.' : 'No.') : cond ? 'Yes, with conditions.' : 'Yes.';
    return lead;
  }
  if (type === 'amount' || type === 'time') {
    const re = type === 'amount'
      ? /£\s?[\d,]+(?:\.\d+)?(?:\s+a\s+(?:day|night|year|month|mile))?|\d+\s?%|\b\d+p a mile\b|\b\d+\s+(?:working |calendar )?(?:days?|weeks?|months?|years?)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:working )?(?:days?|weeks?|months?|years?)\b|\bfull pay\b|\bhalf pay\b/gi
      : /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)(?:\s+to\s+\d{1,2}(?::\d{2})?\s?(?:am|pm))?|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\bthe \d+(?:st|nd|rd|th) of the month\b|\b(?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?)(?: and (?:Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?))?\b|\bevery \w+ years?\b|\blast working day of each month\b|\bin (?:March|April|September|November)\b/g;
    const hits = text.match(re);
    if (hits?.length) return hits[0].replace(/^./, (c) => c.toUpperCase());
  }
  return null;
}

/** Where in the section's text a sentence sits, for highlighting it. */
export function locate(section, sentenceText) {
  const at = section.text.indexOf(sentenceText.split(' ').slice(0, 6).join(' '));
  return at < 0 ? null : { start: at, end: at + sentenceText.length };
}

/* ── your own documents ──────────────────────────────────────────────────── */

/**
 * Turn pasted text or a text file into a document. Headings are Markdown
 * "#" lines, or short lines on their own that end without a full stop;
 * everything between two headings is one section. A document with no
 * headings is cut into sections by paragraph.
 */
export function parseDocument(raw, title = 'Your document', id = 'yours') {
  const lines = String(raw).replace(/\r/g, '').split('\n');
  const sections = [];
  let heading = null, buf = [];
  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text) sections.push([`s${sections.length + 1}`, heading ?? (text.split(/[.!?]/)[0].slice(0, 60) || 'Section'), text]);
    buf = [];
  };
  for (const line of lines) {
    const l = line.trim();
    const md = /^#{1,6}\s+(.*)$/.exec(l);
    const bare = !md && l.length > 0 && l.length <= 60 && !/[.!?,;:]$/.test(l) && /^[A-Z0-9]/.test(l) && l.split(/\s+/).length <= 8;
    if (md || bare) { flush(); heading = (md ? md[1] : l).trim(); continue; }
    if (!l) { if (!heading && buf.length) flush(); continue; }
    buf.push(l);
  }
  flush();
  const firstHeading = lines.find((l) => /^#\s/.test(l.trim()));
  return {
    id, title: firstHeading ? firstHeading.trim().replace(/^#\s+/, '') : title, owner: 'You', updated: null, yours: true,
    sections: sections.map(([sid, h, text]) => ({ id: `${id}/${sid}`, heading: h, text })),
  };
}
