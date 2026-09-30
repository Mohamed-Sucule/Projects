# Claims Desk — insurance paperwork to a decision, with evidence

**[Open it](index.html)** · A home-insurance claim arrives as an email, a scanned claim form and an
invoice (or a quote, or a receipt). The desk:

1. reads the scans with OCR, in your browser;
2. pulls out the facts;
3. checks them against the policy and against each other;
4. recommends a decision: approve, decline with the clause quoted, or refer to a person.

Every check links to its evidence, and clicking it boxes the field on the scan or highlights the
clause. It works out the payout, drafts the reply, and records who approved or overrode the
recommendation. You can also give it a photo of any receipt, and it reads that on your device
too.

Northgate Home Insurance, its customers and their suppliers are fictional.

## Three claims, three answers

| Claim | Right answer | Why |
|---|---|---|
| **A burst pipe** | Approve £1,990 | In force, covered under Buildings, reported in two days, every document agrees, the invoice adds up. £2,340 less the £350 escape-of-water excess. |
| **A dropped laptop** | Decline | A genuine claim that the policy doesn't cover: accidental damage isn't on this schedule. The letter quotes the clause and explains how to appeal. |
| **A stolen bike** | Refer to a person | Probably genuine, but three things a claims handler is paid to notice. The theft was nine days after the policy started. The "proof of purchase" is dated three days *after* the theft. And the £2,450 bike isn't listed, so at most £1,000 is payable. The letter asks for the original receipt and accuses the customer of nothing. |

## How it's built

- **[`render.js`](render.js)** draws the form and invoice as scans: off-white paper, a slight tilt,
  speckle, a fold. The page then reads them back with **Tesseract**, an open-source OCR engine
  running in WebAssembly and served from this repository (`shared/vendor/tesseract`). The
  engine, the English model and the page make zero requests anywhere else. Every word comes back
  with its position, which is how the page draws boxes round the fields it read.
- **[`read.js`](read.js)** turns OCR text into facts. Labels are matched with a letter or two of
  slack. Values are cleaned for what they're meant to be: £ read as "E", O as 0, l as 1, and a
  comma read as a full stop ("£2.340.00" is £2,340, because whichever separator is last with two
  digits after it is the decimal point).
- **[`assess.js`](assess.js)** runs up to thirteen checks: policy found, name, in force, covered,
  reported within 30 days, email and form agree, amount matches the paperwork, the invoice adds
  up, it's in their name, dated sensibly, crime reference for theft, limits, and new-policy
  timing. Each check cites a document field or a clause of the wording in
  [`cases.js`](cases.js). Any failed check means decline. Anything needing a person means refer.
  A limit means partial. Otherwise approve.

## Safe when unsure

The test suite runs every claim through **180 deliberately smudged scans**, with OCR's usual
mistakes applied at random: over 95% of fields still come through, and over 90% of decisions are
unchanged. The rule the test enforces is stricter than the percentages. **A misread may send a
claim to a person, but it must never pay a claim that shouldn't be paid or decline one that
shouldn't be declined.** On the page, every field read from the real OCR is compared with the
source document, live ("11 of 11 read correctly").

## Checked

`tests/claims.test.mjs`:

- All three claims get the decision and payout a claims handler would give.
- Every check cites evidence, and every clause cited exists.
- A decline quotes its clause and mentions the ombudsman. A referral asks for something, and
  never uses the words fraud, suspicious or investigation.
- The rules follow the policy when the facts change. The incident after the policy ended means
  decline. More claimed than invoiced, reported after 30 days, a different name, an invoice that
  no longer matches, or an unknown policy number all mean refer.
- Noisy scans never cause a wrong payment or a wrong decline.

## Not built here

- **The insurer's own systems.** Claims would arrive from the inbox or portal, and policies would
  come from the policy administration system.
- **PDFs and multi-page documents.** Images only for now.
- **Handwriting.** The form here is typed. Handwritten forms need a handwriting model, and a
  person checking every field it's unsure of.
