/* ───────────────────────────────────────────────────────────────────────────
   frontdesk/understand.js — what did the caller just say?

   One sentence in, a structured reading out: what they want (to book, to
   cancel, to ask about parking) and every detail they gave on the way — how
   many, which day, what time, their name, their number, the nut allergy, the
   birthday.

   It is a parser written for one job, a restaurant's phone line, rather than a
   general language model, and that is a choice rather than a limitation.
   People ringing a restaurant say a few hundred things in a few thousand ways,
   and for a job that narrow a purpose-built reader is faster, costs nothing to
   run, never invents a booking, and — the part a client actually cares about —
   can be tested against every phrasing on the list before anything ships. The
   evaluation set in eval.js is that list, and the page shows the score live.

   Where it runs out, a small model takes over: see the fallback in desk.js.

   The hard parts are the ones people never notice they are doing:

     • "half eight" is 20:30 in Britain, and "8" on a restaurant line is 8 in
       the evening, not the morning;
     • "for four" after "a table" is people, and "for eight" after "booking"
       with a "pm" on the end is a time;
     • "oh seven seven double oh…" is a phone number, and the "oh" in "oh, that's
       a shame" is not;
     • "it's Collins" is a name, "it's for four" is not, and "it's tonight" is
       not either;
     • and "Friday the 21st", when the 21st is a Saturday, is a question to ask
       back rather than a guess to make.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── numbers, as people say them ─────────────────────────────────────────── */

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50 };
const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
};
const suffix = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

/**
 * The text with every spoken number turned into digits, plus a map from each
 * character of the result back to the character of the original it came from.
 *
 * Everything below matches against the normalised string — one pattern for
 * "8:30" covers "eight thirty" — and the map is what lets the page underline
 * the caller's own words, not the digits they were turned into.
 */
export function normalise(text) {
  const src = String(text).replace(/[’‘]/g, "'");
  const tokens = [];
  const re = /[A-Za-zÀ-ÿĀ-ž]+(?:['-][A-Za-zÀ-ÿĀ-ž]+)*|\d+|[^A-Za-zÀ-ÿĀ-ž\d]/g;
  let m;
  while ((m = re.exec(src))) tokens.push({ t: m[0], lo: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length });

  let out = '';
  const map = [], mapEnd = [];
  const emit = (str, s, e) => {
    /* A character kept as it was maps to itself; a replacement ("four" → "4")
       maps every character to the whole of the words it came from, so a
       highlight that ends on the 4 ends after "four". */
    const same = str.length === e - s;
    for (let i = 0; i < str.length; i++) {
      out += str[i];
      map.push(same ? s + i : s);
      mapEnd.push(same ? s + i + 1 : e);
    }
  };

  const isDigitish = (k) => {
    const tk = tokens[k];
    if (!tk) return false;
    return /^\d+$/.test(tk.t) || tk.lo in UNITS || tk.lo in TENS || tk.lo === 'double' || tk.lo === 'triple' || tk.lo === 'oh' || tk.lo === 'o';
  };
  /* The next real token either side, skipping spaces and dashes. */
  const neighbour = (k, dir) => {
    for (let j = k + dir; j >= 0 && j < tokens.length; j += dir) {
      if (/^[\s-]$/.test(tokens[j].t)) continue;
      return j;
    }
    return -1;
  };

  for (let k = 0; k < tokens.length; k++) {
    const tk = tokens[k];
    const lo = tk.lo;

    /* "twenty-five" as one hyphenated token */
    const hy = /^(twenty|thirty|forty|fourty|fifty)-(one|two|three|four|five|six|seven|eight|nine|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)$/.exec(lo);
    if (hy) {
      const unit = UNITS[hy[2]] ?? ORDINALS[hy[2]];
      const n = TENS[hy[1]] + unit;
      emit(hy[2] in ORDINALS ? `${n}${suffix(n)}` : String(n), tk.s, tk.e);
      continue;
    }

    if (lo in TENS) {
      /* "twenty five", "twenty first" */
      const j = neighbour(k, 1);
      const nx = j >= 0 ? tokens[j].lo : '';
      if (j === k + 2 && tokens[k + 1].t === ' ' && ((nx in UNITS && UNITS[nx] < 10 && UNITS[nx] > 0) || (nx in ORDINALS && ORDINALS[nx] < 10))) {
        const n = TENS[lo] + (UNITS[nx] ?? ORDINALS[nx]);
        emit(nx in ORDINALS ? `${n}${suffix(n)}` : String(n), tk.s, tokens[j].e);
        k = j;
        continue;
      }
      emit(String(TENS[lo]), tk.s, tk.e);
      continue;
    }

    if (lo in UNITS) { emit(String(UNITS[lo]), tk.s, tk.e); continue; }

    if (lo === 'twentieth' || lo === 'thirtieth' || (lo in ORDINALS && lo !== 'second')) {
      const n = ORDINALS[lo];
      emit(`${n}${suffix(n)}`, tk.s, tk.e);
      continue;
    }
    /* "second" is an ordinal after "the" ("the second", "the second one") and
       a unit of time everywhere else ("just a second"). */
    if (lo === 'second') {
      const p = neighbour(k, -1);
      if (p >= 0 && tokens[p].lo === 'the') { emit('2nd', tk.s, tk.e); continue; }
    }

    /* "oh" is a zero only inside a run of digits: "oh seven seven", "nine oh
       five". "Oh, that's a shame" keeps its oh. */
    if (lo === 'oh' || lo === 'o') {
      const p = neighbour(k, -1), n = neighbour(k, 1);
      if ((n >= 0 && isDigitish(n) && tokens[n].lo !== 'double') || (p >= 0 && isDigitish(p) && n >= 0 && isDigitish(n))) {
        emit('0', tk.s, tk.e);
        continue;
      }
    }

    /* "double oh", "triple seven" */
    if (lo === 'double' || lo === 'triple') {
      const j = neighbour(k, 1);
      const nx = j >= 0 ? tokens[j].lo : '';
      const d = /^\d$/.test(nx) ? nx : nx in UNITS && UNITS[nx] < 10 ? String(UNITS[nx]) : nx === 'oh' || nx === 'o' ? '0' : null;
      if (d != null) {
        emit(d.repeat(lo === 'double' ? 2 : 3), tk.s, tokens[j].e);
        k = j;
        continue;
      }
    }

    emit(lo, tk.s, tk.e);
  }
  return { s: out, map, mapEnd, src };
}

/* ── the calendar ────────────────────────────────────────────────────────── */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (w) => MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)));

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/* Full names, and the abbreviations that are not also ordinary words. "Sat",
   "sun", "wed" and "mon" are left out on purpose: "we sat by the window". */
const WEEKDAY_RE = '(sunday|monday|tuesday|tues|wednesday|weds|thursday|thurs|friday|fri|saturday)s?';
const weekdayIndex = (w) => WEEKDAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));

/** ISO date arithmetic, in UTC so no clock change ever moves a booking. */
export const toDate = (iso) => new Date(`${iso}T12:00:00Z`);
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (isoDate, n) => { const d = toDate(isoDate); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const weekdayOf = (isoDate) => toDate(isoDate).getUTCDay();
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

/** The next date on or after `from` that falls on this weekday. */
function nextWeekday(from, dow, { allowToday = false } = {}) {
  for (let i = allowToday ? 0 : 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (weekdayOf(d) === dow) return d;
  }
  return null;
}

/** A day of the month with no month given: this month if still ahead, else next. */
function dayOfMonth(today, day, month = null) {
  const t = toDate(today);
  let y = t.getUTCFullYear(), mo = month ?? t.getUTCMonth();
  const build = () => {
    const d = new Date(Date.UTC(y, mo, day, 12));
    return d.getUTCMonth() === mo ? iso(d) : null;
  };
  let d = build();
  if (d && d < today) {
    if (month == null) { mo += 1; if (mo > 11) { mo = 0; y += 1; } } else { y += 1; }
    d = build();
  }
  return d;
}

/* ── what we listen for ──────────────────────────────────────────────────── */

const NOTES = [
  /* [pattern, kind, label]. The label is what goes in the book. */
  [/\b(?:tree )?nut(?:s)?\b(?!\s*free)|\bpeanuts?\b/, 'allergy', 'nut allergy'],
  [/\bcoeliac|\bceliac|\bgluten\b/, 'allergy', 'gluten-free (coeliac)'],
  [/\bdairy|\blactose/, 'allergy', 'dairy-free'],
  [/\bshellfish|\bprawns?\b|\bcrustacean/, 'allergy', 'shellfish allergy'],
  [/\bsesame\b/, 'allergy', 'sesame allergy'],
  [/\beggs?\b(?= allerg|.*allerg)/, 'allergy', 'egg allergy'],
  [/\bvegan/, 'diet', 'vegan'],
  [/\bvegetarian|\bveggie\b/, 'diet', 'vegetarian'],
  [/\bhalal\b/, 'diet', 'halal'],
  [/\bbirthday|\bbday\b/, 'occasion', 'birthday'],
  [/\banniversary/, 'occasion', 'anniversary'],
  [/\bpropos(?:e|al|ing)|\bengagement|\bgetting engaged/, 'occasion', 'proposal — be discreet'],
  [/\bgraduat/, 'occasion', 'graduation'],
  [/\bleaving do|\bretirement/, 'occasion', 'leaving do'],
  [/\bwheelchair|\bstep[- ]free|\bmobility scooter|\bwalking frame/, 'access', 'wheelchair — step-free route'],
  [/\bhigh ?chairs?/, 'access', 'highchair'],
  [/\bpram|\bbuggy|\bpushchair|\bstroller/, 'access', 'room for a pram'],
  [/\bwindow\b/, 'seat', 'window table'],
  [/\bquiet(?:er)? (?:table|corner|spot)|\bsomewhere quiet|\bnot (?:near|by) the (?:door|kitchen|toilets?)/, 'seat', 'quiet table'],
  [/\bbooth\b|\bbanquette/, 'seat', 'banquette'],
];

/* Which zone of the room a seating note asks for. The engine chooses the
   table; this only tells it where to look first. */
export const PREFERS = { 'window table': 'window', banquette: 'banquette' };

const TOPICS = [
  ['hours', /\b(?:what time|when) (?:do|are|does) (?:you|the kitchen|the restaurant) (?:open|close|shut|stop|finish)|\bopening (?:hours|times)|\bhow late (?:are you|do you)|\bare you open\b|\bwhat are your (?:hours|times)|\bclosing time|\blast orders|\bwhat days (?:are you|do you)|\bopen (?:on )?mondays?|\bopen for lunch|\bdo you do lunch/],
  ['location', /\bwhere (?:are you|abouts|is the restaurant|exactly|is it)|\bwhereabouts\b|\baddress\b|\bpostcode|\bhow do (?:i|we) (?:get|find)|\bdirections|\bnear(?:est)? (?:station|tube|bus)/],
  ['parking', /\bpark(?:ing)?\b|\bcar park/],
  ['dogs', /\bdogs?\b|\bpets?\b|\bpuppy/],
  ['kids', /\b(?:kids|children|child)(?:'s)? menu|\b(?:are|is) (?:kids|children|babies|little ones) (?:welcome|allowed|ok|okay)|\bchild[- ]friendly|\bfamily[- ]friendly|\b(?:bring|brings) (?:the |our |my )?(?:kids|children|baby|toddler)/],
  ['dietary', /\bvegan|\bvegetarian|\bgluten|\bcoeliac|\bceliac|\bdairy|\ballergens?\b|\bhalal|\bkosher|\bnut[- ]free|\ballerg|\bdietary|\bintoleran/],
  ['menu', /\bmenu\b|\bwhat (?:food|kind of food|sort of food|do you serve|dishes)|\bset menu|\btasting|\bwhat'?s good|\bspecials|\bhalibut|\bfish\b/],
  ['price', /\bhow much|\bprices?\b|\bexpensive|\bcost\b|\bpricey|\baverage spend/],
  ['byo', /\bbyo\b|\bbring (?:our|my|a) own (?:wine|bottle|drink)|\bcorkage/],
  ['cake', /\bcake\b/],
  ['vouchers', /\bvouchers?|\bgift cards?/],
  ['private', /\bprivate (?:room|dining|hire|party|area)|\bhire (?:the|a) |\bexclusive use/],
  ['dress', /\bdress code|\bwhat (?:should|do) (?:i|we) wear|\bsmart casual/],
  ['outside', /\boutside|\boutdoors?|\bterrace|\bgarden|\bal fresco|\bpatio/],
  ['takeaway', /\btake ?away|\btake-?out|\bdeliver(?:y|ies|oo)?\b|\bcollection\b/],
  ['deposit', /\bdeposit|\bcard details|\bcancellation (?:fee|policy|charge)|\bno[- ]show fee/],
  ['access', /\b(?:wheelchair|step[- ]free|disabled) (?:access|accessible|toilet|loo)|\baccessible\b/],
  ['walkin', /\bwalk[- ]?ins?|\bjust (?:turn|show|walk|pop) (?:up|in)|\bwithout a (?:booking|reservation)/],
];

/* Questions start like questions. A topic word inside a statement is a note
   ("one of us is vegan"), inside a question it is a question ("do you do
   vegan?"), and the difference decides whether the caller gets an answer or
   gets written in the book. */
const QUESTION = /\?|^(?:\W*(?:hi|hello|hiya|yeah|yes|ok|okay|oh|um|uh|er|and|also|sorry|just|quick question|one more thing|before (?:i|we) go)\W+)*(?:do|does|is|are|can|could|would|will|what|where|whereabouts|when|how|have|has|any|anything|should|may|i was wondering|wondering|just wondering|is there|are there|i wanted to ask|can i ask)\b/;

const INTENTS = [
  /* Order matters: a cancellation says "booking", a lateness says "can't make
     it", and the more specific reading has to win. */
  ['human', /\b(?:speak|talk|put me through) to (?:a |the |an |some)?(?:actual |real |proper )?(?:person|human|manager|someone|somebody|anyone|member of staff|people)|\breal person|\bhuman being|\bactual person|\bthe manager\b|\ba manager\b|\bcomplain(?:t)?\b|\bnot happy\b|\bdisgusted|\bunacceptable/],
  ['late', /\b(?:running|be|being|bit|little|few|couple of)\b[^.?!]{0,24}\b(?:late|behind)\b|\b\d+ (?:minutes|mins|min) (?:late|behind)|\bstuck in traffic|\brunning behind|\bheld up|\bdelayed\b|\bwon'?t make it (?:on time|by)|\blate for (?:our|my|the) (?:booking|table|reservation)|\bon (?:our|my) way\b/],
  ['cancel', /\bcancel|(?<!\b(?:one of us|one of them|someone|somebody|one person|\d+ of us|a friend|my friend|a guest|(?:my |our )?(?:wife|husband|partner|son|daughter|mum|dad|friend|colleague|mate|sister|brother))\s)\bcan(?:'|no)?t (?:make it|come)(?! on time)\b(?!.*\b(?:instead|another|different)\b)|\bwon'?t be (?:able to (?:make it|come)|coming)|\bcall (?:it|the booking) off|\bnot (?:going to|gonna) make it(?! on time)|\bno longer (?:need|coming|able)|\bdon'?t need (?:the|our|my) (?:table|booking)/],
  ['change', /\b(?:change|move|amend|modify|reschedule|swap|switch)\b[^.?!]{0,30}\b(?:booking|reservation|table|time|day|date|it)\b|\bpush (?:\w+\s){0,2}(?:back|later)|\bbring (?:\w+\s){0,2}forward|\bmove (?:\w+\s){0,2}(?:back|forward|to)\b|\b(?:add|another|extra) (?:\d+ )?(?:more )?(?:person|people|guest|guests)\b|\b(?:\d+|an?) (?:more|extra) (?:person|people|guests?)\b|\b(?:someone|somebody|one of us|one person|\d+ of us|\d+ people) (?:can'?t|cannot|isn'?t|aren'?t|won'?t) (?:make it|come|coming)|\bis it possible to (?:change|move)|\binstead of\b/],
  ['check', /\b(?:confirm|check|double[- ]check)\b[^.?!]{0,20}\b(?:booking|reservation|table)|\b(?:have|did) (?:i|we) (?:got |get )?(?:a )?(?:booking|reservation|table)|\bis (?:my|our) (?:booking|table|reservation)|\bwhat time (?:is|was) (?:my|our) (?:booking|table|reservation)/],
  ['book', /\bbook|\breserv|\btable for\b|\ba table\b|\bany tables\b|\bget a table|\bhave you got (?:a |any )?(?:table|space|room|anything)|\bdo you have (?:a |any )?(?:table|space|room|availability|anything)|\bavailab|\bsqueeze (?:us|me) in|\bfit (?:us|me) in|\bcome (?:in|down|along) (?:tonight|tomorrow|on|for|at)|\beat (?:with you|there|in)\b|\bdinner (?:for|tonight|tomorrow|on)|\bspace for\b|\broom for (?:\d|us|a)|\bseat (?:us|\d)/],
];

const AFFIRM = /^(?:\W*(?:oh|um|uh|er|erm|well|great|lovely|right|ok|okay)\W+)*(?:yes|yeah|yea|yep|yup|ya|aye|sure|ok|okay|alright|all right|fine|perfect|great|lovely|brilliant|excellent|super|wonderful|fantastic|cool|grand|smashing|sounds (?:good|great|perfect|lovely|fine)|that(?:'?s| is| would be|'?d be) (?:fine|great|perfect|lovely|right|correct|good|brilliant|grand|ok|okay|wonderful|fantastic|spot on|all correct|all good|all right)|that works|(?:that|it) suits|go (?:on|ahead)|please do|please|correct|absolutely|definitely|of course|book it|do it|yes please|let'?s do (?:it|that)|i'?ll take (?:it|that)|we'?ll take (?:it|that)|spot on|exactly|indeed|confirm(?:ed)?)\b/;
const DENY = /^(?:\W*(?:oh|um|uh|er|erm|well|sorry|hmm)\W+)*(?:no|nope|nah|not really|no thanks|no thank you|that(?:'?s| is) (?:wrong|not right|incorrect)|not quite|wrong|neither|none of (?:those|them)|that doesn'?t work|that won'?t work|(?:that'?s|it'?s) (?:too )(?:late|early))\b/;
const NOTHING = /^(?:\W*(?:um|uh|er|erm|oh|well)\W+)*(?:no|nope|nah|none|nothing|not that i know of|no allergies|nothing (?:else|like that|special)|no,? (?:nothing|none|that'?s (?:all|it|everything|fine))|all good|we'?re (?:all )?(?:good|fine)|no,? we'?re (?:good|fine)|i don'?t think so|not really)\b/;
const BYE = /\b(?:bye|goodbye|good bye|cheerio|ta-ra|see you|that(?:'?s| is) (?:all|everything|it)(?: for now)?(?:,? thanks?| thank you)?\W*$|nothing else|no,? that(?:'?s| is) (?:all|it|everything)|have a (?:good|nice|lovely) (?:night|evening|day))\b/;
const THANKS = /\b(?:thanks|thank you|cheers|ta|much appreciated|brilliant,? thanks)\b/;
const REPEAT = /^(?:\W*(?:sorry|pardon|what|huh|eh|come again|say (?:that|it) again|say again|repeat (?:that|it)|can you repeat(?: that)?|could you repeat(?: that)?|i didn'?t (?:catch|hear|get) (?:that|you|it)|what did you say|what was that|you what|what'?s that|i missed that|one more time|(?:you'?re|you are) breaking up|can you say that again)\W*)+$/;
const GREET = /^(?:\W*(?:hi|hello|hiya|hey|good (?:evening|afternoon|morning)|hi there|hello there|yes hello|oh hello)\W*)+$/;

/* Words that follow "it's", "I'm", "this is" and are not somebody's name. */
const NOT_A_NAME = new Set(`a an the for to at in on of and or but just only about around after before
  tonight today tomorrow calling ringing phoning looking wanting trying hoping wondering afraid sorry
  ok okay fine great good perfect lovely right correct wrong booked going coming running late early
  not no yes yeah here there that this my our we us me you your it its it's is was be been being
  available free full busy sure quite really very so too also still again please thanks thank
  table tables booking reservation party people person guests just actually well um uh er erm
  fully half quarter pm am o'clock ish minutes mins hour hours now later sooner soon asap
  monday tuesday wednesday thursday friday saturday sunday weekend week night evening morning afternoon
  lunch dinner midday noon mine ours his hers theirs them someone somebody anyone nobody
  alright interested hungry allergic vegan vegetarian coeliac celiac pregnant disabled
  with without from by up down off out over under back all both each some any more less
  mr mrs ms miss dr sir madam mum dad wife husband partner friend friends family
  what when where why how who which whose calling booking stuck held delayed
  double triple oh zero one two three four five six seven eight nine ten twelve
  window quiet banquette booth snug bar outside inside number mobile phone contact email`.split(/\s+/).filter(Boolean));

const TITLE = /^(?:mr|mrs|ms|miss|dr|mx|prof)\.?$/i;

const cap = (w) => w.split(/([-'])/).map((p) => (p === '-' || p === "'" ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');

/* ── the reading ─────────────────────────────────────────────────────────── */

/**
 * Read one thing a caller said.
 *
 * `expecting` is the question the receptionist just asked — "how many?",
 * "what time?", "a name?" — because a bare "eight" is a party of eight in
 * answer to one and eight o'clock in answer to another, and no amount of
 * cleverness gets that from the word alone.
 *
 * `today` is an ISO date; `now` is minutes past midnight.
 */
export function understand(text, { expecting = null, today = '2026-03-14', now = 19 * 60 + 42 } = {}) {
  const { s: norm, map, mapEnd, src } = normalise(text);
  let s = norm;
  const slots = {};
  const spans = [];
  const flags = {};

  /* Consumed text is blanked out, same length, so later patterns cannot read
     a phone number's digits as a party size and every index still lines up. */
  const take = (start, end, slot) => {
    s = s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);
    if (slot) {
      const a = map[start] ?? 0, b = mapEnd[end - 1] ?? a + 1;
      spans.push({ slot, start: a, end: b, text: src.slice(a, b) });
    }
  };
  const find = (re) => { re.lastIndex = 0; return re.exec(s); };

  /* ── phone: first, because it is the longest run of digits ── */
  {
    /* Commas and full stops too: a recogniser punctuates the pauses in
       "oh seven seven double oh, nine double oh, one two three". */
    const re = /(?:\+\s?44\s?\(?0?\)?|\b0)(?:[\s\-(),.]*\d){9,10}\b|\b\d(?:[\s,.-]*\d){9,11}\b/g;
    let m;
    while ((m = re.exec(s))) {
      let digits = m[0].replace(/\D/g, '');
      if (digits.startsWith('44')) digits = '0' + digits.slice(2);
      if (digits.startsWith('00')) digits = digits.slice(1);
      if (!digits.startsWith('0')) digits = '0' + digits;
      if (digits.length === 11) {
        slots.phone = digits.startsWith('07') ? `${digits.slice(0, 5)} ${digits.slice(5)}` : `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
        take(m.index, m.index + m[0].length, 'phone');
        break;
      }
    }
    /* A number that is plainly a phone number but the wrong length: say so,
       rather than silently booking a table under a number nobody can ring. */
    if (!slots.phone && (expecting === 'phone' || /\b(?:number|mobile|phone|contact)\b/.test(s))) {
      const run = /\b0?\d(?:[\s-]*\d){5,13}\b/.exec(s);
      if (run && run[0].replace(/\D/g, '').length >= 6) { flags.badPhone = run[0].replace(/\D/g, '').length; take(run.index, run.index + run[0].length, null); }
    }
  }

  /* ── lateness: "twenty minutes late" — before times, so its number stays its own ── */
  {
    const m = find(/\b(?:about |around |maybe |probably |roughly |like )?(\d{1,3}|half an|an|a (?:quarter of an|half))\s*(?:minutes?|mins?|min|hours?|hrs?)\b(?=[^.?!]{0,20}\b(?:late|behind|delayed|away)\b)|\b(?:about |around |maybe )?(\d{1,3})\s*(?:minutes?|mins?|min) (?:away|out)\b|\b(?:there|with you|arrive|arriving|be in)\s+in\s+(?:about |around |roughly |maybe |like )?(\d{1,3})\s*(?:minutes?|mins?|min)\b/);
    if (m) {
      const w = m[1] ?? m[2] ?? m[3];
      const hour = /hour|hr/.test(m[0]);
      const n = w === 'half an' || w === 'a half' ? 30 : w === 'an' ? 60 : w === 'a quarter of an' ? 15 : hour ? +w * 60 : +w;
      slots.late = n;
      take(m.index, m.index + m[0].length, 'late');
    }
  }

  /* In answer to "how late will you be?", a bare number is minutes. */
  if (expecting === 'late' && slots.late == null) {
    const m = find(/\b(\d{1,3})\b|\b(half an hour|an hour|a quarter of an hour)\b/);
    if (m) {
      slots.late = m[1] ? +m[1] : m[2] === 'half an hour' ? 30 : m[2] === 'an hour' ? 60 : 15;
      take(m.index, m.index + m[0].length, 'late');
    }
  }

  /* ── relative time: "half an hour later", "a bit earlier" ── */
  {
    const pb = find(/\b(push|move|put|knock|bring|shift)\b[^.?!]{0,25}?\b(back|forward)\b(?:\s+(?:by\s+)?(half an hour|an hour|(\d{1,3}) (?:minutes|mins)))?/);
    if (pb) {
      const amount = pb[3] === 'half an hour' ? 30 : pb[3] === 'an hour' ? 60 : pb[4] ? +pb[4] : null;
      slots.shift = { dir: pb[2] === 'back' ? 1 : -1, by: amount };
      take(pb.index + pb[0].indexOf(pb[2]), pb.index + pb[0].length, 'time');
    }
  }
  if (!slots.shift) {
    const m = find(/\b(?:(half an hour|an hour|(\d{1,3}) (?:minutes|mins)|a (?:bit|little|touch)|slightly|bit|little|any(?:thing|time)?|something|much|a lot)\s+)?(earlier|later|sooner)\b/);
    if (m && !/\b(?:call|ring|speak|talk|see you)\b[^.?!]*$/.test(s.slice(0, m.index))) {
      const amount = m[1] === 'half an hour' ? 30 : m[1] === 'an hour' ? 60 : m[2] ? +m[2] : null;
      slots.shift = { dir: m[3] === 'later' ? 1 : -1, by: amount };
      take(m.index, m.index + m[0].length, 'time');
    }
  }

  /* ── time ── */
  /* Read every time mentioned, then choose. "We've a table at quarter past
     eight — could we push it back to nine?" says two times, and the one they
     want is not the first. */
  const times = [];
  const s0 = s;
  for (let pass = 0; pass < 3; pass++) {
    const had = slots.time;
    delete slots.time;
    let at = -1;
    const evening = (h) => (h >= 1 && h <= 11 ? h + 12 : h);
    const set = (h, min, m, approx = false) => {
      slots.time = h * 60 + min;
      if (approx) slots.approx = true;
      at = m.index;
      times.push({ at: m.index, lead: /^(?:from|at)\s/.test(m[0]) ? m[0].split(/\s/)[0] : '', value: slots.time, approx, bound: /^(?:after|from)\s/.test(m[0]) ? 'after' : /^(?:before|by)\s/.test(m[0]) ? 'before' : null });
      take(m.index, m.index + m[0].length, 'time');
    };
    let m;
    const approx = (str) => /\b(?:around|about|roughly|approx|ish|or so|-ish|say|maybe|sometime|some time)\b|ish\b/.test(str);
    const ampm = (h, suffixText) => {
      const sfx = (suffixText || '').replace(/\./g, '');
      if (/pm|evening|night|tonight/.test(sfx)) return h < 12 ? h + 12 : h;
      if (/am|morning/.test(sfx)) return h === 12 ? 0 : h;
      return evening(h);
    };
    /* "tonight" is left for the date to find, so "8:30 tonight" keeps its day. */
    const AMPM = '\\s*(a\\.?m\\.?|p\\.?m\\.?|in the evening|in the morning|at night)?';

    if ((m = find(/\b(?:half|1\/2)\s+past\s+(\d{1,2})\b(?:\s*(?:o'?clock))?/)) || (m = find(/\bhalf\s+(\d{1,2})\b(?!\s*(?:hour|an|of|the|people|minutes))/))) {
      set(evening(+m[1] % 24 || 12) % 24, 30, m, approx(s));
    } else if ((m = find(/\b(\d{1,2}|a)\s+(?:minutes\s+)?(past|after|to|til|till|before)\s+(\d{1,2})\b(?!\s*(?:people|of us|guests))/)) && (m[1] === 'a' ? false : +m[1] % 5 === 0 && +m[1] <= 25)) {
      /* "twenty past seven", "ten to eight" */
      const h = evening(+m[3]);
      if (/past|after/.test(m[2])) set(h, +m[1], m, approx(s));
      else set(h - 1, 60 - +m[1], m, approx(s));
    } else if ((m = find(/\bquarter\s+(past|after|to|til|till|before)\s+(\d{1,2})\b/))) {
      const h = evening(+m[2]);
      if (/past|after/.test(m[1])) set(h, 15, m, approx(s));
      else set(h - 1, 45, m, approx(s));
    } else if ((m = find(new RegExp(`\\b(\\d{1,2})\\s*[:.]\\s*(\\d{2})${AMPM}`)))) {
      const h = +m[1], min = +m[2];
      if (h <= 23 && min <= 59) set(h >= 13 ? h : ampm(h, m[3]), min, m, approx(s));
    } else if ((m = find(new RegExp(`\\b(\\d{1,2})\\s+(15|30|45|05|10|20|40|50)\\b(?!\\s*(?:minutes|mins|people|of us|guests|adults|kids|children|pounds|quid))${AMPM}`)))) {
      const h = +m[1];
      if (h <= 12 || h >= 13 && h <= 23) set(h >= 13 ? h : ampm(h, m[3]), +m[2], m, approx(s));
    } else if ((m = find(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?|o'?\s?clock|ish|-ish)\b|\b(\d{1,2})\s*(?:in the evening|at night)\b|\b(?<!\bfor\s+)(\d{1,2})(?=\s*tonight\b)/))) {
      const h = +(m[1] ?? m[3] ?? m[4]);
      if (h >= 1 && h <= 23) set(h >= 13 ? h : ampm(h, m[2] || 'pm'), 0, m, approx(s) || /ish/.test(m[0]));
    } else if ((m = (() => {
      /* "at 8", "around 9", "move it to 9". Every match is tried, not just the
         first: "a table for ten on Saturday at 8" has its time at the end. And
         "for" is not on the list — "a table for two tonight" is two people,
         never two in the afternoon. */
      const re = /\b(at|around|about|from|after|by|say|before|roughly|to|till|until)\s+(?:about\s+|around\s+)?(\d{1,2})(?:\s*(?:ish|-ish))?\b(?!\s*(?:people|person|of us|guests|adults|kids|children|minutes|mins|hours|\d|st\b|nd\b|rd\b|th\b|or\s+\d+\s+(?:people|of us)|covers|more|extra|in total))/g;
      let hit;
      while ((hit = re.exec(s))) {
        const h = +hit[2];
        if (h < 1 || h > 23) continue;
        /* "up to 6", "from 4 to 6 people" are sizes */
        if (/^(?:to|till|until)$/.test(hit[1]) && /\b(?:up|from \d+)\s*$/.test(s.slice(Math.max(0, hit.index - 10), hit.index))) continue;
        return hit;
      }
      return null;
    })())) {
      const h = +m[2];
      set(h >= 13 ? h : evening(h), 0, m, approx(m[0]) || approx(s));
      if (/^(?:after|from)$/.test(m[1])) slots.bound = 'after';
      if (/^(?:before|by)$/.test(m[1])) slots.bound = 'before';
    } else if ((m = find(/\b(noon|midday|lunch ?time|lunch)\b/))) {
      slots.time = 12 * 60 + (m[1].startsWith('lunch') ? 60 : 0);
      slots.lunch = true;
      take(m.index, m.index + m[0].length, 'time');
    } else if ((m = find(/\b(?:as soon as (?:possible|you can)|asap|right now|straight away|in (?:the )?next (\d+|few) (?:minutes|mins))\b|(?<=\b(?:table|anything|space|room|available|free|seat us|come in|come down|walk in|pop in|pop down)\b[^.?!]{0,16})\bnow\b/))) {
      const within = m[1] && /\d/.test(m[1]) ? +m[1] : 0;
      slots.time = Math.ceil((now + within) / 15) * 15;
      slots.asap = true;
      take(m.index, m.index + m[0].length, 'time');
    } else if ((m = find(/\b(early evening|earliest|early doors|as early as)\b/))) {
      slots.time = 17 * 60 + 30; slots.approx = true;
      take(m.index, m.index + m[0].length, 'time');
    } else if ((m = find(/\b(late evening|latest|as late as|last (?:sitting|table|slot))\b/))) {
      slots.time = 21 * 60 + 30; slots.approx = true;
      take(m.index, m.index + m[0].length, 'time');
    } else if (pass === 0 && (expecting === 'time' || expecting === 'choice')) {
      /* In answer to "what time?", a bare number is the time: "eight", "8ish",
         "7 30" was caught above, "730" and "1930" are caught here. */
      if ((m = find(/^\W*(?:(?:um|uh|er|erm|oh|yeah|yes|well|ok|okay|maybe|say|how about|what about|could we do|can we do|we'?d like|we'?ll say|let'?s say|make it|probably|ideally|around|about|at)\W+)*(\d{3,4}|\d{1,2})(?:\s*(?:ish|-ish))?\b/))) {
        const n = m[1];
        let h, min = 0;
        if (n.length >= 3) { h = +n.slice(0, n.length - 2); min = +n.slice(-2); } else h = +n;
        if (h >= 1 && h <= 23 && min < 60) set(h >= 13 ? h : evening(h), min, m, approx(m[0]));
      } else if ((m = find(/\b(\d{1,2})\b(?=\s+(?:would|works|work|is|sounds|suits|'?ll do|will do|please|then|is fine|is great|is perfect)\b)|\b(?:do|say|how about|what about|make it|take|have|go for|book|let'?s do)\s+(\d{1,2})\b(?!\s*(?:people|of us|guests))/))) {
        /* Not at the start, but plainly a time: "that's a shame — nine would be fine". */
        const h = +(m[1] ?? m[2]);
        if (h >= 1 && h <= 23) set(h >= 13 ? h : evening(h), 0, m, false);
      }
    }
    if (slots.time === undefined) { if (had !== undefined) slots.time = had; break; }
  }
  if (times.length > 1) {
    const leaving = (t) => /\b(?:from|instead of|rather than|not|was|booked(?: (?:at|for))?|booking(?: is)?(?: (?:at|for))?|table(?: is)?(?: (?:at|for))?|reservation(?: is)?(?: (?:at|for))?|(?:got|have) (?:it|one) (?:at|for))\s*$/.test(`${s0.slice(Math.max(0, t.at - 26), t.at)}${t.lead ? ` ${t.lead}` : ''}`.trimEnd() + ' ');
    const keep = times.filter((t) => !leaving(t));
    const chosen = keep.length ? keep[keep.length - 1] : times[times.length - 1];
    slots.time = chosen.value;
    if (chosen.approx) slots.approx = true; else delete slots.approx;
    if (chosen.bound) slots.bound = chosen.bound; else delete slots.bound;
    slots.times = times.map((t) => t.value);
  }

  /* ── date ── */
  {
    let m;
    const setDate = (d, m2, slot = 'date') => { if (d) { slots.date = d; take(m2.index, m2.index + m2[0].length, slot); } };
    if ((m = find(/\b(tonight|today|this evening|tonite|later today|later on|this eve)\b/))) setDate(today, m);
    else if ((m = find(/\b(?:the )?day after tomorrow\b/))) setDate(addDays(today, 2), m);
    else if ((m = find(/\b(tomorrow|tmrw|tomorow|tomoz|tommorow|tommorrow)(?:\s+(?:night|evening))?\b/))) setDate(addDays(today, 1), m);

    /* weekday, optionally with a date after it: "Friday the 20th" */
    /* Every weekday mentioned, then the one they mean. "We've booked for
       Friday but could we move it to Saturday" names two, and the booking is
       the one they are leaving; "Saturday, not Sunday" names two and the one
       after "not" is the mistake. */
    const wdRe = new RegExp(`\\b(?:(this|next|coming|on|a)\\s+)?(?:(week)\\s+on\\s+)?${WEEKDAY_RE}(?:\\s+(week)\\b)?(?:\\s+(?:night|evening|lunch|dinner))?(?:\\s+(?:next|this|coming)\\s+week)?\\b`, 'g');
    const all = [];
    for (let w; (w = wdRe.exec(s));) all.push(w);
    const leaving = (w) => /\b(?:not|instead of|rather than|from|booked (?:for|on)|booking (?:for|on)|reservation (?:for|on)|we'?ve got|have got|have a booking (?:for|on)|had)\s+(?:the\s+)?$/.test(s.slice(Math.max(0, w.index - 26), w.index));
    const wd = all.length > 1 ? (all.filter((w) => !leaving(w)).pop() ?? all[0]) : all[0];
    if (wd && !slots.date) {
      const dow = weekdayIndex(wd[3]);
      let d = nextWeekday(today, dow, { allowToday: false });
      if (/next week/.test(wd[0]) || wd[2] === 'week' || wd[4] === 'week') {
        /* "Friday next week" and "a week on Friday": the one after the coming one. */
        d = addDays(d, 7);
      }
      slots.date = d;
      slots.weekday = dow;
      take(wd.index, wd.index + wd[0].length, 'date');
    }

    /* day of the month, with or without a month */
    let dm = find(new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`))
      || find(new RegExp(`\\b${MONTH_RE}\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (dm) {
      const day = /^\d/.test(dm[1]) ? +dm[1] : +dm[2];
      const mon = monthIndex(/^\d/.test(dm[1]) ? dm[2] : dm[1]);
      const d = day >= 1 && day <= 31 && mon >= 0 ? dayOfMonth(today, day, mon) : null;
      if (d) { mergeDate(d); take(dm.index, dm.index + dm[0].length, 'date'); } else if (day > 31 || !d) flags.badDate = true;
    } else if ((dm = find(/\b(?:the\s+)(\d{1,2})(st|nd|rd|th)\b(?!\s*(?:one|option|time|of us|birthday|anniversary))|\b(\d{1,2})(st|nd|rd|th)\b(?=\s*(?:\?|$|please|for|at|if))/)) && !/\b(?:birthday|anniversary)\b/.test(s.slice(dm.index, dm.index + 22))) {
      const day = +(dm[1] ?? dm[3]);
      const d = day >= 1 && day <= 31 ? dayOfMonth(today, day) : null;
      if (d) { mergeDate(d); take(dm.index, dm.index + dm[0].length, 'date'); } else flags.badDate = true;
    } else if ((dm = find(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/))) {
      const d = dayOfMonth(today, +dm[1], +dm[2] - 1);
      if (d) { mergeDate(d); take(dm.index, dm.index + dm[0].length, 'date'); }
    }

    if (!slots.date && (m = find(/\b(?:this |the )?weekend\b|\bnext week\b|\bsometime this week\b/))) {
      flags.vagueDate = m[0].includes('weekend') ? 'weekend' : 'week';
      take(m.index, m.index + m[0].length, 'date');
    }

    function mergeDate(d) {
      /* A weekday and a date that disagree is a question, not a choice to
         make on the caller's behalf. */
      if (slots.weekday != null && weekdayOf(d) !== slots.weekday) {
        flags.dateClash = { said: slots.weekday, date: d };
      }
      slots.date = d;
    }
  }

  /* ── party size ── */
  {
    let m;
    const setParty = (n, m2, slot = 'party') => {
      if (!(n >= 1 && n <= 99)) return false;
      slots.party = n;
      /* Highlight from the number on — "four people", not "a table for four". */
      const from = m2[1] && /^\d+$/.test(m2[1]) ? m2[0].indexOf(m2[1]) : 0;
      const start = m2.index + Math.max(0, from), end = m2.index + m2[0].length;
      take(start, end, slot);
      take(m2.index, end, null);
      return true;
    };
    if ((m = find(/\b(\d{1,2})\s+(?:adults?|grown[- ]ups?|of us)\s*(?:and|&|plus|\+|with)\s+(\d{1,2})\s+(?:kids|children|child|little ones|babies|baby|toddlers?|under[- ]\d+s?)\b/))) {
      setParty(+m[1] + +m[2], m);
      slots.children = +m[2];
    } else if ((m = find(/\b(\d{1,2}),?\s?(?:maybe|possibly|or|perhaps|might be|could be|max(?:imum)?|at most|tops)\s(\d{1,2})\b(?:\s+(?:people|of us|guests))?(?=\s*(?:people|of us|guests|adults|$|[.,!?]))/))) {
      setParty(Math.max(+m[1], +m[2]), m);
      slots.maybe = `might be ${Math.min(+m[1], +m[2])}`;
    } else if ((m = find(/\b(?:table|booking|reservation|room|space|seats?|somewhere|dinner|lunch)\s+for\s+(\d{1,2})\b(?!\s*(?:pm|am|p\.m|a\.m|:|\.\d|o'?clock|ish|thirty|\d\d))/))
      || (m = find(/\b(?:for|us|we're|we are|there'?(?:s|ll be)|there will be|we'?ll be|we will be|we'?re a|it'?s|its)\s+(?:a\s+)?(?:party of |group of |family of |total of )?(\d{1,2})\s+(?:people|persons?|guests|adults|of us|covers|pax|diners|in total|altogether|in (?:our|the) (?:party|group))\b/))
      || (m = find(/\b(\d{1,2})\s+(?:people|persons|guests|adults|of us|covers|pax|diners|in (?:our|the) (?:party|group))\b(?!\s+(?:has|have|is|are|can|can'?t|cannot|won'?t|will|needs?|'s|'re|isn'?t|aren'?t|don'?t|doesn'?t|eats?|might|may|would|should|wants?|likes?|prefers?|is|was|were|got|dropped|allergic))/))
      || (m = find(/\b(?:party|group|family|table|total|gang) of\s+(\d{1,2})\b/))
      || (m = find(/\b(?:it'?ll be|it will be|that'?ll be|so we'?re|so it'?s|now it'?s|we'?re now|we are now|there'?ll now be|we'?ll now be|now there'?s|down to|up to)\s+(\d{1,2})\b(?!\s*(?:pm|am|:|o'?clock|ish|minutes|mins))(?=\s*(?:now|people|of us|in total|instead|$|[.,!?]))/))
      || (m = find(/\bthe\s+(\d{1,2})\s+of\s+us\b/))) {
      setParty(+m[1], m);
    } else if ((m = find(/\ba dozen\b|\bdozen of us\b/))) {
      setParty(12, m);
    } else if ((m = (() => {
      /* "me, my husband and our two kids": one for the caller, one for each
         person named, and the number in front of anybody plural. Plurals with
         no number ("me and the kids") are left for the receptionist to ask. */
      const REL = '(?:wife|husband|partner|girlfriend|boyfriend|fianc[eé]e?|other half|date|mum|mom|mam|dad|mother|father|sons?|daughters?|friends?|mates?|colleagues?|sisters?|brothers?|nan|gran|grandma|grandad|grandparents|boss|kids|children|parents|in-laws|twins|baby|toddler|missus|hubby|family)';
      const re = new RegExp(`\\b(?:just\\s+)?(?:me|myself)((?:\\s*(?:,|and|&|plus|with)?\\s*(?:my|our|the|a|his|her)\\s+(?:\\d{1,2}\\s+)?${REL}\\b|\\s*(?:,|and|&|plus|with)\\s*(?:\\d{1,2}\\s+)?${REL}\\b)+)`);
      const hit = re.exec(s);
      if (!hit) return null;
      let n = 1;
      for (const part of hit[1].matchAll(new RegExp(`(?:(\\d{1,2})\\s+)?(${REL})\\b`, 'g'))) {
        const [, num, who] = part;
        if (num) n += +num;
        else if (/^(?:parents|in-laws|twins|grandparents)$/.test(who)) n += 2;
        else if (/s$/.test(who) && !/^(?:boss|missus)$/.test(who) || who === 'family' || who === 'children') { flags.partyUnclear = true; return null; }
        else n += 1;
      }
      hit.n = n;
      return hit;
    })())) {
      setParty(m.n, m);
    } else if ((m = find(/\b(?:the )?two of us\b|\bthe pair of us\b/))
      || (m = find(/\b(?:a )?couple of (?:us|people)\b|\bjust (?:the )?two\b|\bfor two\b|\bus two\b|\bthe pair of us\b|\bjust us two\b/))) {
      setParty(2, m);
    } else if (!flags.partyUnclear && (m = find(/\bjust (?:me|myself)\b|\bon my own\b|\btable for one\b|\bsolo\b|\bby myself\b|\bjust (?:the )?one\b/))) {
      setParty(1, m);
    } else if ((m = find(/\bfor\s+(\d{1,2})\b(?!\s*(?:pm|am|p\.m|a\.m|:|o'?clock|ish|minutes|mins|hours|st\b|nd\b|rd\b|th\b|\d))/)) && (slots.time != null || /\b(?:book|table|reserv|space|room|availab\w*)\b/.test(s))) {
      setParty(+m[1], m);
    } else if (expecting === 'party' && (m = find(/^\W*(?:(?:um|uh|er|erm|oh|yeah|yes|so|well|ok|okay|it'?s|its|it will be|it'?ll be|there'?ll be|there will be|there'?s|there is|there are|we'?re|we are|we'?ll be|we will be|going to be|gonna be|just|probably|maybe|about|around|for|table for)\W+)*(\d{1,2})\b(?!\s*(?:pm|am|:|o'?clock))/))) {
      setParty(+m[1], m);
    }

    /* changes to a party: "two more", "one fewer", "somebody can't make it" */
    if ((m = find(/\b(\d{1,2}|an?|one|another)\s+(?:more|extra|additional)\b(?:\s+(?:people|person|guests?|of us))?|\badd(?:ing)?\s+(?:on\s+)?(\d{1,2}|an?|one|another)\b(?:\s+(?:more\s+)?(?:people|person|guests?))?|\banother (?:person|guest)\b/))) {
      const w = m[1] ?? m[2] ?? 'a';
      slots.partyDelta = /^\d+$/.test(w) ? +w : 1;
      take(m.index, m.index + m[0].length, 'party');
    } else if ((m = find(/\b(\d{1,2}|one)\s+(?:less|fewer)\b|\b(?:someone|somebody|one of us|one person|a friend|a guest)\s+(?:can'?t|cannot|isn'?t|won'?t|has dropped|dropped)|\b(\d{1,2}) of us (?:can'?t|won'?t|aren'?t)/))) {
      const w = m[1] ?? m[2];
      slots.partyDelta = -(w && /^\d+$/.test(w) ? +w : 1);
      take(m.index, m.index + m[0].length, 'party');
    }
  }

  /* ── notes: allergies, occasions, access, where to sit ── */
  {
    const notes = [];
    const low = s;
    for (const [re, kind, label] of NOTES) {
      const m = re.exec(low);
      if (!m) continue;
      /* "no nuts" in answer to "any allergies?" is not a nut allergy;
         "nut-free" in a question is a question. */
      const before = low.slice(Math.max(0, m.index - 18), m.index);
      if (/\b(?:no|not|without|isn'?t|aren'?t|don'?t have|no one has|nobody has|none)\s+(?:\w+\s+)?$/.test(before) && kind === 'allergy') continue;
      let text = label;
      if (label === 'highchair') {
        const c = /\b(\d)\s+high ?chairs\b/.exec(low);
        if (c) text = `${c[1]} highchairs`;
      }
      if (label === 'birthday') {
        const age = /\b(\d{1,3})(?:st|nd|rd|th)\s+birthday\b/.exec(low);
        if (age) text = `${age[1]}${suffix(+age[1])} birthday`;
      }
      notes.push({ kind, text });
      const a = map[m.index] ?? 0, b = mapEnd[m.index + m[0].length - 1] ?? a + 1;
      spans.push({ slot: 'notes', start: a, end: b, text: src.slice(a, b) });
    }
    if (notes.length) slots.notes = notes;
  }

  /* ── name ── */
  {
    /* Spelled out: "C-O-L-L-I-N-S", "c o l l i n s" */
    const spelled = /\b([a-z])(?:[\s.\-,]+([a-z])\b){2,}/g;
    let sp, spelledName = null;
    while ((sp = spelled.exec(s))) {
      const letters = sp[0].replace(/[^a-z]/g, '');
      if (letters.length >= 3 && !/^(?:a)+$/.test(letters)) {
        spelledName = { text: cap(letters), index: sp.index, end: sp.index + sp[0].length };
      }
    }

    const pick = (raw, index, len) => {
      const words = raw.split(/\s+/).filter(Boolean);
      const keep = [];
      for (const w of words) {
        if (TITLE.test(w)) { keep.push(cap(w.replace('.', ''))); continue; }
        if (NOT_A_NAME.has(w) || /\d/.test(w)) break;
        keep.push(cap(w));
        if (keep.filter((k) => !TITLE.test(k)).length >= 2) break;
      }
      const real = keep.filter((k) => !TITLE.test(k));
      if (!real.length) return false;
      slots.name = keep.join(' ');
      const a = map[index] ?? 0;
      const b = mapEnd[index + keep.join(' ').length - 1] ?? a + 1;
      spans.push({ slot: 'name', start: a, end: Math.max(b, a + 1), text: src.slice(a, Math.max(b, a + 1)) });
      take(index, index + Math.min(len, keep.join(' ').length), null);
      return true;
    };

    const cue = /\b(?:my name(?:'s| is)|name(?:'s| is)|the name(?:'s| is)|(?:the )?name of|name|surname(?:'s| is)?|last name(?:'s| is)?|it'?s|it is|this is|i'?m|i am|under(?: the name)?(?: of)?|booked under|booking under|put it under|call me|in the name of|(?:mr|mrs|ms|miss|dr)\.?)\s+((?:(?:mr|mrs|ms|miss|dr)\.?\s+)?[a-zà-ÿā-ž][a-zà-ÿā-ž'\-]*(?:\s+[a-zà-ÿā-ž][a-zà-ÿā-ž'\-]*)?)/g;
    let m, found = false;
    while (!found && (m = cue.exec(s))) {
      const start = m.index + m[0].length - m[1].length;
      /* "It's for four", "I'm running late", "this is for Friday" */
      const title = /^(?:mr|mrs|ms|miss|dr)\.?$/.test(m[0].trim().split(/\s+/)[0]);
      found = pick(title ? m[0].trim() : m[1], title ? m.index : start, title ? m[0].length : m[1].length);
      /* "it's under Ferreira": "it's" found nothing, so try again from the
         next word rather than from after everything it swallowed. */
      if (!found) cue.lastIndex = m.index + m[0].indexOf(m[1]);
    }

    if (!found && expecting === 'name') {
      /* In answer to "can I take a name?": whatever is left, once the ums, the
         yeses and the pleases are stripped, is the name. */
      const rest = /^\W*(?:(?:um|uh|er|erm|oh|yeah|yes|yep|sure|ok|okay|so|right|it'?s|its|that'?s|that is|the name'?s|name'?s|surname|under|go with|put it under|put)\W+)*([a-zà-ÿā-ž][a-zà-ÿā-ž'\-]*(?:\s+[a-zà-ÿā-ž][a-zà-ÿā-ž'\-]*){0,2})\W*(?:please|thanks|thank you|cheers)?\W*$/.exec(s);
      if (rest) found = pick(rest[1], rest.index + rest[0].indexOf(rest[1]), rest[1].length);
    }

    if (spelledName && (expecting === 'name' || found || /\b(?:spell|spelt|that'?s)\b/.test(s))) {
      slots.name = slots.name && slots.name.split(' ').length > 1
        ? slots.name.split(' ').slice(0, -1).concat(spelledName.text).join(' ')
        : spelledName.text;
      slots.spelled = true;
    }
  }

  /* ── what they want ── */
  const low = norm;
  let intent = null;
  for (const [name, re] of INTENTS) {
    if (re.test(low)) { intent = name; break; }
  }

  let topic = null;
  if (QUESTION.test(low.trim())) {
    for (const [name, re] of TOPICS) if (re.test(low)) { topic = name; break; }
  } else if (/\b(?:what time do you close|opening hours|where are you|is there parking)\b/.test(low)) {
    for (const [name, re] of TOPICS) if (re.test(low)) { topic = name; break; }
  }
  /* A question about lunch is a question about the hours, not a request for a
     table at one o'clock. */
  if (topic === 'hours' && slots.lunch) delete slots.time;

  /* A question with a booking in it — "do you have a table for four at
     eight?" — is a booking, not a question about the menu. */
  if (topic === 'dietary' && (intent === 'book' || slots.party)) {
    /* "have you got a table for 2, one of us is coeliac": a note, not a question */
    if (!/\b(?:do you|can you|is there|are there|have you got anything|anything)\b[^.?!]*\b(?:vegan|vegetarian|gluten|coeliac|celiac|dairy|allerg|halal|kosher)/.test(low)) topic = null;
  }
  if (topic === 'kids' && slots.party) topic = null;
  if (topic === 'access' && slots.notes?.some((n) => n.kind === 'access') && intent === 'book') topic = null;

  const t = low.trim();
  const affirm = AFFIRM.test(t);
  const deny = !affirm && DENY.test(t);
  const nothing = NOTHING.test(t);
  const bye = BYE.test(t);
  const thanks = THANKS.test(t);
  const repeat = REPEAT.test(t);
  const greet = GREET.test(t);

  /* Choosing between offered times: "the first one", "the later one" */
  let pickOption = null;
  {
    const m = /\b(?:the\s+)?(1st|first|former|earlier|earliest|2nd|second|latter|later|latest|last)(?:\s+(?:one|option|time|slot))?\b/.exec(low);
    if (m && (expecting === 'choice' || /\bone\b|option|slot/.test(m[0]))) {
      pickOption = /1st|first|former|earlier|earliest/.test(m[1]) ? 0 : 1;
      if (slots.shift && expecting === 'choice' && /\bone\b|option/.test(m[0])) delete slots.shift;
    }
  }
  if (!intent && slots.late != null) intent = 'late';
  if (!intent && !topic && !affirm && !deny && !nothing && !bye && !repeat && !greet
      && (slots.party != null || slots.time != null || slots.date != null) && expecting == null) {
    intent = 'book';
  }

  return {
    text: src,
    intent,
    topic,
    slots,
    affirm, deny, nothing, bye, thanks, repeat, greet,
    pick: pickOption,
    flags,
    spans: spans.sort((a, b) => a.start - b.start),
  };
}

/* ── saying things back ──────────────────────────────────────────────────── */

/** 20:30 → "8:30", 20:00 → "8 o'clock", as a person would say it on the phone. */
export function sayTime(m) {
  const h = Math.floor(m / 60) % 24, min = m % 60;
  const h12 = h % 12 || 12;
  if (h === 12 && min === 0) return 'midday';
  if (min === 0) return `${h12} o'clock`;
  return `${h12}:${String(min).padStart(2, '0')}`;
}

/** "tonight", "tomorrow", "Friday the 20th", "Saturday the 4th of April". */
export function sayDate(date, today) {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'tonight';
  if (diff === 1) return 'tomorrow';
  const d = toDate(date);
  const wd = WEEKDAYS[d.getUTCDay()];
  const day = d.getUTCDate();
  const W = wd[0].toUpperCase() + wd.slice(1);
  const sameMonth = d.getUTCMonth() === toDate(today).getUTCMonth();
  const month = MONTHS[d.getUTCMonth()];
  const tail = sameMonth && diff < 28 ? '' : ` of ${month[0].toUpperCase() + month.slice(1)}`;
  return `${diff < 7 ? 'this ' : ''}${W} the ${day}${suffix(day)}${tail}`;
}

/** "Sat 14 Mar" — for the screen, where space is short. */
export function shortDate(date) {
  const d = toDate(date);
  const wd = WEEKDAYS[d.getUTCDay()];
  const mo = MONTHS[d.getUTCMonth()];
  return `${wd[0].toUpperCase()}${wd.slice(1, 3)} ${d.getUTCDate()} ${mo[0].toUpperCase()}${mo.slice(1, 3)}`;
}

export const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
