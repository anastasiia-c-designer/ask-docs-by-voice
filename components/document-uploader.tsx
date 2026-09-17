"use client"

import { useRef, useState } from "react"
import { Upload, FileText, RefreshCw } from "lucide-react"
import { extractPdf, countPages, ScannedPdfError } from "@/lib/pdf"
import { Tooltip } from "@/components/tooltip"
import type { ManualDocument } from "@/lib/types"

const MAX_FILES = 2
const MAX_PAGES = 10

const SAMPLE_FILES = ["/samples/brisa-manual-v1.pdf", "/samples/brisa-warranty.pdf"]

interface DocumentUploaderProps {
  documents: ManualDocument[]
  onDocumentsReady: (
    documents: ManualDocument[],
    ingestionMs: number,
    title: string,
    fromSample: boolean,
  ) => void
  onReplace: () => void
}

export function DocumentUploader({ documents, onDocumentsReady, onReplace }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ingest(files: File[], fromSample = false) {
    setError(null)

    if (files.length > MAX_FILES) {
      setError(`That’s more than we can read at once. Choose up to ${MAX_FILES} PDFs.`)
      return
    }
    if (files.some((f) => f.type !== "application/pdf")) {
      setError("Only PDF files are supported. Choose a PDF and try again.")
      return
    }

    setLoading(true)
    const start = performance.now()
    try {
      const extracted = []
      for (const file of files) {
        extracted.push(await extractPdf(file))
      }
      const parsed: ManualDocument[] = extracted.map((e) => e.document)

      const totalPages = countPages(parsed)
      if (totalPages > MAX_PAGES) {
        setError(
          `Too many pages: ${totalPages}. The maximum is ${MAX_PAGES} across all files. Remove a file or use a shorter manual.`,
        )
        setLoading(false)
        return
      }

      const ingestionMs = performance.now() - start
      // Chat title comes from the first loaded file.
      onDocumentsReady(parsed, ingestionMs, extracted[0]?.title ?? "", fromSample)
    } catch (err) {
      if (err instanceof ScannedPdfError) {
        setError(`${err.message} Try exporting it as a text-based PDF.`)
      } else {
        // Never surface a raw JS error to the user; log the technical detail.
        console.error("[v0] PDF ingestion failed:", err)
        setError("Couldn’t read this PDF in this browser. Try another browser or file.")
      }
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    await ingest(Array.from(fileList))
  }

  async function loadSamples() {
    setError(null)
    setLoading(true)
    try {
      const files = await Promise.all(
        SAMPLE_FILES.map(async (url) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Could not load ${url}`)
          const blob = await res.blob()
          const name = url.split("/").pop() ?? "sample.pdf"
          return new File([blob], name, { type: "application/pdf" })
        }),
      )
      // Hand off to the exact same ingestion pipeline as a user upload, but flag
      // it as sample-loaded so the page can show the starter questions.
      await ingest(files, true)
    } catch (err) {
      console.error("[v0] Sample manual load failed:", err)
      setError("Couldn’t load the sample manuals. Please try again or upload your own PDF.")
      setLoading(false)
    }
  }

  // Loaded state: a single row of compact file chips (scrolls horizontally when
  // it overflows, e.g. on mobile) followed by a Replace icon button.
  if (documents.length > 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:justify-end">
          {documents.map((doc) => (
            <span
              key={doc.fileName}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]"
            >
              <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-32 truncate font-medium text-foreground">{doc.fileName}</span>
              <span className="text-muted-foreground">· {doc.pages.length}p</span>
            </span>
          ))}
        </div>
        <Tooltip label="Replace documents" className="shrink-0">
          <button
            type="button"
            onClick={onReplace}
            aria-label="Replace documents"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="size-4" />
          </button>
        </Tooltip>
      </div>
    )
  }

  // Empty state: upload area + sample shortcut. The heading/intro live in the
  // page's empty state above this component.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="flex w-full flex-col items-center gap-2 rounded-[16px] border border-dashed border-border bg-card px-4 py-12 text-center transition-colors hover:border-ring hover:bg-accent/40 disabled:opacity-60"
        >
          <Upload className="size-6 text-primary" aria-hidden />
          <span className="text-sm font-medium text-foreground">
            {loading ? "Reading documents…" : "Upload equipment manuals"}
          </span>
          <span className="text-xs text-muted-foreground text-pretty">
            Up to {MAX_FILES} text-based PDF files, {MAX_PAGES} pages total.
          </span>
        </button>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={loadSamples}
            disabled={loading}
            className="rounded-full bg-brand-soft px-4 py-2 text-sm font-medium text-accent-strong transition-colors hover:bg-brand-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            Try sample manuals
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground text-pretty">
          Two sample manuals for a fictional air purifier (AP-200 and AP-400).
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive text-pretty">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
