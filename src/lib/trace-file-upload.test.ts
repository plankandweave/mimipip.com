import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTraceVideoDuration, saveTraceFile, traceFileType, type TraceUploadProgress } from "./trace-file-upload";

test("saved media accepts only supported containers and enforces exact size/duration boundaries", () => {
  for (const type of ["video/mp4", "video/quicktime", "video/webm"]) assert.equal(traceFileType({ type, size: 96 * 1024 * 1024 }), "video");
  for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(traceFileType({ type, size: 6 * 1024 * 1024 }), "photo");
  for (const size of [0, 96 * 1024 * 1024 + 1]) assert.throws(() => traceFileType({ type: "video/mp4", size }));
  assert.throws(() => traceFileType({ type: "application/pdf", size: 100 }));
  assert.throws(() => traceFileType({ type: "image/jpeg", size: 6 * 1024 * 1024 + 1 }));
  for (const seconds of [0, NaN, Infinity, 180.01]) assert.throws(() => checkTraceVideoDuration(seconds));
  checkTraceVideoDuration(180);
});

test("failed PUT cannot finish; retry reuses the same walk and photo mark", async () => {
  const calls: string[] = [];
  const progress: TraceUploadProgress = {};
  let fail = true;
  const input = {
    kind: "photo" as const, blob: new Blob(["synthetic"], { type: "image/jpeg" }), seconds: 0, name: "Test", where: "Empty wall", progress,
    post: async (_path: string, b: Record<string, unknown>) => {
      calls.push(String(b.action));
      return { walkId: "walk", markId: "mark", signedUrl: "https://example.test/upload" };
    },
    put: async () => { if (fail) throw new Error("offline"); },
  };
  await assert.rejects(saveTraceFile(input), /offline/);
  assert.equal(progress.ended, undefined);
  assert.deepEqual(calls, ["start", "piece", "mark", "sign"]);
  fail = false;
  await saveTraceFile(input);
  assert.deepEqual(calls, ["start", "piece", "mark", "sign", "sign", "commit", "end"]);
  assert.equal(progress.ended, true);
});

test("failed receipt keeps committed video and retries only completion, never marks or transcribes", async () => {
  const calls: string[] = [];
  let fail = true;
  const input = {
    kind: "video" as const, blob: new Blob(["synthetic"], { type: "video/mp4" }), seconds: 4, name: "Test", where: "Empty corridor", progress: {} as TraceUploadProgress,
    post: async (_path: string, b: Record<string, unknown>) => {
      calls.push(String(b.action));
      if (b.action === "end" && fail) throw new Error("receipt unavailable");
      return { walkId: "walk", signedUrl: "https://example.test/upload" };
    },
    put: async () => {},
  };
  await assert.rejects(saveTraceFile(input));
  assert.equal(input.progress.committed, true);
  assert.equal(input.progress.ended, undefined);
  fail = false;
  await saveTraceFile(input);
  assert.deepEqual(calls, ["start", "piece", "sign", "commit", "end", "end"]);
});
