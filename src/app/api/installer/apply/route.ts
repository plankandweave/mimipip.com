import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Installer applications. Media never passes through here — the browser uploads
// straight to the private `installer-apps` bucket (a liveness video would blow
// past Vercel's ~4.5MB request body cap), so this route only forwards the
// metadata + storage paths to the RPC, which owns all validation.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "server" }, { status: 400 });
  }

  // Honeypot: a real applicant never sees this field. Answer like a success so
  // the bot has nothing to tune against, and never touch the database.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, reference: "ZINS-0000" });
  }

  const { data, error } = await supabase.rpc("submit_installer_application", {
    p: {
      name: body.name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      city: body.city ?? null,
      pincode: body.pincode ?? null,
      yearsExperience: body.yearsExperience ?? null,
      aadhaar: body.aadhaar ?? null,
      pan: body.pan ?? null,
      workPhotos: Array.isArray(body.workPhotos) ? body.workPhotos : [],
      selfiePath: body.selfiePath ?? null,
      videoPath: body.videoPath ?? null,
      videoChallenge: body.videoChallenge ?? null,
      lang: body.lang === "hi" ? "hi" : "en",
      consent: body.consent === true,
    },
  });

  if (error) {
    console.error("[installer/apply] rpc failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }

  return NextResponse.json(data);
}
