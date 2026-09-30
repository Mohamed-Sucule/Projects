# Ask the Handbook — answers from company documents, with sources

**[Open it](index.html)** · A knowledge assistant for staff questions: holidays, expenses, sick
pay, a stolen laptop. Every answer is a sentence from the company's own documents, shown with the
policy and section it came from and highlighted in place. When the documents don't answer the
question, it says so, gives the reason and points to the nearest thing it does cover. Paste in
your own documents and it answers from those too.

The company, Halden & Pike, is fictional. Its handbook ([`corpus.js`](corpus.js)) is written the
way real ones are: several authors, numbers buried in paragraphs, a travel policy that was
replaced but never deleted, and plenty of reasonable questions it doesn't answer at all.

## The one rule

**An answer is a sentence from the documents, with its source.** Nothing here writes new prose
about a policy, so nothing here can state a policy that doesn't exist. What's left to go wrong
is picking the wrong sentence, and that can be measured.

## How it works — [`search.js`](search.js)

1. **Words to roots.** Porter's stemming algorithm (1980), written out in full and tested against
   its published examples. Different words for the same thing then meet in a concept: holiday,
   vacation, PTO and annual leave are one idea. So are stolen, lost and theft, and "sick pay"
   is about pay, not about being sick.
2. **Every sentence ranked with BM25**, the scoring function behind most search engines. It also
   gets credit for its section and heading, and for being the kind of answer asked for: "how much"
   wants an amount, "when" a date, "can I" a sentence about what you can or can't do. A word and
   its concept count once, so words that happen to have synonyms don't outweigh words that don't.
3. **Checking the question is really about that.** It refuses if the question's key word never
   appears in the documents ("dog", "gym", "wifi"), if the most specific thing asked about is
   missing from the best section ("Christmas bonus" isn't answered by the Christmas closure),
   or if too little of the question is covered.
4. **Old policies.** A replaced policy is never the answer. If it said something different, the
   answer says so ("The 2023 policy said £150 a night"), because people remember the old number.

## Measured honestly — [`questions.js`](questions.js)

Three sets of questions. About a fifth of them are deliberately unanswerable, and most of those
share words with a section about something else, which is exactly how a search system talks
itself into answering.

| Set | Written | First run | Today |
|---|---|---|---|
| Tuning (80) | first, used to build it | — | 76 |
| Round one (41) | after it was built | **25** | 34 |
| Round two (43) | after the round-one fixes | **21** | 32 |

The first-run numbers are recorded in the file and never edited.

- **Round one** showed it had overfitted: it was far too quick to say "I don't know". It treated
  ordinary question words like "deadline", "maximum" and "join" as unknown topics. Those fixes
  are in the code with comments saying which question caused them.
- **Round two** was written to check whether those fixes generalised. Mostly they didn't. It
  scored lower than round one on its first run. That's the most useful number in the file: word
  matching alone copes badly with phrasings the handbook never uses ("daily" for "a day", "wine"
  for "alcohol", "Fridays" for "Tuesdays and Thursdays").

That result is why the page has a **"Run with the model"** button. It loads a small
sentence-embedding model (MiniLM, 23 MB) in your browser, embeds every sentence of the handbook,
and re-runs all three sets with semantic similarity added to the ranking. The before and after
numbers are then computed on your own device, so there's nothing to take on trust.

The number that matters most is on the page too: **answers made up**. That means questions the
handbook can't answer that it answered anyway, across all 164 questions.

## Your own documents

Paste text or pick a `.txt` or `.md` file. Markdown `#` headings, or short lines standing on their
own, become sections, and the whole index is rebuilt in a few milliseconds. Nothing leaves the
tab. Every question it can't answer goes on a **gaps** list. For the people who write the
policies, that list is the most useful output of the whole system.

## Checked

`tests/handbook.test.mjs`:

- The stemmer matches Porter's published examples.
- Every answer quoted is really in the section it cites, and can be highlighted there.
- A replaced policy is never cited as the answer. When it differs, the answer says so.
- The tuning set scores at least 76 and makes up at most one answer. The held-out sets never
  score below their first runs, and no question appears in two sets.
- Short answers ("£180 a night") are read off the quoted sentence, never made up.
- A pasted document's headings become sections, and questions find them.
- A full stop inside an email address doesn't end the sentence. It used to, and the first half
  of the lost-laptop rule, email address included, went missing.

## Not built here

- **Connectors** (SharePoint, Confluence, Google Drive): the index already takes documents as
  headings and text.
- **Permissions**: answering only from documents the person asking could open.
- **PDFs and Word files**: text and Markdown only for now.
