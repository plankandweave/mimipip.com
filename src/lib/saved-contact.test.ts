// The browser-local address, pinned.
//
// Both call sites SPREAD readSavedContact() straight into form state, so what
// this returns becomes what a customer is about to submit. Two things have to
// hold: nothing but the seven known fields ever comes back, and the record
// does not outlive its usefulness on a browser somebody else will use next.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readSavedContact, writeSavedContact, clearSavedContact } from "./saved-contact";

const KEY = "zyv_contact_v1";

const store = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown };
g.window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const full = {
  name: "Priyanka Singh", email: "p@example.com", phone: "9876543210",
  line1: "One BKC, Level 12", city: "Mumbai", state: "Maharashtra", pincode: "400051",
};

beforeEach(() => store.clear());

test("a round trip returns what was written", () => {
  writeSavedContact(full);
  assert.deepEqual(readSavedContact(), full);
});

test("nothing saved reads as empty, not as a crash", () => {
  assert.deepEqual(readSavedContact(), {});
});

test("only the seven known fields come back", () => {
  // Both callers do `{ ...form, ...readSavedContact() }`. A record carrying an
  // extra key — hand-edited, or written by a future build — would set a form
  // field nobody chose to expose.
  store.set(KEY, JSON.stringify({
    ...full, savedAt: Date.now(),
    gstin: "27AAHCV3778L1ZK", isAdmin: true, total: 999999,
  }));
  assert.deepEqual(Object.keys(readSavedContact()).sort(), Object.keys(full).sort());
});

test("a non-string field is dropped rather than spread into the form", () => {
  store.set(KEY, JSON.stringify({ ...full, pincode: 400051, savedAt: Date.now() }));
  const got = readSavedContact();
  assert.equal(got.pincode, undefined);
  assert.equal(got.city, "Mumbai");
});

test("garbage in storage reads as empty", () => {
  for (const raw of ["not json", "null", "[1,2,3]", '"a string"', "42"]) {
    store.set(KEY, raw);
    assert.deepEqual(readSavedContact(), {}, `should have refused: ${raw}`);
  }
});

test("an address older than thirty days is forgotten, and erased", () => {
  const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
  store.set(KEY, JSON.stringify({ ...full, savedAt: old }));
  assert.deepEqual(readSavedContact(), {});
  // Not merely hidden — a stale record must not survive to be merged into by
  // the next write, or one fresh field would resurrect a year-old address.
  assert.equal(store.get(KEY), undefined);
});

test("an address just inside the window is still offered", () => {
  const recent = Date.now() - 29 * 24 * 60 * 60 * 1000;
  store.set(KEY, JSON.stringify({ ...full, savedAt: recent }));
  assert.equal(readSavedContact().line1, "One BKC, Level 12");
});

test("a record with no timestamp is treated as expired, not as trusted", () => {
  store.set(KEY, JSON.stringify(full));
  assert.deepEqual(readSavedContact(), {});
});

test("a partial write merges over what was there, and refreshes the clock", () => {
  writeSavedContact(full);
  writeSavedContact({ phone: "9812345678" });
  const got = readSavedContact();
  assert.equal(got.phone, "9812345678");
  assert.equal(got.city, "Mumbai", "the rest of the address must survive");
});

test("logging out forgets the address", () => {
  writeSavedContact(full);
  clearSavedContact();
  assert.deepEqual(readSavedContact(), {});
});

test("storage that throws is survivable in both directions", () => {
  const saved = g.window;
  g.window = {
    localStorage: {
      getItem() { throw new Error("private browsing"); },
      setItem() { throw new Error("quota"); },
      removeItem() { throw new Error("nope"); },
    },
  };
  // A checkout must never be blocked by a convenience.
  assert.deepEqual(readSavedContact(), {});
  assert.doesNotThrow(() => writeSavedContact(full));
  assert.doesNotThrow(() => clearSavedContact());
  g.window = saved;
});
