import * as cheerio from "cheerio";
import type { PortalPage, PortalTable } from "./types";

export function parsePortalPage(html: string, url: string): PortalPage {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const title = ($("title").first().text() || $("h1").first().text() || "").trim();
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => { const t = $(el).text().trim(); if (t) headings.push(t); });
  const tables: PortalTable[] = [];
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("tr").first().find("th, td").each((_, c) => { headers.push($(c).text().trim()); });
    const hasHeader = $(table).find("tr").first().find("th").length > 0;
    const rows: string[][] = [];
    $(table).find("tr").each((i, tr) => {
      if (i === 0 && hasHeader) return;
      const cells: string[] = [];
      $(tr).find("td, th").each((_, c) => { cells.push($(c).text().trim().replace(/\s+/g, " ")); });
      if (cells.some((c) => c.length > 0)) rows.push(cells);
    });
    if (rows.length > 0 || headers.length > 0) tables.push({ headers, rows });
  });
  const links: { text: string; href: string }[] = [];
  $("a[href]").each((_, a) => {
    const text = $(a).text().trim(); const href = $(a).attr("href") || "";
    if (href && !href.startsWith("javascript:") && href !== "#") links.push({ text, href });
  });
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
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

export function extractErrorText(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates = [
    $('[id*="lblError"], [id*="lblMessage"], [class*="error"], [class*="alert"], .text-danger').first().text().trim(),
    ($("body").text().match(/(invalid[^.]*|incorrect[^.]*|login failed[^.]*)/i)?.[0] || "").trim()
  ];
  return candidates.find((c) => c && c.length > 2) || null;
}

export function extractStudentName(html: string): string | undefined {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const m = text.match(/welcome[, ]+([A-Z][A-Za-z .]{2,40})/i) || text.match(/student name[:\s]+([A-Z][A-Za-z .]{2,40})/i);
  return m?.[1]?.trim();
}
