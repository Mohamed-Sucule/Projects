/* ───────────────────────────────────────────────────────────────────────────
   handbook/corpus.js — the staff handbook of a company that does not exist.

   Halden & Pike is invented: a hundred-and-forty-person engineering
   consultancy with offices in Leeds and London. Its handbook is written the
   way real ones are — by several people over several years, in slightly
   different voices, with numbers buried in the middle of paragraphs, a policy
   that was replaced but never deleted, and plenty of perfectly reasonable
   questions it does not answer at all. That last part matters most. An
   assistant tested only on questions its documents can answer has not been
   tested on the thing that gets it switched off: confidently answering the
   ones they can't.

   Every email address is on the reserved .example domain.
   ─────────────────────────────────────────────────────────────────────────── */

export const COMPANY = { name: 'Halden & Pike', people: 'people@haldenpike.example', it: 'it-help@haldenpike.example' };

const doc = (id, title, meta, sections) => ({ id, title, ...meta, sections: sections.map(([sid, heading, text]) => ({ id: `${id}/${sid}`, heading, text: text.replace(/\s+/g, ' ').trim() })) });

export const DOCS = [
  doc('leave', 'Annual leave and holidays', { owner: 'People team', updated: '2026-01-05' }, [
    ['allowance', 'Your allowance', `
      Everyone gets 25 days of annual leave a year, plus the eight UK bank holidays. Part-time colleagues get the
      same allowance pro rata: someone working three days a week gets 15 days plus a pro-rata share of bank
      holidays. After five years at Halden & Pike your allowance goes up to 27 days, and after ten years to 30.
      The leave year runs from 1 January to 31 December.`],
    ['booking', 'Booking time off', `
      Book leave in Pathway, our HR system, and your manager will approve it there. Give at least twice as much
      notice as the length of the leave: two weeks' notice for a week off, for example. For anything longer than
      two consecutive weeks, talk to your manager before you book travel. Leave is approved on a
      first-come, first-served basis when too many people in one team ask for the same dates.`],
    ['carry', 'Carrying leave over', `
      You can carry over up to 5 unused days into the next leave year. Carried-over days must be used by
      31 March, after which they are lost. If you could not take your leave because of sickness or parental
      leave, the 5-day limit does not apply — speak to the People team.`],
    ['buy', 'Buying and selling leave', `
      Once a year, in November, you can buy up to 5 extra days of leave through salary sacrifice. The cost is
      spread over the following twelve months of pay. Selling unused leave back to the company is not possible,
      except for untaken days when you leave the company, which are paid in your final salary.`],
    ['closure', 'The Christmas closure', `
      The whole company closes between Christmas and New Year. The three working days between the bank holidays
      come out of your annual allowance, so plan for them. If a client project needs cover during the closure,
      the people covering get the days back to take in January.`],
    ['blackout', 'Busy periods', `
      Finance cannot take leave in the last five working days of a quarter or during the annual audit in the
      first two weeks of April, except in an emergency. Project teams agree their own busy periods with their
      project lead.`],
  ]),

  doc('sickness', 'Sickness absence', { owner: 'People team', updated: '2025-09-12' }, [
    ['report', 'Reporting sickness', `
      If you are too ill to work, tell your manager by phone or message before 10am on your first day off, and
      record the absence in Pathway. A message in the team channel is not enough on its own. Keep your manager
      updated if you are off for more than three days.`],
    ['certify', 'Fit notes', `
      For absences of up to seven calendar days you can self-certify in Pathway. From the eighth day you need a
      fit note from your GP or a hospital doctor, and you should send a copy to the People team.`],
    ['pay', 'Sick pay', `
      Company sick pay is full pay for up to 20 working days in any rolling twelve months, then half pay for the
      next 20 working days. After that, statutory sick pay applies. Company sick pay starts once you have
      passed probation; before that you get statutory sick pay only.`],
    ['return', 'Coming back to work', `
      After an absence of more than two weeks, your manager will arrange a short return-to-work conversation,
      and can agree a phased return with lighter hours for up to four weeks on full pay. Occupational health
      referrals are arranged by the People team and are confidential.`],
    ['dependants', 'When someone else is ill', `
      You can take up to 5 days of paid emergency leave a year to look after a dependant who is ill or when
      childcare falls through. Record it in Pathway as dependant leave, not as sickness.`],
  ]),

  doc('parental', 'Parental leave', { owner: 'People team', updated: '2025-04-01' }, [
    ['birth', 'Maternity and birth-parent leave', `
      Birth parents can take up to 52 weeks of leave. Halden & Pike pays 26 weeks at full pay, followed by 13
      weeks of statutory pay, and the final 13 weeks are unpaid. To qualify for the enhanced pay you need to
      have worked here for 26 weeks by the 15th week before the baby is due.`],
    ['partner', 'Partner leave', `
      Partners, including adoptive and same-sex partners, get 6 weeks of leave at full pay, to be taken in the
      first year after the birth or placement. It can be taken in blocks of at least one week.`],
    ['adoption', 'Adoption', `
      The primary adopter gets the same leave and pay as a birth parent, from the date the child is placed.
      You can also take paid time off for up to five adoption appointments before the placement.`],
    ['shared', 'Shared parental leave', `
      Shared parental leave is available and is paid at full pay for the same number of weeks as maternity pay
      would have been, split between the parents however they choose. Tell the People team at least eight weeks
      before each block you want to take.`],
    ['keep', 'Keeping-in-touch days', `
      While on leave you can work up to 10 keeping-in-touch days without it ending your leave. They are paid at
      your normal day rate and are entirely optional.`],
  ]),

  doc('expenses', 'Expenses', { owner: 'Finance', updated: '2025-11-20' }, [
    ['claiming', 'How to claim', `
      Claim expenses in Pathway within 60 days of spending the money, with a photo of every receipt. Claims
      submitted by the 20th of the month are paid with that month's salary. Claims older than 60 days need
      your director's sign-off and may be refused.`],
    ['meals', 'Meals', `
      When you are travelling for work you can claim up to £30 a day for meals, or £45 a day in London. Alcohol
      is not reimbursed, except at a client dinner that a director has approved in advance.`],
    ['mileage', 'Driving', `
      Using your own car for work is paid at 45p a mile for the first 10,000 miles in a tax year and 25p a mile
      after that. Your commute to your usual office is not claimable. Parking and tolls on work journeys can be
      claimed with receipts.`],
    ['equipment', 'Equipment and software', `
      Anything costing more than £250 must be ordered through the IT team rather than bought and claimed.
      Software subscriptions need approval from IT before you sign up, even if they are free, because of data
      protection.`],
    ['card', 'Company cards', `
      Project leads and directors can ask Finance for a company card. Card spending is reconciled in Pathway by
      the 5th of the following month, with receipts, exactly like an expense claim.`],
  ]),

  doc('travel', 'Travel policy (2025)', { owner: 'Finance', updated: '2025-01-01', supersedes: 'travel-2023' }, [
    ['booking', 'Booking travel', `
      Book all trains, flights and hotels through Tripwell, our travel booking tool, at least seven days ahead
      where you can. If you book outside Tripwell you will not be covered by our travel insurance.`],
    ['trains', 'Trains', `
      Travel standard class. First class is allowed when the journey is longer than two and a half hours or
      when you need to work on the train and standard class is full.`],
    ['flights', 'Flights', `
      Fly economy for flights under six hours and premium economy for anything longer. Business class needs a
      director's approval and is only for flights over ten hours.`],
    ['hotels', 'Hotels', `
      Hotels can cost up to £180 a night in London and £130 a night elsewhere in the UK, including breakfast.
      For international trips Tripwell shows the limit for each city.`],
    ['insurance', 'Travel insurance', `
      Everyone travelling for work is covered by the company travel insurance, including up to two days of
      personal travel added to a work trip. The policy number and emergency line are in Tripwell.`],
  ]),

  doc('travel-2023', 'Travel policy (2023) — replaced', { owner: 'Finance', updated: '2023-02-01', supersededBy: 'travel' }, [
    ['hotels', 'Hotels', `
      Hotels can cost up to £150 a night in London and £110 a night elsewhere in the UK. Breakfast can be
      claimed separately as a meal.`],
    ['trains', 'Trains', `
      Travel standard class. First class is only allowed with a director's approval.`],
  ]),

  doc('hybrid', 'Hybrid and remote working', { owner: 'People team', updated: '2025-06-30' }, [
    ['pattern', 'How we work', `
      We work in the office at least two days a week, and every team is in on Tuesdays and Thursdays so that
      those days are worth coming in for. Which other days you work from home is up to you and your team.`],
    ['abroad', 'Working from abroad', `
      You can work from another country for up to 20 working days a year, with your manager's approval and a
      check by the People team for tax and immigration rules. Some countries are not allowed for data
      protection reasons; the People team has the current list.`],
    ['setup', 'Setting up at home', `
      Everyone gets a one-off home office allowance of £400 for a desk, chair, monitor or anything else that
      makes working at home comfortable. Claim it in Pathway within your first six months.`],
    ['hours', 'Core hours', `
      Core hours are 10am to 4pm, when you should be available for meetings. Outside core hours you can
      organise your day as suits you and your team.`],
    ['offices', 'The offices', `
      The Leeds office is at Tanner's Yard and the London office is in Clerkenwell. Both are open from 7am to
      8pm on weekdays; out of hours access needs a request to facilities.`],
  ]),

  doc('security', 'IT and security', { owner: 'IT', updated: '2026-02-10' }, [
    ['lost', 'Lost or stolen devices', `
      If your laptop or phone is lost or stolen, report it to ${'it-help@haldenpike.example'} or call the IT
      line within one hour, even outside working hours. IT will lock and wipe the device remotely. Report thefts
      to the police as well and send IT the crime reference number.`],
    ['passwords', 'Passwords and sign-in', `
      Use the company password manager for every work password, and keep multi-factor authentication switched
      on for every account that offers it. Never share a password, including with IT: nobody from IT will ever
      ask you for one.`],
    ['phishing', 'Suspicious emails', `
      If an email looks suspicious, use the Report button in Outlook rather than forwarding it. If you clicked a
      link or entered a password, tell IT straight away; you will not be in trouble for reporting it.`],
    ['usb', 'USB drives and personal devices', `
      Personal USB drives cannot be used with company laptops. To share large files with a client, use the
      secure transfer link in the intranet. Personal phones can be used for work email only through the
      Outlook app with the company profile installed.`],
    ['laptop', 'Your laptop', `
      New starters get a laptop on their first day. Laptops are replaced every four years, or sooner if one is
      faulty. Do not install software that is not in the company catalogue without asking IT.`],
  ]),

  doc('benefits', 'Pay and benefits', { owner: 'People team', updated: '2026-01-15' }, [
    ['pay', 'Pay day', `
      Salaries are paid on the last working day of each month. Payslips are in Pathway.`],
    ['reviews', 'Pay reviews', `
      Pay is reviewed once a year in March, and any rise takes effect from 1 April. Promotions can happen at
      either of the two performance reviews, in March and September.`],
    ['pension', 'Pension', `
      You are enrolled in the company pension from your first day. Halden & Pike contributes 6% of your salary
      when you contribute at least 4%, and you can pay in more through salary sacrifice.`],
    ['health', 'Health cover', `
      Private medical insurance covers you from the end of probation, and you can add your partner and children
      at a discounted rate. Everyone can use the employee assistance line, free and confidential, 24 hours a day.`],
    ['learning', 'Learning budget', `
      Everyone has a learning budget of £1,000 a year for courses, books, conferences and certifications, plus
      five days of study leave. Unused budget does not roll over.`],
    ['cycle', 'Cycle to work', `
      You can get a bike and equipment up to £2,500 through the cycle-to-work scheme, paid back through salary
      sacrifice over twelve months.`],
    ['eyes', 'Eye tests', `
      If you use a screen at work, the company pays for an eye test every two years, and up to £75 towards
      glasses if you need them for screen work.`],
    ['referral', 'Referring a friend', `
      If someone you refer is hired and passes probation, you get a referral bonus of £2,000.`],
  ]),

  doc('conduct', 'Code of conduct', { owner: 'Legal', updated: '2024-10-01' }, [
    ['gifts', 'Gifts and hospitality', `
      You can accept gifts or hospitality worth up to £50 from a client or supplier without asking. Anything
      worth more must be recorded in the gifts register and approved by your director. Never accept cash or
      anything offered while a tender is open.`],
    ['interests', 'Conflicts of interest', `
      Tell your director about any outside work, investment or relationship that could conflict with your work
      here. Second jobs are allowed as long as they do not compete with us or affect your work, and you have
      told your manager.`],
    ['speak', 'Speaking up', `
      If you see something that is illegal, unsafe or against this code, raise it with your manager, a director
      or the confidential Speak Up line. Nobody will be treated badly for raising a concern in good faith.`],
    ['social', 'Social media', `
      You can say you work at Halden & Pike, but do not post about clients or projects unless they are already
      public and marketing has agreed. Personal views should be clearly your own.`],
  ]),

  doc('onboarding', 'Your first weeks', { owner: 'People team', updated: '2025-08-01' }, [
    ['first', 'Your first day', `
      Your first day starts at 9:30am at your home office, where your manager will meet you. You will get your
      laptop, a building pass and your Pathway login, and have lunch with your team.`],
    ['probation', 'Probation', `
      Probation lasts six months. Your manager will check in with you at one, three and five months, and confirm
      the end of probation in writing. During probation the notice period is one week on either side.`],
    ['notice', 'Notice periods', `
      After probation, the notice period is one month for most roles and three months for directors and
      principal engineers, as set out in your contract.`],
    ['buddy', 'Your buddy', `
      Every new starter is given a buddy from another team for their first three months: someone to ask the
      questions you would rather not ask your manager.`],
  ]),
];

/** Every section, flattened, with its document attached. */
export const SECTIONS = DOCS.flatMap((d) => d.sections.map((s) => ({ ...s, doc: d })));
