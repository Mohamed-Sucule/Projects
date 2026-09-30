/* ───────────────────────────────────────────────────────────────────────────
   frontdesk/eval.js — the things callers say, and what each one means.

   This is the list the receptionist is measured against, on the page and in
   the tests. It was written before the parser was tuned against it and it is
   deliberately untidy: lower-case with no punctuation, the way speech comes
   out of a recogniser; numbers as words and as digits; people correcting
   themselves; people asking two things at once.

   Each case says only what it checks. A case that expects a party size and a
   time does not care what the parser thinks the intent is, and the score
   counts a case as right only when every field it names is right.

   Today, for every case, is Saturday 14 March and it is 19:42 — the same
   moment the Covers restaurant is at when it opens.
   ─────────────────────────────────────────────────────────────────────────── */

const T = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const TODAY = '2026-03-14', TOMORROW = '2026-03-15', MON = '2026-03-16', TUE = '2026-03-17', WED = '2026-03-18',
  THU = '2026-03-19', FRI = '2026-03-20', SAT = '2026-03-21', SUN = '2026-03-22';

/* [what they said, what it means, the question they were answering] */
export const CASES = [
  /* ── asking for a table, all at once ── */
  ['Hi, have you got a table for four tonight at around half eight?', { intent: 'book', party: 4, date: TODAY, time: T(20, 30) }],
  ['hi yeah can i book a table for two for tomorrow at 7', { intent: 'book', party: 2, date: TOMORROW, time: T(19) }],
  ["I'd like to make a reservation for six people on Friday at 8pm", { intent: 'book', party: 6, date: FRI, time: T(20) }],
  ['Do you have any availability this Saturday evening for 3', { intent: 'book', party: 3, date: SAT }],
  ['table for 2 tonight please', { intent: 'book', party: 2, date: TODAY }],
  ["Hello, I was wondering if you'd have room for five of us on Thursday, about seven thirty?", { intent: 'book', party: 5, date: THU, time: T(19, 30) }],
  ['can we get a table for 8 next friday at quarter past 7', { intent: 'book', party: 8, date: FRI, time: T(19, 15) }],
  ['just me and my wife, tomorrow night at 8 if you can', { intent: 'book', party: 2, date: TOMORROW, time: T(20) }],
  ["Hiya, I want to book for 4 people on Sunday at 1", { intent: 'book', party: 4, date: TOMORROW, time: T(13) }],
  ['Could I reserve a table for two on Wednesday at half seven please', { intent: 'book', party: 2, date: WED, time: T(19, 30) }],
  ['booking for three at 9pm tonight', { intent: 'book', party: 3, date: TODAY, time: T(21) }],
  ['have you got anything for 2 right now', { intent: 'book', party: 2, time: T(19, 45) }],
  ["We're looking for a table for ten on Saturday the 21st at 8", { intent: 'book', party: 10, date: SAT, time: T(20) }],
  ['a table for 4 on the 20th at 7.45', { intent: 'book', party: 4, date: FRI, time: T(19, 45) }],
  ['two adults and two kids tuesday at 6', { intent: 'book', party: 4, date: TUE, time: T(18) }],
  ['can I book dinner for 6 on March 28th at 8:15', { intent: 'book', party: 6, date: '2026-03-28', time: T(20, 15) }],
  ['do you have space for a party of seven tomorrow evening', { intent: 'book', party: 7, date: TOMORROW }],
  ['hi there just after a table for 1 tonight at 8', { intent: 'book', party: 1, date: TODAY, time: T(20) }],
  ['Could you squeeze us in tonight? There are three of us.', { intent: 'book', party: 3, date: TODAY }],
  ['I want to book a table', { intent: 'book' }],
  ["Yes hello, I'd like to book please", { intent: 'book' }],
  ['reservation for the 4th of april, 2 people, 7pm', { intent: 'book', party: 2, date: '2026-04-04', time: T(19) }],
  ['is there any chance of a table for five at nine tomorrow', { intent: 'book', party: 5, date: TOMORROW, time: T(21) }],
  ['Can I get a table for twelve on the 27th', { intent: 'book', party: 12, date: '2026-03-27' }],
  ['do you have a table for 4 at 8 o clock tonight', { intent: 'book', party: 4, date: TODAY, time: T(20) }],
  ['me and my mum on thursday afternoon around 5', { intent: 'book', party: 2, date: THU, time: T(17) }],
  ['we are a group of 9 looking for friday night at 7', { intent: 'book', party: 9, date: FRI, time: T(19) }],
  ['for four people at eight fifteen on the twenty first please', { intent: 'book', party: 4, date: SAT, time: T(20, 15) }],
  ['Hi could I book a table for Friday week for 2 at 7', { party: 2, time: T(19) }],
  ['can we book a table a week on friday for 4', { intent: 'book', party: 4, date: '2026-03-27' }],
  ['id like a table for two tomorrow at twenty past seven', { intent: 'book', party: 2, date: TOMORROW, time: T(19, 20) }],
  ['have you got a table for 6 at 19:30 on sunday', { intent: 'book', party: 6, date: TOMORROW, time: T(19, 30) }],
  ['do you have any tables free tonight at 10', { intent: 'book', date: TODAY, time: T(22) }],
  ['we want to come in on friday for dinner', { intent: 'book', date: FRI }],
  ['a table for 2 please at quarter to nine', { intent: 'book', party: 2, time: T(20, 45) }],
  ['can I book for 4 at 8 tomorrow', { intent: 'book', party: 4, time: T(20), date: TOMORROW }],
  ['book me in for tuesday, 3 of us, 7:30', { intent: 'book', party: 3, date: TUE, time: T(19, 30) }],
  ["I'm after a table for the two of us on Wednesday the 18th", { intent: 'book', party: 2, date: WED }],
  ['Evening! Table for four, 8 o’clock, Friday?', { intent: 'book', party: 4, time: T(20), date: FRI }],
  ['can i reserve for five maybe six on saturday', { intent: 'book', party: 6, date: SAT }],

  /* ── answering one question at a time ── */
  ['four', { party: 4 }, 'party'],
  ['there will be six of us', { party: 6 }, 'party'],
  ["it's just me", { party: 1 }, 'party'],
  ['um probably 3', { party: 3 }, 'party'],
  ['2 please', { party: 2 }, 'party'],
  ['the two of us', { party: 2 }, 'party'],
  ["we're a party of 11", { party: 11 }, 'party'],
  ['a dozen', { party: 12 }, 'party'],
  ['eight', { time: T(20) }, 'time'],
  ['half seven', { time: T(19, 30) }, 'time'],
  ['7:15 would be great', { time: T(19, 15) }, 'time'],
  ['about 8ish', { time: T(20) }, 'time'],
  ['730', { time: T(19, 30) }, 'time'],
  ['could we do 9', { time: T(21) }, 'time'],
  ['quarter past eight', { time: T(20, 15) }, 'time'],
  ['six thirty', { time: T(18, 30) }, 'time'],
  ['as early as possible', { time: T(17, 30) }, 'time'],
  ['tomorrow', { date: TOMORROW }, 'date'],
  ['this friday', { date: FRI }, 'date'],
  ['next tuesday', { date: TUE }, 'date'],
  ['the 25th', { date: '2026-03-25' }, 'date'],
  ['Saturday the 21st', { date: SAT }, 'date'],
  ['tonight if possible', { date: TODAY }, 'date'],
  ['the 2nd of april', { date: '2026-04-02' }, 'date'],
  ['sunday', { date: TOMORROW }, 'date'],
  ['Collins', { name: 'Collins' }, 'name'],
  ["it's Sarah Collins", { name: 'Sarah Collins' }, 'name'],
  ['yeah the name is priya shah', { name: 'Priya Shah' }, 'name'],
  ['under Okafor please', { name: 'Okafor' }, 'name'],
  ['Mrs Whitfield', { name: 'Mrs Whitfield' }, 'name'],
  ['its tom', { name: 'Tom' }, 'name'],
  ['my name is Dave Miller', { name: 'Dave Miller' }],
  ["Hi it's Jo, I want to book a table for 2 tomorrow", { name: 'Jo', party: 2, date: TOMORROW, intent: 'book' }],
  ["this is Hannah Price, I've got a booking tonight I need to cancel", { name: 'Hannah Price', intent: 'cancel' }],
  ['k-o-w-a-l-s-k-i', { name: 'Kowalski' }, 'name'],
  ["it's under o'neill", { name: "O'Neill" }, 'name'],
  ['07700 900123', { phone: '07700 900123' }, 'phone'],
  ['oh seven seven double oh nine double oh one two three', { phone: '07700 900123' }, 'phone'],
  ['my number is 07700900456', { phone: '07700 900456' }],
  ['+44 7700 900789', { phone: '07700 900789' }, 'phone'],
  ['its 0 7 7 0 0 9 0 0 5 5 5', { phone: '07700 900555' }, 'phone'],
  ['020 7946 0321', { phone: '020 7946 0321' }, 'phone'],

  /* ── things people add ── */
  ['one of us has a nut allergy', { notes: ['nut allergy'] }, 'notes'],
  ["it's my mum's 70th birthday", { notes: ['70th birthday'] }, 'notes'],
  ["my dad's in a wheelchair so we'll need step free", { notes: ['wheelchair — step-free route'] }, 'notes'],
  ["we'll need two highchairs", { notes: ['2 highchairs'] }, 'notes'],
  ["no, nothing like that", { nothing: true }, 'notes'],
  ['no allergies thanks', { nothing: true }, 'notes'],
  ["it's our anniversary, could we have a window table", { notes: ['anniversary', 'window table'] }, 'notes'],
  ['my partner is coeliac', { notes: ['gluten-free (coeliac)'] }, 'notes'],
  ["two of the party are vegan and one's vegetarian", { notes: ['vegan', 'vegetarian'] }, 'notes'],
  ["i'm going to propose so somewhere quiet would be good", { notes: ['proposal — be discreet', 'quiet table'] }, 'notes'],
  ['table for 4 tonight at 8, one of them is allergic to shellfish', { party: 4, date: TODAY, time: T(20), notes: ['shellfish allergy'] }],
  ['we have a pram with us', { notes: ['room for a pram'] }, 'notes'],

  /* ── yes and no ── */
  ['yes please', { affirm: true }, 'confirm'],
  ["yeah that's perfect", { affirm: true }, 'confirm'],
  ['sounds good', { affirm: true }, 'confirm'],
  ['lovely, go ahead', { affirm: true }, 'confirm'],
  ['yep', { affirm: true }, 'confirm'],
  ["that's all correct", { affirm: true }, 'confirm'],
  ['no', { deny: true }, 'confirm'],
  ["no that's not right", { deny: true }, 'confirm'],
  ['nope', { deny: true }, 'confirm'],
  ['ok great', { affirm: true }, 'confirm'],
  ["that's fine", { affirm: true }, 'choice'],
  ['the later one', { pick: 1 }, 'choice'],
  ['the first one please', { pick: 0 }, 'choice'],
  ['9:15 is fine', { time: T(21, 15), affirm: false }, 'choice'],
  ['have you got anything earlier', { shift: -1 }, 'choice'],
  ['a bit later maybe', { shift: 1 }, 'choice'],
  ['no, it should be for five people', { deny: true, party: 5 }, 'confirm'],
  ['actually can we make it 8:30 instead', { time: T(20, 30) }, 'confirm'],
  ['sorry, I meant Saturday not Sunday', { date: SAT }, 'confirm'],
  ['no, the name is Harris', { deny: true, name: 'Harris' }, 'confirm'],

  /* ── changing, cancelling, running late ── */
  ['I need to cancel my booking', { intent: 'cancel' }],
  ["hi, we've got a table tonight under Bello but we can't make it anymore", { intent: 'cancel', name: 'Bello', date: TODAY }],
  ['I have to cancel for tomorrow, the name is Wright', { intent: 'cancel', name: 'Wright', date: TOMORROW }],
  ["we won't be able to come on friday", { intent: 'cancel', date: FRI }],
  ["Hi it's Castellanos, we're running about 20 minutes late", { intent: 'late', name: 'Castellanos', late: 20 }],
  ["we're stuck in traffic, we'll be there in about 15 minutes", { intent: 'late', late: 15 }],
  ["I'm going to be a bit late for our booking", { intent: 'late' }],
  ['running half an hour behind sorry, booking under Lindqvist', { intent: 'late', late: 30, name: 'Lindqvist' }],
  ['can I change my booking to 9 instead', { intent: 'change', time: T(21) }],
  ["we've booked for Friday but could we move it to Saturday", { intent: 'change', date: SAT }],
  ['can we add two more people to our booking tonight', { intent: 'change', partyDelta: 2, date: TODAY }],
  ["one of us can't make it, so it'll be 3 now", { intent: 'change', party: 3 }],
  ['is it possible to push our table back half an hour', { intent: 'change', shift: 1 }],
  ["we'd like to bring our booking forward, it's under Ferreira", { intent: 'change', name: 'Ferreira' }],
  ['can you check my booking for Saturday? name is Adams', { intent: 'check', name: 'Adams', date: SAT }],
  ['have I got a reservation for tonight', { intent: 'check', date: TODAY }],
  ["Hi I'd like to confirm my table tonight, it's under Lindqvist", { intent: 'check', name: 'Lindqvist' }],

  /* ── questions ── */
  ['what time do you close?', { topic: 'hours' }],
  ['are you open on mondays', { topic: 'hours' }],
  ['do you do lunch', { topic: 'hours' }],
  ['where are you exactly?', { topic: 'location' }],
  ["what's the address", { topic: 'location' }],
  ['is there anywhere to park nearby', { topic: 'parking' }],
  ['can I bring my dog', { topic: 'dogs' }],
  ['do you have a kids menu', { topic: 'kids' }],
  ['do you do vegan food?', { topic: 'dietary' }],
  ['can you cater for coeliacs', { topic: 'dietary' }],
  ["what's on the menu", { topic: 'menu' }],
  ['how much is it roughly per head', { topic: 'price' }],
  ['can we bring our own wine', { topic: 'byo' }],
  ['is it ok if we bring a birthday cake', { topic: 'cake' }],
  ['do you sell gift vouchers', { topic: 'vouchers' }],
  ['do you have a private room', { topic: 'private' }],
  ['is there a dress code', { topic: 'dress' }],
  ['do you have outdoor seating', { topic: 'outside' }],
  ['do you do takeaway', { topic: 'takeaway' }],
  ['do you need a deposit', { topic: 'deposit' }],
  ['is it wheelchair accessible', { topic: 'access' }],
  ['do you take walk ins', { topic: 'walkin' }],
  ['what are your opening hours on sunday', { topic: 'hours' }],
  ['Do you have a table for two tonight, and is there parking?', { intent: 'book', party: 2, date: TODAY, topic: 'parking' }],

  /* ── people ── */
  ['can I speak to the manager please', { intent: 'human' }],
  ["I'd like to talk to a real person", { intent: 'human' }],
  ['I want to make a complaint about last night', { intent: 'human' }],

  /* ── the edges of a call ── */
  ['hello?', { greet: true }],
  ['sorry, what was that?', { repeat: true }],
  ["no that's everything, thanks, bye", { bye: true }],
  ['brilliant, thanks very much, see you then', { bye: true, thanks: true }],
  ["that's all thanks", { bye: true }],
  ['cheers', { thanks: true }],

  /* ── the awkward ones ── */
  ['Friday the 21st at 8 for two', { party: 2, time: T(20), dateClash: true }],
  ['for 8 at 7', { party: 8, time: T(19) }],
  ['can I book for 8 tonight', { intent: 'book', date: TODAY }],
  ["oh that's a shame, what about sunday", { date: TOMORROW }, 'choice'],
  ["I'm calling to book a table for Tuesday", { intent: 'book', date: TUE, name: undefined }],
  ["I'm running late", { intent: 'late', name: undefined }],
  ['its for 4 people', { party: 4, name: undefined }, 'name'],
  ['this weekend sometime', { vagueDate: 'weekend' }, 'date'],
  ['we sat by the window last time and loved it', { notes: ['window table'] }, 'notes'],
  ['my number is 07700 900 12', { badPhone: true }, 'phone'],
  ['can we do quarter to eight tonight for 2', { party: 2, time: T(19, 45), date: TODAY }],
  ['book me a table for 2 on the 30th of March at half past 6', { party: 2, date: '2026-03-30', time: T(18, 30) }],
  ['do you have a table at 5 tomorrow for 3 people', { party: 3, date: TOMORROW, time: T(17) }],
  ['two people saturday 8pm name of Clarke number 07700 900222', { party: 2, date: SAT, time: T(20), name: 'Clarke', phone: '07700 900222' }],
  ['a table at noon', { time: T(12) }],
];

/* ── held out ──────────────────────────────────────────────────────────────
   Written after the parser was finished, and never used to change it. The
   list above is the one it was built against, so its score says how well it
   learned its homework; this is the one that says how well it copes with
   phrasings nobody tuned it for. If a case here fails, it stays failing and
   the page shows it. */
/* Its score the first time it was run, before anything was fixed. Kept here
   because the live score moves as mistakes get fixed, and a held-out number
   is only honest as the number it was on the day. */
export const HELD_OUT_FIRST_RUN = { right: 75, cases: 82 };

export const HELD_OUT = [
  ['good evening, any chance of a table for three at around 8 tonight', { intent: 'book', party: 3, date: TODAY, time: T(20) }],
  ['hey do u have space for 2 at 9', { intent: 'book', party: 2, time: T(21) }],
  ["I'd love to book a table for my family, there's five of us, next Wednesday", { intent: 'book', party: 5, date: WED }],
  ['can i get a reservation tuesday 7pm 4 people', { intent: 'book', party: 4, date: TUE, time: T(19) }],
  ['yes hi, table for six please on friday the twentieth, seven o clock', { intent: 'book', party: 6, date: FRI, time: T(19) }],
  ["we're hoping to come in tomorrow around half six, there'll be four of us", { intent: 'book', party: 4, date: TOMORROW, time: T(18, 30) }],
  ['could you fit two of us in at quarter past nine tonight', { intent: 'book', party: 2, date: TODAY, time: T(21, 15) }],
  ['hi, looking to book for 3 on thursday evening', { intent: 'book', party: 3, date: THU }],
  ['a table for eleven on the 3rd of april at 7:30pm', { intent: 'book', party: 11, date: '2026-04-03', time: T(19, 30) }],
  ['me my husband and our two kids, sunday at 5', { party: 4, date: TOMORROW, time: T(17) }],
  ['is there a table for one at the bar or anywhere tonight', { intent: 'book', party: 1, date: TODAY }],
  ['can we book in for 7 people on saturday 21st march', { intent: 'book', party: 7, date: SAT }],
  ['hiya, 2 people, tonight, 8:45 if poss', { party: 2, date: TODAY, time: T(20, 45) }],
  ['need a table for 4 asap', { intent: 'book', party: 4, time: T(19, 45) }],
  ['do you have any tables left for tomorrow lunchtime', { intent: 'book', date: TOMORROW }],
  ['book a table for 5 at 6 on the 19th', { intent: 'book', party: 5, time: T(18), date: THU }],
  ["I'd like to book the snug for a party of 10 on friday", { intent: 'book', party: 10, date: FRI }],
  ['just the two of us thursday at eight thirty', { party: 2, date: THU, time: T(20, 30) }],
  ['three', { party: 3 }, 'party'],
  ["there's going to be seven", { party: 7 }, 'party'],
  ['um just two', { party: 2 }, 'party'],
  ['six adults', { party: 6 }, 'party'],
  ['half eight ideally', { time: T(20, 30) }, 'time'],
  ['7 ish', { time: T(19) }, 'time'],
  ['around nine if you have it', { time: T(21) }, 'time'],
  ['eight fifteen', { time: T(20, 15) }, 'time'],
  ['quarter to seven', { time: T(18, 45) }, 'time'],
  ['19:00', { time: T(19) }, 'time'],
  ['6pm', { time: T(18) }, 'time'],
  ['next friday', { date: FRI }, 'date'],
  ['wednesday please', { date: WED }, 'date'],
  ['the 1st of april', { date: '2026-04-01' }, 'date'],
  ['tomorrow evening', { date: TOMORROW }, 'date'],
  ['march 31st', { date: '2026-03-31' }, 'date'],
  ['the twenty second', { date: SUN }, 'date'],
  ['Jenkins', { name: 'Jenkins' }, 'name'],
  ["it's Amara Nwosu", { name: 'Amara Nwosu' }, 'name'],
  ['yeah put it under Ali', { name: 'Ali' }, 'name'],
  ['the surname is Fitzpatrick', { name: 'Fitzpatrick' }, 'name'],
  ['Dr Evans', { name: 'Dr Evans' }, 'name'],
  ['S-M-I-T-H', { name: 'Smith' }, 'name'],
  ['07700 900 314', { phone: '07700 900314' }, 'phone'],
  ['zero seven seven zero zero nine zero zero three one four', { phone: '07700 900314' }, 'phone'],
  ['yeah its 07700-900-271', { phone: '07700 900271' }, 'phone'],
  ['my mobile is oh seven seven oh oh nine oh oh eight eight eight', { phone: '07700 900888' }],
  ["my son's got a peanut allergy", { notes: ['nut allergy'] }, 'notes'],
  ["it's a birthday dinner", { notes: ['birthday'] }, 'notes'],
  ["one of us is gluten free", { notes: ['gluten-free (coeliac)'] }, 'notes'],
  ['we have a baby so a highchair please', { notes: ['highchair'] }, 'notes'],
  ["nope we're all good", { nothing: true }, 'notes'],
  ["no, nothing special", { nothing: true }, 'notes'],
  ["my wife uses a wheelchair", { notes: ['wheelchair — step-free route'] }, 'notes'],
  ["yes that's lovely thank you", { affirm: true }, 'confirm'],
  ['perfect', { affirm: true }, 'confirm'],
  ["yeah go on then", { affirm: true }, 'confirm'],
  ["no sorry, that's wrong", { deny: true }, 'confirm'],
  ['the earlier one', { pick: 0 }, 'choice'],
  ['8 is fine', { time: T(20) }, 'choice'],
  ["hmm, what about later on", { shift: 1 }, 'choice'],
  ["hi i'm afraid we need to cancel tonight's booking, it's under Whitcombe", { intent: 'cancel', name: 'Whitcombe', date: TODAY }],
  ["we can't come tomorrow anymore", { intent: 'cancel', date: TOMORROW }],
  ['please cancel my reservation', { intent: 'cancel' }],
  ["we're about ten minutes behind, sorry", { intent: 'late', late: 10 }],
  ["the train's delayed so we'll be a bit late", { intent: 'late' }],
  ['can I move my booking from 8 to half 8', { intent: 'change', time: T(20, 30) }],
  ['we need to add one more person to the booking', { intent: 'change', partyDelta: 1 }],
  ['is there any way to change our table to 9pm', { intent: 'change', time: T(21) }],
  ['can I check what time my table is tomorrow', { intent: 'check', date: TOMORROW }],
  ['how late are you open tonight', { topic: 'hours' }],
  ['is there a car park', { topic: 'parking' }],
  ['are dogs allowed', { topic: 'dogs' }],
  ['do you have vegetarian options', { topic: 'dietary' }],
  ['whereabouts are you', { topic: 'location' }],
  ["what's the price range like", { topic: 'price' }],
  ['are children allowed', { topic: 'kids' }],
  ['do you have anywhere to sit outside', { topic: 'outside' }],
  ['do you do deliveries', { topic: 'takeaway' }],
  ["can I talk to someone about a private party", { intent: 'human' }],
  ['get me the manager', { intent: 'human' }],
  ['pardon?', { repeat: true }],
  ['ok bye', { bye: true }],
  ["that's everything thank you", { bye: true }],
];

/** Does a reading match what a case expects? Returns the fields it got wrong. */
export function mismatches(reading, expect) {
  const wrong = [];
  const s = reading.slots;
  const hhmm = (m) => (m == null ? undefined : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  for (const [k, v] of Object.entries(expect)) {
    let got;
    switch (k) {
      case 'intent': got = reading.intent; break;
      case 'topic': got = reading.topic; break;
      case 'party': got = s.party; break;
      case 'partyDelta': got = s.partyDelta; break;
      case 'date': got = s.date; break;
      case 'time': got = hhmm(s.time); break;
      case 'name': got = s.name; break;
      case 'phone': got = s.phone; break;
      case 'late': got = s.late; break;
      case 'shift': got = s.shift?.dir; break;
      case 'notes': got = (s.notes || []).map((n) => n.text); break;
      case 'affirm': case 'deny': case 'nothing': case 'bye': case 'thanks': case 'repeat': case 'greet':
        got = reading[k]; break;
      case 'pick': got = reading.pick; break;
      case 'dateClash': got = !!reading.flags.dateClash; break;
      case 'vagueDate': got = reading.flags.vagueDate; break;
      case 'badPhone': got = !!reading.flags.badPhone; break;
      default: got = undefined;
    }
    const same = Array.isArray(v) ? JSON.stringify(got) === JSON.stringify(v) : got === v;
    if (!same) wrong.push({ field: k, expected: v, got });
  }
  return wrong;
}

/** Run the whole set through a reader and score it. */
export function score(read, cases = CASES) {
  const rows = cases.map(([text, expect, expecting]) => {
    const r = read(text, { expecting: expecting ?? null, today: '2026-03-14', now: 19 * 60 + 42 });
    const wrong = mismatches(r, expect);
    return { text, expecting: expecting ?? null, expect, wrong, ok: !wrong.length };
  });
  const fields = rows.reduce((n, r) => n + Object.keys(r.expect).length, 0);
  const fieldsRight = rows.reduce((n, r) => n + Object.keys(r.expect).length - r.wrong.length, 0);
  return { rows, cases: rows.length, right: rows.filter((r) => r.ok).length, fields, fieldsRight };
}
