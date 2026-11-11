import { test } from "node:test";
import assert from "node:assert/strict";
import { requestGeo, referrerHost } from "./request-geo";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

test("request.cf wins, and a city survives its accents", () => {
  const g = requestGeo({ cf: { country: "IN", region: "Maharashtra", city: "Pune" }, headers: headers({}) });
  assert.deepEqual(g, { country: "IN", region: "Maharashtra", city: "Pune" });
});

test("the gateway's encoded headers are read back when cf is not carried", () => {
  const g = requestGeo({
    headers: headers({ "x-zyv-geo-country": "BR", "x-zyv-geo-region": encodeURIComponent("São Paulo"), "x-zyv-geo-city": encodeURIComponent("São Paulo") }),
  });
  assert.deepEqual(g, { country: "BR", region: "São Paulo", city: "São Paulo" });
});

test("nothing known is null, and markup never survives", () => {
  assert.deepEqual(requestGeo({ headers: headers({}) }), { country: null, region: null, city: null });
  assert.equal(requestGeo({ headers: headers({ "x-zyv-geo-city": "<script>Pune" }) }).city, "scriptPune");
});

test("referrer host is the bare host, or null", () => {
  assert.equal(referrerHost("https://www.instagram.com/reel/abc"), "instagram.com");
  assert.equal(referrerHost("android-app://com.instagram.android/"), "com.instagram.android");
  assert.equal(referrerHost(""), null);
  assert.equal(referrerHost("not a url"), null);
});
