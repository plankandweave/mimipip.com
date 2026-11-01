// Turn a spreadsheet grid (any headers, any order, possibly several sheets)
// into the row shape admin_trade_contacts_upsert accepts. Pure, so it is
// testable without a file or a database.

export type ContactRow = {
  first_name: string;
  last_name?: string;
  kind?: string;
  firm?: string;
  designation?: string;
  city?: string;
  website?: string;
  mobile?: string;
  email?: string;
  source?: string;
  notes?: string;
};

type Field = keyof ContactRow | "title" | "name";

// Header aliases, lowercased and stripped of punctuation. First match wins.
const HEADERS: [Field, string[]][] = [
  ["first_name", ["first name", "firstname", "first", "given name"]],
  ["last_name", ["last name", "lastname", "last", "surname", "family name"]],
  ["name", ["name", "full name", "contact", "contact name", "person"]],
  ["mobile", ["mobile", "phone", "mobile no", "mobile number", "phone number", "whatsapp", "cell", "contact no", "number"]],
  ["email", ["email", "e mail", "email id", "email address", "mail"]],
  ["firm", ["company", "company name", "firm", "studio", "organisation", "organization", "practice"]],
  ["designation", ["designation", "role", "title", "position"]],
  ["city", ["city", "location", "town"]],
  ["website", ["website", "web", "url", "site"]],
  ["kind", ["kind", "type", "category", "profession"]],
  ["source", ["source", "event", "met at", "where met"]],
  ["notes", ["notes", "note", "remarks", "comment", "comments"]],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Does this row read as a header line? (≥2 recognised column names.) */
function headerMap(row: string[]): Map<number, Field> | null {
  const map = new Map<number, Field>();
  row.forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    for (const [field, aliases] of HEADERS) {
      if (aliases.includes(n) && ![...map.values()].includes(field)) { map.set(i, field); return; }
    }
  });
  return map.size >= 2 ? map : null;
}

const TITLE_PREFIX = /^(ar|ar\.|arch|arch\.|id|id\.|mr|mr\.|ms|ms\.|mrs|mrs\.|dr|dr\.|client|n)$/i;

export function parseContactRows(grid: string[][]): ContactRow[] {
  const out: ContactRow[] = [];
  let map: Map<number, Field> | null = null;
  // The Design Mumbai sheets had an unlabelled first column holding "Ar" /
  // "Client" / "n" — a title, not data. Remembered per header so it can
  // become `kind`.
  let titleCol: number | null = null;

  for (const row of grid) {
    if (row[0] === "__sheet_break__") { map = null; titleCol = null; continue; }
    const asHeader = headerMap(row);
    if (asHeader) {
      map = asHeader;
      titleCol = null;
      row.forEach((c, i) => { if (!map!.has(i) && norm(c) === "" && titleCol === null) titleCol = i; });
      continue;
    }
    if (!map) continue;

    const r: Partial<Record<Field, string>> = {};
    map.forEach((field, i) => { const v = (row[i] ?? "").trim(); if (v) r[field] = v; });
    if (titleCol !== null && row[titleCol]) r.title = row[titleCol].trim();

    // Split a single "name" column into first/last when the sheet has no split.
    let first = r.first_name ?? "";
    let last = r.last_name ?? "";
    if (!first && r.name) {
      const parts = r.name.split(/\s+/).filter((p) => !TITLE_PREFIX.test(p));
      first = parts.shift() ?? "";
      last = parts.join(" ");
    }
    first = first.replace(/^(ar|id|mr|ms|mrs|dr)\.?\s+/i, "").trim();
    if (!first) continue;

    const title = (r.title ?? "").toLowerCase().replace(/\./g, "");
    let kind = r.kind;
    if (!kind) {
      if (/^ar(ch)?$/.test(title)) kind = "architect";
      else if (title === "client") kind = "client";
    }

    // An email typed into the mobile column, or vice versa, still lands.
    let mobile = r.mobile;
    let email = r.email;
    if (mobile && mobile.includes("@") && !email) { email = mobile; mobile = undefined; }
    if (email && !email.includes("@") && /\d{10}/.test(email) && !mobile) { mobile = email; email = undefined; }

    const contact: ContactRow = { first_name: first };
    if (last) contact.last_name = last;
    if (kind) contact.kind = kind;
    if (r.firm) contact.firm = r.firm;
    if (r.designation) contact.designation = r.designation;
    if (r.city) contact.city = r.city;
    if (r.website) contact.website = r.website;
    if (mobile) contact.mobile = mobile.replace(/\.0$/, "");
    if (email) contact.email = email.replace(/\s+/g, "");
    if (r.source) contact.source = r.source;
    if (r.notes) contact.notes = r.notes;
    if (!contact.mobile && !contact.email) continue;
    out.push(contact);
  }
  return out;
}
