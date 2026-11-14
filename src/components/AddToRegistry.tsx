"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { AuthModal } from "./AuthModal";
import { registryApi } from "./Registry";
/** Pass the same configured payload as checkout, never display prices or a product URL alone. */
export function AddToRegistry(props: {
  selection: unknown;
  disabled?: boolean;
}) {
  const { session } = useAuth();
  return <AddToRegistryInner key={session?.user?.id ?? "guest"} {...props} />;
}
function AddToRegistryInner({
  selection,
  disabled = false,
}: {
  selection: unknown;
  disabled?: boolean;
}) {
  const { session } = useAuth();
  const [auth, setAuth] = useState(false),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [registries, setRegistries] = useState<
      { code: string; title: string; closed: boolean }[]
    >([]),
    [chosen, setChosen] = useState("");
  async function load() {
    if (!session) {
      setAuth(true);
      return;
    }
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/registry", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      const active = d.registries.filter((x: { closed: boolean }) => !x.closed);
      setRegistries(active);
      setChosen(active[0]?.code ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="my-2">
      <button
        type="button"
        className="btn w-full border border-edge"
        disabled={disabled || busy}
        onClick={load}
      >
        Add to registry
      </button>
      {open && (
        <div className="mt-3 grid gap-3 rounded-xl border border-edge bg-white p-4">
          <p className="font-semibold">Save this exact selection</p>
          {registries.length > 0 ? (
            <>
              <label className="grid gap-2">
                Choose your registry
                <select
                  className="min-h-12 w-full rounded-lg border p-2"
                  value={chosen}
                  onChange={(e) => setChosen(e.target.value)}
                >
                  {registries.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !chosen}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await registryApi({
                      action: "add",
                      code: chosen,
                      selection,
                    });
                    setOpen(false);
                    setError("Saved to your registry.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save to registry
              </button>
            </>
          ) : (
            !busy && (
              <p>
                Create a registry first, then return to save this selection.
              </p>
            )
          )}
          <Link href="/registry/manage" className="underline">
            Create or manage registries
          </Link>
          <button
            type="button"
            className="underline"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
      <p className="text-sm" role="status">
        {error}
      </p>
      <AuthModal
        open={auth}
        onClose={() => setAuth(false)}
        onSuccess={() => setAuth(false)}
      />
    </div>
  );
}
