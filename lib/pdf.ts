"use client"

import * as pdfjsLib from "pdfjs-dist"
import type { ManualDocument, DocumentPage } from "./types"

// Point pdf.js at its worker. Bundled via a module URL so it works in the browser
// without copying files into /public.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

// A page with fewer than this many non-whitespace characters is treated as
// having no meaningful extractable text (likely a scanned image).
const MIN_CHARS_PER_PAGE = 10

export class ScannedPdfError extends Error {
  constructor(fileName: string) {
    super(`"${fileName}" looks like a scanned PDF. Only text-based PDFs are supported.`)
    this.name = "ScannedPdfError"
  }
}

export async function extractPdf(file: File): Promise<ManualDocument> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pages: DocumentPage[] = []
  let totalTextChars = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      // @ts-expect-error - pdf.js text items expose a `str` field at runtime
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()

    totalTextChars += text.replace(/\s/g, "").length
    pages.push({ pageNumber, text })
  }

  // If the whole document has almost no extractable text, it is effectively scanned.
  if (totalTextChars < MIN_CHARS_PER_PAGE) {
    throw new ScannedPdfError(file.name)
  }

  return { fileName: file.name, pages }
}

export function countPages(documents: ManualDocument[]): number {
  return documents.reduce((sum, doc) => sum + doc.pages.length, 0)
}
