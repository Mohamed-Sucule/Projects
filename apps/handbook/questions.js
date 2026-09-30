/* ───────────────────────────────────────────────────────────────────────────
   handbook/questions.js — what staff actually ask, and what counts as right.

   A right answer is the right fact from the right section. Near enough is
   wrong: "25 days" cited to the sick-pay policy is a wrong answer that
   happens to contain the right number, and it would teach somebody to trust
   a citation they should not.

   A right refusal is "the handbook doesn't say" for a question the handbook
   really does not answer. The unanswerable questions are chosen to be
   tempting: most of them share words with a section that is about something
   else — "can I bring my dog to the office?" shares "office" with the hybrid
   working policy — which is exactly how a retrieval system talks itself into
   answering.

   Like Front Desk, two sets. The first was used to build and tune the
   search. The second was written afterwards and run once before anything
   was changed; its first-run score is kept below.
   ─────────────────────────────────────────────────────────────────────────── */

/* [question, section id | null for "not in the handbook", pattern the answer must contain] */
export const TUNING = [
  ['How many days holiday do I get?', 'leave/allowance', /25 days/],
  ['what is the annual leave allowance', 'leave/allowance', /25 days/],
  ['How much holiday do part-time staff get?', 'leave/allowance', /pro rata/],
  ['Does my holiday go up the longer I stay?', 'leave/allowance', /27 days|five years/],
  ['When does the leave year start?', 'leave/allowance', /1 January/],
  ['How do I book time off?', 'leave/booking', /Pathway/],
  ['How much notice do I need to give for a week off?', 'leave/booking', /twice as much notice|two weeks/],
  ['Can I carry over unused holiday?', 'leave/carry', /5 unused days/],
  ['When do carried over days expire?', 'leave/carry', /31 March/],
  ['Can I buy extra holiday?', 'leave/buy', /buy up to 5 extra days/],
  ['can i sell my leave back', 'leave/buy', /not possible/],
  ['Do we close at Christmas?', 'leave/closure', /closes between Christmas and New Year/],
  ['Can finance people take leave at quarter end?', 'leave/blackout', /last five working days/],
  ['What do I do if I am sick?', 'sickness/report', /before 10am/],
  ['By what time do I need to call in sick?', 'sickness/report', /10am/],
  ['When do I need a doctor\'s note?', 'sickness/certify', /eighth day|seven calendar days/],
  ['How much sick pay do I get?', 'sickness/pay', /full pay for up to 20 working days/],
  ['Do I get sick pay during probation?', 'sickness/pay', /statutory sick pay only/],
  ['Can I have a phased return after being off sick?', 'sickness/return', /phased return/],
  ['My child is ill, can I take time off?', 'sickness/dependants', /5 days of paid emergency leave/],
  ['How long is maternity leave?', 'parental/birth', /52 weeks/],
  ['how much maternity pay is there', 'parental/birth', /26 weeks at full pay/],
  ['How much paternity leave do I get?', 'parental/partner', /6 weeks/],
  ['Is there shared parental leave?', 'parental/shared', /Shared parental leave is available/],
  ['What are keeping in touch days?', 'parental/keep', /10 keeping-in-touch days/],
  ['What about adoption leave?', 'parental/adoption', /same leave and pay as a birth parent/],
  ['How do I claim expenses?', 'expenses/claiming', /within 60 days/],
  ['When will my expenses be paid?', 'expenses/claiming', /20th of the month/],
  ['How much can I spend on food when travelling?', 'expenses/meals', /£30 a day/],
  ['What is the meal allowance in London?', 'expenses/meals', /£45/],
  ['Can I claim for alcohol?', 'expenses/meals', /Alcohol is not reimbursed/],
  ['What is the mileage rate?', 'expenses/mileage', /45p a mile/],
  ['Can I claim my commute?', 'expenses/mileage', /commute to your usual office is not claimable/],
  ['Can I expense a new monitor that costs £300?', 'expenses/equipment', /more than £250/],
  ['How do I get a company credit card?', 'expenses/card', /ask Finance for a company card/],
  ['How do I book a train?', 'travel/booking', /Tripwell/],
  ['Can I travel first class?', 'travel/trains', /two and a half hours/],
  ['Can I fly business class?', 'travel/flights', /director's approval/],
  ['What is the hotel limit in London?', 'travel/hotels', /£180/],
  ['How much can I spend on a hotel in Manchester?', 'travel/hotels', /£130/],
  ['Am I insured if I add a holiday onto a work trip?', 'travel/insurance', /two days of personal travel/],
  ['Which days do I need to be in the office?', 'hybrid/pattern', /Tuesdays and Thursdays/],
  ['Can I work from abroad?', 'hybrid/abroad', /20 working days/],
  ['Is there a budget for a home office?', 'hybrid/setup', /£400/],
  ['What are core hours?', 'hybrid/hours', /10am to 4pm/],
  ['Where is the Leeds office?', 'hybrid/offices', /Tanner's Yard/],
  ['What do I do if my laptop is stolen?', 'security/lost', /within one hour/],
  ['I clicked a dodgy link, what now?', 'security/phishing', /tell IT straight away/],
  ['Can I use a USB stick?', 'security/usb', /cannot be used/],
  ['How often do laptops get replaced?', 'security/laptop', /every four years/],
  ['Can I check work email on my own phone?', 'security/usb', /Outlook app/],
  ['When is payday?', 'benefits/pay', /last working day/],
  ['When are pay rises?', 'benefits/reviews', /1 April/],
  ['How much does the company put into my pension?', 'benefits/pension', /6%/],
  ['Do we have private health insurance?', 'benefits/health', /Private medical insurance/],
  ['What is the training budget?', 'benefits/learning', /£1,000/],
  ['Is there a cycle to work scheme?', 'benefits/cycle', /£2,500/],
  ['Will the company pay for glasses?', 'benefits/eyes', /£75/],
  ['What is the referral bonus?', 'benefits/referral', /£2,000/],
  ['Can I accept a gift from a client?', 'conduct/gifts', /up to £50/],
  ['Am I allowed a second job?', 'conduct/interests', /Second jobs are allowed/],
  ['Can I post about my project on LinkedIn?', 'conduct/social', /do not post about clients or projects/],
  ['What time do I start on my first day?', 'onboarding/first', /9:30am/],
  ['How long is probation?', 'onboarding/probation', /six months/],
  ['What is my notice period?', 'onboarding/notice', /one month/],

  /* not in the handbook */
  ['Can I bring my dog to the office?', null],
  ['What is the dress code?', null],
  ['Is there free parking at the Leeds office?', null],
  ['Do we get a Christmas bonus?', null],
  ['How do I book a meeting room?', null],
  ['What is the wifi password?', null],
  ['Can I get a standing desk in the office?', null],
  ['Do we get our birthday off?', null],
  ['Is there a gym discount?', null],
  ['How many sick days can I take before a warning?', null],
  ['Can I work a four-day week?', null],
  ['What is the company\'s revenue?', null],
  ['Who is the CEO?', null],
  ['Can I expense a taxi home after working late?', null],
  ['Is there a canteen in the London office?', null],
];

export const HELD_OUT = [
  ['how many days annual leave do we get', 'leave/allowance', /25 days/],
  ['What happens to leftover holiday at the end of the year?', 'leave/carry', /5 unused days/],
  ['What\'s the leave allowance after 10 years?', 'leave/allowance', /30/],
  ['Is there a limit on how long a holiday I can take?', 'leave/booking', /two consecutive weeks/],
  ['Do I need a fit note for 3 days off sick?', 'sickness/certify', /self-certify/],
  ['What is the sick pay policy after 20 days?', 'sickness/pay', /half pay/],
  ['how long does partner leave last', 'parental/partner', /6 weeks/],
  ['Can I take unpaid maternity leave?', 'parental/birth', /unpaid/],
  ['What is the deadline for submitting expense claims?', 'expenses/claiming', /60 days/],
  ['Do I need receipts?', 'expenses/claiming', /receipt/],
  ['How much per mile for driving?', 'expenses/mileage', /45p/],
  ['Can I claim parking?', 'expenses/mileage', /Parking and tolls/],
  ['What is the per diem for meals outside London?', 'expenses/meals', /£30/],
  ['Can I sign up for a free software tool?', 'expenses/equipment', /approval from IT/],
  ['What is the maximum I can spend on a hotel outside London?', 'travel/hotels', /£130/],
  ['Can I book my own hotel?', 'travel/booking', /Tripwell/],
  ['When can I fly premium economy?', 'travel/flights', /six hours/],
  ['How many days a week do I have to come in?', 'hybrid/pattern', /two days a week/],
  ['can i work remotely from spain for a month', 'hybrid/abroad', /20 working days/],
  ['What hours do I need to be online?', 'hybrid/hours', /10am to 4pm/],
  ['Where is the London office?', 'hybrid/offices', /Clerkenwell/],
  ['My phone was stolen', 'security/lost', /within one hour/],
  ['What should I do with a phishing email?', 'security/phishing', /Report button/],
  ['Can IT ask me for my password?', 'security/passwords', /nobody from IT will ever ask/],
  ['Do I have to use two-factor authentication?', 'security/passwords', /multi-factor authentication/],
  ['What is the pension contribution?', 'benefits/pension', /6%/],
  ['Does the learning budget roll over?', 'benefits/learning', /does not roll over/],
  ['Is there an employee assistance programme?', 'benefits/health', /employee assistance line/],
  ['When do promotions happen?', 'benefits/reviews', /March and September/],
  ['What is the gift limit?', 'conduct/gifts', /£50/],
  ['How do I report something unsafe?', 'conduct/speak', /Speak Up/],
  ['Do I get a mentor when I join?', 'onboarding/buddy', /buddy/],
  ['What is the notice period during probation?', 'onboarding/probation', /one week/],

  ['Can I bring my kids to the office?', null],
  ['What is the policy on smoking?', null],
  ['Do we get free lunch?', null],
  ['How do I change my bank details?', null],
  ['Can I get a company car?', null],
  ['What is the bereavement leave policy?', null],
  ['Is there jury service pay?', null],
  ['Can I take my laptop on holiday abroad?', null],
];

/* Its score the first time it was run, before anything was changed because
   of it. Filled in once, from that run, and never edited.

   It was a bad day: 25 of 41, against 77 of 80 on the tuning set. The search
   had learned its homework — the synonym table and the thresholds fitted the
   first eighty questions — and on new phrasings it was far too quick to say
   "the handbook doesn't say": eleven of the sixteen misses were refusals of
   questions the handbook does answer. "Deadline", "maximum", "leftover" and
   "join" were treated as topics it had never heard of, rather than as the
   ordinary words of a question. What changed as a result is in the README,
   and ROUND_TWO below was written after those changes to measure them. */
export const HELD_OUT_FIRST_RUN = { right: 25, total: 41 };

/* ── round two ─────────────────────────────────────────────────────────────
   Written after the fixes the first held-out run led to, to measure whether
   they generalise or merely fixed those forty-one questions. Run once; the
   score it got is below, and it is the number the page leads with. */
export const ROUND_TWO = [
  ['How many bank holidays do we get?', 'leave/allowance', /eight UK bank holidays/],
  ['I work 3 days a week, how much leave do I get?', 'leave/allowance', /15 days/],
  ['Where do I request annual leave?', 'leave/booking', /Pathway/],
  ['Do I lose my holiday if I do not use it?', 'leave/carry', /lost|31 March/],
  ['Is the office open between Christmas and New Year?', 'leave/closure', /closes between Christmas and New Year/],
  ['Who do I tell if I am ill?', 'sickness/report', /manager/],
  ['Can I self certify sickness?', 'sickness/certify', /self-certify/],
  ['What happens to my pay if I am off sick for a long time?', 'sickness/pay', /half pay|statutory sick pay/],
  ['Is there leave for emergencies with my kids?', 'sickness/dependants', /emergency leave/],
  ['How many weeks of maternity leave are paid in full?', 'parental/birth', /26 weeks/],
  ['Can dads take paid leave when the baby arrives?', 'parental/partner', /6 weeks of leave at full pay/],
  ['Can I work during maternity leave?', 'parental/keep', /keeping-in-touch days/],
  ['What\'s the time limit on expense claims?', 'expenses/claiming', /60 days/],
  ['How much is the daily food allowance?', 'expenses/meals', /£30 a day/],
  ['Can I get reimbursed for wine at a client dinner?', 'expenses/meals', /director has approved/],
  ['What rate do I get after 10,000 miles?', 'expenses/mileage', /25p/],
  ['I need a new laptop bag for £80, can I claim it?', null],
  ['Who needs to approve a software subscription?', 'expenses/equipment', /approval from IT/],
  ['Can I book travel myself on a booking website?', 'travel/booking', /Tripwell/],
  ['Is breakfast included in the hotel budget?', 'travel/hotels', /including breakfast/],
  ['Can I get first class on a four hour train?', 'travel/trains', /two and a half hours/],
  ['What class do I fly on a long haul flight?', 'travel/flights', /premium economy/],
  ['Do I have to come into the office on Fridays?', 'hybrid/pattern', /Tuesdays and Thursdays/],
  ['How long can I work outside the UK?', 'hybrid/abroad', /20 working days/],
  ['What can I spend the home office allowance on?', 'hybrid/setup', /desk, chair, monitor/],
  ['What time does the office open?', 'hybrid/offices', /7am/],
  ['Someone stole my work phone, who do I contact?', 'security/lost', /it-help@haldenpike.example|IT line/],
  ['Should I forward a phishing email to IT?', 'security/phishing', /Report button/],
  ['Can I install my own apps on my laptop?', 'security/laptop', /company catalogue/],
  ['How much is the employer pension contribution?', 'benefits/pension', /6%/],
  ['Can I add my family to the health insurance?', 'benefits/health', /partner and children/],
  ['How many study days do I get?', 'benefits/learning', /five days of study leave/],
  ['How much is the bonus for referring someone?', 'benefits/referral', /£2,000/],
  ['Can a supplier take me to a football match?', 'conduct/gifts', /£50/],
  ['Do I need permission to do freelance work?', 'conduct/interests', /told your manager/],
  ['How often will my manager check in during probation?', 'onboarding/probation', /one, three and five months/],

  ['Is there a pay rise in October?', null],
  ['Can I claim for a gym membership?', null],
  ['Do we have a pet insurance benefit?', null],
  ['How do I book a desk in the office?', null],
  ['Is there a four-day week trial?', null],
  ['What is the policy on flexible bank holidays for religious festivals?', null],
  ['Can I use my learning budget on a language app?', null],
];

/* Also run once, also kept as it was: 21 of 43. Worse than round one, which
   is the most useful number in this file. It says the fixes after round one
   were real fixes for those forty-one questions and not much more, and that
   word matching on its own does not get past about half of questions phrased
   in words the handbook never uses — "daily" for "a day", "wine" for
   "alcohol", "employer" for "the company". That is the case for the small
   language model the page can switch on, and it is why the page can re-run
   this whole report with the model on, on the visitor's own device, rather
   than asking anyone to take the improvement on trust. */
export const ROUND_TWO_FIRST_RUN = { right: 21, total: 43 };

/** Is an answer right? Returns a verdict and a reason. */
export function judge(answer, [, section, pattern]) {
  if (section === null) {
    return answer.refused ? { ok: true, kind: 'refused' } : { ok: false, kind: 'answered-unanswerable', why: `answered from ${answer.section?.id}` };
  }
  if (answer.refused) return { ok: false, kind: 'wrongly-refused', why: 'said it did not know' };
  if (answer.section?.id !== section) return { ok: false, kind: 'wrong-source', why: `cited ${answer.section?.id}, wanted ${section}` };
  if (!pattern.test(answer.text)) return { ok: false, kind: 'wrong-answer', why: 'right section, answer does not contain the fact' };
  return { ok: true, kind: 'answered' };
}

/** Run a set through an asker and tally it the way the page reports it. */
export function report(ask, set = TUNING) {
  const rows = set.map((q) => {
    const a = ask(q[0]);
    return { q: q[0], expect: q[1], answer: a, verdict: judge(a, q) };
  });
  const count = (k) => rows.filter((r) => r.verdict.kind === k).length;
  const answerable = rows.filter((r) => r.expect !== null);
  const unanswerable = rows.filter((r) => r.expect === null);
  return {
    rows,
    total: rows.length,
    right: rows.filter((r) => r.verdict.ok).length,
    answerable: answerable.length,
    answeredRight: count('answered'),
    unanswerable: unanswerable.length,
    refusedRight: count('refused'),
    madeUp: count('answered-unanswerable'),
    wrongSource: count('wrong-source'),
    wrongAnswer: count('wrong-answer'),
    wronglyRefused: count('wrongly-refused'),
  };
}
