"use client"

// Renders a single conversation turn: the asked question, the answer with its
// status, optional spoken-answer controls (latest turn only), and each citation
// with a snippet of the page text that comes right before the quote.

import type { ReactNode } from "react"
import { Quote } from "lucide-react"
import { citationContextBefore } from "@/lib/citation-context"
import type { AnswerStatus, ConversationTurn, ManualDocument } from "@/lib/types"

const STATUS_LABELS: Record<AnswerStatus, string> = {
  answered: "Answered",
  not_found: "Not in documents",
  needs_clarification: "Needs clarification",
  unverified: "Unverified",
}

const STATUS_CLASSES: Record<AnswerStatus, string> = {
  answered: "bg-primary text-primary-foreground",
  not_found: "bg-muted text-muted-foreground",
  needs_clarification: "bg-accent text-accent-foreground",
  unverified: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
}

interface AnswerDisplayProps {
  turn: ConversationTurn
  documents: ManualDocument[]
  speechControls?: ReactNode
}

export function AnswerDisplay({ turn, documents, speechControls }: AnswerDisplayProps) {
  const { question, result } = turn

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">You asked:</span> {question}
      </p>

      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[result.status]}`}
        >
          {STATUS_LABELS[result.status]}
        </span>
      </div>

      <p className="text-base leading-relaxed text-card-foreground text-pretty">{result.answer}</p>

      {speechControls && <div className="mt-3">{speechControls}</div>}

      {result.citations.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {result.citations.map((c, i) => {
            const context = citationContextBefore(documents, c.fileName, c.page, c.quote)
            return (
              <li key={i} className="rounded-md border border-border bg-muted/50 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Quote className="size-3.5" />
                  {c.fileName} — page {c.page}
                </div>
                {context && (
                  <p className="mb-1 text-xs leading-relaxed text-muted-foreground/80">
                    {context}
                  </p>
                )}
                <blockquote className="text-sm leading-relaxed text-foreground">
                  {c.quote}
                </blockquote>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
