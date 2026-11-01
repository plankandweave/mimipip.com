// A blocked payment script must settle, and retries must not stack scripts.
let pending: Promise<boolean> | null = null;
export function loadRazorpay(timeoutMs = 15_000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const ready = () => typeof (window as unknown as { Razorpay?: unknown }).Razorpay === "function";
  if (ready()) return Promise.resolve(true);
  if (pending) return pending;
  pending = new Promise<boolean>(resolve => {
    const script = document.createElement("script");
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (!ok) script.remove();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => finish(ready());
    script.onerror = () => finish(false);
    document.body.appendChild(script);
  }).finally(() => { pending = null; });
  return pending;
}
