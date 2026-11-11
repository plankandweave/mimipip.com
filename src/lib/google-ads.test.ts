import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { adsConversion, adsSetUserData, googleTagBootstrap, googleTagSrc, normalisePhone } from "@/lib/google-ads";

function captureCalls() {
  const calls: unknown[][] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gtag: (...args: unknown[]) => calls.push(args) },
  });
  return calls;
}

test("Indian mobiles normalise to E.164 however they were typed", () => {
  assert.equal(normalisePhone("98765 43210"), "+919876543210");
  assert.equal(normalisePhone("09876543210"), "+919876543210");
  assert.equal(normalisePhone("+91 98765-43210"), "+919876543210");
  assert.equal(normalisePhone("919876543210"), "+919876543210");
  assert.equal(normalisePhone("+1 (415) 555-0100"), "+14155550100");
  assert.equal(normalisePhone(""), null);
  assert.equal(normalisePhone("12"), null);
});

test("user_data is only set when something usable was given", () => {
  const calls = captureCalls();
  adsSetUserData({ email: "  ", phone: "" });
  assert.equal(calls.length, 0);
  adsSetUserData({ email: "A@B.co" });
  assert.deepEqual(calls[0], ["set", "user_data", { email: "a@b.co" }]);
});

test("conversion events carry the account-scoped label", () => {
  const calls = captureCalls();
  adsConversion("enquiry");
  assert.deepEqual(calls[0], ["event", "conversion", { send_to: "AW-18449342468/tMRSCPDy94AdEITAqt1E" }]);
});

test("no tag on the page means no throw", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  assert.doesNotThrow(() => adsConversion("signUp"));
});

/**
 * The bootstrap is a string that the browser executes verbatim. #418 shipped a
 * regex literal inside the layout's template literal, it arrived mangled, and
 * the whole tag died on line 1 — no GA4, no Ads, no remarketing. So: run it.
 */
function runBootstrap(pathname: string, gaId?: string) {
  // A browser runs this at global scope, where `window.dataLayer = …` then
  // makes a bare `dataLayer` resolvable. vm gives us exactly that.
  const context: Record<string, unknown> = { location: { pathname } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(googleTagBootstrap(gaId), context);
  // vm objects come from another realm, so compare them by value.
  return ((context.dataLayer ?? []) as IArguments[]).map(
    (entry) => JSON.parse(JSON.stringify(Array.from(entry))) as unknown[],
  );
}

test("the tag bootstrap executes and configures both destinations", () => {
  const calls = runBootstrap("/", "G-TEST123");
  assert.equal(calls[0]?.[0], "js");
  assert.deepEqual(calls[1], ["config", "AW-18449342468", { allow_enhanced_conversions: true }]);
  assert.deepEqual(calls[2], ["config", "G-TEST123"]);
});

test("gtag.js loads GA4's container first, so page_view waits on one script", () => {
  assert.equal(googleTagSrc("G-TEST123"), "https://www.googletagmanager.com/gtag/js?id=G-TEST123");
  assert.equal(googleTagSrc(undefined), "https://www.googletagmanager.com/gtag/js?id=AW-18449342468");
  assert.equal(googleTagSrc(""), "https://www.googletagmanager.com/gtag/js?id=AW-18449342468");
});

test("GA4 is omitted when no measurement id is configured", () => {
  const calls = runBootstrap("/", undefined);
  assert.equal(calls.filter((c) => c[0] === "config").length, 1);
});

test("only staff desks are flagged as internal traffic", () => {
  const internal = (p: string) =>
    runBootstrap(p, "G-TEST123").some((c) => c[0] === "set");
  assert.equal(internal("/admin"), true);
  assert.equal(internal("/studio/samples"), true);
  assert.equal(internal("/"), false);
  assert.equal(internal("/collections"), false);
  // A prefix match must not catch a real shopper route.
  assert.equal(internal("/administrators"), false);
  assert.equal(internal("/studiotour"), false);
});
