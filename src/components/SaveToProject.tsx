"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePartner } from "@/components/PartnerProvider";

/**
 * A partner designer's "Add to cart".
 *
 * The wall they configured on the product page — design, material, size and
 * the framing they approved — is filed into one of the account's customer
 * projects as an option, exactly as the portal's own editor would. From there
 * the customer decides and procurement releases; the designer never touches a
 * cart or a price. Projects are the portal's own rows (partner_private_projects),
 * so nothing saved here is invisible to the rest of the account.
 */
export type WallToSave = {
  productHandle: string;
  materialSlug: string;
  widthMm: number;
  heightMm: number;
  placement: { zoom: number; cropX: number; cropY: number; flipH: boolean; flipV: boolean };
  openings: { widthMm: number; heightMm: number; offsetMm: number }[];
};

type Project = { id: string; customer_name: string; customer_id: string };

export function SaveToProject({
  wall, open, onClose, onSaved,
}: {
  wall: WallToSave | null;
  open: boolean;
  onClose: () => void;
  onSaved: (project: Project) => void;
}) {
  const { partner } = usePartner();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [creating, setCreating] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [room, setRoom] = useState("");
  const [wallId, setWallId] = useState("W1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/corporate/private-workspace?projectsPage=0", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => {
        const list = (v.projects ?? []) as Project[];
        setProjects(list);
        setProjectId((p) => p || list[0]?.id || "");
        setCreating(list.length === 0);
      })
      .catch(() => setError("Couldn't load your projects just now."));
  }, [open]);

  if (!open || !wall || typeof document === "undefined") return null;

  const close = () => { setError(null); onClose(); };

  const save = async () => {
    if (busy) return;
    setError(null);
    if (!room.trim() || !wallId.trim()) { setError("Name the room and the wall."); return; }
    if (creating && (!customerName.trim() || !customerId.trim())) {
      setError("Give the customer a name and your reference for them.");
      return;
    }
    setBusy(true);
    try {
      let target = projects?.find((p) => p.id === projectId) ?? null;
      if (creating) {
        const r = await fetch("/api/corporate/private-workspace", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "project", customerName: customerName.trim(), customerId: customerId.trim() }),
        });
        const v = await r.json();
        if (!r.ok) throw new Error(v.error || "Couldn't create the project.");
        target = v as Project;
      }
      if (!target) throw new Error("Choose a project.");
      const r = await fetch("/api/corporate/private-workspace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "option",
          projectId: target.id,
          roomName: room.trim(),
          wallIdentifier: wallId.trim(),
          ...wall,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Couldn't save the wall.");
      onSaved(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the wall.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-charcoal/40 p-4" onClick={close}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="save-to-project-title"
        className="w-full max-w-md rounded-[18px] bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="save-to-project-title" className="text-lg font-semibold">Save this wall to a project</h2>
        <p className="mt-1 text-sm text-slate">
          It goes into {partner?.name ?? "your account"}&rsquo;s project for the customer to decide and procurement to release.
        </p>

        {projects && projects.length > 0 && (
          <label className="mt-5 block text-sm">
            Customer project
            <select
              value={creating ? "__new" : projectId}
              onChange={(e) => { if (e.target.value === "__new") setCreating(true); else { setCreating(false); setProjectId(e.target.value); } }}
              className="mt-1 w-full rounded-[10px] border border-edge bg-surface p-2.5"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.customer_name} · {p.customer_id}</option>)}
              <option value="__new">+ New customer…</option>
            </select>
          </label>
        )}
        {creating && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm">Customer name
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120}
                className="mt-1 w-full rounded-[10px] border border-edge p-2.5" placeholder="e.g. Mr & Mrs Rao" /></label>
            <label className="text-sm">Your reference
              <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} maxLength={80}
                className="mt-1 w-full rounded-[10px] border border-edge p-2.5" placeholder="e.g. HL-BLR-2041" /></label>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">Room
            <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={80}
              className="mt-1 w-full rounded-[10px] border border-edge p-2.5" placeholder="e.g. Master bedroom" /></label>
          <label className="text-sm">Wall
            <input value={wallId} onChange={(e) => setWallId(e.target.value)} maxLength={40}
              className="mt-1 w-full rounded-[10px] border border-edge p-2.5" placeholder="e.g. W1" /></label>
        </div>
        <p className="mt-3 text-xs text-slate">
          {(wall.widthMm / 10).toFixed(0)} × {(wall.heightMm / 10).toFixed(0)} cm · {wall.materialSlug.replace(/-/g, " ")}
        </p>
        {error && <p role="alert" className="mt-3 text-xs text-alert">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={close} className="btn-secondary flex-1">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="btn flex-1">
            {busy ? "Saving…" : "Save to project"}
          </button>
        </div>
        {partner && (
          <p className="mt-4 text-center text-xs text-slate">
            <Link href={`${partner.home}/projects`} className="underline underline-offset-2">Open your projects</Link>
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
