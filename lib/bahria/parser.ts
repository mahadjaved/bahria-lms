import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { LMS_BASE_URL } from "./constants";
import type { PortalPage, PortalTable } from "./types";

function norm(s: string): string { return s.replace(/\s+/g, " ").trim(); }

/** Resolve an href the way a browser on `pageUrl` would; force LMS host for uploaded documents. */
export function resolveHref(href: string, pageUrl: string): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h === "#" || h.toLowerCase().startsWith("javascript:")) return null;
  const uploadedIdx = h.indexOf("_uploaded_documents");
  if (uploadedIdx >= 0) {
    return LMS_BASE_URL + "/" + h.slice(uploadedIdx).replace(/^\/+/, "");
  }
  try {
    const u = new URL(h, pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch { return null; }
}

export function parsePortalPage(html: string, url: string): PortalPage {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const title = norm($("title").first().text() || $("h1").first().text() || "");
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => { const t = norm($(el).text()); if (t) headings.push(t); });

  const tables: PortalTable[] = [];
  const seen = new Set<string>();
  $("table").each((_, tableEl) => {
    const $table = $(tableEl);
    // Rows that belong to THIS table, not to a table nested inside one of its cells.
    const directRows = $table.find("tr").filter((_, tr) => {
      const closest = $(tr).closest("table").get(0);
      return closest === (tableEl as unknown as AnyNode);
    });
    if (directRows.length === 0) return;

    // Layout table: a row whose single cell wraps another table — skip it,
    // the inner table will be visited on its own.
    let isLayout = false;
    const grid: { cells: string[]; cellLinks: (string | null)[]; link: string | null; hasTh: boolean }[] = [];
    directRows.each((_, tr) => {
      const $tr = $(tr);
      const $cells = $tr.children("td, th");
      if ($cells.length === 1 && $cells.find("table").length > 0) { isLayout = true; return; }
      const cells: string[] = [];
      const cellLinks: (string | null)[] = [];
      $cells.each((_, c) => {
        const $c = $(c);
        cells.push(norm($c.text()));
        const a = $c.find("a[href]").first();
        cellLinks.push(a.length ? resolveHref(a.attr("href") || "", url) : null);
      });
      const firstAnchor = $tr.find("a[href]").first();
      const link = firstAnchor.length ? resolveHref(firstAnchor.attr("href") || "", url) : null;
      grid.push({ cells, cellLinks, link, hasTh: $cells.filter("th").length > 0 });
    });
    if (isLayout || grid.length === 0) return;

    const first = grid[0];
    const colCount = Math.max(...grid.map((r) => r.cells.length));
    let headers: string[] = [];
    let dataRows = grid;
    if (first.hasTh) { headers = first.cells; dataRows = grid.slice(1); }
    const hasHeader = headers.length > 0;
    // A data table: headed with at least one row, or a plain grid of >= 2 x 2.
    const isData = (hasHeader && dataRows.length >= 1) || (dataRows.length >= 2 && colCount >= 2);
    if (!isData) return;

    const kept = dataRows.filter((r) => r.cells.some((c) => c.length > 0));
    const rows = kept.map((r) => r.cells);
    const rowLinks = kept.map((r) => r.link);
    const cellLinks = kept.map((r) => r.cellLinks);
    if (rows.length === 0) return;
    const table: PortalTable = { headers, rows, rowLinks, cellLinks };
    const signature = JSON.stringify(table);
    if (seen.has(signature)) return;
    seen.add(signature);
    tables.push(table);
  });

  const links: { text: string; href: string }[] = [];
  const seenLinks = new Set<string>();
  $("a[href]").each((_, a) => {
    const resolved = resolveHref($(a).attr("href") || "", url);
    if (!resolved) return;
    const key = resolved;
    if (seenLinks.has(key)) return;
    seenLinks.add(key);
    links.push({ text: norm($(a).text()), href: resolved });
  });

  const text = norm($("body").text()).slice(0, 8000);
  return { url, title, headings, tables, links, text };
}

export function extractHiddenFields(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name"); if (name) fields[name] = $(el).attr("value") || "";
  });
  return fields;
}

export interface FormSelect {
  name: string;
  options: { value: string; label: string; selected: boolean }[];
  selectedValue: string;
}
export interface WebFormInfo {
  action: string;
  fields: Record<string, string>;
  selects: FormSelect[];
  /** Names usable as __EVENTTARGET for a search/show-style postback. */
  buttons: string[];
}

const SEMESTER_RE = /semester|session|term/i;
const BUTTON_RE = /search|show|view|load|get|display|btn/i;

/** Analyze the first WebForms <form> on a page so the client can replay it as a postback. */
export function analyzeWebForm(html: string, pageUrl: string): WebFormInfo | null {
  const $ = cheerio.load(html);
  const form = $("form").first();
  if (!form.length) return null;
  const actionAttr = form.attr("action") || pageUrl;
  let action = pageUrl;
  try { action = new URL(actionAttr, pageUrl).toString(); } catch { /* keep pageUrl */ }

  const fields: Record<string, string> = {};
  form.find('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name"); if (name) fields[name] = $(el).attr("value") || "";
  });
  form.find('input[type="text"], input:not([type])').each((_, el) => {
    const name = $(el).attr("name"); if (name && fields[name] === undefined) fields[name] = $(el).attr("value") || "";
  });
  form.find('input[type="checkbox"]:checked, input[type="radio"]:checked').each((_, el) => {
    const name = $(el).attr("name"); if (name) fields[name] = $(el).attr("value") || "on";
  });

  const selects: FormSelect[] = [];
  form.find("select").each((_, el) => {
    const name = $(el).attr("name"); if (!name) return;
    const options: FormSelect["options"] = [];
    $(el).find("option").each((_, op) => {
      options.push({ value: $(op).attr("value") ?? norm($(op).text()), label: norm($(op).text()), selected: $(op).attr("selected") !== undefined });
    });
    const selected = options.find((o) => o.selected) || options[0];
    selects.push({ name, options, selectedValue: selected ? selected.value : "" });
    fields[name] = selected ? selected.value : "";
  });

  const buttons: string[] = [];
  form.find('input[type="submit"], input[type="image"], button').each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("id") || "";
    if (name) buttons.push(name.replace(/_/g, "$"));
  });
  // Anchor-based postback buttons (Aspire LinkButtons render as <a href="javascript:__doPostBack('name','')">)
  $('a[href*="__doPostBack"]').each((_, el) => {
    const m = ($(el).attr("href") || "").match(/__doPostBack\('([^']+)'/);
    if (m) buttons.push(m[1]);
  });

  return { action, fields, selects, buttons: [...new Set(buttons)] };
}

export function isSemesterSelect(sel: FormSelect): boolean {
  return SEMESTER_RE.test(sel.name);
}
export function pickSemesterValue(sel: FormSelect): string {
  const usable = sel.options.filter((o) => o.value !== "" && o.value !== "0" && o.value !== "-1");
  if (usable.length === 0) return sel.selectedValue;
  const selected = usable.find((o) => o.selected);
  if (selected) return selected.value;
  return usable[usable.length - 1].value;
}
export function pickActionButton(info: WebFormInfo): string | null {
  const scored = info.buttons
    .map((b) => ({ b, score: /btn(search|show|view|load)/i.test(b) ? 3 : /search|show|view|load/i.test(b) ? 2 : BUTTON_RE.test(b) ? 1 : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score);
  return scored.length ? scored[0].b : null;
}

/**
 * The CMS TimeTable page has no HTML table: the schedule is JSON in the
 * hidden field `BodyPH_hfCalendarJson` (HTML-escaped in the source; cheerio
 * hands us the attribute entity-decoded). Returns the parsed object or null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCalendarJson(html: string): Record<string, any> | null {
  const $ = cheerio.load(html);
  const el = $('input[id$="hfCalendarJson"], input[name$="hfCalendarJson"]').first();
  const raw = el.attr("value");
  if (!raw) return null;
  const attempts = [
    raw,
    raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
    raw.replace(/\\"/g, '"')
  ];
  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* try the next unescaping */ }
  }
  return null;
}

export function extractErrorText(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates = [
    norm($('[id*="lblError"], [id*="lblMessage"], [class*="error"], [class*="alert"], .text-danger').first().text()),
    (($("body").text().match(/(invalid[^.]*|incorrect[^.]*|login failed[^.]*)/i)?.[0] || "")).trim()
  ];
  return candidates.find((c) => c && c.length > 2) || null;
}

export function extractStudentName(html: string): string | undefined {
  const $ = cheerio.load(html);
  const labelled = norm($('[id*="lblStudentName"], [id*="lblName"], [id*="StudentName"], [class*="user-name"], [class*="username"]').first().text());
  if (labelled && labelled.length >= 3 && labelled.length <= 60 && !/logout|welcome/i.test(labelled)) return labelled;
  const text = norm($("body").text());
  const m = text.match(/welcome[, ]+([A-Z][A-Za-z .]{2,40})/i) || text.match(/student name[:\s]+([A-Z][A-Za-z .]{2,40})/i);
  return m?.[1]?.trim();
}
