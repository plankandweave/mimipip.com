"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { signAdminUpload, putSigned, extOf } from "@/lib/signed-upload";
import { adminRpc } from "@/lib/admin-rpc";
import { StaffGate, useStaff } from "@/lib/use-staff";

// Upload artwork → draft design → review the flat → publish. The two-step
// shape is the catalogue rule made visible: nothing goes live until a human
// has looked at the flat image and confirmed it is clean pattern artwork.

const MAX_BYTES = 25 * 1024 * 1024;

// The vocabulary already in the catalogue — freeform stays possible, but
// picking from these keeps a new design findable in the existing collections.
const ROOM_TAGS = ["Living Room", "Bedroom", "Foyer", "Home Office", "Pooja Room", "Dining Room", "Kids Room"];
// "Murals" is gone: it was a product type, not a style, and offering it here
// would write back a tag the catalogue has just retired (migration 0137).
const STYLE_TAGS = ["Botanical", "Landscape", "Abstract", "Vintage", "Traditional", "Geometric", "Textured"];
const MOODS = ["Serene", "Regal", "Playful", "Dramatic", "Warm", "Fresh"];

type Design = {
  handle: string;
  title: string;
  status: string;
  description: string | null;
  flat_verified: boolean;
  created_at: string;
  flat_url: string | null;
  images: { url: string; is_flat: boolean }[];
  tags: string[];
  materials: { name: string; price: number }[];
};

type Material = { slug: string; name: string; default_price_per_sqft: number };

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Upload one file straight to storage (bypasses the ~4.5MB function body cap).
 *  Goes through a signed URL now: this page runs as `anon` as far as Supabase
 *  is concerned — Cloudflare Access gates the page, not the bucket — so the
 *  browser must not need write access of its own. The server picks the key,
 *  reading it from the staff sign-in rather than from anything sent here. */
async function uploadToStorage(file: File, folder: string): Promise<string> {
  const target = await signAdminUpload({
    kind: "admin-design",
    ext: extOf(file),
    folder,
  });
  return putSigned(target, file, file.type || "image/png");
}

function TagPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (t: string) => void;
}) {
  return (
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              className={`rounded-full px-3 py-1 text-[0.7rem] transition ${
                on ? "bg-charcoal text-surface" : "bg-wash text-slate hover:bg-lavender/40"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DesignUploader() {
  const staff = useStaff();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);

  // the form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [freeTags, setFreeTags] = useState("");
  const [matSlugs, setMatSlugs] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [flatFile, setFlatFile] = useState<File | null>(null);
  const [flatPreview, setFlatPreview] = useState<string | null>(null);
  const [lifestyleFiles, setLifestyleFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyHandle, setBusyHandle] = useState<string | null>(null);
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const flatInput = useRef<HTMLInputElement>(null);
  const lifeInput = useRef<HTMLInputElement>(null);

  // Swap in the local preview for a newly chosen flat, revoking the previous
  // object URL so repeated picks don't leak.
  const pickFlat = (f: File | null) => {
    setFlatFile(f);
    setFlatPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const load = useCallback(async () => {
    const [dRes, mRes] = await Promise.all([
      adminRpc("admin_list_designs"),
      supabaseBrowser.from("materials").select("slug,name,default_price_per_sqft").eq("active", true).order("position"),
    ]);
    if (dRes.error || dRes.data === null) {
      setError("Couldn't load the catalogue — you may be signed out.");
      return;
    }
    setError(null);
    setDesigns((dRes.data as Design[]) ?? []);
    const mats = (mRes.data as Material[]) ?? [];
    setMaterials(mats);
    setMatSlugs((cur) => (cur.length ? cur : mats.filter((m) => m.slug === "smooth-matt").map((m) => m.slug)));
  }, []);

  useEffect(() => {
    if (staff === "in") load();
  }, [staff, load]);

  const toggle = (list: string[], set: (v: string[]) => void, t: string) =>
    set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setTags([]);
    setFreeTags("");
    setPrice("");
    pickFlat(null);
    setLifestyleFiles([]);
    if (flatInput.current) flatInput.current.value = "";
    if (lifeInput.current) lifeInput.current.value = "";
  };

  const submit = async () => {
    setError(null);
    setNote(null);
    if (!title.trim()) return setError("Give the design a name.");
    if (!flatFile) return setError("The flat artwork is required — it's what the visualizer and the print use.");
    if (!matSlugs.length) return setError("Pick at least one material.");
    if (flatFile.size > MAX_BYTES) return setError("That flat file is over 25MB.");

    setBusy(true);
    try {
      const folder = slugify(title) || "design";
      const flatUrl = await uploadToStorage(flatFile, folder);
      const lifestyleUrls: string[] = [];
      for (const f of lifestyleFiles.slice(0, 8)) {
        if (f.size <= MAX_BYTES) lifestyleUrls.push(await uploadToStorage(f, folder));
      }

      const allTags = [
        ...tags.filter((t) => !MOODS.includes(t)),
        ...tags.filter((t) => MOODS.includes(t)).map((m) => `Mood: ${m}`),
        ...freeTags.split(",").map((t) => t.trim()).filter(Boolean),
      ];

      const { data, error: rpcErr } = await adminRpc("admin_create_design", {
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_tags: allTags,
        p_flat_url: flatUrl,
        p_lifestyle_urls: lifestyleUrls,
        p_material_slugs: matSlugs,
        p_price_per_sqft: price.trim() ? Number(price) : null,
      });
      if (rpcErr) {
        setError(
          rpcErr.message.includes("handle_exists")
            ? "A design with that name already exists — try a different name."
            : `Couldn't save the design: ${rpcErr.message}`,
        );
      } else {
        const created = data as { handle: string; title: string };
        // Record the masters' true pixel sizes. admin_create_design runs under
        // the anon key, which can't write product_images, so the measuring is
        // done server-side. Deliberately not awaited into the success path: the
        // design IS saved, and a failed measurement must not read as a failed
        // upload — the row simply stays null and the backfill catches it.
        void fetch("/api/studio/record-dimensions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [flatUrl, ...lifestyleUrls] }),
        }).catch(() => {});
        setNote(`"${created.title}" saved as a draft. Check the flat image below, then publish it.`);
        reset();
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const applyForgottenCivilizationsTaxonomy = async () => {
    setTaxonomyBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/forgotten-civilizations-taxonomy", { method: "POST" });
      const body = await res.json() as { data?: { designs: number; tags: number }; error?: string | null };
      if (!res.ok || body.error) throw new Error(body.error || "Couldn’t update the collection tags.");
      setNote(`Tagged ${body.data?.designs ?? 11} Forgotten Civilizations designs across colour, style, mood, rooms, collection and workplace discovery.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t update the collection tags.");
    } finally {
      setTaxonomyBusy(false);
    }
  };

  const publish = async (d: Design) => {
    setBusyHandle(d.handle);
    setError(null);
    const { error: e } = await adminRpc("admin_activate_design", { p_handle: d.handle });
    setBusyHandle(null);
    if (e) setError(`Couldn't publish: ${e.message}`);
    else {
      setNote(`"${d.title}" is live at zyvorah.com/products/${d.handle}`);
      await load();
    }
  };

  const remove = async (d: Design) => {
    setBusyHandle(d.handle);
    const { error: e } = await adminRpc("admin_delete_design", { p_handle: d.handle });
    setBusyHandle(null);
    if (e) setError(`Couldn't delete: ${e.message}`);
    else {
      setNote(`Draft "${d.title}" deleted.`);
      await load();
    }
  };

  if (staff !== "in") return <StaffGate state={staff} title="Add a design" />;

  const drafts = (designs ?? []).filter((d) => d.status === "draft");
  const recent = (designs ?? []).filter((d) => d.status !== "draft");

  return (
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-mist">Catalogue</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Add a design</h1>
          <p className="mt-1 text-sm text-slate">
            Upload the artwork, check the flat, publish. It goes live on the site the moment you publish.
          </p>
        </div>
        <div className="flex gap-4 text-xs text-slate">
          <Link href="/admin" className="underline underline-offset-2">Ops dashboard →</Link>
          <Link href="/decide" className="underline underline-offset-2">Decision board →</Link>
        </div>
      </div>

      {error && <p className="mt-4 rounded-[12px] bg-blush/50 px-4 py-3 text-sm">{error}</p>}
      {note && <p className="mt-4 rounded-[12px] bg-sage/50 px-4 py-3 text-sm">{note}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-edge bg-wash px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Forgotten Civilizations taxonomy</p>
          <p className="mt-0.5 text-[0.72rem] text-slate">Apply the collection’s reviewed colour, style, mood, room and creative-office discovery tags to all 11 live designs.</p>
        </div>
        <button onClick={applyForgottenCivilizationsTaxonomy} disabled={taxonomyBusy} className="btn h-9 shrink-0 text-[0.72rem] disabled:opacity-50">
          {taxonomyBusy ? "Applying…" : "Apply tags"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* the form */}
        <div className="rounded-[20px] border border-edge bg-surface p-5">
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Design name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Balaji Darshan"
              className="mt-2 h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
            />
            {title.trim() && (
              <span className="mt-1 block text-[0.7rem] text-mist">zyvorah.com/products/{slugify(title)}</span>
            )}
          </label>

          <label className="mt-4 block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What the design is, and the room it was made for."
              className="mt-2 w-full rounded-[12px] border border-edge bg-surface px-4 py-3 text-sm outline-none focus:border-charcoal"
            />
          </label>

          <div className="mt-5 rounded-[16px] bg-wash p-4">
            <p className="font-display text-sm font-bold">Flat artwork — required</p>
            <p className="mt-1 text-[0.72rem] text-slate">
              The clean pattern with no furniture in it. This is what &ldquo;See it on your wall&rdquo; and the printer
              use, so a styled room photo will not do.
            </p>
            <input
              ref={flatInput}
              type="file"
              accept="image/*"
              onChange={(e) => pickFlat(e.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-[0.72rem] file:mr-3 file:rounded-full file:border-0 file:bg-charcoal file:px-4 file:py-2 file:text-[0.7rem] file:text-surface"
            />
            {flatPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={flatPreview} alt="Flat artwork preview" className="mt-3 max-h-56 rounded-[10px] object-contain" />
            )}
          </div>

          <div className="mt-4 rounded-[16px] bg-wash p-4">
            <p className="font-display text-sm font-bold">Room shots — optional</p>
            <p className="mt-1 text-[0.72rem] text-slate">Styled photos for the gallery. The first becomes the card image.</p>
            <input
              ref={lifeInput}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setLifestyleFiles(Array.from(e.target.files ?? []))}
              className="mt-3 block w-full text-[0.72rem] file:mr-3 file:rounded-full file:border-0 file:bg-wash file:px-4 file:py-2 file:text-[0.7rem]"
            />
            {lifestyleFiles.length > 0 && (
              <p className="mt-2 text-[0.7rem] text-slate">{lifestyleFiles.length} selected</p>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <TagPicker label="Rooms" options={ROOM_TAGS} selected={tags} onToggle={(t) => toggle(tags, setTags, t)} />
            <TagPicker label="Style" options={STYLE_TAGS} selected={tags} onToggle={(t) => toggle(tags, setTags, t)} />
            <TagPicker label="Mood" options={MOODS} selected={tags} onToggle={(t) => toggle(tags, setTags, t)} />
            <label className="block">
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Other tags</span>
              <input
                value={freeTags}
                onChange={(e) => setFreeTags(e.target.value)}
                placeholder="Comma separated — e.g. Deity, Temple"
                className="mt-2 h-10 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              {/* ONE finish per wallpaper — the database refuses a second
                  (product_materials_one_finish), so this is a radio. */}
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Finish</p>
              <div className="mt-2 space-y-1.5">
                {materials.map((m) => (
                  <label key={m.slug} className="flex items-center gap-2 text-[0.78rem]">
                    <input
                      type="radio"
                      name="design-finish"
                      checked={matSlugs[0] === m.slug}
                      onChange={() => setMatSlugs([m.slug])}
                    />
                    {m.name} <span className="text-mist">₹{m.default_price_per_sqft}/sqft</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-mist">Price override</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Leave blank for standard"
                className="mt-2 h-10 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
              />
              <span className="mt-1 block text-[0.7rem] text-mist">₹ per sqft, applied to the finish picked.</span>
            </label>
          </div>

          <button onClick={submit} disabled={busy} className="btn mt-6 h-11 w-full text-[0.78rem] disabled:opacity-50">
            {busy ? "Uploading…" : "Save as draft"}
          </button>
          <p className="mt-2 text-center text-[0.7rem] text-mist">
            Drafts are invisible to customers until you publish them.
          </p>
        </div>

        {/* drafts awaiting publish + recent */}
        <div>
          <p className="font-display text-sm font-bold">
            Drafts {drafts.length > 0 && <span className="text-mist">· {drafts.length}</span>}
          </p>
          {drafts.length === 0 && <p className="mt-2 text-xs text-mist">Nothing waiting to publish.</p>}
          <div className="mt-3 space-y-3">
            {drafts.map((d) => (
              <div key={d.handle} className="rounded-[16px] border border-edge bg-surface p-4">
                {d.flat_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.flat_url} alt={`${d.title} flat`} className="mb-3 max-h-40 w-full rounded-[10px] object-cover" />
                )}
                <p className="font-display text-sm font-bold">{d.title}</p>
                <p className="mt-0.5 text-[0.7rem] text-mist">{d.tags.join(" · ") || "no tags"}</p>
                <p className="mt-2 text-[0.72rem] text-slate">
                  Is that flat image clean pattern artwork, with no furniture in it? Publishing confirms it is.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => publish(d)}
                    disabled={busyHandle === d.handle}
                    className="btn h-9 flex-1 text-[0.72rem] disabled:opacity-50"
                  >
                    {busyHandle === d.handle ? "Publishing…" : "Publish live"}
                  </button>
                  <button
                    onClick={() => remove(d)}
                    disabled={busyHandle === d.handle}
                    className="h-9 rounded-full border border-edge px-4 text-[0.72rem] text-slate disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 font-display text-sm font-bold">Recently added</p>
          <div className="mt-3 space-y-2">
            {recent.slice(0, 12).map((d) => (
              <a
                key={d.handle}
                href={`/products/${d.handle}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-[12px] bg-wash px-3 py-2 text-[0.75rem] hover:bg-lavender/40"
              >
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 text-[0.65rem] uppercase tracking-widest text-mist">{d.status}</span>
              </a>
            ))}
            {recent.length === 0 && <p className="text-xs text-mist">Nothing in the last 30 days.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
