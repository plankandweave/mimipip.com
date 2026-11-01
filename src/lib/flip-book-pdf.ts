import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  A4L, M, ink, soft, accentByTheme, LOCKUP_W,
  fetchImages, wrap, drawLockup, lockupAt, footer,
} from "./project-pdf-shared";
import type { FlipSpread, Project } from "@/content/projects/types";

/**
 * The flip book as a file — the same left-to-right read, one landscape A4
 * page per spread, downloaded from the same button as every other book.
 *
 * The page grammar mirrors the web renderer: plates keep their sideways
 * caption (pdf-lib rotates text about its origin, so a -90° draw stepping
 * x by line-height reads top-to-bottom exactly like `writing-mode:
 * vertical-rl`), panoramas bleed to the page edge, and the night spreads
 * carry the same indigo paper. All imagery is prefetched through the shared
 * bounded-concurrency fetcher — this book carries ~24 images and fetching
 * them serially would brush the route's 60-second budget.
 */

const NIGHT = rgb(0.078, 0.11, 0.149); // #141C26 — the night paper
const NIGHT_INK = rgb(0.91, 0.894, 0.859);
const NIGHT_MUTED = rgb(0.576, 0.627, 0.651);
const PAPER = rgb(0.953, 0.941, 0.914); // #F3F0E9 — the dusk theme's ground

function ground(page: PDFPage, dark: boolean | undefined) {
  page.drawRectangle({
    x: 0, y: 0, width: A4L[0], height: A4L[1],
    color: dark ? NIGHT : PAPER,
  });
}

/** The sideways band: caption lines drawn at -90°, stepping right to left,
 *  reading top-to-bottom — the print twin of the web's vertical-rl. */
function drawBand(
  page: PDFPage, font: PDFFont, bold: PDFFont,
  x: number, top: number,
  caption: { number?: string; title: string; space?: string; note?: string },
  opts: { dark?: boolean; accent: ReturnType<typeof rgb> },
) {
  const mutedInk = opts.dark ? NIGHT_MUTED : soft;
  const mainInk = opts.dark ? NIGHT_INK : ink;
  let cx = x;
  const line = (text: string, size: number, f: PDFFont, color: ReturnType<typeof rgb>, gap: number) => {
    page.drawText(text, { x: cx, y: top, size, font: f, color, rotate: degrees(-90) });
    cx += size + gap;
  };
  if (caption.number) line(caption.number, 13, bold, opts.accent, 8);
  line(caption.title.toUpperCase(), 15, bold, mainInk, 9);
  if (caption.space) line(caption.space.toUpperCase(), 8, font, mutedInk, 7);
  if (caption.note) {
    for (const l of wrap(caption.note, font, 8.5, A4L[1] - M * 2)) line(l, 8.5, font, mutedInk, 4.5);
  }
}

export async function renderFlipBookPdf(project: Project): Promise<Uint8Array> {
  const spreads: FlipSpread[] = project.flip?.spreads ?? [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = accentByTheme[project.theme] ?? ink;
  const lockupLabel = project.slug === "the-lives-within" ? project.client : project.kind === "concept" ? "Concept study" : "Commissioned work";
  const footerLabel = `${project.title} · ${project.client}`;

  // Every image the book needs, fetched once each with bounded concurrency.
  const wanted: { key: string; maxWidth: number }[] = [];
  for (const s of spreads) {
    // The cover earns full resolution; a panorama prints 842pt wide, so 1200px
    // already exceeds what the page can show and 110 of them at 1600 was the
    // difference between a comfortable download and a timeout.
    if (s.type === "cover") wanted.push({ key: s.image, maxWidth: 1600 });
    if (s.type === "panorama") wanted.push({ key: s.image, maxWidth: 1200 });
    if (s.type === "plate") wanted.push({ key: s.image, maxWidth: 1400 });
    if (s.type === "pair") for (const i of s.images) wanted.push({ key: i.key, maxWidth: 900 });
    // The gallery is thumbnails on one page — small fetches, but seventy of
    // them, so they go through the same bounded-concurrency prefetch.
    if (s.type === "gallery") for (const i of s.images) wanted.push({ key: i.key, maxWidth: 260 });
  }
  const images = await fetchImages(wanted);
  const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();
  const embed = async (key: string) => {
    const hit = embedded.get(key);
    if (hit) return hit;
    const prep = images.get(key);
    if (!prep) return null;
    const e = await pdf.embedJpg(prep.jpeg);
    embedded.set(key, e);
    return e;
  };

  for (const s of spreads) {
    const page = pdf.addPage(A4L);
    const dark = "dark" in s ? s.dark : undefined;

    if (s.type === "cover") {
      const img = await embed(s.image);
      if (img) {
        const scale = Math.max(A4L[0] / img.width, A4L[1] / img.height);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (A4L[0] - w) / 2, y: (A4L[1] - h) / 2, width: w, height: h });
      } else {
        ground(page, true);
      }
      page.drawRectangle({ x: 0, y: 0, width: A4L[0], height: 200, color: rgb(0, 0, 0), opacity: 0.55 });
      const label = project.slug === "the-lives-within" ? "" : project.kind === "concept" ? "CONCEPT STUDY" : "COMMISSIONED PROJECT";
      page.drawText(project.slug === "the-lives-within" ? project.client.toUpperCase() : `${label} · ${project.client.toUpperCase()}`, { x: M, y: 150, size: 10, font: bold, color: rgb(1, 1, 1) });
      page.drawText(project.title, { x: M, y: 106, size: 38, font: bold, color: rgb(1, 1, 1) });
      for (const [i, line] of wrap(project.standfirst, font, 11.5, A4L[0] - M * 2 - 160).entries()) {
        page.drawText(line, { x: M, y: 80 - i * 16, size: 11.5, font, color: rgb(1, 1, 1), opacity: 0.94 });
      }
      await drawLockup(pdf, page, font, bold, { x: A4L[0] - LOCKUP_W - M, y: 28, onImage: true, label: lockupLabel });
      continue;
    }

    ground(page, dark);
    const mainInk = dark ? NIGHT_INK : ink;
    const mutedInk = dark ? NIGHT_MUTED : soft;

    if (s.type === "passage") {
      let y = A4L[1] / 2 + 70;
      if (s.eyebrow) {
        const w = bold.widthOfTextAtSize(s.eyebrow.toUpperCase(), 9);
        page.drawText(s.eyebrow.toUpperCase(), { x: (A4L[0] - w) / 2, y, size: 9, font: bold, color: dark ? rgb(0.761, 0.647, 0.404) : accent });
        y -= 34;
      }
      for (const line of wrap(s.title, bold, 26, 560)) {
        const w = bold.widthOfTextAtSize(line, 26);
        page.drawText(line, { x: (A4L[0] - w) / 2, y, size: 26, font: bold, color: mainInk });
        y -= 32;
      }
      y -= 8;
      for (const para of s.body) {
        for (const line of wrap(para, font, 11, 440)) {
          const w = font.widthOfTextAtSize(line, 11);
          page.drawText(line, { x: (A4L[0] - w) / 2, y, size: 11, font, color: mutedInk });
          y -= 16;
        }
        y -= 8;
      }
      footer(page, font, footerLabel, mutedInk);
      continue;
    }

    if (s.type === "plate" || s.type === "pair") {
      const areaH = A4L[1] - M * 2;
      const bandW = 74;
      if (s.type === "plate") {
        const img = await embed(s.image);
        if (img) {
          const scale = Math.min((A4L[0] - M * 2 - bandW) / img.width, areaH / img.height);
          const w = img.width * scale, h = img.height * scale;
          const ix = M + (A4L[0] - M * 2 - bandW - w) / 2;
          const iy = M + (areaH - h) / 2;
          page.drawImage(img, { x: ix, y: iy, width: w, height: h });
          const at = lockupAt(ix, iy, w);
          await drawLockup(pdf, page, font, bold, { ...at, onImage: true, label: lockupLabel });
          drawBand(page, font, bold, ix + w + 26, iy + h - 4, s.caption, { dark, accent });
        }
      } else {
        const gap = 12;
        const first = await embed(s.images[0].key);
        const second = await embed(s.images[1].key);
        if (first && second) {
          // Fit BOTH axes: two portrait sheets fill the height, but two
          // landscape sheets side by side at full height would run half a
          // page off the right edge, so the pair scales down until it fits
          // the width the band leaves free.
          const availW = A4L[0] - M * 2 - bandW;
          let h = areaH;
          const widthAt = (hh: number) =>
            (first.width / first.height) * hh + gap + (second.width / second.height) * hh;
          if (widthAt(h) > availW) h = (h * (availW - gap)) / (widthAt(h) - gap);
          const w1 = (first.width / first.height) * h;
          const w2 = (second.width / second.height) * h;
          const total = w1 + gap + w2;
          const startX = M + (availW - total) / 2;
          const startY = M + (areaH - h) / 2;
          page.drawImage(first, { x: startX, y: startY, width: w1, height: h });
          page.drawImage(second, { x: startX + w1 + gap, y: startY, width: w2, height: h });
          const at = lockupAt(startX + w1 + gap, startY, w2);
          await drawLockup(pdf, page, font, bold, { ...at, onImage: true, label: lockupLabel });
          drawBand(page, font, bold, M + availW + 26, startY + h - 4, s.caption, { dark, accent });
        }
      }
      footer(page, font, footerLabel, mutedInk);
      continue;
    }

    if (s.type === "panorama") {
      const img = await embed(s.image);
      if (img) {
        const scale = Math.max(A4L[0] / img.width, A4L[1] / img.height);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (A4L[0] - w) / 2, y: (A4L[1] - h) / 2, width: w, height: h });
      }
      // The caption band goes down BEFORE the lockup, not after.
      //
      // A page's content stream paints in order, so a band drawn last is a
      // band drawn on top. This one is 46pt tall and full-bleed, and the
      // lockup sits 28pt off the same edge — so painting it afterwards laid
      // 40% black over the lower half of the QR's white card. The code still
      // scanned in a bright viewer and failed in a dim one, on seventy of
      // this book's pages, while looking merely a little grey to everyone.
      // A QR either has its full contrast or it is decoration.
      if (s.caption) {
        const text = [s.caption.number, s.caption.title, s.caption.space].filter(Boolean).join(" · ").toUpperCase();
        page.drawRectangle({ x: 0, y: 0, width: A4L[0], height: 46, color: rgb(0, 0, 0), opacity: 0.4 });
        page.drawText(text, { x: M, y: 18, size: 8.5, font: bold, color: rgb(1, 1, 1) });
      }
      if (img) {
        await drawLockup(pdf, page, font, bold, { x: A4L[0] - LOCKUP_W - M, y: 28, onImage: true, label: lockupLabel });
      }
      continue;
    }

    if (s.type === "palette") {
      page.drawText("THE PALETTE", { x: M, y: A4L[1] - M - 10, size: 10, font: bold, color: accent });
      if (project.palette.intro) {
        for (const [i, line] of wrap(project.palette.intro, font, 10.5, 500).entries()) {
          page.drawText(line, { x: M, y: A4L[1] - M - 34 - i * 14, size: 10.5, font, color: soft });
        }
      }
      // Bands as wide as their share — the hex paints, and is never printed.
      const entries = project.palette.entries;
      const shares = entries.map((e) => {
        const m = /([\d.]+)/.exec(e.share ?? "");
        return m ? parseFloat(m[1]) : 100 / entries.length;
      });
      const totalShare = shares.reduce((a, b) => a + b, 0);
      const stripY = 200, stripH = 150;
      let x = M;
      // A 3%-share band is narrower than the word "Antique Gold", so labels
      // step down a line whenever one would start before the previous one
      // ended. Without this the two smallest colours print as one run-on word.
      let labelRight = -Infinity;
      let labelRow = 0;
      entries.forEach((e, i) => {
        const w = ((A4L[0] - M * 2) * shares[i]) / totalShare;
        const m = /^#?([0-9a-f]{6})$/i.exec(e.hex.trim());
        const [r, g, b] = m
          ? [parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255]
          : [0.94, 0.91, 0.87];
        page.drawRectangle({ x, y: stripY, width: w, height: stripH, color: rgb(r, g, b) });
        labelRow = x < labelRight ? labelRow + 1 : 0;
        const nameW = bold.widthOfTextAtSize(e.name, 8);
        page.drawText(e.name, { x: x + 2, y: stripY - 14 - labelRow * 10, size: 8, font: bold, color: ink });
        labelRight = x + 2 + nameW + 6;
        x += w;
      });
      footer(page, font, footerLabel);
      continue;
    }

    if (s.type === "gallery") {
      page.drawText((s.heading ?? "Every wall").toUpperCase(), { x: M, y: A4L[1] - M - 4, size: 10, font: bold, color: accent });
      if (s.intro) {
        for (const [i, line] of wrap(s.intro, font, 9.5, A4L[0] - M * 2).entries()) {
          page.drawText(line, { x: M, y: A4L[1] - M - 26 - i * 12, size: 9.5, font, color: soft });
        }
      }
      const top = A4L[1] - M - 58, bottom = M + 18;
      const cols = 10, gap = 3;
      const cellW = (A4L[0] - M * 2 - gap * (cols - 1)) / cols;
      const cellH = cellW * (2 / 3);
      let cx = M, cy = top - cellH;
      for (const img of s.images) {
        if (cy < bottom) break;
        const e = await embed(img.key);
        if (e) page.drawImage(e, { x: cx, y: cy, width: cellW, height: cellH });
        cx += cellW + gap;
        if (cx + cellW > A4L[0] - M) { cx = M; cy -= cellH + gap; }
      }
      footer(page, font, footerLabel);
      continue;
    }

    if (s.type === "index") {
      page.drawText((s.heading ?? "Every wall, considered").toUpperCase(), { x: M, y: A4L[1] - M - 4, size: 10, font: bold, color: accent });
      const colW = (A4L[0] - M * 2 - 60) / 4;
      let col = 0, y = A4L[1] - M - 34;
      const nextCol = () => { col += 1; y = A4L[1] - M - 34; };
      for (const g of s.groups) {
        const needed = 14 + g.spaces.length * 9.5;
        if (y - needed < M && col < 3) nextCol();
        const x = M + col * (colW + 20);
        page.drawText(g.name.toUpperCase(), { x, y, size: 6.5, font: bold, color: accent });
        y -= 11;
        for (const sp of g.spaces) {
          page.drawText(sp, { x, y, size: 7, font, color: soft });
          y -= 9.5;
        }
        y -= 10;
      }
      footer(page, font, footerLabel);
      continue;
    }

    // ask
    {
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
      await drawLockup(pdf, page, font, bold, {
        x: A4L[0] - LOCKUP_W - M, y: A4L[1] / 2 - 30, onImage: false, label: lockupLabel,
      });
      page.drawText("Scan to start a project", {
        x: A4L[0] - LOCKUP_W - M, y: A4L[1] / 2 - 46, size: 8, font, color: soft,
      });
      footer(page, font, footerLabel);
    }
  }

  return pdf.save();
}
