/** Ambient declaration for workerd's runtime module. `env` is imported
 *  dynamically in media-client.ts (service-binding fetch); on any other runtime
 *  the import throws and callers fall back to plain fetch. `WorkerEntrypoint`
 *  is the base of the cached Site entrypoint in src/edge/worker.ts. */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
  export abstract class WorkerEntrypoint<Env = unknown, Props = unknown> {
    protected env: Env;
    protected ctx: { waitUntil(promise: Promise<unknown>): void; props: Props };
  }
}
