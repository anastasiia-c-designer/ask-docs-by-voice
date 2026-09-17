"use client"

// Renders a single conversation turn as a card: the transcript ("You asked: …")
// which appears as soon as transcription finishes, a skeleton while the answer
// is pending, then the status, the answer (the largest text in the card), a
// small replay control (latest turn only), each citation with its page context
// and quote, and a collapsed Details toggle.

import type { ReactNode } from "react"
import { CheckCircle2, SearchX, HelpCircle, ShieldAlert, AlertCircle } from "lucide-react"
import { citationContextBefore } from "@/lib/citation-context"
import { TurnDetails } from "@/components/turn-details"
import type { AnswerStatus, ConversationTurn, ManualDocument } from "@/lib/types"

const STATUS_META: Record<
  AnswerStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  answered: { label: "From the manual", className: "bg-success/10 text-success", Icon: CheckCircle2 },
  not_found: { label: "Not in the manual", className: "bg-muted text-muted-foreground", Icon: SearchX },
  needs_clarification: {
    label: "Need one detail",
    className: "bg-warning/15 text-warning-foreground",
    Icon: HelpCircle,
  },
  unverified: { label: "Couldn’t verify", className: "bg-destructive/10 text-destructive", Icon: ShieldAlert },
}

interface AnswerDisplayProps {
  turn: ConversationTurn
  documents: ManualDocument[]
  speechControls?: ReactNode
}

export function AnswerDisplay({ turn, documents, speechControls }: AnswerDisplayProps) {
  const { question, result, pending, error } = turn

  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
        <span className="font-medium text-foreground">You asked:</span> {question}
      </p>

      {pending && (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <span className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <span className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          <span className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      )}
      {pending && <span className="sr-only">Finding an answer…</span>}

      {error && !pending && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      )}

      {result && !pending && (
        <>
          {(() => {
            const meta = STATUS_META[result.status]
            const { Icon } = meta
            return (
              <div className="mt-4 flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {meta.label}
                </span>
                {speechControls}
              </div>
            )
          })()}

          <p className="mt-3 text-lg leading-relaxed text-card-foreground text-pretty">
            {result.answer}
          </p>

          {result.citations.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {result.citations.map((c, i) => {
                const context = citationContextBefore(documents, c.fileName, c.page, c.quote)
                return (
                  <li key={i} className="rounded-lg border border-border bg-background p-3">
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {c.fileName} · p. {c.page}
                    </span>
                    {context && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{context}</p>
                    )}
                    <blockquote className="mt-2 border-l-2 border-primary bg-primary/5 py-1.5 pl-3 text-sm leading-relaxed text-foreground">
                      {c.quote}
                    </blockquote>
                  </li>
                )
              })}
            </ul>
          )}

          <TurnDetails turn={turn} />
        </>
      )}
    </article>
  )
}
