"use client"

// Small collapsed section at the bottom of the page holding the "Copy full log"
// action and an optional ingestion-time note. Per-turn rows live in each card's
// Details; this is only the whole-session export.

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { TestLogEntry } from "@/lib/types"
import { fullLogMarkdown } from "@/lib/test-log"

interface TestLogProps {
  entries: TestLogEntry[]
  ingestionMs: number | null
}

export function TestLog({ entries, ingestionMs }: TestLogProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (entries.length === 0 && ingestionMs === null) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullLogMarkdown(entries))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
        Test log{entries.length > 0 ? ` (${entries.length})` : ""}
      </button>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copy}
            disabled={entries.length === 0}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy full log"}
          </button>
          {ingestionMs !== null && (
            <span className="font-mono text-[11px] text-muted-foreground">
              Ingestion {ingestionMs.toFixed(0)} ms
            </span>
          )}
        </div>
      )}
    </div>
  )
}
