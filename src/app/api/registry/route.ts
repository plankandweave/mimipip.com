import { supabaseServerAuth } from "@/lib/auth-server";
import {
  ensureRegistry,
  createRegistry,
  updateRegistry,
  addItem,
  itemAction,
  registryView,
  validCode,
} from "@/brand/registry/service";
import type { Env } from "@/brand/commerce/checkout";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
async function owner() {
  const auth = await supabaseServerAuth();
  const { data, error } = await auth.auth.getUser();
  return !error && data.user?.email_confirmed_at ? data.user.id : null;
}
async function database() {
  const { env } = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
    env: Env;
  };
  if (!env.DB) throw Error("Registry service is temporarily unavailable.");
  await ensureRegistry(env.DB);
  return env.DB;
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      code = url.searchParams.get("code"),
      manage = url.searchParams.get("manage") === "1";
    const user = manage || !code ? await owner() : null;
    if ((manage || !code) && !user)
      return json({ error: "Please sign in to manage your registries." }, 401);
    if (code && !validCode(code))
      return json({ error: "Registry not found." }, 404);
    const db = await database();
    if (code) {
      const view = await registryView(db, code, user ?? undefined);
      if (!view || (manage && !view.isOwner))
        return json({ error: "Registry not found." }, 404);
      return json(view);
    }
    const rows = await db
      .prepare(
        "SELECT id AS code,title,kind,occasion,closed FROM mimipip_registries WHERE owner_id=? ORDER BY created_at DESC",
      )
      .bind(user)
      .all();
    return json({ registries: rows.results });
  } catch {
    return json(
      { error: "Your registry could not be loaded. Please try again." },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON required." }, 415);
  try {
    const user = await owner();
    if (!user)
      return json({ error: "Please sign in to manage your registries." }, 401);
    const text = await request.text();
    if (text.length > 32768)
      return json({ error: "This selection is too large." }, 413);
    const b = JSON.parse(text),
      db = await database();
    if (b.action === "create")
      return json({ code: await createRegistry(db, user, b.registry) }, 201);
    if (!validCode(b.code ?? ""))
      return json({ error: "Registry not found." }, 404);
    if (b.action === "update")
      await updateRegistry(db, b.code, user, b.registry);
    else if (b.action === "add") await addItem(db, b.code, user, b.selection);
    else if (
      ["remove", "favourite"].includes(b.action) &&
      validCode(b.itemId ?? "")
    )
      await itemAction(db, b.code, user, b.itemId, b.action, b.value === true);
    else return json({ error: "Choose a registry action." }, 400);
    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return json(
      {
        error: message.includes("registry_gift_reserved")
          ? "This gift is already purchased or being checked out and cannot be removed."
          : message.startsWith("[")
            ? "Check the registry fields and delivery details."
            : message.includes("D1") || message.includes("SQL")
              ? "Your change could not be saved. Please try again."
              : message || "Your change could not be saved.",
      },
      400,
    );
  }
}
