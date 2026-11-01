import { NextResponse } from "next/server";
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendOutreachDecision, type OutreachAI } from "@/lib/outreach";

export const runtime = "nodejs";

// Approve or decline an inbound collab/press inquiry. The unguessable token IS
// the capability — it only ever travels in the founder's dossier email. The
// RPC is idempotent, so a second click can never send the reply twice: it
// comes back with already=true and we skip the send.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  const approve = body?.approve === true;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("outreach_decide_by_token", {
    p_token: token,
    p_approve: approve,
  });
  if (error) {
    console.error("[outreach] decide failed:", error.message);
    return NextResponse.json({ error: "decide_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const row = data as {
    already: boolean;
    kind: string;
    name: string;
    email: string;
    reference: string;
    status: string;
    ai: OutreachAI | null;
  };

  if (!row.already) {
    after(() =>
      sendOutreachDecision({
        kind: row.kind,
        name: row.name,
        email: row.email,
        reference: row.reference,
        ai: row.ai,
        approved: approve,
      }).catch((e) => console.error("[outreach] reply send failed:", e)),
    );
  }

  return NextResponse.json({ status: row.status, already: row.already });
}
