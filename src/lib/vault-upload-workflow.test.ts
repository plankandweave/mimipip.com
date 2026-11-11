import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as rules from "./vault-image-notes";
import * as kinds from "./vault-kinds";

type Element = { type: unknown; props: Record<string, unknown> };
type Exports = {
  default: (props: { onChanged: () => Promise<void> }) => Element;
  AnnotationEditor: (props: {
    url: string;
    value: rules.ImageNotes;
    onChange: (n: rules.ImageNotes) => void;
    disabled: boolean;
  }) => Element;
  MarkedPicture: (props: { url: string; notes: rules.ImageNotes }) => Element;
  sendVaultFile: (
    file: File,
    key: string,
    details: Record<string, unknown>,
  ) => Promise<string>;
  AudioNote: (props: {
    parentId: string;
    onChanged: () => Promise<void>;
  }) => Element;
};
function component(
  fetcher: typeof fetch,
  microphone: () => Promise<unknown> = async () => {
    throw new DOMException("denied", "NotAllowedError");
  },
  deferUpdates = false,
) {
  const pending: (() => void)[] = [];
  const state: unknown[] = [];
  let index = 0;
  const effects: (() => void)[] = [];
  let first = true;
  const hooks = {
    useState: (initial: unknown) => {
      const i = index++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (v: unknown) => {
          const update = () => { state[i] = typeof v === "function" ? v(state[i]) : v; };
          if (deferUpdates) pending.push(update); else update();
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = index++;
      if (!(i in state)) state[i] = { current: initial };
      return state[i];
    },
    useEffect: (fn: () => void) => {
      if (first) effects.push(fn);
    },
  };
  const exports = {} as Exports;
  const source = readFileSync(
    new URL("../app/partners/[slug]/vault-image-upload.tsx", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      File,
      Blob,
      DOMException,
      crypto,
      fetch: fetcher,
      URL: {
        createObjectURL: () => "blob:synthetic",
        revokeObjectURL: () => {},
      },
      queueMicrotask,
      setTimeout,
      clearTimeout,
      navigator: { mediaDevices: { getUserMedia: microphone } },
      MediaRecorder: class {},
      require: (n: string) =>
        n === "react"
          ? hooks
          : n === "react/jsx-runtime"
            ? {
                jsx: (type: unknown, props: Record<string, unknown>) => ({
                  type,
                  props,
                }),
                jsxs: (type: unknown, props: Record<string, unknown>) => ({
                  type,
                  props,
                }),
              }
            : n === "@/lib/vault-image-notes"
              ? rules
              : n === "@/lib/vault-kinds"
                ? kinds
                : {},
    },
  );
  const render = (picture?: { url: string; notes: rules.ImageNotes }) => {
    index = 0;
    const tree = picture
      ? exports.MarkedPicture(picture)
      : exports.AudioNote({
          parentId: "own-picture",
          onChanged: async () => {},
        });
    if (first) {
      effects.forEach((f) => f());
      first = false;
    }
    return tree;
  };
  const renderEditor = (
    value: rules.ImageNotes,
    onChange: (n: rules.ImageNotes) => void,
  ) => {
    index = 0;
    return exports.AnnotationEditor({
      url: "blob:test",
      value,
      onChange,
      disabled: false,
    });
  };
  return { exports, render, renderEditor,
    renderUploader: () => { index = 0; return exports.default({ onChanged: async () => {} }); },
    flushUpdates: () => { while (pending.length) pending.shift()!(); },
  };
}
function find(
  tree: unknown,
  match: (e: Element) => boolean,
): Element | undefined {
  if (Array.isArray(tree)) {
    for (const v of tree) {
      const found = find(v, match);
      if (found) return found;
    }
  } else if (tree && typeof tree === "object" && "props" in tree) {
    const e = tree as Element;
    if (match(e)) return e;
    return find(e.props.children, match);
  }
}
const json = (v: unknown, status = 200) => Response.json(v, { status });
test("repeat selection retains files when React defers updates past input reset", () => {
  const c = component(fetch, undefined, true);
  for (const name of ["first.png", "second.png"]) {
    const input = find(c.renderUploader(), e => e.type === "input" && e.props.type === "file")!;
    const file = new File(["synthetic"], name, { type: "image/png" });
    let files: File[] = [file];
    const target = { get files() { return files; }, set value(_value: string) { files = []; } };
    (input.props.onChange as (event: unknown) => void)({ target });
    c.flushUpdates();
    assert.ok(find(c.renderUploader(), e => (e.props.draft as {file?: File} | undefined)?.file === file));
  }
});
test("interrupted upload retries with same key; lost commit response does not duplicate a saved slot", async () => {
  let signed = 0,
    committed = 0,
    puts = 0,
    saved = false;
  const keys: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    if (url === "/synthetic-put") {
      puts++;
      if (puts === 1) throw new Error("offline");
      return json({ ok: true });
    }
    const b = JSON.parse(String(init?.body));
    if (b.action === "sign") {
      signed++;
      keys.push(b.uploadKey);
      return json({
        ok: true,
        id: "one-slot",
        complete: saved,
        signedUrl: "/synthetic-put",
      });
    }
    committed++;
    saved = true;
    if (committed === 1) throw new Error("response lost");
    return json({ ok: true });
  };
  const { exports } = component(fetcher);
  const f = new File(["x"], "test.jpg", { type: "image/jpeg" });
  await assert.rejects(exports.sendVaultFile(f, "same-key", {}), /offline/);
  await assert.rejects(
    exports.sendVaultFile(f, "same-key", {}),
    /response lost/,
  );
  assert.equal(await exports.sendVaultFile(f, "same-key", {}), "one-slot");
  assert.equal(signed, 3);
  assert.equal(puts, 2);
  assert.equal(committed, 1);
  assert.deepEqual(keys, ["same-key", "same-key", "same-key"]);
});
test("audio upload denial is shown; no commit follows denied storage", async () => {
  let calls = 0;
  const { exports } = component(async () => {
    calls++;
    return calls === 1
      ? json({ ok: true, id: "audio", signedUrl: "/put" })
      : json({ error: "denied" }, 403);
  });
  await assert.rejects(
    exports.sendVaultFile(new File(["x"], "note.mp3"), "key", {
      action: "audio-sign",
      parentId: "own",
    }),
    /interrupted/,
  );
  assert.equal(calls, 2);
});
test("microphone denial presents file alternative without recording or uploading", async () => {
  let network = 0;
  const h = component(async () => {
    network++;
    throw new Error("must not upload");
  });
  const tree = h.render();
  const record = find(
    tree,
    (e) => e.type === "button" && e.props.children === "Record audio",
  );
  assert.ok(record);
  (record.props.onClick as () => void)();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const alert = find(h.render(), (e) => e.props.role === "alert");
  assert.match(
    String(alert?.props.children),
    /Microphone permission was denied/,
  );
  assert.equal(network, 0);
});

test("preview ignores empty URL and recovers when a failed image source changes", () => {
  const h = component(async () => {
    throw new Error("no network");
  });
  const notes: rules.ImageNotes = { space: "Room", wall: "North", marks: [] };
  assert.equal(
    find(h.render({ url: "", notes }), (e) => e.type === "img"),
    undefined,
  );
  const old = h.render({ url: "blob:old", notes });
  (find(old, (e) => e.type === "img")!.props.onError as () => void)();
  assert.equal(
    find(h.render({ url: "blob:old", notes }), (e) => e.type === "svg"),
    undefined,
  );
  assert.ok(
    find(h.render({ url: "blob:new", notes }), (e) => e.type === "svg"),
  );
  // A late error from the obsolete element must not hide the new picture.
  (find(old, (e) => e.type === "img")!.props.onError as () => void)();
  assert.ok(
    find(h.render({ url: "blob:new", notes }), (e) => e.type === "svg"),
  );
});

test("cancel and undo discard pending annotation state; a saved note starts fresh", () => {
  const h = component(async () => {
    throw new Error("no network");
  });
  let value: rules.ImageNotes = { space: "Room", wall: "North", marks: [] };
  const render = () =>
    h.renderEditor(value, (n) => {
      value = n;
    });
  const click = (label: string) => {
    const e = find(
      render(),
      (e) => e.type === "button" && e.props.children === label,
    )!;
    (e.props.onClick as () => void)();
  };
  const type = (text: string) =>
    (
      find(render(), (e) => e.type === "input")!.props.onChange as (
        e: unknown,
      ) => void
    )({ target: { value: text } });
  click("Add note");
  type("Discard this");
  click("Cancel annotation");
  click("Add note");
  assert.equal(find(render(), (e) => e.type === "input")!.props.value, "");
  type("Keep switch");
  click("Place at top left");
  click("Add note");
  assert.equal(find(render(), (e) => e.type === "input")!.props.value, "");
  assert.equal(value.marks.length, 1);
  click("Add arrow");
  const picture = find(render(), (e) => typeof e.props.onPoint === "function")!;
  (picture.props.onPoint as (x: number, y: number) => void)(0.2, 0.3);
  click("Undo last");
  assert.equal(value.marks.length, 0);
  assert.equal(
    find(render(), (e) => e.props.role === "status"),
    undefined,
  );
  click("Add arrow");
  assert.match(
    String(find(render(), (e) => e.props.role === "status")!.props.children),
    /Tap where the arrow begins/,
  );
});
