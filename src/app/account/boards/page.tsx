"use client";

import { useEffect, useState } from "react";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { signBoardImage } from "@/lib/board-save";

type Item = {
  id: string;
  image_url: string;
  created_at: string;
  products: { handle: string; title: string } | null;
};
type Board = { id: string; name: string; created_at: string; board_items: Item[] };

export default function BoardsPage() {
  const { session, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [boards, setBoards] = useState<Board[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setAuthOpen(true);
      return;
    }
    supabaseBrowser
      .from("boards")
      .select("id, name, created_at, board_items ( id, image_url, created_at, products ( handle, title ) )")
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const rows = (data as unknown as Board[]) ?? [];
        // The bucket is private and owner-scoped, so image_url is a reference
        // rather than something the browser can load. Sign each tile with the
        // customer's own session; a tile whose object has gone (a superseded
        // preview mid-delete) signs to null and is dropped rather than
        // rendering as a broken image.
        setBoards(
          await Promise.all(
            rows.map(async (b) => ({
              ...b,
              board_items: (
                await Promise.all(
                  b.board_items.map(async (it) => {
                    const src = await signBoardImage(it.image_url);
                    return src ? { ...it, image_url: src } : null;
                  }),
                )
              ).filter((it): it is Item => it !== null),
            })),
          ),
        );
      });
  }, [session, loading]);

  return (
    <div className="container-x py-10">
      <h1 className="font-display text-2xl font-bold">My Boards</h1>
      <p className="mt-1 text-sm text-slate">Wall previews you've saved, grouped by project.</p>

      {!session && !loading && (
        <p className="mt-8 text-sm text-slate">
          <button onClick={() => setAuthOpen(true)} className="underline underline-offset-2">
            Log in
          </button>{" "}
          to see your boards.
        </p>
      )}

      {session && boards === null && <p className="mt-8 text-sm text-slate">Loading…</p>}

      {boards && boards.length === 0 && (
        <p className="mt-8 text-sm text-slate">
          No boards yet — open any product's "See it on your wall" tool and save a placement to start one.
        </p>
      )}

      <div className="mt-8 space-y-10">
        {boards?.map((b) => (
          <div key={b.id}>
            <h2 className="font-display text-lg font-semibold">{b.name}</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {b.board_items.map((it) => (
                <div key={it.id} className="group">
                  <div className="relative aspect-square overflow-hidden rounded-[16px] bg-wash">
                    <Image src={it.image_url} alt="" fill sizes="240px" className="object-cover" />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    {it.products ? (
                      <Link
                        href={`/products/${it.products.handle}`}
                        className="text-xs font-medium underline underline-offset-2"
                      >
                        {it.products.title}
                      </Link>
                    ) : (
                      <span className="text-xs text-mist">—</span>
                    )}
                    <a
                      href={it.image_url}
                      download
                      className="text-xs text-slate underline underline-offset-2 hover:text-charcoal"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
    </div>
  );
}
