"use client"

// Header control that summarizes the chat's loaded documents ("N documents")
// and, on click, opens a popover listing each file with its page count plus a
// "Replace documents" action. Closes on outside click and Escape.

import { useEffect, useRef, useState } from "react"
import { FileText, ChevronDown } from "lucide-react"
import type { ManualDocument } from "@/lib/types"

interface DocumentsMenuProps {
  documents: ManualDocument[]
  onReplace: () => void
  // "bar" anchors the popover to the button (desktop). "compact" lets it span
  // the full width of the header it lives in (mobile) — that header must be
  // positioned (relative).
  variant?: "bar" | "compact"
}

export function DocumentsMenu({ documents, onReplace, variant = "bar" }: DocumentsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const count = documents.length
  const label = `${count} ${count === 1 ? "document" : "documents"}`

  return (
    <div ref={ref} className={variant === "bar" ? "relative shrink-0" : "shrink-0"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {label}
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={[
            "absolute z-40 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg",
            variant === "bar" ? "right-0 mt-2 w-72" : "inset-x-4 top-full mt-1",
          ].join(" ")}
        >
          <ul className="flex flex-col gap-0.5">
            {documents.map((doc) => (
              <li
                key={doc.fileName}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{doc.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {doc.pages.length} {doc.pages.length === 1 ? "page" : "pages"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onReplace()
              }}
              className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Replace documents
            </button>
            <p className="mt-1.5 px-1 text-xs text-muted-foreground text-pretty">
              Replaces the documents in this chat and clears the conversation.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
