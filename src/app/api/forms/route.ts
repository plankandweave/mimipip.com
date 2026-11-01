import { istDateKey } from "@/lib/ist";
import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { recordCommercialEvent, visitorTokenOf } from "@/lib/server-events";
import { TASTE_COOKIE } from "@/lib/taste";
import { autoSubscribe } from "@/lib/subscribe";
import { fileContactLead } from "@/lib/lead-intake";

// One function for the simple form submissions (Hobby-plan function budget):
// newsletter signup, contact message, and sample request. Dispatched by `type`.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.type) return NextResponse.json({ error: "missing_type" }, { status: 400 });
  const email = (body.email ?? "").trim();

  const store = await cookies();
  const visitorToken = visitorTokenOf(store.get(TASTE_COOKIE)?.value);

  /**
   * A lead is a hop in the chain the whole package exists to make traversable:
   * visitor -> session -> lead -> customer -> order. Recorded as a server event
   * rather than left as a side effect of a form insert, because otherwise the
   * step where an anonymous visit becomes a named person is the one step with no
   * record of the visit attached.
   *
   * The email is deliberately NOT on the event. It is already in the table the
   * form writes to, where it belongs; the event stream stays anonymous and
   * carries the token, which is what the chain actually needs.
   */
  const lead = (kind: string) =>
    after(() =>
      recordCommercialEvent({
        event: "lead_captured",
        subject: `${kind}:${visitorToken ?? "anon"}:${istDateKey()}`,
        token: visitorToken,
        handle: typeof body.productHandle === "string" ? body.productHandle : null,
        meta: { kind, source: body.source ?? null },
      }),
    );

  if (body.type === "newsletter") {
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    const { error } = await supabase.rpc("subscribe_newsletter", { p_email: email, p_source: body.source ?? "footer" });
    if (error) return NextResponse.json({ error: "internal" }, { status: 500 });
    lead("newsletter");
    return NextResponse.json({ ok: true });
  }

  if (body.type === "contact") {
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    if (!body.message || String(body.message).trim().length < 2) {
      return NextResponse.json({ error: "empty_message" }, { status: 400 });
    }
    const { error } = await supabase.rpc("submit_contact", {
      p_name: body.name ?? null, p_email: email, p_message: String(body.message), p_topic: body.topic ?? null,
    });
    if (error) return NextResponse.json({ error: "internal" }, { status: 500 });
    lead("contact");
    // Every contact form carries the subscribe line (SubscribeDisclosure).
    after(() => autoSubscribe(email, `contact:${String(body.source ?? "form").slice(0, 40)}`));
    // A person asked to be contacted: a CRM task due today and a mail to the
    // team, the moment it arrives (7 October 2026: "plz call back" from an
    // architect sat in contact_messages for three weeks, outside the CRM).
    after(() => fileContactLead({
      name: typeof body.name === "string" ? body.name : null,
      email,
      phone: typeof body.phone === "string" ? body.phone : null,
      message: String(body.message),
      topic: typeof body.topic === "string" ? body.topic : null,
      source: typeof body.source === "string" ? body.source : "contact-form",
    }));
    return NextResponse.json({ ok: true });
  }

  if (body.type === "samples") {
    const materials: string[] = Array.isArray(body.materials) ? body.materials : [];
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    if (materials.length === 0) return NextResponse.json({ error: "no_materials" }, { status: 400 });
    const { error } = await supabase.rpc("request_samples", {
      p_email: email, p_name: body.name ?? null, p_phone: body.phone ?? null,
      p_materials: materials, p_product_handle: body.productHandle ?? null, p_address: body.address ?? null,
    });
    if (error) return NextResponse.json({ error: "internal" }, { status: 500 });
    lead("samples");
    after(() => autoSubscribe(email, "samples"));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_type" }, { status: 400 });
}
