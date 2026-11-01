import { safely } from "./degrade";

/**
 * Read the store's first-party snapshot for the morning brief without letting
 * a failed read stop the brief.
 *
 * 14 October 2026: intel_snapshot hit a statement timeout at 02:30Z, the route
 * returned 500, and no brief went out at all — the overnight sections filed by
 * every agent reached nobody. A failed store read now costs the brief its store
 * numbers (which the mail says it could not read), never the whole mail.
 *
 * A refused key is still flagged separately so the route can answer 401: that
 * is a configuration fault, not a slow database.
 */
export type SnapshotRead = {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  snap: Record<string, any>;
  error: string | null;
  unauthorized: boolean;
};

type RpcResult = { data: unknown; error: { message?: string } | null };

export async function readBriefSnapshot(
  call: () => PromiseLike<RpcResult>,
  budgetMs: number,
  log?: (msg: string, err?: unknown) => void,
): Promise<SnapshotRead> {
  const timedOut: SnapshotRead = {
    snap: {},
    error: "the store's numbers took too long to answer and were dropped so the brief could go out",
    unauthorized: false,
  };
  const work = (async (): Promise<SnapshotRead> => {
    const { data, error } = await call();
    if (error) {
      const message = error.message || "unknown database error";
      return { snap: {}, error: message, unauthorized: message.includes("unauthorized") };
    }
    return { snap: (data ?? {}) as Record<string, unknown>, error: null, unauthorized: false };
  })();
  const failed = (e: unknown): SnapshotRead => ({
    snap: {},
    error: e instanceof Error ? e.message : String(e),
    unauthorized: false,
  });
  // safely() swallows a rejection into the fallback; capture the reason first.
  let rejection: unknown;
  const guarded = work.catch((e) => {
    rejection = e;
    return null;
  });
  const r = await safely("store snapshot", budgetMs, guarded, timedOut as SnapshotRead | null, log);
  if (r === null) return failed(rejection);
  if (r.error && !r.unauthorized) (log ?? console.error)(`[brief] store snapshot failed — sending without it: ${r.error}`);
  return r;
}
