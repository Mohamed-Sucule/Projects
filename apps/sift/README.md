# Sift

Drop a CSV in and it tells you what is actually in it.

**→ [Open it](https://mohamed-sucule.github.io/Projects/apps/sift/)**

Every column gets a type, a count of the gaps, a range and a shape. Then you can
sort and filter a hundred thousand rows without it stuttering. Nothing is
uploaded anywhere — it all happens in the tab.

---

## The parser is the point

Splitting a line on commas is **the single most common data bug in working
software**. It silently truncates any row with a comma inside a quoted field,
the row count still looks about right, and nobody notices until a customer asks
where half their address went.

So the parser is a character loop, not a regex, and it handles the whole list:

- `a,"b,c",d` is three fields, not four
- `"he said ""hi"""` is one field containing `he said "hi"`
- a newline inside quotes stays inside the row
- `30" monitor` is a quote in the middle of a field, not a malformed file
- CRLF, LF and a bare CR each end a row exactly once
- a byte-order mark — Excel writes one — doesn't become part of the first
  column name, which otherwise makes every lookup of `id` fail for reasons you
  can't see on screen
- **a trailing newline doesn't invent an empty row.** Almost every file ends
  with one, and a parser that adds a record for it reports one more row than
  exists, and every count downstream is off by one.

There's a test for each of those, because each of them is a bug I've seen in
production code.

### Things it refuses to guess

**Dates are read only when they're unambiguous.** `new Date('03/04/2025')` is
March in the US and April almost everywhere else. Picking one silently makes
half the world's data wrong by up to eleven months, so anything that isn't ISO
stays text — where it's at least *visibly* unparsed.

**The delimiter is sniffed from consistency across rows, not from the header.**
Guessing from the header alone gets a semicolon file with `"born 1815, London"`
in it wrong, every time.

**A ragged row is padded and counted, never dropped.** Throwing away someone's
record over a stray delimiter is bad; doing it quietly is worse. The count of
reshaped rows is in the footer.

**Duplicate column names are made distinct** rather than shadowing each other.

## What it says about a column

A type is accepted when 95% of the non-blank values fit it, so one corrupt cell
in ten thousand doesn't demote a numeric column to text — but **the count that
didn't fit is always shown**, because a column that is "97% a number" is a thing
somebody needs to know about.

A few deliberate choices:

- **A column of 1s and 0s stays an integer**, not a boolean. It's far more often
  a count or a flag people want to sum, and turning it into booleans loses the
  sum.
- **Blanks are counted separately and never decide the type.** Zero is a value,
  not a gap.
- **A histogram never has more buckets than there are distinct values.** A
  column of quantities 1 to 5 spread across twenty-four buckets draws five
  spikes with gaps between them, which reads as missing data rather than as five
  values.
- **A column where every value appears once is named as an identifier**, because
  listing eight values with a count of one beside each tells you nothing.

## A hundred thousand rows, at sixty frames a second

A hundred thousand rows across eleven columns is **1.1 million elements**. Hand
a browser that and it will allocate for about forty seconds and then scroll at
four frames a second.

The fix isn't to make the elements cheaper, it's not to make them. Keep a tall
empty box so the scrollbar tells the truth, work out which rows fall inside the
viewport, and render those thirty-odd. Scrolling then costs the same at a
hundred rows as at a million, and the row elements are recycled rather than
rebuilt, because creating and dropping thirty elements per frame is enough to
make a trackpad flick feel notchy.

Measured in the browser, on the generated 100k-row file:

| | |
| --- | --- |
| parse | 177ms |
| profile | 492ms |
| DOM rows at 4,000 rows | 37 |
| DOM rows at 100,000 rows | **36** |
| DOM rows after scrolling to the bottom | **36** |

There's a test in the suite that parses and profiles 100k rows and fails if it
takes more than a few seconds — not a benchmark, a tripwire. If someone reaches
for a regex or starts concatenating arrays in a loop, it goes from under two
seconds to thirty and the tool stops being usable on the files people have.

## The filter language

Small on purpose:

```
london                  every column, anywhere
city:man                one column, contains
status:shipped total>900
total<50                compares as numbers when both sides are numbers
when>2026-09-01         and as dates when both sides are dates
city:"New York"         quotes for values with spaces
total=                  the rows where it's empty
```

Terms are ANDed, because that's what people mean when they type two things. An
unknown column is searched as text rather than throwing, so the query survives
being typed one character at a time.

**A blank never satisfies an ordering comparison.** `total<50` returning every
row with no total in it is the opposite of what was asked — an unknown value
fails every ordering test, the same way SQL treats NULL.

## Details

- Sorting is **stable** and puts blanks last in *both* directions — a column
  sorted worst-first that opens with four hundred empty cells hasn't answered
  anybody's question.
- Sorting works on indices, not rows, so a 200k-row table isn't copied on every
  click.
- The filter is debounced by 90ms: under the threshold where a person notices a
  delay, well over the cost of one pass.
- The column headers are real controls — focusable, operable with Enter or
  Space, and they report `aria-sort`. A clickable `div` is invisible to a
  keyboard and silent to a screen reader.
- The drag overlay counts drag depth rather than using a boolean, because
  `dragenter` and `dragleave` fire for every element the pointer crosses and a
  boolean flickers the overlay on and off across the whole page.
- It opens with 4,000 generated rows already loaded, because a tool with an
  empty state is a tool nobody sees working. The sample deliberately contains
  quoted commas and missing values — a sample that's too tidy demonstrates
  nothing.

## Five bugs found by testing it

- **`""` parsed to no rows at all.** A file that is just an empty quoted field
  holds one row with one empty field, and checking `field !== ''` can't tell
  that apart from having read nothing.
- **A blank cell matched `total<50`**, because `'' < '50'` is true for strings.
- **Three distinct values in six rows wasn't recognised as a category**, because
  the ratio test was strict where it should have been inclusive.
- **`parseTable(null)` threw** instead of returning an empty table.
- **Scrolling 100k rows down and then filtering to 3,000 crashed the renderer.**
  The scroll position was briefly past the end of the new list, so the first
  visible row landed beyond the last one, the row count came out negative, and
  the recycling loop handed `removeChild` an `undefined`.

## Tests

`node tests/run.mjs sift` — 49 of them, covering every parser case listed above,
type inference, the summary statistics, sorting, the filter language, and the
100k-row tripwire.
