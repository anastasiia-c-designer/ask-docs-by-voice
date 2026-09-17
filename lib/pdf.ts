"use client"

import type { ManualDocument, DocumentPage } from "./types"

// pdf.js is loaded lazily (dynamic import) the first time a PDF is parsed, never
// at page load. Two reasons:
//  1. It must not run at module-eval time — a bug in the PDF library must never
//     crash the whole page (e.g. Safari, where the modern build references the
//     ES Iterator Helpers global that Safari does not implement).
//  2. We use the "legacy" build (pdfjs-dist/legacy/build/...), which is
//     transpiled and polyfilled for wider browser support (older Safari/iOS).
type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs")

let pdfjsPromise: Promise<PdfJsModule> | null = null

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs")
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString()
      return pdfjsLib
    })()
  }
  return pdfjsPromise
}

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
  const pdfjsLib = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pages: DocumentPage[] = []
  let totalTextChars = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
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
