import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  OS_ACTOR, resolveStudioCaller, readCompanyAsk, companyLookupPlan, currentDeckPath,
  readRecipientAsk, presentationLink, domainOf, normaliseDomain, isFreeMail, tokenStrongEnough,
} from "./studio-os-door";

const req = (headers: Record<string, string> = {}) => new Request("https://zyvorah.com/api/admin/crm/studio", { headers });

test("the OS on the shared token is a staff-equivalent caller named OS design agent", async () => {
  const caller = await resolveStudioCaller(req({ "x-zyvorah-token": "right" }), {
    internalTokenOk: (r) => r.headers.get("x-zyvorah-token") === "right",
    staffKey: async () => { throw new Error("staff path must not run for the OS"); },
    adminRpcKey: async () => "admin-key-from-admin_config",
  });
  assert.deepEqual(caller, { key: "admin-key-from-admin_config", actor: OS_ACTOR, os: true });
});

test("a wrong or missing token takes exactly the staff path, which answers nobody with an empty key", async () => {
  const deps = {
    internalTokenOk: (r: Request) => r.headers.get("x-zyvorah-token") === "right",
    staffKey: async () => "",
    adminRpcKey: async () => { throw new Error("the admin key is never read for a non-OS caller"); },
  };
  assert.deepEqual(await resolveStudioCaller(req({ "x-zyvorah-token": "wrong" }), deps), { key: "", actor: "", os: false });
  assert.deepEqual(await resolveStudioCaller(req(), deps), { key: "", actor: "", os: false });
});

test("a signed-in staff member keeps their own key and is named by their email", async () => {
  const caller = await resolveStudioCaller(req({ cookie: "zyv_staff=abc" }), {
    internalTokenOk: () => false,
    staffKey: async () => "admin-key",
    adminRpcKey: async () => "admin-key",
    staffEmail: async () => "roheena@zyvorah.com",
  });
  assert.deepEqual(caller, { key: "admin-key", actor: "roheena@zyvorah.com", os: false });
});

test("the OS with no admin key in admin_config gets an empty key, so the RPC gate still refuses it", async () => {
  const caller = await resolveStudioCaller(req({ "x-zyvorah-token": "right" }), {
    internalTokenOk: () => true, staffKey: async () => "", adminRpcKey: async () => undefined,
  });
  assert.equal(caller.key, "");
  assert.equal(caller.os, true);
});

test("company ask: name is compulsory, email and domain are read defensively, kind falls back to other", () => {
  assert.equal(readCompanyAsk(null), null);
  assert.equal(readCompanyAsk({ email: "x@y.com" }), null);
  assert.equal(readCompanyAsk({ name: "   " }), null);
  const ask = readCompanyAsk({
    name: " Rathinam Group of Institutions ", domain: "https://www.rathinam.in/about",
    email: "Chairman.Office@Rathinam.in", contact_name: "Chairman's Office", kind: "college", city: "Coimbatore",
  })!;
  assert.equal(ask.name, "Rathinam Group of Institutions");
  assert.equal(ask.domain, "rathinam.in");
  assert.equal(ask.email, "chairman.office@rathinam.in");
  assert.equal(ask.contactName, "Chairman's Office");
  assert.equal(ask.kind, "other");
  assert.equal(ask.city, "Coimbatore");
  assert.equal(readCompanyAsk({ name: "x", kind: "hotel" })!.kind, "hotel");
  assert.equal(readCompanyAsk({ name: "x", email: "not-an-email" })!.email, null);
});

test("lookup plan: the contact's domain finds the company; a free-mail address is a contact but never a domain", () => {
  const corporate = companyLookupPlan(readCompanyAsk({ name: "Rathinam Group of Institutions", email: "chairman.office@rathinam.in" })!);
  assert.deepEqual(corporate, {
    matchKey: "rathinam group of institutions", domain: "rathinam.in",
    contact: { email: "chairman.office@rathinam.in", name: "chairman.office" },
  });
  const freemail = companyLookupPlan(readCompanyAsk({ name: "Dr Mehta", email: "drmehta@gmail.com", contact_name: "Dr Mehta" })!);
  assert.equal(freemail.domain, null);
  assert.deepEqual(freemail.contact, { email: "drmehta@gmail.com", name: "Dr Mehta" });
  const explicit = companyLookupPlan(readCompanyAsk({ name: "SKDO", domain: "skdo.in" })!);
  assert.deepEqual(explicit, { matchKey: "skdo", domain: "skdo.in", contact: null });
});

test("domain helpers", () => {
  assert.equal(domainOf("A@B.Co.In"), "b.co.in");
  assert.equal(domainOf("nope"), null);
  assert.equal(normaliseDomain("WWW.Example.com/"), "example.com");
  assert.equal(normaliseDomain("not a domain"), null);
  assert.equal(isFreeMail("GMAIL.com"), true);
  assert.equal(isFreeMail("rathinam.in"), false);
});

test("the current deck is the reviewed one unless a later compose superseded it", () => {
  assert.equal(currentDeckPath({ status: "reviewed", deck_path: "d", reviewed_deck_path: "r" }), "r");
  assert.equal(currentDeckPath({ status: "approved", deck_path: "d", reviewed_deck_path: "r" }), "r");
  assert.equal(currentDeckPath({ status: "composed", deck_path: "d", reviewed_deck_path: "r" }), "d");
  assert.equal(currentDeckPath({ status: "composed", deck_path: null, reviewed_deck_path: "r" }), "r");
  assert.equal(currentDeckPath({ status: "creative", deck_path: null, reviewed_deck_path: null }), null);
});

test("recipient ask needs a real presentation id and a real email; the link is the public /p page", () => {
  assert.equal(readRecipientAsk({ presentation_id: "nope", email: "a@b.com" }), null);
  assert.equal(readRecipientAsk({ presentation_id: "4b7c5a4e-2c5e-4d8e-9a1b-0f2e3d4c5b6a", email: "a@" }), null);
  assert.deepEqual(
    readRecipientAsk({ presentation_id: "4B7C5A4E-2C5E-4D8E-9A1B-0F2E3D4C5B6A", email: " Chairman@Rathinam.in ", name: " Chairman " }),
    { presentationId: "4B7C5A4E-2C5E-4D8E-9A1B-0F2E3D4C5B6A", email: "chairman@rathinam.in", name: "Chairman" },
  );
  assert.equal(presentationLink(undefined, "abc"), "https://zyvorah.com/p/abc");
  assert.equal(presentationLink("https://staging.zyvorah.com/", "abc"), "https://staging.zyvorah.com/p/abc");
  assert.equal(tokenStrongEnough("a".repeat(64)), true);
  assert.equal(tokenStrongEnough("short"), false);
});
