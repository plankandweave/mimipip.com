import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import { staffKey } from "@/lib/staff-key";
import { parseContactRows, type ContactRow } from "@/lib/trade-contacts-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk import for the trade contact book (/admin/contacts).
 *
 * Accepts multipart form-data: `key` (admin key), `source` (where these
 * people were met — stamped on every row that doesn't name its own), and
 * `file` — an .xlsx or .csv straight out of whatever a show, a partner or a
 * business-card scanner produced. Column headers are matched loosely (see
 * parseContactRows) so nobody has to reformat a sheet to upload it.
 *
 * The browser could parse a CSV itself, but not an .xlsx without shipping a
 * spreadsheet library to the client, and the sheets that arrive are always
 * .xlsx. So the file comes here, exceljs (already a dependency for the
 * marketplace export) reads it, and the rows go to admin_trade_contacts_upsert,
 * which decides identity and never overwrites a hand-made correction.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const key = await staffKey(req);
  const { data: ok } = await supabase.rpc("admin_key_ok", { p_key: key });
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const source = String(form.get("source") ?? "").trim() || null;
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  let grid: string[][];
  try {
    grid = await readGrid(file);
  } catch (e) {
    return NextResponse.json({ error: "unreadable_file", detail: (e as Error).message }, { status: 400 });
  }

  const rows: ContactRow[] = parseContactRows(grid);
  if (rows.length === 0) {
    return NextResponse.json({ error: "no_rows", detail: "No rows with a name and a mobile or email were found." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_trade_contacts_upsert", {
    p_key: key,
    p_rows: rows,
    p_source: source,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, parsed: rows.length, result: data });
}

/** Every sheet of an .xlsx, or the single table of a .csv, as trimmed strings. */
async function readGrid(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const wb = new ExcelJS.Workbook();
  const grid: string[][] = [];

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = buf.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      grid.push(splitCsvLine(line));
    }
    return grid;
  }

  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // Every sheet, each with its own header row: the Design Mumbai file carried
  // two sheets with slightly different columns, and both had to load.
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map(cellText);
      if (vals.some((v) => v !== "")) grid.push(vals);
    });
    grid.push(["__sheet_break__"]);
  });
  return grid;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return cellText(o.result);
    if (o.hyperlink) return String(o.hyperlink).replace(/^mailto:/, "").trim();
  }
  return String(v).trim();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
