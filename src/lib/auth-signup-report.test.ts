import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * AuthModal must report every completed sign-up exactly once.
 *
 * The bug this guards: `afterSignIn` returns early into the email step (mobile
 * door) or the mobile step (email door), and those steps used to finish by
 * calling `onSuccess()` directly. A brand-new account ALWAYS takes one of
 * those branches, so no new sign-up was ever counted — 26 accounts were
 * created in the 28 days to 27 Sep 2026 and GA4 recorded zero `sign_up`.
 *
 * This is a source-shape guard rather than a render test because the repo has
 * no React testing setup. It fails on the pre-fix file (verified, not assumed):
 * that version contains four `onSuccess()` call sites, three of them outside
 * the reporting helper.
 */
const SOURCE = readFileSync(new URL("../components/AuthModal.tsx", import.meta.url), "utf8");

test("every exit from AuthModal goes through the sign-up reporter", () => {
  // `onSuccess()` may be invoked in exactly one place: inside finishSignUp.
  const calls = SOURCE.match(/onSuccess\(\)/g) ?? [];
  assert.equal(
    calls.length,
    1,
    `onSuccess() must be called only inside finishSignUp; found ${calls.length} call sites. ` +
      "A step that finishes with a bare onSuccess() is a sign-up GA never hears about.",
  );

  const helper = SOURCE.slice(SOURCE.indexOf("const finishSignUp"));
  assert.ok(helper.includes("onSuccess()"), "finishSignUp must still complete the modal");
  assert.ok(
    helper.indexOf("conversionSignUp") < helper.indexOf("onSuccess()"),
    "the conversion must be reported before the modal hands control back",
  );
});

test("the skip on the optional mobile step still counts as a sign-up", () => {
  assert.ok(
    /stage === "phone" \? \(\) => finishSignUp\(/.test(SOURCE),
    'skipping the optional mobile step must report the sign-up, not call onSuccess directly',
  );
});

test("the report is guarded so two steps cannot count twice", () => {
  assert.ok(SOURCE.includes("signUpReported"), "a once-only guard must exist");
  const helper = SOURCE.slice(SOURCE.indexOf("const finishSignUp"));
  assert.ok(
    helper.indexOf("signUpReported.current") < helper.indexOf("conversionSignUp"),
    "the guard must be checked before the conversion is sent",
  );
});
