"""Turn uploaded bytes into headed blocks of text. Every format is identified by its bytes, never its name."""

from __future__ import annotations

import io
import logging
import re
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser

MAX_DOCX_UNCOMPRESSED = 50 * 1024 * 1024
MAX_DOCX_RATIO = 100


class ParseError(ValueError):
    """The file is understood but cannot be used; the message is safe to show the uploader."""


@dataclass
class Block:
    kind: str  # heading | para | table
    text: str
    page: int = 1


@dataclass
class Parsed:
    format: str
    title: str
    blocks: list[Block] = field(default_factory=list)
    pages: int = 1

    @property
    def chars(self) -> int:
        return sum(len(b.text) for b in self.blocks)


def sniff(data: bytes, filename: str) -> str:
    name = filename.lower()
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = set(z.namelist())
        except zipfile.BadZipFile as e:
            raise ParseError("This looks like a zip archive but it is damaged.") from e
        if "word/document.xml" in names and "[Content_Types].xml" in names:
            return "docx"
        raise ParseError("Zip archives are not accepted. Upload a PDF, Word (.docx), HTML, Markdown, text or CSV file.")
    if b"\x00" in data[:4096]:
        raise ParseError("This is a binary file type Tally does not read. Upload a PDF, Word (.docx), HTML, Markdown, text or CSV file.")
    try:
        head = data[:2048].decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError as e:
            raise ParseError("Text files must be UTF-8.") from e
        head = ""
    if name.endswith(".csv"):
        return "csv"
    if name.endswith((".html", ".htm")) or re.search(r"<!doctype html|<html[\s>]", head, re.I):
        return "html"
    if name.endswith((".md", ".markdown")):
        return "md"
    return "txt"


def parse(data: bytes, filename: str, *, max_pages: int = 200) -> Parsed:
    if not data.strip():
        raise ParseError("The file is empty.")
    fmt = sniff(data, filename)
    if fmt == "pdf":
        return parse_pdf(data, max_pages=max_pages)
    if fmt == "docx":
        return parse_docx(data)
    if fmt == "csv":
        raise ParseError("CSV files are accounts data: import them as a table rather than as a document.")
    text = data.decode("utf-8-sig")
    if fmt == "html":
        return parse_html(text)
    if fmt == "md":
        return parse_markdown(text)
    return parse_text(text, filename)


# ── PDF ─────────────────────────────────────────────────────────────────────

_HEADING = re.compile(r"^(\d+(\.\d+)*\.?\s+[A-Z][^.]{0,70}|Schedule\b.{0,70}|Background|Changes|Variation|Liability|Governing law"
                      r"|[A-Z][A-Za-z&'\- ]{2,40})$")
_MONEY_ROW = re.compile(r"£\s?[\d,]+\.\d{2}\s*$")


def parse_pdf(data: bytes, *, max_pages: int) -> Parsed:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    logging.getLogger("pypdf").setLevel(logging.ERROR)  # damage it can recover from is not the uploader's problem

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ParseError("This PDF is password-protected. Remove the password and upload it again.")
        pages = reader.pages
        if len(pages) > max_pages:
            raise ParseError(f"This PDF has {len(pages)} pages; the limit is {max_pages}.")
        texts = [p.extract_text() or "" for p in pages]
    except ParseError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as e:
        raise ParseError("This PDF could not be read. It may be damaged.") from e
    if sum(len(t.strip()) for t in texts) < 20 * len(texts):
        raise ParseError("This PDF has no text layer. Scanned documents need OCR first, which Tally does not do.")
    out = Parsed(format="pdf", title="", pages=len(texts))
    for number, text in enumerate(texts, 1):
        lines = [ln.strip() for ln in text.splitlines()]
        if number == 1:
            first = next((i for i, ln in enumerate(lines) if ln), None)
            if first is not None and len(lines[first]) < 140 and not lines[first].endswith("."):
                out.title = lines[first]
                lines = lines[first + 1:]
        _lines_to_blocks(lines, number, out)
    return out


def _lines_to_blocks(lines: list[str], page: int, out: Parsed) -> None:
    para: list[str] = []
    table: list[str] = []

    def flush_para():
        if para:
            out.blocks.append(Block("para", " ".join(para), page))
            para.clear()

    def flush_table():
        if table:
            out.blocks.append(Block("table", "\n".join(table), page))
            table.clear()

    for line in lines:
        if not line:
            flush_para()
            continue
        if _MONEY_ROW.search(line) and len(line) < 90:
            flush_para()
            table.append(line)
            continue
        if table and re.match(r"^(Item|Product|Wine|Unit)\b", line):
            table.append(line)
            continue
        if _HEADING.match(line) and not para:
            flush_table()
            out.blocks.append(Block("heading", line, page))
            continue
        if re.match(r"^(Item|Product|Wine)\s+Unit\b", line):
            flush_para()
            table.append(line)
            continue
        flush_table()
        para.append(line)
        if line.endswith((".", ":")):
            flush_para()
    flush_para()
    flush_table()


# ── Word ────────────────────────────────────────────────────────────────────

def parse_docx(data: bytes) -> Parsed:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        total = sum(i.file_size for i in z.infolist())
        packed = sum(i.compress_size for i in z.infolist()) or 1
        if total > MAX_DOCX_UNCOMPRESSED or total / packed > MAX_DOCX_RATIO:
            raise ParseError("This Word file expands to an unreasonable size when opened, so it was not processed.")
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        doc = Document(io.BytesIO(data))
    except Exception as e:  # python-docx raises a variety of lxml and KeyError subclasses
        raise ParseError("This Word file could not be read. It may be damaged.") from e
    out = Parsed(format="docx", title="")
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            if style.lower().startswith(("heading", "title")):
                if not out.title and style.lower() in ("title", "heading 1"):
                    out.title = text
                out.blocks.append(Block("heading", text))
            else:
                out.blocks.append(Block("para", text))
        elif tag == "tbl":
            t = Table(child, doc)
            rows = [" | ".join(c.text.strip() for c in row.cells) for row in t.rows]
            if rows:
                out.blocks.append(Block("table", "\n".join(rows)))
    return out


# ── HTML ────────────────────────────────────────────────────────────────────

class _HTMLText(HTMLParser):
    SKIP = {"script", "style", "nav", "footer", "head", "noscript", "svg", "template"}
    BLOCK = {"p", "li", "div", "td", "th", "tr", "blockquote", "section", "article", "br"}
    VOID = {"br", "img", "meta", "link", "input", "hr", "col", "area", "base", "source", "wbr", "embed", "param", "track"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self.skip = 0
        self.hidden: list[bool] = []
        self.heading = False
        self.buf: list[str] = []
        self.row: list[str] = []
        self.title = ""
        self.in_title = False
        self.hidden_text = False

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            if tag == "br":
                self._flush()
            return
        a = dict(attrs)
        style = (a.get("style") or "").replace(" ", "").lower()
        self.hidden.append("display:none" in style or "visibility:hidden" in style or "hidden" in a)
        if tag in self.SKIP:
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._flush()
            self.heading = True
        elif tag in self.BLOCK:
            self._flush()

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if self.hidden:
            self.hidden.pop()
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        if tag == "title":
            self.in_title = False
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._flush()
            self.heading = False
        elif tag in ("td", "th"):
            self.row.append(" ".join(self.buf).strip())
            self.buf.clear()
        elif tag == "tr":
            if self.row:
                self.blocks.append(Block("table", " | ".join(self.row)))
            self.row = []
        elif tag in self.BLOCK:
            self._flush()

    def handle_data(self, data):
        if self.in_title:
            self.title += data.strip()
            return
        if self.skip:
            return
        text = " ".join(data.split())
        if text:
            self.buf.append(text)
            if any(self.hidden):
                self.hidden_text = True

    def _flush(self):
        text = " ".join(self.buf).strip()
        self.buf.clear()
        if text:
            kind = "heading" if self.heading else "para"
            block = Block(kind, text)
            if self.hidden_text:
                block.text = "[hidden on the web page] " + text
                self.hidden_text = False
            self.blocks.append(block)


def parse_html(text: str) -> Parsed:
    p = _HTMLText()
    p.feed(text)
    p.close()
    p._flush()
    merged: list[Block] = []
    for b in p.blocks:
        if b.kind == "table" and merged and merged[-1].kind == "table":
            merged[-1].text += "\n" + b.text
        else:
            merged.append(b)
    h1 = next((b.text for b in merged if b.kind == "heading"), "")
    return Parsed(format="html", title=h1 or p.title, blocks=merged)


# ── Markdown and plain text ─────────────────────────────────────────────────

def parse_markdown(text: str) -> Parsed:
    out = Parsed(format="md", title="")
    para: list[str] = []
    table: list[str] = []

    def flush():
        if para:
            out.blocks.append(Block("para", " ".join(para)))
            para.clear()
        if table:
            out.blocks.append(Block("table", "\n".join(table)))
            table.clear()

    for raw in text.splitlines():
        line = raw.strip()
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush()
            if not out.title:
                out.title = m.group(2).strip()
            out.blocks.append(Block("heading", m.group(2).strip()))
        elif line.startswith("|"):
            if para:
                flush()
            if not re.match(r"^\|[\s\-:|]+\|?$", line):
                table.append(" | ".join(c.strip() for c in line.strip("|").split("|")))
        elif not line:
            flush()
        else:
            if table:
                flush()
            para.append(re.sub(r"[*_`]", "", line))
    flush()
    return out


def parse_text(text: str, filename: str) -> Parsed:
    out = Parsed(format="txt", title=filename.rsplit(".", 1)[0][:120])
    for chunk in re.split(r"\n\s*\n", text):
        chunk = " ".join(chunk.split())
        if chunk:
            out.blocks.append(Block("para", chunk))
    return out
