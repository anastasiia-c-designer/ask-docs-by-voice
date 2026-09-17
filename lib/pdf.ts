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

// extractPdf returns the parsed document plus a best-effort chat-title candidate
// derived from the file (metadata Title, else first content line, else name).
export interface ExtractedManual {
  document: ManualDocument
  title: string
}

const MAX_TITLE_CHARS = 60

// A metadata Title we should ignore in favor of the document's own text.
function isGenericTitle(title: string): boolean {
  const t = title.trim().toLowerCase()
  if (!t) return true
  if (t === "untitled") return true
  if (t.startsWith("microsoft word -")) return true
  return false
}

// Lowercase and collapse digit runs so page-numbered running heads/feet compare
// as equal ("Manual — Page 3" ~ "Manual — Page 4").
function normalizeLine(line: string): string {
  return line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
}

// The normalized first (header) or last (footer) line shared by most pages, or
// null when there is no consistent running edge.
function runningEdgeLine(linesByPage: string[][], fromStart: boolean): string | null {
  const pages = linesByPage.filter((lines) => lines.length > 0)
  if (pages.length < 3) return null

  const counts = new Map<string, number>()
  for (const lines of pages) {
    const line = fromStart ? lines[0] : lines[lines.length - 1]
    const key = normalizeLine(line)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const threshold = Math.ceil(pages.length * 0.6)
  let best: string | null = null
  let bestCount = 0
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      best = key
    }
  }
  return bestCount >= threshold ? best : null
}

// The first non-empty page-1 line that is not a running header/footer.
function firstContentLine(page1Lines: string[], header: string | null, footer: string | null): string {
  for (const line of page1Lines) {
    const normalized = normalizeLine(line)
    if (!normalized) continue
    if (header && normalized === header) continue
    if (footer && normalized === footer) continue
    return line.trim()
  }
  return ""
}

function deriveTitle(fileName: string, metaTitle: string, linesByPage: string[][]): string {
  let title = ""
  if (metaTitle && !isGenericTitle(metaTitle)) {
    title = metaTitle
  } else {
    const header = runningEdgeLine(linesByPage, true)
    const footer = runningEdgeLine(linesByPage, false)
    title = firstContentLine(linesByPage[0] ?? [], header, footer)
  }
  if (!title) title = fileName.replace(/\.pdf$/i, "")
  return title.trim().slice(0, MAX_TITLE_CHARS)
}

export async function extractPdf(file: File): Promise<ExtractedManual> {
  const pdfjsLib = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pages: DocumentPage[] = []
  const linesByPage: string[][] = []
  let totalTextChars = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)

    // Do NOT use page.getTextContent(): internally it drains the text
    // ReadableStream with `for await...of`, which Safari (desktop 17.5 and iOS)
    // does not support for streams, throwing "undefined is not a function
    // (near '...t of e...')". Read the stream manually instead and rebuild the
    // same { items } shape getTextContent would have returned.
    const stream = page.streamTextContent()
    const reader = stream.getReader()
    const items: { str?: string; hasEOL?: boolean }[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value?.items) items.push(...value.items)
    }
    const text = items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()

    // Reconstruct visual lines from the same items (used only for the chat-title
    // heuristic). This does not touch `text` above or the verification pipeline.
    const lines: string[] = []
    let lineBuf: string[] = []
    for (const item of items) {
      lineBuf.push(item.str ?? "")
      if (item.hasEOL) {
        const line = lineBuf.join(" ").replace(/\s+/g, " ").trim()
        if (line) lines.push(line)
        lineBuf = []
      }
    }
    const tailLine = lineBuf.join(" ").replace(/\s+/g, " ").trim()
    if (tailLine) lines.push(tailLine)
    linesByPage.push(lines)

    totalTextChars += text.replace(/\s/g, "").length
    pages.push({ pageNumber, text })
  }

  // If the whole document has almost no extractable text, it is effectively scanned.
  if (totalTextChars < MIN_CHARS_PER_PAGE) {
    throw new ScannedPdfError(file.name)
  }

  let metaTitle = ""
  try {
    const md = await pdf.getMetadata()
    const info = md?.info as { Title?: unknown } | undefined
    if (info && typeof info.Title === "string") metaTitle = info.Title.trim()
  } catch {
    // Metadata is optional; fall back to page text / file name.
  }

  return {
    document: { fileName: file.name, pages },
    title: deriveTitle(file.name, metaTitle, linesByPage),
  }
}

export function countPages(documents: ManualDocument[]): number {
  return documents.reduce((sum, doc) => sum + doc.pages.length, 0)
}
