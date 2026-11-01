import { SUBSCRIBE_DISCLOSURE } from "@/lib/subscribe-disclosure";

/** The approved subscribe line. Sits directly under the button that submits
 *  an email; `data-subscribe-disclosure` lets the live checks find it. */
export function SubscribeDisclosure({ className = "" }: { className?: string }) {
  return (
    <p data-subscribe-disclosure className={`mt-2 text-[0.72rem] leading-snug text-slate ${className}`}>
      {SUBSCRIBE_DISCLOSURE}{" "}
      <a href="/privacy#newsletter" className="underline underline-offset-2 hover:text-charcoal">
        Privacy
      </a>
    </p>
  );
}
