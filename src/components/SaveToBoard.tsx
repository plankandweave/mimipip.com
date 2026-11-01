"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { addBoardItem, ensureBoard, resolveProductId, uploadBoardImage } from "@/lib/board-save";
import type { CropData } from "@/lib/visualizer";

type Board = { id: string; name: string };

export function SaveToBoard({
  open,
  onClose,
  productId,
  productHandle,
  imageDataUrl,
  crop,
}: {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  /** Surfaces that only carry a handle (curator, room tool, chat) pass this
   *  instead — the id is resolved on save so the board item still links back to
   *  the product rather than rendering as an orphan tile. */
  productHandle?: string | null;
  imageDataUrl: string; // the room composite (or the flat crop, as a fallback)
  crop: CropData;
}) {
  const { session, ensureCustomerId } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<string>("__new__");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailVerified = Boolean(session?.user?.email_confirmed_at || session?.user?.confirmed_at);

  useEffect(() => {
    if (!open) return;
    if (!session || !emailVerified) {
      setAuthOpen(true);
      return;
    }
    setAuthOpen(false);
    supabaseBrowser
      .from("boards")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setBoards(data ?? []);
        setBoardId(data && data.length ? data[0].id : "__new__");
      });
  }, [open, session, emailVerified]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const customerId = await ensureCustomerId();
      if (!customerId) throw new Error("Couldn't verify your account — please try logging in again.");

      const targetBoardId =
        boardId === "__new__"
          ? await ensureBoard(customerId, newName.trim() || "My wallpaper ideas")
          : boardId;

      const imageUrl = await uploadBoardImage(customerId, imageDataUrl);
      const targetProductId = productId ?? (await resolveProductId(productHandle));

      await addBoardItem({ boardId: targetBoardId, productId: targetProductId, imageUrl, crop });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving this.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] grid place-items-center bg-charcoal/40 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-[min(420px,100%)] rounded-[24px] bg-cloud p-6 shadow-2xl ring-1 ring-edge"
        >
          {done ? (
            <>
              <p className="font-display text-lg font-bold">Saved to your board</p>
              <p className="mt-1 text-xs text-slate">Find it anytime under My Boards.</p>
              <button onClick={onClose} className="btn mt-5 h-11 w-full text-[0.78rem]">
                Done
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-bold">Save to a board</p>
              <p className="mt-1 text-xs text-slate">
                Keep this preview with a project — e.g. one board per client or room.
              </p>

              <div className="mt-4 space-y-2">
                {boards.map((b) => (
                  <label
                    key={b.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-[12px] border-2 px-4 py-3 text-sm ${
                      boardId === b.id ? "border-charcoal" : "border-edge"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={boardId === b.id}
                      onChange={() => setBoardId(b.id)}
                      className="accent-charcoal"
                    />
                    {b.name}
                  </label>
                ))}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-[12px] border-2 px-4 py-3 text-sm ${
                    boardId === "__new__" ? "border-charcoal" : "border-edge"
                  }`}
                >
                  <input
                    type="radio"
                    checked={boardId === "__new__"}
                    onChange={() => setBoardId("__new__")}
                    className="accent-charcoal"
                  />
                  New board
                </label>
                {boardId === "__new__" && (
                  <input
                    type="text"
                    placeholder="e.g. Sharma residence — living room"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal"
                  />
                )}
              </div>

              {error && <p className="mt-3 text-xs text-charcoal/80">{error}</p>}

              <div className="mt-5 flex gap-3">
                <button onClick={onClose} className="btn btn-ghost h-11 flex-1 text-[0.78rem]">
                  Cancel
                </button>
                <button onClick={save} disabled={busy} className="btn h-11 flex-1 text-[0.78rem]">
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <AuthModal
        open={authOpen}
        onClose={onClose}
        onSuccess={() => setAuthOpen(false)}
      />
    </>
  );
}
