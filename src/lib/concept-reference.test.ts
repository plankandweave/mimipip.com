import assert from "node:assert/strict";
import test from "node:test";
import { getConceptReference } from "./concept-reference";
import { PROJECTS } from "@/content/projects";

test("all apartment landing pages can submit a brief, including the main paid landing", () => {
  for (const slug of ["angan-by-the-sea", "raat-bagh", "extreme-modernist", "new-york-apartment"]) {
    assert.ok(getConceptReference(slug)?.title, slug);
  }
});

test("existing projects remain accepted and invented references are refused", () => {
  for (const project of PROJECTS) assert.equal(getConceptReference(project.slug)?.title, project.title);
  assert.equal(getConceptReference("not-a-real-concept"), undefined);
  assert.equal(getConceptReference(""), undefined);
});
