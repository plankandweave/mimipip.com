import test from "node:test";
import assert from "node:assert/strict";
import { presentBriefProse } from "./brief-presentation";
import { ORDER_HOLD_NOTICE, otherOrdersLine } from "./brief-order-hold";
import { BRIEF_SECTIONS, classifySections, filingSource } from "./briefing-rules";

const cutoff = new Date("2026-10-07T02:30:40Z");
const present = (bodyHtml: string, key = "night-patrol", headline: string | null = null) =>
  presentBriefProse({ key, headline, bodyHtml, source: "night-patrol", cutoff });
const notice = `<p>${ORDER_HOLD_NOTICE}</p>`;
const oldNotice = "Vijay Sales VS-000060 / ZVY-10663 is on an owner no-reprint hold; missing print, QC or POD evidence does not prove it was not printed. Physical state needs reconciliation; replay advice withheld";
const leaked = "The next fix can only be proven by sending the order to the real printer, so it waits for someone at the machine.";

test("Oct 7 delivered HTML and plain text withhold the complete held-order unit", () => {
  for (const body of [
    `<p><strong>Restarts:</strong> none needed.<br>${oldNotice} ${leaked}<br><strong>Bug queue:</strong> 0 new on either desk. MG OS #13 was already fixed. 1 old smoke-test report is parked.</p>`,
    `Restarts: none needed.\n${oldNotice} ${leaked}\nBug queue: 0 new on either desk. MG OS #13 was already fixed. 1 old smoke-test report is parked.`,
  ]) {
    for (const key of Object.keys(BRIEF_SECTIONS)) {
      const r = present(body, key);
      assert.equal(r.held, true, key);
      assert.match(r.bodyHtml!, /Restarts.*none needed/);
      assert.match(r.bodyHtml!, /Bug queue: 0 new/);
      assert.doesNotMatch(r.bodyHtml!, /MG OS #13|old smoke-test/);
      assert.ok(r.bodyHtml!.includes(ORDER_HOLD_NOTICE));
      assert.ok(!r.bodyHtml!.includes(leaked));
      assert.doesNotMatch(r.bodyHtml!, /waits for someone|sending the order|next fix/);
    }
  }
});

test("action wording cannot change the held-order decision", () => {
  for (const suffix of [
    leaked,
    "One supervised end-to-end attempt would settle it.",
    "Feed the original file through the device to settle this.",
    "An operator at the machine is the remaining dependency.",
    "The next thing to try is rendering it alone with nothing else running. Tell any session 'run 10663'.",
    "This unfamiliar sentence contains no known action keywords.",
  ]) assert.equal(present(`<p>ZVY-10663: ${suffix}</p>`).bodyHtml, notice, suffix);
});

test("whole units include advice before the identifier and mixed subjects", () => {
  for (const body of [
    '<p>Feed it through the device to settle this: ZVY-10663.</p>',
    '<p>ZVY-10664 is complete, and the next physical proof belongs to ZVY-10663.</p>',
    '<p>Retry both ZVY-10664 and ZVY-10663.</p>',
    '<p>ZVY-10663: evidence recorded. ZVY-10664: render it alone.</p>',
  ]) assert.equal(present(body).bodyHtml, notice + (body.includes("ZVY-10664") ? `<p>${otherOrdersLine(["ZVY-10664"])}</p>` : ""));
});

test("paragraphs, bullets, generic headings and numbering do not release the hold", () => {
  for (const continuation of [
    `<br>${leaked}`,
    `</p><p>${leaked}`,
    `</p><ul><li>${leaked}</li></ul><p>`,
    `</p><h3>Next steps</h3><p>${leaked}`,
    `</p><h3>Evidence</h3><p>${leaked}`,
    `</p><div><p>2. ${leaked}</p></div><p>`,
    `\n- ${leaked}\n3. One supervised attempt would settle it.`,
  ]) assert.equal(present(`<p>ZVY-10663: hold remains.${continuation}</p>`).bodyHtml, notice);
});

test("independent facts do not authorize an anonymous continuation", () => {
  for (const separate of [
    '<p>Bug queue: 0 new.</p>',
    '<p>Restarts: none needed.</p>',
  ]) {
    const r = present(`<p>ZVY-10663: hold remains.</p>${separate}<p>${leaked}</p>`);
    assert.ok(r.bodyHtml!.includes(separate));
    assert.ok(!r.bodyHtml!.includes(leaked));
    assert.equal((r.bodyHtml!.match(/owner no-reprint hold/g) ?? []).length, 1);
  }
});

test("safe-looking prefixes never exempt arbitrary suffixes", () => {
  for (const separate of [
    `<p>Bug queue: 0 new. ${leaked}</p>`,
    `<p>Restarts: none needed, and ${leaked}</p>`,
    `<p>ZVY-10664: complete. For the earlier order, ${leaked}</p>`,
    `<p>ZVY-10664: complete; feed the earlier file through the device.</p>`,
  ]) {
    const r = present(`<p>ZVY-10663: hold remains.</p>${separate}`);
    assert.doesNotMatch(r.bodyHtml!, /real printer|earlier order|earlier file|complete|device/);
    // Another order survives only as a bare reference in the fixed line.
    assert.equal(r.bodyHtml!.replace(`<p>${otherOrdersLine(["ZVY-10664"])}</p>`, "").includes("ZVY-10664"), false);
  }
});

test("empty markup under a protected headline stays idempotent", () => {
  const once = present('<p></p>', "night-patrol", "ZVY-10663");
  assert.equal(once.bodyHtml, notice);
  assert.deepEqual(presentBriefProse({ key: "night-patrol", ...once, source: "night-patrol", cutoff }), once);
});

test("a held-order headline protects implicit body units", () => {
  const r = present(`<p>${leaked}</p>`, "day-watch", "ZVY-10663 update");
  assert.equal(r.bodyHtml, notice);
  assert.match(r.headline!, /owner no-reprint hold/);
});

test("a body-triggered hold also replaces an unscoped advisory headline", () => {
  const r = present('<p>ZVY-10663: hold remains.</p>', "night-patrol", "The only remaining step is one supervised physical attempt");
  assert.doesNotMatch(r.headline!, /supervised|physical attempt/);
  assert.match(r.headline!, /free-form filing withheld/);
});

test("inline and encoded full identifiers cannot bypass the unit guard", () => {
  for (const id of [
    'VS-000060', 'VS 60', 'ZVY 10663', 'ZVY–10663', 'ZVY&#45;10663',
    'ZVY&#x2d;10663', 'ZVY-&nbsp;10663', 'ZVY-<strong>10663</strong>', 'Z<small>VY-10663</small>',
    'ZVY-106<wbr>63', 'ZVY&#45 10663',
    'Z<b title="a>b">VY-10663</b>', 'ZVY-106&shy;63',
    'ZVY-106\u200b63', 'ZVY-106\u034f63', 'ZVY-106\ufe0f63',
    'ZVY-<br>10663', 'V<span>S-0000</span>60', 'ZVY−10663',
    'ZVY-10&emsp13;663', 'ZVY-10&emsp14;663', 'ＺＶＹ－１０６６３',
    'ZVY-10\u061c663', 'ZVY-10\u202a663',
    'Z<!-->VY-10663', 'Z<!--->VY-10663',
  ]) assert.equal(present(`<p>${id}: ${leaked}</p>`).bodyHtml, notice, id);
});

test("all free-form body text is withheld, including text before the identifier", () => {
  const body = '<p>One supervised attempt would settle it.</p><p>Restarts: none needed. Feed it to the real machine.</p><p>ZVY-10663: owner hold.</p><p>Unknown new heading: a completely novel suggestion.</p>';
  assert.equal(present(body).bodyHtml, notice + '<p>Restarts: none needed.</p>');
});

test("operational fields require complete atomic values and render no raw suffix", () => {
  for (const [source, expected] of [
    ['Restarts: 2 restarts. Feed it through the printer.', 'Restarts: 2.'],
    ['Bug queue: 0 new, 1 open. One supervised attempt would settle it.', 'Bug queue: 0 new, 1 open.'],
    ['Bug queue: 0 new on both desks. For the earlier order, send it.', 'Bug queue: 0 new on both desks.'],
    ['Restarts: none planned until the order is sent.', ''],
    ['Bug queue: 0 new unless the job is run.', ''],
    ['Restarts: 2.5 restarts.', ''],
    ['Bug queue: 0 new, 2 new.', ''],
    ['Bug queue: 0 new. Bug queue: 2 new.', ''],
    ['Restarts: none. Restarts: 2.', ''],
  ]) {
    const r = present(`<p>ZVY-10663: hold.</p><p>${source}</p>`);
    assert.equal(r.bodyHtml, notice + (expected ? `<p>${expected}</p>` : ''), source);
  }
});

test("contradictory operational fields are withheld rather than selected", () => {
  const r = present('<p>ZVY-10663: hold.</p><p>Restarts: none.</p><p>Restarts: 2.</p>');
  assert.equal(r.bodyHtml, notice);
});

test("unrelated numbers and other orders are byte-stable without a held subject", () => {
  for (const body of [
    '<p>Analytics run 10663 finished with 188 sessions.</p>',
    '<p>Invoice total: 10663. Run the report again.</p>',
    '<p>ZVY-10664 is unprinted; retry after checking the print log.</p>',
    '<h3>ZVY-10664</h3><p>Render it alone. Run it again.</p>',
  ]) assert.deepEqual(present(body), { bodyHtml: body, headline: null, held: false });
});

test("ambiguous structure fails closed rather than keeping an unclassified suffix", () => {
  for (const body of [
    `<table><tr><td>ZVY-10663</td><td>${leaked}</td></tr></table>`,
    `<p>ZVY-10663</p><!-- next unit --><p>${leaked}</p>`,
    `<p>ZVY-10663</p><broken ${leaked}`,
  ]) assert.equal(present(body).bodyHtml, notice);
});

test("free-form physical evidence is withheld without denying it or changing the source", () => {
  for (const body of [
    '<p>ZVY-10663: printedAt verified, signed QC and POD verified. Reprinting is prohibited.</p>',
    '<p>ZVY-10663: we have run it successfully on 29 Sep, with signed QC and POD verified.</p>',
    '<p>VS-000060: physical state unknown; do not reprint or retry.</p>',
  ]) {
    const input = { key: "night-patrol", headline: null, bodyHtml: body, source: "original physical evidence", cutoff };
    const r = presentBriefProse(input);
    assert.equal(r.bodyHtml, notice);
    assert.equal(input.bodyHtml, body);
    assert.equal(input.source, "original physical evidence");
    assert.match(r.bodyHtml!, /original filing is unchanged/);
    assert.match(r.bodyHtml!, /does not establish whether printing, QC or POD occurred/);
  }
});

test("full presentation including headline is idempotent", () => {
  for (const headline of [null, "Night patrol completed", "ZVY-10663 update"]) {
    const once = present(`<p>Restarts: none.</p><p>${oldNotice} ${leaked}</p><p>Bug queue: 0 new.</p>`, "night-patrol", headline);
    assert.deepEqual(presentBriefProse({ key: "night-patrol", ...once, source: "night-patrol", cutoff }), once);
  }
});

test("classification preserves red status and real filing provenance", () => {
  const row = { key: "night-patrol", status: "red", filed_for: "2026-10-07", updated_at: "2026-10-07T02:00:00Z",
    source: filingSource("night-patrol", "2026-10-07T01:50:00Z"), body_html: `<p>ZVY-10663: ${leaked}</p>` };
  const before = JSON.stringify(row);
  const r = classifySections([row], "2026-10-07", cutoff).sections[0];
  assert.equal(r.status, "red");
  assert.equal(r.bodyHtml, notice);
  assert.equal(r.observedAt, "2026-10-07T01:50:00Z");
  assert.equal(r.updatedAt, "2026-10-07T02:00:00Z");
  assert.equal(JSON.stringify(row), before);
});

// 8 Oct 2026: the overnight patrol named ZVY-10663 once, in "Held for proof",
// and the whole section — five owner decisions on other orders — vanished.
const PATROL_OCT8 = `<p><strong>Held for proof</strong><br>ZVY-10663 (Vijay Sales) is still not printed. The next step can only be proven by re-sending it to the physical printer.</p>
<p><strong>Needs Roheena</strong><br>
1. <strong>Top up Replicate.</strong> 612 designs wait.<br>
2. <strong>ZVY-20479 (Vijay Sales, OS order 766): was it printed?</strong> If it doesn't exist, it needs re-sending.<br>
3. <strong>ZVY-20484 (Livspace)</strong> needs your decision.<br>
4. <strong>ZVY-20488 (website)</strong> is waiting for you to approve its A4 sample.<br>
5. 10 tax invoice numbers are still in draft, the latest ZYV/2026-27/0066.</p>`;

test("a held filing still says which other orders it names, as bare references only", () => {
  const r = present(PATROL_OCT8, "night-patrol", "Nothing down overnight; two Vijay Sales orders stuck");
  assert.equal(r.bodyHtml, notice + `<p>${otherOrdersLine(["ZVY-20479", "ZVY-20484", "ZVY-20488"])}</p>`);
  assert.doesNotMatch(r.bodyHtml!, /re-sending|physical printer|approve|Replicate|was it printed/);
  assert.match(r.headline!, /free-form filing withheld/);
});

test("the held order itself, in any spelling, is never listed as another order", () => {
  for (const id of ["ZVY-10663", "ZVY 10663", "ZVY&#45;10663", "VS-000060", "VS 60", "VS-60", "ZVY-<b>10663</b>"]) {
    const r = present(`<p>${id}: hold.</p><p>ZVY-20479: check.</p>`);
    assert.equal(r.bodyHtml, notice + `<p>${otherOrdersLine(["ZVY-20479"])}</p>`, id);
  }
});

test("other-order references are canonical, deduplicated, capped and include the headline", () => {
  const r = present('<p>ZVY-10663 hold. zvy 20479, ZVY-20479 again, VS-61 and vs-000061.</p>', "night-patrol", "ZVY-20500 also");
  assert.equal(r.bodyHtml, notice + `<p>${otherOrdersLine(["ZVY-20500", "ZVY-20479", "VS-000061"])}</p>`);
  const many = Array.from({ length: 20 }, (_, i) => `ZVY-${20400 + i}`).join(", ");
  const capped = present(`<p>ZVY-10663 hold. ${many}.</p>`).bodyHtml!;
  assert.ok(capped.includes("ZVY-20411") && !capped.includes("ZVY-20412"));
});

test("a headline-only hold lists other orders and stays idempotent", () => {
  const once = present("", "night-patrol", "ZVY-10663 and ZVY-20479");
  assert.equal(once.bodyHtml, notice + `<p>${otherOrdersLine(["ZVY-20479"])}</p>`);
  assert.deepEqual(presentBriefProse({ key: "night-patrol", ...once, source: "night-patrol", cutoff }), once);
  const patrol = present(PATROL_OCT8);
  assert.deepEqual(presentBriefProse({ key: "night-patrol", ...patrol, source: "night-patrol", cutoff }), patrol);
});
