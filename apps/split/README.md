# Split — who owes whom, in the fewest payments

**[Open it](index.html)** · Add who paid for what on a trip, in a flat or at a dinner, and it
works out the smallest number of bank transfers that squares everybody up. It opens on an example
weekend so there is something to look at; change anything and the plan redoes itself.

- **Uneven splits.** Equally between some of the group, by shares (two nights costs twice one),
  or by exact amounts that are checked to add up.
- **Settling is just another line.** "Mark paid" records the transfer, and it drops out of the
  plan — a half-settled group still adds up.
- **One link for the whole group.** The state is packed into the URL itself. There is no
  server, no account, and nothing is uploaded; the only copy is in the link and in your browser.

## Money is whole cents

Every amount is an integer number of the smallest unit from the moment it is typed. £10 split
three ways is 334 + 333 + 333, with the extra penny going to the same person every time, so every
split sums to its total and every group's balances sum to exactly zero. The tests check both on
thousands of random groups, because a balance sheet that is a penny out is one nobody trusts
again.

## The fewest payments

Work out what each person is up or down. A set of people whose balances cancel out among
themselves can always be settled in one payment fewer than there are of them, and never fewer.
So the minimum is *(people with a balance) − (the most separate zero-sum groups they can be
divided into)*, and [`split.js`](split.js) finds that division with a search over subsets —
exponential in principle, instant for anybody who fits round a table. Past sixteen people it
falls back to matching the biggest debtor with the biggest creditor.

That usual method is not optimal. For balances of +2, +2, +3, −3 and −4 it sends the −4 to the +3
first and then mops up — four payments — when +3 and −3 cancel on their own and the rest is one
more group: three. The tests check the plan against a brute-force search over every way of
dividing hundreds of random groups, which shares no code with the real thing.

Typing "12,50" means twelve and a half, and "1,234" means a thousand and more; the parser knows
the difference.
