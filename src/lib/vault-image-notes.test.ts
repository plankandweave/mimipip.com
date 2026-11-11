import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as rules from "./vault-image-notes";
import * as kinds from "./vault-kinds";

const key = "a0000000-0000-4000-8000-000000000001";
const notes = {
  space: " Consultation 1 ",
  wall: " Behind desk ",
  marks: [{ kind: "note", x: 0.1, y: 0.2, text: " Keep switch clear " }],
};
test("labels mandatory for pictures, optional marks validated and normalized", () => {
  assert.deepEqual(rules.parseImageNotes(notes), {
    space: "Consultation 1",
    wall: "Behind desk",
    marks: [{ kind: "note", x: 0.1, y: 0.2, text: "Keep switch clear" }],
  });
  for (const value of [
    null,
    {},
    { ...notes, space: " " },
    { ...notes, wall: " " },
    { ...notes, marks: [{ kind: "note", x: NaN, y: 0, text: "x" }] },
    { ...notes, marks: Array(31).fill(notes.marks[0]) },
    { ...notes, marks: [{ kind: "arrow", x: 0, y: 0, x2: 2, y2: 0 }] },
  ])
    assert.throws(() => rules.parseImageNotes(value));
  assert.equal(rules.parseImageNotes({ ...notes, marks: [] }).marks.length, 0);
  assert.equal(rules.imageNotesEnabled("another-client"), false);
  assert.equal(rules.audioType("video/mp4", "x.mp4"), null);
  assert.deepEqual(rules.audioType("audio/webm;codecs=opus", "x.webm"), {
    ext: "webm",
    type: "audio/webm",
  });
});
// Minimal in-memory PostgREST double, executing the production upload preparer.
function harness() {
  const rows: Record<string, Record<string, unknown>> = {};
  let signs = 0;
  const sb = {
    from: () => {
      const filters: Record<string, unknown> = {};
      const q = {
        upsert: async (row: Record<string, unknown>) => {
          rows[String(row.id)] ??= structuredClone(row);
          return { error: null };
        },
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        is: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        maybeSingle: async () => ({
          data:
            Object.values(rows).find((r) =>
              Object.entries(filters).every(([k, v]) => r[k] === v),
            ) ?? null,
          error: null,
        }),
      };
      return q;
    },
  };
  const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
  const source = readFileSync(
    new URL("./vault-notes-upload.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Response,
      Date,
      JSON,
      require: (n: string) =>
        ({
          "./corporate-auth": {
            can: (s: { allowed: boolean }) => s.allowed,
            sessionActor: () => ({ name: "Synthetic" }),
          },
          "./vault-image-notes": rules,
          "./vault-kinds": kinds,
          "./vault": {
            vaultPath: (slug: string, id: string, ext: string) =>
              `vault-private/${slug}/${id}.${ext}`,
          },
          "./corporate-art-store": {
            caSignedUploadUrl: (path: string) => {
              signs++;
              return { signedUrl: path };
            },
          },
        })[n] ?? {},
    },
  );
  const session = {
    account: { id: "account-a", slug: "superhealth" },
    email: "a@example.test",
    allowed: true,
  };
  const prepare = (b: Record<string, unknown>, s = session) =>
    exports.prepareNotesUpload(sb, s, "blueprint-a", b) as Promise<Response>;
  return { rows, session, prepare, signs: () => signs };
}
const picture = {
  action: "sign",
  uploadKey: key,
  fileName: "picture.jpg",
  contentType: "image/jpeg",
  bytes: 42,
  imageNotes: notes,
};
test("server rejects omitted labels before storing, but plans need none; permissions stay scoped", async () => {
  const h = harness();
  assert.equal(
    (await h.prepare({ ...picture, imageNotes: undefined })).status,
    400,
  );
  assert.equal(Object.keys(h.rows).length, 0);
  assert.equal(
    (
      await h.prepare({
        ...picture,
        imageNotes: undefined,
        fileName: "plan.pdf",
        contentType: "application/pdf",
      })
    ).status,
    200,
  );
  assert.equal(
    (await h.prepare(picture, { ...h.session, allowed: false })).status,
    403,
  );
  assert.equal(
    (
      await h.prepare(picture, {
        ...h.session,
        account: { id: "other", slug: "other" },
      })
    ).status,
    403,
  );
});
test("retry/concurrent sign is one slot; jsonb ordering and saved response replay preserve notes", async () => {
  const h = harness();
  await Promise.all([h.prepare(picture), h.prepare(picture)]);
  assert.equal(Object.keys(h.rows).length, 1);
  const saved = h.rows[key];
  saved.image_notes = {
    marks: rules.parseImageNotes(notes).marks,
    wall: "Behind desk",
    space: "Consultation 1",
  };
  assert.equal((await h.prepare(picture)).status, 200);
  assert.equal(
    (
      await h.prepare({
        ...picture,
        imageNotes: { ...notes, space: "Different" },
      })
    ).status,
    409,
  );
  saved.deleted_at = null;
  const r = await h.prepare(picture);
  assert.equal((await r.json()).complete, true);
  assert.equal(h.signs(), 3);
  assert.equal(
    (await h.prepare(picture, { ...h.session, email: "b@example.test" }))
      .status,
    409,
  );
});
test("audio belongs to own committed picture; tenant spoof, foreign member and oversize denied", async () => {
  const h = harness();
  await h.prepare(picture);
  h.rows[key].deleted_at = null;
  const audio = {
    action: "audio-sign",
    uploadKey: "b0000000-0000-4000-8000-000000000001",
    parentId: key,
    fileName: "note.mp3",
    contentType: "audio/mpeg",
    bytes: 100,
  };
  assert.equal(
    (await h.prepare(audio, { ...h.session, email: "b@example.test" })).status,
    403,
  );
  assert.equal(
    (
      await h.prepare(audio, {
        ...h.session,
        account: { id: "account-b", slug: "saraswati-ytit" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await h.prepare({ ...audio, bytes: rules.MAX_AUDIO_BYTES + 1 })).status,
    413,
  );
  assert.equal((await h.prepare(audio)).status, 200);
  assert.equal(h.rows[audio.uploadKey].parent_document_id, key);
  assert.equal(h.rows[audio.uploadKey].account_id, "account-a");
});

test("picture bytes cannot bypass labels through a PDF filename or MIME claim", () => {
  assert.equal(
    rules.pictureBytes(new Uint8Array([255, 216, 255, 0]).buffer),
    true,
  );
  assert.equal(
    rules.pictureBytes(new Uint8Array([137, 80, 78, 71, 13, 10]).buffer),
    true,
  );
  assert.equal(
    rules.pictureBytes(new TextEncoder().encode("RIFF1234WEBPabc").buffer),
    true,
  );
  assert.equal(
    rules.pictureBytes(new TextEncoder().encode('<svg xmlns="x">').buffer),
    true,
  );
  assert.equal(
    rules.pictureBytes(new TextEncoder().encode("%PDF-1.7").buffer),
    false,
  );
});
