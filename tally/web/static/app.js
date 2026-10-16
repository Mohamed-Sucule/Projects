"use strict";
// Tally web UI. Everything that came from the server is inserted as text (never innerHTML), because answers,
// document passages and invoice notes are untrusted.

const $ = (sel) => document.querySelector(sel);
const money = (v) => "£" + Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { meta: null, admin: "", run: null };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// replaceChildren() would print a null child as the text "null"; drop empty children first.
function put(el, ...kids) {
  el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
}

async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (state.admin) headers["Authorization"] = "Bearer " + state.admin;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || res.statusText || "Request failed");
  return data;
}

// ── tabs ───────────────────────────────────────────────────────────────

const loaders = { audit: loadAudit, docs: loadDocs, evals: loadEvals };
const loaded = {};

function showTab(name) {
  if (!document.getElementById("tab-" + name)) name = "ask";
  document.querySelectorAll("[role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll("[role=tabpanel]").forEach((p) => (p.hidden = p.id !== "tab-" + name));
  if (loaders[name] && !loaded[name]) {
    loaded[name] = true;
    loaders[name]().catch((e) => showError("#" + (name === "docs" ? "docs" : name) + "-out", e));
  }
}

function showError(target, e) {
  const el = typeof target === "string" ? $(target) : target;
  put(el, h("div", { class: "error", text: e.message || String(e) }));
}

// ── meta ───────────────────────────────────────────────────────────────

async function loadMeta() {
  const m = await api("/api/meta");
  state.meta = m;
  $("#org").textContent = `${m.org} · ${m.books.invoices} invoices · ${m.documents} documents · as of ${fmtDate(m.as_of)}`;
  const pill = $("#model-pill");
  pill.textContent = m.llm_enabled ? `Claude · ${m.model}` : "Model not configured";
  pill.className = "pill " + (m.llm_enabled ? "on" : "off");
  const samples = $("#samples");
  put(samples, ...m.samples.map((s) =>
    h("button", { class: "chip", type: "button", onclick: () => { $("#q").value = s.question; ask(); } },
      h("span", { class: "cat", text: s.category }), s.question)));
  if (!m.llm_enabled) {
    put($("#ask-out"), h("div", { class: "notice" },
      "This deployment has no Anthropic API key, so questions are switched off. The audit, documents and eval results still work."));
  }
}

function fmtDate(iso) {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── ask ────────────────────────────────────────────────────────────────

function stepLabel(tool, input) {
  input = input || {};
  switch (tool) {
    case "search_documents":
      return ["Searching documents for ", h("code", { text: input.query || "" }), input.supplier_id ? ` (${input.supplier_id})` : ""];
    case "read_document":
      return ["Reading ", h("code", { text: input.doc_id || "" }), input.from_passage ? ` from passage ${input.from_passage}` : ""];
    case "list_documents":
      return ["Listing documents", input.supplier_id ? ` for ${input.supplier_id}` : ""];
    case "query_database":
      return ["Querying the accounts ", h("code", { text: input.sql || "" })];
    case "calculate":
      return ["Calculating ", h("code", { text: input.expression || "" })];
    default:
      return [tool];
  }
}

async function ask() {
  const q = $("#q").value.trim();
  if (q.length < 3) return;
  const out = $("#ask-out");
  const btn = $("#ask-btn");
  btn.disabled = true;
  const trace = h("ol", { class: "trace" });
  const thinking = h("li", { class: "live" }, h("span", { class: "dot" }), h("span", { class: "what", text: "Thinking…" }));
  trace.append(thinking);
  put(out, trace);
  let live = null;
  try {
    const headers = { "Content-Type": "application/json" };
    const res = await fetch("/api/ask", { method: "POST", headers, body: JSON.stringify({ question: q }) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error && data.error.message) || res.statusText);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        let ev = "message", data = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event: ")) ev = line.slice(7);
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) continue;
        const payload = JSON.parse(data);
        if (ev === "progress" && payload.type === "tool") {
          thinking.remove();
          live = h("li", { class: "live" }, h("span", { class: "dot" }), h("span", { class: "what" }, ...stepLabel(payload.tool, payload.input)));
          trace.append(live);
        } else if (ev === "progress" && payload.type === "tool_done" && live) {
          live.className = payload.is_error ? "err" : "done";
          live.append(h("span", { text: "· " + (payload.summary || "") }));
          live = null;
          trace.append(thinking);
        } else if (ev === "answer") {
          thinking.remove();
          out.append(renderAnswer(payload));
        } else if (ev === "error") {
          thinking.remove();
          out.append(h("div", { class: "error", text: payload.message }));
        }
      }
    }
  } catch (e) {
    thinking.remove();
    out.append(h("div", { class: "error", text: e.message }));
  } finally {
    btn.disabled = false;
  }
}

function renderAnswer(r) {
  const card = h("article", { class: "card answer" });
  card.append(h("div", { class: "badges" },
    h("span", { class: "badge " + r.status, text: r.status.replace("_", " ") }),
    r.verdict !== "not_applicable" ? h("span", { class: "badge " + r.verdict, text: r.verdict }) : null));
  card.append(h("p", { class: "text", text: r.answer }));
  if (r.figures.length) {
    card.append(h("div", { class: "figures" }, r.figures.map((f) =>
      h("div", { class: "figure" }, h("b", { text: figureText(f) }), h("span", { text: f.label })))));
  }
  if (r.warnings.length) card.append(h("ul", { class: "warnings" }, r.warnings.map((w) => h("li", { text: w }))));
  if (r.citations.length) {
    card.append(h("h3", { text: "Sources" }));
    card.append(h("ul", { class: "cites" }, r.citations.map((c) => h("li", {},
      h("button", { class: "cite", type: "button", onclick: () => openDoc(c.doc_id, c.chunk_id, c.quote) },
        h("q", { text: c.quote }),
        h("small", { text: [c.doc_title, c.section, c.page ? "page " + c.page : ""].filter(Boolean).join(" · ") }))))));
  }
  if (r.queries.length) {
    const d = h("details", {}, h("summary", { text: `Database queries (${r.queries.length})` }));
    for (const q of r.queries) {
      d.append(h("pre", { text: q.sql }));
      if (q.rows.length) d.append(tableOf(q.columns, q.rows, q.row_count > q.rows.length ? `${q.row_count} rows; first ${q.rows.length} shown` : ""));
    }
    card.append(d);
  }
  card.append(h("div", { class: "meta" },
    h("span", { text: `${r.steps.length} tool call${r.steps.length === 1 ? "" : "s"}` }),
    h("span", { text: `${(r.latency_ms / 1000).toFixed(1)} s` }),
    h("span", { text: `${r.input_tokens.toLocaleString()} in / ${r.output_tokens.toLocaleString()} out tokens` }),
    h("span", { text: `$${r.cost_usd.toFixed(4)}` }),
    h("span", { text: r.model })));
  return card;
}

function figureText(f) {
  const unit = (f.unit || "").trim();
  if (/^(gbp|£)/i.test(unit)) return money(f.value) + unit.replace(/^(gbp|£)\s*/i, "");
  if (/^(percent|%)$/i.test(unit)) return `${f.value}%`;
  return `${Number(f.value).toLocaleString("en-GB")} ${unit}`.trim();
}

function tableOf(columns, rows, caption) {
  const fmt = (v) => (v === null ? "" : typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(4)).toString() : String(v));
  return h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, columns.map((c) => h("th", { text: c })))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((v) => h("td", { class: typeof v === "number" ? "num" : null, text: fmt(v) })))))),
    caption ? h("p", { class: "muted small", text: caption }) : null);
}

// ── source drawer ──────────────────────────────────────────────────────

async function openDoc(docId, chunkId, quote) {
  const drawer = $("#drawer");
  const body = $("#drawer-body");
  drawer.hidden = false;
  $("#drawer-title").textContent = "Loading…";
  put(body);
  try {
    const d = await api("/api/documents/" + encodeURIComponent(docId));
    $("#drawer-title").textContent = d.title;
    body.append(h("p", { class: "muted small", text: `${d.kind} · ${d.format.toUpperCase()} · ${d.filename}` }));
    if (d.flags.length) body.append(h("p", {}, h("span", { class: "flag", text: "Flagged: " + d.flags.join(", ") })));
    let target = null;
    for (const c of d.chunks) {
      const el = h("div", { class: "passage" + (c.id === chunkId ? " hit" : "") },
        h("div", { class: "where", text: [c.section, c.page ? "page " + c.page : "", "passage " + c.ordinal].filter(Boolean).join(" · ") }),
        highlight(c.text, c.id === chunkId ? quote : ""));
      if (c.flags.length) el.append(h("span", { class: "flag", text: "Looks like instructions to an AI: " + c.flags.join(", ") }));
      if (c.id === chunkId) target = el;
      body.append(el);
    }
    if (target) target.scrollIntoView({ block: "center" });
  } catch (e) {
    showError(body, e);
  }
}

function highlight(text, quote) {
  // The server matched the quote ignoring whitespace and case; do the same here so a quote across a line break still lights up.
  const div = h("div", { class: "body" });
  const words = (quote || "").split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = words.length ? new RegExp(words.join("\\s+"), "i").exec(text) : null;
  if (!m) {
    div.textContent = text;
  } else {
    div.append(text.slice(0, m.index), h("mark", { text: m[0] }), text.slice(m.index + m[0].length));
  }
  return div;
}

// ── audit ──────────────────────────────────────────────────────────────

const RULES = {
  price: "Price", fixed_fee: "Fixed fee", delivery_fee: "Delivery charge", volume_discount: "Volume discount",
  out_of_hours: "Out of hours", minimum_charge: "Minimum charge", allowance: "Free allowance", frequency: "Frequency",
  quantity: "Quantity", duplicate: "Duplicate", arithmetic: "Arithmetic",
};

async function loadAudit() {
  const runs = await api("/api/audit/runs");
  const latest = runs.find((r) => r.status === "done") || runs[0];
  renderAuditActions();
  if (!latest) {
    put($("#audit-out"), h("div", { class: "card muted", text: "No audit has run yet." }));
    return;
  }
  state.run = await api("/api/audit/runs/" + latest.id);
  renderRun();
}

function renderAuditActions() {
  const box = $("#audit-actions");
  const m = state.meta || {};
  const canWrite = m.public_demo || state.admin;
  put(box,
    h("button", { class: "btn", type: "button", disabled: !canWrite || null, onclick: () => startRun("reference") }, "Re-run audit"),
    m.llm_enabled && state.admin ? h("button", { class: "btn", type: "button", onclick: () => startRun("extracted") }, "Re-extract terms and audit") : null);
}

async function startRun(source) {
  const out = $("#audit-out");
  out.prepend(h("div", { class: "notice", text: source === "extracted" ? "Claude is reading every contract…" : "Running checks…" }));
  try {
    let run = await api("/api/audit/runs", { method: "POST", json: { terms_source: source } });
    while (run.status === "running") {
      await new Promise((r) => setTimeout(r, 1500));
      run = await api("/api/audit/runs/" + run.id);
    }
    state.run = run;
    renderRun();
  } catch (e) {
    showError(out, e);
  }
}

function renderRun() {
  const run = state.run;
  const out = $("#audit-out");
  if (run.status === "failed") {
    put(out, h("div", { class: "error", text: "This audit failed: " + (run.error || "unknown error") }));
    return;
  }
  const s = run.summary || { by_supplier: {}, total: 0, findings: 0 };
  const names = Object.fromEntries(((state.meta && state.meta.suppliers) || []).map((x) => [x.supplier_id, x.name]));
  const invoices = new Set(run.findings.map((f) => f.invoice_no)).size;
  const max = Math.max(1, ...Object.values(s.by_supplier));
  const bars = h("div", { class: "bars" }, Object.entries(s.by_supplier).sort((a, b) => b[1] - a[1]).map(([sid, amt]) => {
    const fill = h("div", { class: "fill" });
    fill.style.width = (100 * amt / max).toFixed(1) + "%";
    return h("div", { class: "bar" }, h("span", { text: names[sid] || sid }), h("div", { class: "track" }, fill), h("span", { class: "amt", text: money(amt) }));
  }));
  const filter = h("select", { "aria-label": "Filter by supplier", onchange: () => fillRows(filter.value) },
    h("option", { value: "", text: "All suppliers" }), Object.keys(s.by_supplier).map((sid) => h("option", { value: sid, text: names[sid] || sid })));
  const tbody = h("tbody");
  const fillRows = (only) => put(tbody, ...run.findings.filter((f) => !only || f.supplier_id === only).map((f) =>
    h("tr", {}, h("td", { class: "mono", text: f.invoice_no }), h("td", { text: names[f.supplier_id] || f.supplier_id }),
      h("td", {}, h("span", { class: "rule", text: RULES[f.rule] || f.rule })), h("td", { text: f.detail }),
      h("td", { class: "num", text: money(f.amount) }))));
  fillRows("");
  const unverified = Object.keys(s.unverified_evidence || {});
  put(out,
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("b", { text: money(s.total) }), h("span", { text: "in disputed charges" })),
      h("div", { class: "stat" }, h("b", { text: String(s.findings) }), h("span", { text: "findings" })),
      h("div", { class: "stat" }, h("b", { text: String(invoices) }), h("span", { text: `of ${(state.meta && state.meta.books.invoices) || "?"} invoices affected` })),
      h("div", { class: "stat" }, h("b", { text: run.terms_source === "reference" ? "Reference" : "Extracted" }),
        h("span", { text: `terms · run #${run.id} · ${fmtDate(run.started_at.slice(0, 10))}` }))),
    unverified.length ? h("div", { class: "notice", text: `Some extracted terms for ${unverified.join(", ")} quote text that was not found in the contract. Check those findings by hand.` }) : null,
    h("div", { class: "card" }, h("h2", { text: "Disputed amount by supplier" }), bars),
    h("div", { class: "card" }, h("div", { class: "row-between" }, h("h2", { text: "Findings" }), filter),
      h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Invoice", "Supplier", "Check", "What is wrong", "Amount"].map((c, i) => h("th", { class: i === 4 ? "num" : null, text: c })))),
        tbody))),
    renderDrafts(run));
}

function renderDrafts(run) {
  const box = h("div", { class: "card" }, h("h2", { text: "Dispute emails" }));
  const m = state.meta || {};
  const canWrite = m.public_demo || state.admin;
  if (!run.drafts.length) {
    box.append(h("p", { class: "muted", text: m.llm_enabled
      ? "Claude writes one email per supplier from these findings. Guardrails check every invoice is mentioned and every amount is one the audit found; a person approves each email."
      : "Without a model key, drafts use a fixed template. With one, Claude writes them and guardrails check every invoice and amount." }));
    box.append(h("button", { class: "btn primary", type: "button", disabled: !canWrite || !run.findings.length || null, onclick: async (e) => {
      e.target.disabled = true;
      e.target.textContent = "Drafting…";
      try { state.run = await api(`/api/audit/runs/${run.id}/drafts`, { method: "POST" }); renderRun(); } catch (err) { showError(box, err); }
    } }, "Draft dispute emails"));
    return box;
  }
  const names = Object.fromEntries(((state.meta && state.meta.suppliers) || []).map((x) => [x.supplier_id, x.name]));
  for (const d of run.drafts) {
    const area = h("textarea", { "aria-label": "Email body", disabled: d.status !== "pending" || null });
    area.value = d.body;
    const row = h("div", { class: "row" });
    if (d.status === "pending" && canWrite) {
      row.append(
        h("button", { class: "btn primary sm", type: "button", onclick: () => decide(d.id, "approve", area.value) }, "Approve and queue"),
        h("button", { class: "btn danger sm", type: "button", onclick: () => decide(d.id, "reject") }, "Reject"));
    }
    row.append(h("span", { class: "muted small", text: d.reason || "" }));
    box.append(h("div", { class: "draft" },
      h("div", { class: "draft-head" },
        h("div", {}, h("strong", { text: names[d.supplier_id] || d.supplier_id }), h("div", { class: "muted small", text: `To ${d.to_addr || "(no address)"} · ${d.subject}` })),
        h("span", { class: "status " + d.status, text: d.status })),
      area, row));
  }
  box.append(h("p", { class: "muted small", text: "Approved emails go to an outbox table. This demo never sends email." }));
  return box;
}

async function decide(id, decision, body) {
  try {
    await api(`/api/drafts/${id}/decision`, { method: "POST", json: decision === "approve" ? { decision, body } : { decision, reason: "Rejected in review" } });
    state.run = await api("/api/audit/runs/" + state.run.id);
    renderRun();
  } catch (e) {
    alert(e.message);
  }
}

// ── documents ──────────────────────────────────────────────────────────

async function loadDocs() {
  const docs = await api("/api/documents");
  const m = state.meta;
  const grid = h("div", { class: "docs" }, docs.map((d) => h("button", { class: "doc", type: "button", onclick: () => openDoc(d.id) },
    h("span", { class: "kind", text: `${d.kind} · ${d.format}${d.supplier_id ? " · " + d.supplier_id : ""}` }),
    h("span", { class: "title", text: d.title }),
    h("span", { class: "muted small", text: `${d.chunks} passages · ${d.pages || 1} page${d.pages === 1 ? "" : "s"} · ${d.filename}` }),
    d.flags.length ? h("div", {}, h("span", { class: "flag", text: "Flagged: " + d.flags.join(", ") })) : null)));
  const counts = m ? Object.entries(m.books).map(([t, n]) => `${n.toLocaleString()} ${t.replace("_", " ")}`).join(" · ") : "";
  put($("#docs-out"), grid,
    h("div", { class: "card" }, h("h2", { text: "Accounts database" }), h("p", { class: "muted", text: counts }),
      h("p", { class: "muted small", text: "Loaded from CSV exports into a separate SQLite file. The model's SQL tool opens it read-only and may read only these tables." })),
    adminPanel());
}

function adminPanel() {
  const card = h("div", { class: "card" }, h("h2", { text: "Add documents or accounts (admin)" }));
  if (!state.meta.admin_enabled) {
    card.append(h("p", { class: "muted", text: "Uploads are switched off on this deployment." }));
    return card;
  }
  const token = h("input", { type: "password", autocomplete: "off", placeholder: "Admin token" });
  token.value = state.admin;
  token.addEventListener("change", () => { state.admin = token.value.trim(); renderAuditActions(); });
  const file = h("input", { type: "file", accept: ".pdf,.docx,.html,.htm,.md,.txt" });
  const kind = h("select", {}, ["contract", "amendment", "policy", "other"].map((k) => h("option", { value: k, text: k })));
  const supplier = h("input", { type: "text", placeholder: "e.g. greenleaf", pattern: "[a-z0-9_-]+" });
  const csv = h("input", { type: "file", accept: ".csv" });
  const table = h("select", {}, ["suppliers", "invoices", "invoice_lines", "deliveries", "delivery_items", "payments"].map((t) => h("option", { value: t, text: t })));
  const result = h("p", { class: "muted small" });
  const send = async (url, form) => {
    result.textContent = "Uploading…";
    try {
      const res = await fetch(url, { method: "POST", body: form, headers: { Authorization: "Bearer " + state.admin } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error && data.error.message) || res.statusText);
      result.textContent = "Done: " + JSON.stringify(data);
      loaded.docs = false;
      await loadMeta();
      await loadDocs();
    } catch (e) {
      result.textContent = e.message;
    }
  };
  card.append(
    h("div", { class: "upload" }, h("label", {}, "Admin token", token)),
    h("h3", { text: "Document" }),
    h("div", { class: "upload" }, h("label", {}, "File (PDF, DOCX, HTML, MD)", file), h("label", {}, "Kind", kind), h("label", {}, "Supplier id", supplier),
      h("button", { class: "btn", type: "button", onclick: () => {
        if (!file.files[0]) return;
        const f = new FormData();
        f.append("file", file.files[0]);
        f.append("kind", kind.value);
        if (supplier.value.trim()) f.append("supplier_id", supplier.value.trim());
        send("/api/documents", f);
      } }, "Upload document")),
    h("h3", { text: "Accounts table (replaces it)" }),
    h("div", { class: "upload" }, h("label", {}, "CSV file", csv), h("label", {}, "Table", table),
      h("button", { class: "btn", type: "button", onclick: () => {
        if (!csv.files[0]) return;
        const f = new FormData();
        f.append("file", csv.files[0]);
        send("/api/books/" + table.value, f);
      } }, "Import CSV")),
    result);
  return card;
}

// ── evals ──────────────────────────────────────────────────────────────

async function loadEvals() {
  const reports = await api("/api/evals");
  const order = ["summary", "audit_reference", "retrieval", "sql_guard", "ingestion", "qa", "extraction", "audit_extracted", "drafts"];
  const names = Object.keys(reports).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  if (!names.length) {
    put($("#evals-out"), h("div", { class: "card muted", text: "No eval reports yet. Run: python -m evals.run" }));
    return;
  }
  put($("#evals-out"), ...names.map((n) => renderSuite(n, reports[n])));
}

function renderSuite(name, r) {
  if (name === "summary") {
    return h("div", { class: "card" }, h("h2", { text: "Summary" }),
      h("p", { class: "muted small", text: r.note || "" }),
      tableOf(["Suite", "Score", "Model", "Ran"], (r.suites || []).map((s) => [s.title, s.headline, s.model || "none (offline)", s.ran_at.slice(0, 16).replace("T", " ")])));
  }
  const pct = r.total ? r.passed / r.total : 0;
  const card = h("div", { class: "card suite" },
    h("div", { class: "row-between" },
      h("div", {}, h("h2", { text: r.title }), h("p", { class: "muted small", text: r.description || "" })),
      h("div", { class: "score " + (pct >= 0.95 ? "ok" : pct < 0.7 ? "bad" : ""), text: `${r.passed}/${r.total}` })));
  const metrics = Object.entries(r.metrics || {});
  if (metrics.length) {
    card.append(h("div", { class: "stats" }, metrics.map(([k, v]) => h("div", { class: "stat" },
      h("b", { text: typeof v === "number" && v <= 1 && !Number.isInteger(v) ? (100 * v).toFixed(1) + "%" : String(v) }), h("span", { text: k.replaceAll("_", " ") })))));
  }
  const failed = (r.cases || []).filter((c) => !c.pass);
  const d = h("details", {}, h("summary", { text: `All cases (${(r.cases || []).length})${failed.length ? ` · ${failed.length} failed` : ""}` }),
    tableOf(["Case", "Result", "Detail"], (r.cases || []).map((c) => [c.id, c.pass ? "pass" : "FAIL", c.detail || ""])));
  card.append(d, h("p", { class: "muted small", text: `${r.model ? "Model " + r.model + " · " : ""}ran ${String(r.ran_at || "").slice(0, 16).replace("T", " ")}` }));
  return card;
}

// ── boot ───────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[role=tab]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));
  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); ask(); });
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1) || "ask"));
  $("#drawer-close").addEventListener("click", () => ($("#drawer").hidden = true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#drawer").hidden = true; });
  loadMeta().then(() => showTab(location.hash.slice(1) || "ask")).catch((e) => showError("#ask-out", e));
});
