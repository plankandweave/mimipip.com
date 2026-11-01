/**
 * Run a piece of a report with a deadline, and never let it reject.
 *
 * WHY THIS EXISTS
 * The 08:00 morning brief used to do one job — read yesterday's traffic and
 * sales — and had few ways to fail. It now also gathers from Google Analytics
 * twice more, the post ledger, and four agents that file their own sections.
 * Every one of those is a new way for the whole mail to die: a rejected promise
 * inside the brief's `Promise.all` fails the route, and a route that 500s sends
 * nothing at all.
 *
 * That trade is unacceptable in this direction. A brief missing its organic
 * section is a small loss the mail itself can explain. A silent morning is the
 * exact failure the brief was built to end, and it would be caused by the
 * additions rather than by anything being wrong with the business.
 *
 * So each addition is fenced: it answers within its budget, or it is replaced by
 * a fallback that SAYS IN THE MAIL that it did not answer. The fallback is never
 * an empty-looking success — callers pass one carrying its own explanation, so a
 * dropped block reads as dropped and not as zero.
 */

export async function safely<T>(
  label: string,
  budgetMs: number,
  work: Promise<T>,
  fallback: T,
  log: (msg: string, err?: unknown) => void = (msg, err) =>
    err === undefined ? console.error(msg) : console.error(msg, err),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          log(`[brief] ${label} exceeded ${budgetMs}ms — sending without it`);
          resolve(fallback);
        }, budgetMs);
      }),
    ]);
  } catch (e) {
    log(`[brief] ${label} failed — sending without it`, e);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
