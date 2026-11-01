import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  A4L, M, ink, soft, accentByTheme, LOCKUP_W,
  fetchImage, wrap, drawLockup, lockupAt, footer,
} from "./project-pdf-shared";
import { paginateText } from "./project-pdf-text";
import type { Project } from "@/content/projects/types";

/**
 * The case-study book as a file — the thing a hotel GM forwards to an owner.
 *
 * The page itself is the better read (the drag reveal *is* the argument),
 * but a forwarded link opens to a login-less public page either way, so the
 * download exists for the person who wants to print it, attach it to an
 * email, or drop it into their own deck.
 *
 * Every image-bearing page carries a brand lockup in its bottom-right
 * corner: wordmark, "Commissioned work", zyvorah.com, and a QR that is both
 * scannable off paper and clickable in a viewer. That replaced a tiled
 * watermark. The tile protected a cropped screenshot better; the lockup is
 * far better at the thing this file exists to do, which is let someone who
 * likes the work reach us without going hunting. Deliberate trade.
 */

// Page constants, image fetching, wrapping, the lockup and the footer all
// live in project-pdf-shared.ts now — shared with the flip book's PDF so the
// two page grammars can never drift apart on the mechanics.

export async function renderProjectBookPdf(project: Project): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = accentByTheme[project.theme] ?? ink;
  const lockupLabel = project.slug === "the-lives-within" ? project.client : project.kind === "concept" ? "Concept study" : "Commissioned work";
  const footerLabel = `${project.title} · ${project.client}`;

  // ---- Cover ----------------------------------------------------------
  {
    const page = pdf.addPage(A4L);
    const cover = await fetchImage(project.cover, 1600);
    if (cover) {
      const img = await pdf.embedJpg(cover.jpeg);
      const scale = Math.max(A4L[0] / img.width, A4L[1] / img.height);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: (A4L[0] - w) / 2, y: (A4L[1] - h) / 2, width: w, height: h });
      // Scrim so the title reads over any photo.
      page.drawRectangle({ x: 0, y: 0, width: A4L[0], height: 190, color: rgb(0, 0, 0), opacity: 0.55 });
      // The scrim makes this corner dark whatever the photograph was doing,
      // so the lockup is told white outright rather than measuring the
      // unscrimmed pixels underneath and guessing wrong.
      await drawLockup(pdf, page, font, bold, { x: A4L[0] - LOCKUP_W - M, y: 28, onImage: true, label: lockupLabel });
    } else {
      page.drawRectangle({ x: 0, y: 0, width: A4L[0], height: A4L[1], color: rgb(0.95, 0.94, 0.91) });
    }
    const label = project.slug === "the-lives-within" ? "" : project.kind === "concept" ? "CONCEPT STUDY" : "COMMISSIONED PROJECT";
    page.drawText(project.slug === "the-lives-within" ? project.client.toUpperCase() : `${label} · ${project.client.toUpperCase()}`, {
      x: M, y: 130, size: 10, font: bold, color: cover ? rgb(1, 1, 1) : accent,
    });
    for (const [i, line] of wrap(project.title, bold, 30, A4L[0] - M * 2).entries()) {
      page.drawText(line, { x: M, y: 96 - i * 34, size: 30, font: bold, color: cover ? rgb(1, 1, 1) : ink });
    }
  }

  // Complete editorial sections flow across pages rather than clipping a long brief.
  function textSection(title: string, paragraphs: string[]) {
    for (const [index, lines] of paginateText(paragraphs.filter(Boolean), font, A4L[0] - M * 2).entries()) {
      const page = pdf.addPage(A4L);
      page.drawText(`${title.toUpperCase()}${index ? " · CONTINUED" : ""}`, { x: M, y: A4L[1] - M, size: 10, font: bold, color: accent });
      for (const line of lines) page.drawText(line.text, { x: M, y: line.y, size: 11, font, color: ink });
      footer(page, font, footerLabel);
    }
  }
  textSection("The brief", [project.standfirst, ...project.facts.map(f => `${f.label}: ${f.value}`), project.brief.intro, ...project.brief.requirements.map((r, i) => `${String(i + 1).padStart(2, "0")}. ${r}`)]);
  textSection("Our interpretation", project.interpretation);
  textSection("The palette", [project.palette.intro ?? "", ...project.palette.entries.map(e => `${e.name}: ${e.purpose}`), project.palette.note ?? ""]);
  textSection("The motifs", [project.motifs.intro ?? "", ...project.motifs.entries.map(e => `${e.name}: ${e.description}`)]);
  if (project.buildings) textSection(project.buildingLabel ?? "The wall programme", [project.buildings.intro ?? "", ...project.buildings.entries.flatMap(e => [e.name + " · " + e.subtitle, e.body, ...e.draws])]);
  if (project.wallHierarchy) textSection("Wall hierarchy", [project.wallHierarchy.intro ?? "", ...project.wallHierarchy.levels.map(e => `${e.level} (${e.share}%): ${e.purpose}`), project.wallHierarchy.note ?? ""]);
  if (project.journeys) textSection("Guest journeys", [project.journeys.intro ?? "", ...project.journeys.entries.flatMap(e => [e.who + ": " + e.route.join(" > "), e.body])]);
  textSection(project.slug === "the-lives-within" ? "From artwork to installation" : "From concept to installation", [project.process.intro ?? "", ...project.process.steps.map(e => `${e.title}: ${e.body}`)]);
  textSection(project.productionNote.title, [project.productionNote.body, ...project.productionNote.points, project.shop?.body ?? "", project.shop?.href ? `Explore the wall references: zyvorah.com${project.shop.href}` : ""]);

  // ---- One page per chapter ---------------------------------------------
  for (const ch of project.chapters) {
    const page = pdf.addPage(A4L);
    const imgKey = ch.curated;
    const buf = await fetchImage(imgKey, 1400);

    const imgAreaW = A4L[0] - M * 2;
    const imgAreaH = 330;
    const imgTop = A4L[1] - M;

    if (buf) {
      const img = await pdf.embedJpg(buf.jpeg);
      const scale = Math.min(imgAreaW / img.width, imgAreaH / img.height);
      const w = img.width * scale, h = img.height * scale;
      const ix = M + (imgAreaW - w) / 2;
      const iy = imgTop - h;
      page.drawImage(img, { x: ix, y: iy, width: w, height: h });
      const at = lockupAt(ix, iy, w);
      await drawLockup(pdf, page, font, bold, { ...at, onImage: true, label: lockupLabel });
    } else {
      page.drawRectangle({ x: M, y: imgTop - imgAreaH, width: imgAreaW, height: imgAreaH, color: rgb(0.93, 0.92, 0.89) });
    }

    let y = imgTop - imgAreaH - 30;
    page.drawText(ch.space.toUpperCase(), { x: M, y, size: 9, font: bold, color: accent });
    y -= 20;
    page.drawText(ch.title, { x: M, y, size: 18, font: bold, color: ink });
    y -= 26;
    for (const line of wrap(ch.rationale, font, 11, A4L[0] - M * 2)) {
      page.drawText(line, { x: M, y, size: 11, font, color: soft });
      y -= 15;
    }
    footer(page, font, footerLabel);
  }

  // ---- Closing / ask ------------------------------------------------------
  {
    const page = pdf.addPage(A4L);
    page.drawRectangle({ x: 0, y: 0, width: A4L[0], height: A4L[1], color: rgb(0.97, 0.965, 0.95) });
    const heading = project.ask?.heading ?? "Send us one wall.";
    const body = project.ask?.body ?? "";
    let y = A4L[1] / 2 + 60;
    for (const [i, line] of wrap(heading, bold, 24, A4L[0] - M * 2 - 200).entries()) {
      page.drawText(line, { x: M, y: y - i * 30, size: 24, font: bold, color: ink });
    }
    y -= 70;
    for (const line of wrap(body, font, 12, 480)) {
      page.drawText(line, { x: M, y, size: 12, font, color: soft });
      y -= 17;
    }
    y -= 20;
    page.drawText("zyvorah.com/commercial", { x: M, y, size: 12, font: bold, color: accent });

    // The closing page is the one people act from, so the QR gets room here
    // rather than the corner treatment used over artwork. Pale ground, so the
    // ink is dark.
    await drawLockup(pdf, page, font, bold, {
      x: A4L[0] - LOCKUP_W - M, y: A4L[1] / 2 - 30, onImage: false, label: lockupLabel,
    });
    page.drawText("Scan to start a project", {
      x: A4L[0] - LOCKUP_W - M, y: A4L[1] / 2 - 46, size: 8, font, color: soft,
    });
    footer(page, font, footerLabel);
  }

  return pdf.save();
}
