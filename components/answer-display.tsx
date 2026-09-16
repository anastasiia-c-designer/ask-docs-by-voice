"use client"

// Swappable output surface. A later step will add spoken answers on top of the
// same AnswerResult shape, so keep rendering isolated here and independent of
// how the question was asked.

import { Quote } from "lucide-react"
import type { AnswerResult, AnswerStatus } from "@/lib/types"

const STATUS_LABELS: Record<AnswerStatus, string> = {
  answered: "Answered",
  not_found: "Not in documents",
  needs_clarification: "Needs clarification",
}

const STATUS_CLASSES: Record<AnswerStatus, string> = {
  answered: "bg-primary text-primary-foreground",
  not_found: "bg-muted text-muted-foreground",
  needs_clarification: "bg-accent text-accent-foreground",
}

interface AnswerDisplayProps {
  result: AnswerResult | null
  error: string | null
}

export function AnswerDisplay({ result, error }: AnswerDisplayProps) {
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-card p-4">
        <p className="text-sm font-medium text-destructive">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[result.status]}`}
        >
          {STATUS_LABELS[result.status]}
        </span>
      </div>

      <p className="text-base leading-relaxed text-card-foreground text-pretty">{result.answer}</p>

      {result.citations.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {result.citations.map((c, i) => (
            <li key={i} className="rounded-md border border-border bg-muted/50 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Quote className="size-3.5" />
                {c.fileName} — page {c.page}
              </div>
              <blockquote className="text-sm leading-relaxed text-foreground">
                {c.quote}
              </blockquote>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
