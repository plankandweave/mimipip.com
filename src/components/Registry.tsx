"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { AuthModal } from "./AuthModal";
import { loadRazorpay } from "@/lib/load-razorpay";
import {
  registryMoney,
  type RegistryView,
  type RegistryItem,
  type Delivery,
} from "@/brand/registry/types";
const field =
  "w-full min-h-12 rounded-xl border border-edge bg-white px-3 py-2";
export async function registryApi(body: unknown) {
  const r = await fetch("/api/registry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Please try again.");
  return d;
}
async function readRegistry(query: string) {
  const r = await fetch("/api/registry" + query, { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Please try again.");
  return d;
}
export function RegistryHome() {
  const [code, setCode] = useState(""),
    [error, setError] = useState("");
  return (
    <main className="container-x max-w-6xl py-12">
      <div className="mx-auto max-w-2xl text-center">
        <p className="caps text-slate">Mimi Pip Registry</p>
        <h1 className="mt-4 text-4xl md:text-5xl">
          Little wishes.
          <br />
          Lovely gifts.
        </h1>
        <p className="mt-5 text-lg">
          Choose the things you love for their little world. Share your wishes
          with the people who love them.
        </p>
        <Link
          href="/registry/manage"
          className="mt-5 inline-block underline underline-offset-4"
        >
          Manage my registries →
        </Link>
      </div>
      <div className="my-10 grid gap-6 md:grid-cols-2">
        {[
          {
            kind: "baby",
            title: "Baby Registry",
            text: "A little world, ready to welcome them. Bring together your favourite nursery designs for a baby shower or a new arrival.",
            colour: "#e8f0f2",
            symbol: "A little hello",
          },
          {
            kind: "gift",
            title: "Gift Registry",
            text: "Birthdays, a first big-kid room, and all the moments in between. Make a wish list that feels just like them.",
            colour: "#fbebe3",
            symbol: "Something to celebrate",
          },
        ].map((c) => (
          <section
            key={c.kind}
            className="overflow-hidden rounded-3xl border border-edge"
          >
            <img
              src={
                c.kind === "baby"
                  ? "/nursery-worlds/03-bear-and-bee-meadow-room-v2.webp"
                  : "/feed-images/birthday-banner.jpg"
              }
              alt={
                c.kind === "baby"
                  ? "A warm nursery with a bear and meadow wall design"
                  : "Children celebrating a birthday in an illustrated garden"
              }
              width={1671}
              height={941}
              className="aspect-video w-full object-cover"
            />
            <div className="p-7">
              <h2 className="text-3xl">{c.title}</h2>
              <p className="my-4 leading-relaxed">{c.text}</p>
              <Link
                className="btn btn-primary"
                href={"/registry/manage?new=" + c.kind}
              >
                Create a {c.kind === "baby" ? "baby" : "gift"} registry
              </Link>
              {c.kind === "gift" && (
                <p className="mt-3 text-sm">
                  Birthday · New room · Family celebration · Just because
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      <section className="mx-auto max-w-xl rounded-3xl bg-wash p-6">
        <h2 className="text-2xl">Find a registry</h2>
        <p className="my-3">
          Enter the registry code or paste the link shared with you.
        </p>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const match = code
              .trim()
              .match(/(?:^|\/)([a-f0-9]{32})(?:[/?#]|$)/);
            if (!match) {
              setError("Check the code or link and try again.");
              return;
            }
            window.location.assign("/registry/" + match[1]);
          }}
        >
          <label className="grid gap-2">
            Registry code or link
            <input
              className={field}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary">Find registry</button>
          <p role="status">{error}</p>
        </form>
      </section>
      <div className="my-12 grid gap-6 md:grid-cols-3">
        {[
          [
            "Choose your favourites",
            "Save the exact designs and sizes you would love.",
          ],
          [
            "Share your wishes",
            "Send your private registry link to family and friends.",
          ],
          [
            "Celebrate together",
            "Guests choose a gift. Purchased gifts are counted for you.",
          ],
        ].map(([title, text], i) => (
          <div key={title}>
            <p className="caps text-slate">0{i + 1}</p>
            <h2 className="my-2 text-xl">{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <p className="text-center">
        Prefer to let them choose?{" "}
        <Link className="underline" href="/gift-card">
          Give a personalised gift card.
        </Link>
      </p>
    </main>
  );
}
const emptyDelivery: Delivery = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postcode: "",
  countryCode: "IN",
};
export function RegistryManager() {
  const { session } = useAuth();
  return <RegistryManagerInner key={session?.user?.id ?? "guest"} />;
}
function RegistryManagerInner() {
  const { session, loading } = useAuth();
  const [auth, setAuth] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [list, setList] = useState<
      { code: string; title: string; closed: boolean }[]
    >([]),
    [current, setCurrent] = useState<RegistryView | null>(null),
    [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    kind: "baby" as "baby" | "gift",
    occasion: "Baby shower",
    eventDate: "",
    message: "",
    delivery: emptyDelivery,
    closed: false,
  });
  async function refresh() {
    const d = await readRegistry("");
    setList(d.registries);
  }
  useEffect(() => {
    if (!session) return;
    let active = true;
    readRegistry("")
      .then((d) => {
        if (active) setList(d.registries);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    const kind = new URLSearchParams(location.search).get("new");
    if (kind === "baby" || kind === "gift") {
      setDraft((d) => ({
        ...d,
        kind,
        occasion: kind === "baby" ? "Baby shower" : "Birthday",
      }));
      setEditing(true);
    }
  }, []);
  async function open(code: string) {
    setError("");
    setBusy(true);
    try {
      const d = await readRegistry("?manage=1&code=" + code);
      setCurrent(d);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const changeKind = (kind: "baby" | "gift") =>
    setDraft({
      ...draft,
      kind,
      occasion: kind === "baby" ? "Baby shower" : "Birthday",
    });
  const label = (
    key: "title" | "eventDate" | "message",
    name: string,
    type = "text",
  ) => (
    <label className="grid gap-2">
      {name}
      <input
        className={field}
        type={type}
        maxLength={key === "message" ? 500 : 100}
        required={key === "title"}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <main className="container-x max-w-4xl py-10">
      <Link href="/registry" className="underline">
        ← Mimi Pip Registry
      </Link>
      <h1 className="my-5 text-3xl">Your registries</h1>
      {loading ? (
        <p>Loading your account…</p>
      ) : !session ? (
        <section className="rounded-2xl bg-wash p-6">
          <p>Sign in to create a registry and keep your wishes together.</p>
          <button className="btn mt-4" onClick={() => setAuth(true)}>
            Sign in
          </button>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {list.map((r) => (
              <button
                className="btn border border-edge"
                disabled={busy}
                key={r.code}
                onClick={() => open(r.code)}
              >
                {r.title}
                {r.closed ? " · Closed" : ""}
              </button>
            ))}
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setCurrent(null);
                setDraft({
                  title: "",
                  kind: "baby",
                  occasion: "Baby shower",
                  eventDate: "",
                  message: "",
                  delivery: emptyDelivery,
                  closed: false,
                });
                setEditing(true);
              }}
            >
              Create a registry
            </button>
          </div>
          {editing && (
            <form
              className="my-8 grid gap-5 rounded-3xl border border-edge p-5 md:p-8"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const d = await registryApi({
                    action: current ? "update" : "create",
                    ...(current ? { code: current.code } : {}),
                    registry: draft,
                  });
                  await refresh();
                  await open(current?.code ?? d.code);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 className="text-2xl">
                {current ? "Edit your registry" : "Make it yours"}
              </h2>
              <label className="grid gap-2">
                Registry type
                <select
                  className={field}
                  value={draft.kind}
                  onChange={(e) =>
                    changeKind(e.target.value as "baby" | "gift")
                  }
                >
                  <option value="baby">Baby Registry</option>
                  <option value="gift">Gift Registry</option>
                </select>
              </label>
              <label className="grid gap-2">
                Occasion
                <select
                  className={field}
                  value={draft.occasion}
                  onChange={(e) =>
                    setDraft({ ...draft, occasion: e.target.value })
                  }
                >
                  {(draft.kind === "baby"
                    ? ["Baby shower", "Welcome baby"]
                    : [
                        "Birthday",
                        "A new room",
                        "Family celebration",
                        "Just because",
                      ]
                  ).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              {label(
                "title",
                "Registry title, for example “Tara’s Birthday Registry”",
              )}
              {label("eventDate", "Celebration date (optional)", "date")}
              {label("message", "A welcome message (optional)")}
              <h3 className="mt-4 text-xl">Where should gifts arrive?</h3>
              <p>
                These delivery details are private. Guests see your chosen
                gifts, title, message and celebration date.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries({
                  name: "Recipient name",
                  email: "Recipient email",
                  phone: "Delivery phone",
                  address: "Street address",
                  city: "City",
                  state: "State",
                  postcode: "Postal code",
                }).map(([key, name]) => (
                  <label
                    key={key}
                    className={
                      "grid gap-2 " + (key === "address" ? "sm:col-span-2" : "")
                    }
                  >
                    {name}
                    <input
                      className={field}
                      required
                      maxLength={key === "address" ? 500 : 254}
                      type={
                        key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                      }
                      value={draft.delivery[key as keyof Delivery]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          delivery: {
                            ...draft.delivery,
                            [key]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <label className="grid gap-2">
                  Delivery country
                  <select
                    className={field}
                    value={draft.delivery.countryCode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        delivery: {
                          ...draft.delivery,
                          countryCode: e.target.value as "IN" | "US",
                        },
                      })
                    }
                  >
                    <option value="IN">India</option>
                    <option value="US">United States</option>
                  </select>
                </label>
              </div>
              {current && (
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={draft.closed}
                    onChange={(e) =>
                      setDraft({ ...draft, closed: e.target.checked })
                    }
                  />
                  Close registry to new purchases
                </label>
              )}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save registry"}
              </button>
            </form>
          )}
          {current && !editing && (
            <section className="my-8 space-y-5">
              <h2 className="text-2xl">{current.title}</h2>
              <ShareRegistry code={current.code} />
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn border border-edge"
                  onClick={() => {
                    setDraft({
                      title: current.title,
                      kind: current.kind,
                      occasion: current.occasion,
                      eventDate: current.eventDate,
                      message: current.message,
                      delivery: current.delivery!,
                      closed: current.closed,
                    });
                    setEditing(true);
                  }}
                >
                  Edit details
                </button>
                <Link className="btn" href={"/registry/" + current.code}>
                  Guest view
                </Link>
                <Link className="btn btn-primary" href="/browse/collection">
                  Choose gifts
                </Link>
                <Link className="btn" href="/cart">
                  Add saved cart selections
                </Link>
              </div>
              <p>
                Choose a design and size, then use “Add to registry”. You can
                also save selections from your cart. Your list is available only
                to people with its link.
              </p>
              {!current.items.length && (
                <p className="rounded-xl bg-wash p-5">
                  Your wish list is ready for its first gift.
                </p>
              )}
              {current.items.map((i) => (
                <article
                  key={i.id}
                  className="rounded-2xl border border-edge p-5"
                >
                  <h3 className="text-xl">{i.name}</h3>
                  <p>
                    {i.size} · {i.purchased} of {i.quantity} purchased
                    {i.held ? ` · ${i.held} being checked out` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await registryApi({
                            action: "favourite",
                            code: current.code,
                            itemId: i.id,
                            value: !i.favourite,
                          });
                          await open(current.code);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {i.favourite ? "Unmark most wanted" : "Mark most wanted"}
                    </button>
                    <button
                      className="btn"
                      disabled={busy || i.purchased + i.held > 0}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await registryApi({
                            action: "remove",
                            code: current.code,
                            itemId: i.id,
                          });
                          await open(current.code);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
              <h3 className="text-2xl">Gifts & thank-yous</h3>
              {!current.thanks?.length ? (
                <p>
                  Gift messages will appear here when a purchase is confirmed.
                </p>
              ) : (
                current.thanks.map((t) => (
                  <div key={t.order} className="rounded-xl bg-wash p-5">
                    <p className="font-bold">From {t.name}</p>
                    <p className="whitespace-pre-wrap">{t.message}</p>
                    <p className="text-sm">
                      {t.email} · {t.order}
                    </p>
                  </div>
                ))
              )}
            </section>
          )}
        </>
      )}
      <p role="status" className="my-4">
        {error}
      </p>
      <AuthModal
        open={auth}
        onClose={() => setAuth(false)}
        onSuccess={() => setAuth(false)}
      />
    </main>
  );
}
export function ShareRegistry({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  const url = "https://mimipip.com/registry/" + code;
  return (
    <div className="rounded-2xl bg-wash p-5">
      <p className="break-all text-sm">{url}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Link copied.");
            } catch {
              setMessage("Select and copy the link above.");
            }
          }}
        >
          Copy link
        </button>
        <a
          className="btn"
          href={
            "https://wa.me/?text=" +
            encodeURIComponent("Our Mimi Pip wish list: " + url)
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          Share on WhatsApp
        </a>
        <a
          className="btn"
          href={
            "mailto:?subject=Our%20Mimi%20Pip%20registry&body=" +
            encodeURIComponent(url)
          }
        >
          Share by email
        </a>
        <a
          className="btn"
          href={"/api/registry/qr?code=" + code}
          download="mimi-pip-registry-qr.svg"
        >
          Download QR code
        </a>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
export function RegistryGuest({ code }: { code: string }) {
  const [registry, setRegistry] = useState<RegistryView | null>(null),
    [error, setError] = useState(""),
    [chosen, setChosen] = useState<RegistryItem | null>(null),
    [filter, setFilter] = useState("all"),
    [savedItems, setSavedItems] = useState<string[]>([]);
  useEffect(() => {
    if (!registry) return;
    setSavedItems(
      registry.items
        .filter((i) => {
          try {
            return !!sessionStorage.getItem(
              "mimipip-registry-payment:" + code + ":" + i.id,
            );
          } catch {
            return false;
          }
        })
        .map((i) => i.id),
    );
  }, [registry, code]);
  async function refresh() {
    try {
      setRegistry(await readRegistry("?code=" + code));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    readRegistry("?code=" + code)
      .then((d) => {
        if (active) setRegistry(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [code]);
  if (!registry)
    return (
      <main className="container-x py-12">
        <p role="status">{error || "Opening this wish list…"}</p>
        <Link className="underline" href="/registry">
          Find another registry
        </Link>
      </main>
    );
  return (
    <main className="container-x max-w-5xl py-10">
      <Link href="/registry" className="underline">
        Mimi Pip Registry
      </Link>
      <header className="my-6 rounded-3xl bg-wash px-6 py-10 text-center">
        <p className="caps">
          {registry.kind === "baby"
            ? "Baby Registry"
            : registry.occasion === "Birthday"
              ? "Birthday Registry"
              : "Gift Registry"}
        </p>
        <h1 className="my-4 text-4xl">{registry.title}</h1>
        {registry.eventDate && (
          <p>
            {new Date(registry.eventDate + "T12:00:00").toLocaleDateString(
              "en-IN",
              { day: "numeric", month: "long", year: "numeric" },
            )}
          </p>
        )}
        <p className="mx-auto mt-4 max-w-xl whitespace-pre-wrap">
          {registry.message}
        </p>
      </header>
      {registry.closed ? (
        <p className="rounded-xl bg-wash p-5">
          This registry is closed to new gifts. Thank you for being part of the
          celebration.
        </p>
      ) : (
        <p className="my-5">
          Choose something they love. We’ll deliver it to their private delivery
          address in{" "}
          {registry.countryCode === "IN" ? "India" : "the United States"}.
        </p>
      )}
      {chosen ? (
        <GiftPurchase
          code={code}
          item={chosen}
          onBack={() => {
            setChosen(null);
            void refresh();
          }}
        />
      ) : (
        <>
          <label className="mb-5 flex flex-wrap items-center gap-3">
            Show gifts
            <select
              className={field + " max-w-xs"}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All gifts</option>
              <option value="available">Still wanted</option>
              <option value="favourite">Most wanted</option>
              <option value="budget">
                {registry.countryCode === "IN" ? "Under ₹5,000" : "Under $100"}
              </option>
            </select>
          </label>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {registry.items
              .filter(
                (i) =>
                  filter === "all" ||
                  (filter === "available" && i.remaining > 0) ||
                  (filter === "favourite" && i.favourite) ||
                  (filter === "budget" &&
                    (i.amountMinor ?? Infinity) <
                      (registry.countryCode === "IN" ? 500000 : 10000)),
              )
              .map((i) => (
                <article
                  className="overflow-hidden rounded-2xl border border-edge"
                  key={i.id}
                >
                  {i.image && (
                    <img
                      src={i.image}
                      alt={i.name}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <div className="p-5">
                    {i.favourite && <p className="caps mb-2">Most wanted</p>}
                    <h2 className="text-xl">{i.name}</h2>
                    <p className="my-2 text-sm">{i.size}</p>
                    <p className="font-semibold">
                      {i.amountMinor != null &&
                        registryMoney(i.currency!, i.amountMinor)}
                    </p>
                    <p className="my-2 text-sm">
                      {i.purchased} of {i.quantity} purchased
                      {i.held ? ` · ${i.held} being checked out` : ""}
                    </p>
                    {savedItems.includes(i.id) ? (
                      <button
                        className="btn mt-2 w-full"
                        onClick={() => setChosen(i)}
                      >
                        Check your gift payment
                      </button>
                    ) : i.unavailable ? (
                      <p>Temporarily unavailable</p>
                    ) : i.remaining > 0 && !registry.closed ? (
                      <button
                        className="btn btn-primary mt-2 w-full"
                        onClick={() => setChosen(i)}
                      >
                        Give this gift
                      </button>
                    ) : (
                      <p>
                        {i.purchased >= i.quantity
                          ? "Gifted with love"
                          : registry.closed
                            ? "Registry closed"
                            : "Being checked out"}
                      </p>
                    )}
                  </div>
                </article>
              ))}
          </div>
          {!registry.items.length && (
            <p className="py-8">
              This wish list is still being put together. Please visit again
              soon.
            </p>
          )}
        </>
      )}
      <p className="mt-8 text-sm">
        Gifts are purchased one at a time. Delivery is included; destination
        duties may apply for US deliveries.{" "}
        <Link href="/guides/shipping-returns" className="underline">
          Delivery & returns
        </Link>
      </p>
    </main>
  );
}
function GiftPurchase({
  code,
  item,
  onBack,
}: {
  code: string;
  item: RegistryItem;
  onBack: () => void;
}) {
  const key = "mimipip-registry-payment:" + code + ":" + item.id;
  const [form, setForm] = useState({ name: "", email: "", message: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [paid, setPaid] = useState(""),
    [pending, setPending] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    fetch("/api/checkout/readiness")
      .then((r) => r.json())
      .then((d) => setReady(d.open === true))
      .catch(() => setReady(false));
    try {
      const s = sessionStorage.getItem(key);
      if (s) {
        const v = JSON.parse(s);
        setForm(v.form);
        setPending(true);
      }
    } catch {
      setError(
        "Your saved payment could not be read. Contact hello@mimipip.com if you were charged.",
      );
    }
  }, [key]);
  async function post(action: string, body: unknown) {
    const r = await fetch("/api/checkout/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    return d;
  }
  async function check() {
    setBusy(true);
    setError("");
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!saved) throw Error("No payment to check.");
      const d = await post("status", { token: saved.token });
      if (d.paid) {
        setPaid(d.orderNumber);
        sessionStorage.removeItem(key);
      } else {
        setError(d.message);
        if (d.status === "expired") setExpired(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (busy || ready !== true) return;
    setBusy(true);
    setError("");
    try {
      const existing = JSON.parse(sessionStorage.getItem(key) || "null");
      const token =
        existing?.token ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
      const fields = existing?.form ?? form;
      const registry = { code, itemId: item.id, ...fields };
      const q = await post("quote", { registry });
      if (q.totalMinor !== item.amountMinor || q.currency !== item.currency)
        throw Error(
          "The price has changed. Return to the registry to see the current price before paying.",
        );
      sessionStorage.setItem(key, JSON.stringify({ token, form: fields }));
      setPending(true);
      const d = await post("create", { token, registry });
      if (d.paid) {
        await check();
        return;
      }
      if (!(await loadRazorpay()))
        throw Error("The payment window could not load. Please try again.");
      const widget = new (window as any).Razorpay({
        key: d.keyId,
        order_id: d.orderId,
        amount: d.amount,
        currency: d.currency,
        name: "Mimi Pip",
        description: "A gift from " + fields.name,
        prefill: { name: fields.name, email: fields.email },
        theme: { color: "#714414" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: unknown) => {
          try {
            await post("verify", { token, ...(r as object) });
          } catch {
            /* Status independently verifies the capture. */
          }
          await check();
        },
      });
      widget.on("payment.failed", () => {
        setError(
          "Payment was not confirmed. If charged, check payment before trying again.",
        );
        setBusy(false);
      });
      widget.open();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-edge p-6">
      <button className="underline" onClick={onBack} disabled={busy}>
        ← Back to the wish list
      </button>
      {paid ? (
        <>
          <h2 className="my-4 text-2xl">A lovely gift, on its way.</h2>
          <p>
            Your payment is confirmed. Order {paid}. The family can see your
            gift and message in their registry.
          </p>
        </>
      ) : (
        <form onSubmit={pay} className="mt-5 grid gap-4">
          <h2 className="text-2xl">Give {item.name}</h2>
          <p>{registryMoney(item.currency!, item.amountMinor!)} · Quantity 1</p>
          <p>The family’s delivery details stay private.</p>
          {(["name", "email", "message"] as const).map((k) => (
            <label className="grid gap-2" key={k}>
              {k === "name"
                ? "Your name"
                : k === "email"
                  ? "Your email"
                  : "Your gift message (optional)"}
              <input
                className={field}
                required={k !== "message"}
                type={k === "email" ? "email" : "text"}
                maxLength={k === "message" ? 500 : k === "email" ? 254 : 100}
                disabled={pending}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          <button className="btn btn-primary" disabled={busy || ready !== true}>
            {busy
              ? "Checking payment…"
              : pending
                ? "Resume payment"
                : "Pay & give this gift"}
          </button>
          {expired && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                sessionStorage.removeItem(key);
                onBack();
              }}
            >
              Return to choose a gift
            </button>
          )}
          {pending && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={check}
            >
              Check payment status
            </button>
          )}
          {ready === false && (
            <p>
              Payments are temporarily unavailable. Please come back shortly.
            </p>
          )}
          <p className="text-xs">
            By paying you accept our{" "}
            <Link href="/guides/shipping-returns" className="underline">
              delivery and returns
            </Link>{" "}
            and{" "}
            <Link href="/guides/terms" className="underline">
              terms
            </Link>
            .
          </p>
        </form>
      )}
      <p role="status" className="mt-4">
        {error}
      </p>
    </section>
  );
}
