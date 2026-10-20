/* Delimited text: CSV files (RFC 4180) and the tab-separated text that Excel, Google Sheets
   and Numbers put on the clipboard. Both quote a field that holds the delimiter, a quote or
   a line break, and double the quotes inside it. */

/** Parse delimited text into rows of fields. Accepts \r\n, \n and \r line endings. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  // a byte order mark at the start of a CSV file is not part of its first field
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuotes = (s: string, delimiter: string) =>
  s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r');

/** Rows of fields into delimited text, quoting only the fields that need it. */
export function writeDelimited(
  rows: readonly (readonly string[])[],
  delimiter: string,
  newline = '\r\n',
): string {
  return rows
    .map((r) =>
      r.map((f) => (needsQuotes(f, delimiter) ? `"${f.replace(/"/g, '""')}"` : f)).join(delimiter),
    )
    .join(newline);
}

export const parseCSV = (text: string) => parseDelimited(text, ',');
export const writeCSV = (rows: readonly (readonly string[])[]) => writeDelimited(rows, ',');
export const parseTSV = (text: string) => parseDelimited(text.replace(/\r?\n$/, ''), '\t');
export const writeTSV = (rows: readonly (readonly string[])[]) => writeDelimited(rows, '\t', '\n');
