import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { PROJECTS } from "@/content/projects";
import { conceptShopUrl, getShopConcept } from "./shop-concepts";

test("every sellable case study links from the case-study host to a real storefront route", () => {
  for (const project of PROJECTS) {
    if (!getShopConcept(project.slug) && !project.shop) continue;
    const destination = new URL(conceptShopUrl(project.slug));
    assert.equal(destination.origin, "https://zyvorah.com", project.slug);
    const parts = destination.pathname.split("/").filter(Boolean);
    const hasDedicatedRoute = existsSync(`src/app/${parts.join("/")}/page.tsx`);
    const hasGenericConceptRoute = parts.length === 2 && parts[0] === "concepts" &&
      existsSync("src/app/concepts/[slug]/page.tsx");
    const hasHospitalRoute = parts.length === 2 && parts[0] === "hospitals" &&
      existsSync("src/app/hospitals/[space]/page.tsx");
    assert.ok(hasDedicatedRoute || hasGenericConceptRoute || hasHospitalRoute, `${project.slug}: ${destination.pathname}`);
    if (project.shop?.href.startsWith("/")) {
      assert.equal(destination.pathname, project.shop.href, project.slug);
    }
  }
});
