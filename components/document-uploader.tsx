"use client"

import { useRef, useState } from "react"
import { Upload, FileText, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { extractPdf, countPages, ScannedPdfError } from "@/lib/pdf"
import type { ManualDocument } from "@/lib/types"

const MAX_FILES = 2
const MAX_PAGES = 10

interface DocumentUploaderProps {
  documents: ManualDocument[]
  onDocumentsReady: (documents: ManualDocument[], ingestionMs: number) => void
  onReplace: () => void
}

export function DocumentUploader({ documents, onDocumentsReady, onReplace }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    setError(null)
    if (!fileList || fileList.length === 0) return

    const files = Array.from(fileList)

    if (files.length > MAX_FILES) {
      setError(`You can upload at most ${MAX_FILES} PDF files.`)
      return
    }
    if (files.some((f) => f.type !== "application/pdf")) {
      setError("Only PDF files are supported.")
      return
    }

    setLoading(true)
    const start = performance.now()
    try {
      const parsed: ManualDocument[] = []
      for (const file of files) {
        parsed.push(await extractPdf(file))
      }

      const totalPages = countPages(parsed)
      if (totalPages > MAX_PAGES) {
        setError(`Too many pages: ${totalPages}. The maximum is ${MAX_PAGES} pages across all files.`)
        setLoading(false)
        return
      }

      const ingestionMs = performance.now() - start
      onDocumentsReady(parsed, ingestionMs)
    } catch (err) {
      if (err instanceof ScannedPdfError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : "Failed to read the PDF.")
      }
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  if (documents.length > 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-card-foreground">Loaded documents</h2>
          <Button variant="outline" size="sm" onClick={onReplace}>
            <RefreshCw className="mr-1.5 size-3.5" />
            Replace documents
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li
              key={doc.fileName}
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">{doc.fileName}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {doc.pages.length} {doc.pages.length === 1 ? "page" : "pages"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center transition-colors hover:border-ring hover:bg-accent disabled:opacity-60"
      >
        <Upload className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {loading ? "Reading documents…" : "Upload equipment manuals"}
        </span>
        <span className="text-xs text-muted-foreground text-pretty">
          Up to {MAX_FILES} text-based PDF files, {MAX_PAGES} pages total.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
