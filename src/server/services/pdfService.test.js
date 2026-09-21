import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadPdf,
  savePdf,
  buildPageList,
  reorderPages,
  deletePages,
  mergePdfs,
  extractPages,
  applyTextBlocks,
} from "./pdfService.js";

async function makePdfBytes(pageCount = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([600, 800]);
  return doc.save();
}

let tmpDir;
let path1; // 2 páginas
let path2; // 1 página

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdfpro-svc-"));
  path1 = path.join(tmpDir, "a.pdf");
  path2 = path.join(tmpDir, "b.pdf");
  await fs.writeFile(path1, await makePdfBytes(2));
  await fs.writeFile(path2, await makePdfBytes(1));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("pdfService", () => {
  test("loadPdf carga un PDF y devuelve el documento", async () => {
    const doc = await loadPdf(path1);
    expect(doc.getPageCount()).toBe(2);
  });

  test("loadPdf lanza error si el archivo no existe", async () => {
    await expect(loadPdf("/no/existe.pdf")).rejects.toThrow();
  });

  test("savePdf escribe el PDF en disco y se puede releer", async () => {
    const doc = await loadPdf(path1);
    const out = path.join(tmpDir, "saved.pdf");
    await savePdf(doc, out);
    const reloaded = await loadPdf(out);
    expect(reloaded.getPageCount()).toBe(2);
  });

  test("buildPageList genera un elemento por página con estructura correcta", async () => {
    const doc = await loadPdf(path1);
    const pages = buildPageList(doc);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      id: 0,
      index: 0,
      title: "Page 1",
      interactive: false,
    });
    expect(pages[1]).toMatchObject({
      id: 1,
      index: 1,
      title: "Page 2",
      interactive: false,
    });
  });

  test("reorderPages invierte el orden de páginas", async () => {
    const doc = await loadPdf(path1);
    const reordered = await reorderPages(doc, [1, 0]);
    expect(reordered.getPageCount()).toBe(2);
  });

  test("reorderPages con un solo índice devuelve documento de una página", async () => {
    const doc = await loadPdf(path1);
    const reordered = await reorderPages(doc, [0]);
    expect(reordered.getPageCount()).toBe(1);
  });

  test("deletePages elimina una página por índice", async () => {
    const bytes = await makePdfBytes(2);
    const doc = await PDFDocument.load(bytes);
    const updated = await deletePages(doc, [1]);
    expect(updated.getPageCount()).toBe(1);
  });

  test("deletePages elimina múltiples páginas en cualquier orden", async () => {
    const bytes = await makePdfBytes(3);
    const doc = await PDFDocument.load(bytes);
    const updated = await deletePages(doc, [2, 0]);
    expect(updated.getPageCount()).toBe(1);
  });

  test("mergePdfs combina dos archivos PDF", async () => {
    const merged = await mergePdfs(path1, path2);
    expect(merged.getPageCount()).toBe(3); // 2 + 1
  });

  test("extractPages extrae páginas concretas", async () => {
    const bytes = await makePdfBytes(3);
    const doc = await PDFDocument.load(bytes);
    const extracted = await extractPages(doc, [0, 2]);
    expect(extracted.getPageCount()).toBe(2);
  });

  test("extractPages con un índice devuelve documento de una página", async () => {
    const bytes = await makePdfBytes(3);
    const doc = await PDFDocument.load(bytes);
    const extracted = await extractPages(doc, [1]);
    expect(extracted.getPageCount()).toBe(1);
  });

  test("applyTextBlocks registers fontkit and embeds each owned Noto style once", async () => {
    const calls = [];
    const embeddedFonts = [];
    const registeredFontkits = [];
    const doc = {
      registerFontkit: (fontkit) => registeredFontkits.push(fontkit),
      embedFont: async (fontBytes) => {
        embeddedFonts.push(fontBytes);
        return `font-${embeddedFonts.length}`;
      },
      getPages: () => [{ drawText: (...args) => calls.push(args) }],
    };

    await applyTextBlocks(doc, [
      { pageIndex: 0, text: "regular", x: 20, y: 100, fontSize: 10 },
      { pageIndex: 0, text: "bold", x: 20, y: 88, fontSize: 10, bold: true },
      { pageIndex: 0, text: "italic", x: 20, y: 76, fontSize: 10, italic: true },
      { pageIndex: 0, text: "both", x: 20, y: 64, fontSize: 10, bold: true, italic: true },
      { pageIndex: 0, text: "legacy", x: 20, y: 52, fontSize: 10, fontFamily: "Courier" },
    ]);

    expect(registeredFontkits).toHaveLength(1);
    expect(embeddedFonts).toHaveLength(4);
    expect(embeddedFonts).toEqual([
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
    ]);
    expect(calls).toEqual([
      ["regular", expect.objectContaining({ y: 100, font: "font-1" })],
      ["bold", expect.objectContaining({ y: 88, font: "font-2" })],
      ["italic", expect.objectContaining({ y: 76, font: "font-3" })],
      ["both", expect.objectContaining({ y: 64, font: "font-4" })],
      ["legacy", expect.objectContaining({ y: 52, font: "font-1" })],
    ]);
  });

  test("applyTextBlocks persists embedded Noto fonts for every style and Unicode text", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);

    await applyTextBlocks(doc, [
      { pageIndex: 0, text: "Regular: acción", x: 20, y: 700, fontSize: 14 },
      { pageIndex: 0, text: "Bold: corazón", x: 20, y: 660, fontSize: 14, bold: true },
      { pageIndex: 0, text: "Italic: pingüino", x: 20, y: 620, fontSize: 14, italic: true },
      { pageIndex: 0, text: "Bold italic: niño", x: 20, y: 580, fontSize: 14, bold: true, italic: true },
    ]);

    const bytes = await doc.save({ useObjectStreams: false });
    const reloaded = await PDFDocument.load(bytes);
    const pdfSource = Buffer.from(bytes).toString("latin1");

    expect(reloaded.getPageCount()).toBe(1);
    expect(pdfSource).toMatch(/\/Subtype \/Type0/);
    expect(pdfSource).toMatch(/\/FontFile2\b/);
    expect(pdfSource).toMatch(/\/BaseFont \/[^\s]*NotoSans-Regular/);
    expect(pdfSource).toMatch(/\/BaseFont \/[^\s]*NotoSans-Bold(?!Italic)/);
    expect(pdfSource).toMatch(/\/BaseFont \/[^\s]*NotoSans-Italic/);
    expect(pdfSource).toMatch(/\/BaseFont \/[^\s]*NotoSans-BoldItalic/);
    expect(pdfSource).not.toMatch(/\/BaseFont \/(?:Helvetica|Courier)\b/);
  });
});
