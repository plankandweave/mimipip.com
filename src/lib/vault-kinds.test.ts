import { test } from "node:test";
import assert from "node:assert/strict";
import { guessVaultKind, titleFromFileName, vaultFileExtension, vaultKindLabel, vaultStoredType } from "./vault-kinds";

test("files are accepted by an allow-list, with the name as fallback", () => {
  assert.equal(vaultFileExtension("application/pdf", "Master_Plan.pdf"), "pdf");
  assert.equal(vaultFileExtension("", "A-Block.dwg"), "dwg");
  assert.equal(vaultFileExtension("application/octet-stream", "ground floor.DXF"), "dxf");
  assert.equal(vaultFileExtension("image/jpeg", "IMG_0021.jpeg"), "jpg");
  assert.equal(vaultFileExtension("application/x-msdownload", "setup.exe"), null);
  assert.equal(vaultFileExtension("text/html", "page.html"), null);
});

test("a stored type is never 'octet-stream' when the extension says more", () => {
  assert.equal(vaultStoredType("application/octet-stream", "pdf"), "application/pdf");
  assert.equal(vaultStoredType("image/png", "png"), "image/png");
  assert.equal(vaultStoredType("", "dwg"), "application/acad");
});

test("the drawer is guessed from the file, and a person can override", () => {
  assert.equal(guessVaultKind("application/pdf", "Campus Master Plan 2026.pdf"), "plan");
  assert.equal(guessVaultKind("", "B1-block.dwg"), "plan");
  assert.equal(guessVaultKind("image/jpeg", "IMG_1024.jpg"), "photo");
  assert.equal(guessVaultKind("application/pdf", "Rathinam brand book.pdf"), "brand");
  assert.equal(guessVaultKind("application/zip", "stuff.zip"), "other");
  assert.equal(vaultKindLabel("plan"), "Plans and drawings");
  assert.equal(vaultKindLabel("nonsense"), "Documents");
});

test("a title reads like a name, not a file name", () => {
  assert.equal(titleFromFileName("Master_Plan-2026.pdf"), "Master Plan 2026");
  assert.equal(titleFromFileName(".pdf"), "Untitled");
});
