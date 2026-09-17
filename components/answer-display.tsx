"use client"

// Renders a single conversation turn as a chat exchange (no cards):
//   • the user's question as a right-aligned bubble (with a mic icon for voice
//     questions), shown as soon as the transcript is ready;
//   • the assistant reply on the left with the Pagewise logo as an avatar — an
//     animated "thinking" indicator while pending, then the status label, the
//     answer, its citations, an actions row (Play / Copy / Details), and the
//     collapsible Details panel below.

import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  SearchX,
  HelpCircle,
  ShieldAlert,
  AlertCircle,
  Mic,
  Volume2,
  Copy,
  Check,
  BarChart3,
} from "lucide-react"
import { citationContextBefore, citationPageHighlight } from "@/lib/citation-context"
import { TurnDetails } from "@/components/turn-details"
import { LogoMark } from "@/components/logo"
import { Tooltip } from "@/components/tooltip"
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion"
import type { AnswerStatus, Citation, ConversationTurn, ManualDocument } from "@/lib/types"

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
  onPlay: (text: string) => void
}

export function AnswerDisplay({ turn, documents, onPlay }: AnswerDisplayProps) {
  const { question, result, pending, error, inputMode } = turn
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* User question, right-aligned */}
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-center gap-2 sm:max-w-[75%]">
          {inputMode === "voice" && (
            <Mic className="size-4 shrink-0 text-muted-foreground" aria-label="Voice question" />
          )}
          <div className="rounded-[18px] rounded-br-[6px] bg-user-bubble px-3.5 py-2 text-sm leading-relaxed text-foreground text-pretty">
            {question}
          </div>
        </div>
      </div>

      {/* Assistant reply, left with logo avatar */}
      <div className="flex gap-3">
        <LogoMark className="mt-0.5 size-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {pending && <Thinking />}

          {error && !pending && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm text-foreground">{error}</p>
            </div>
          )}

          {result && !pending && (
            <>
              {/* Verified answers show the check on the citation chip instead of a
                  status label; other statuses keep the label above the answer. */}
              {result.status !== "answered" &&
                (() => {
                  const meta = STATUS_META[result.status]
                  const { Icon } = meta
                  return (
                    <span
                      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {meta.label}
                    </span>
                  )
                })()}

              <p className="text-sm leading-relaxed text-foreground text-pretty">{result.answer}</p>

              {result.citations.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {result.citations.map((c, i) => (
                    <CitationCard
                      key={i}
                      citation={c}
                      documents={documents}
                      verified={result.status === "answered"}
                    />
                  ))}
                </ul>
              )}

              <ActionsRow
                onPlay={() => onPlay(result.answer)}
                copyText={buildCopyText(result.answer, result.citations)}
                canShowDetails={Boolean(turn.metrics)}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((v) => !v)}
              />

              <TurnDetails turn={turn} open={detailsOpen} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Answer text plus each citation as "fileName p. N: quote".
function buildCopyText(answer: string, citations: Citation[]): string {
  const parts = [answer]
  if (citations.length > 0) {
    parts.push(citations.map((c) => `${c.fileName} p. ${c.page}: ${c.quote}`).join("\n"))
  }
  return parts.join("\n\n")
}

// Animated three-dot "thinking" indicator; static when reduced motion is on.
function Thinking() {
  const reduced = usePrefersReducedMotion()
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`size-1.5 rounded-full bg-muted-foreground/50 ${reduced ? "" : "animate-bounce"}`}
            style={reduced ? undefined : { animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      Checking the manual…
    </div>
  )
}

// Icon-only action button with an accessible label and native tooltip.
function IconAction({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string
  onClick: () => void
  expanded?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={expanded}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft hover:text-foreground"
      >
        {children}
      </button>
    </Tooltip>
  )
}

function ActionsRow({
  onPlay,
  copyText,
  canShowDetails,
  detailsOpen,
  onToggleDetails,
}: {
  onPlay: () => void
  copyText: string
  canShowDetails: boolean
  detailsOpen: boolean
  onToggleDetails: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="-ml-1.5 flex items-center gap-0.5">
      <IconAction label="Play answer" onClick={onPlay}>
        <Volume2 className="size-4" />
      </IconAction>
      <IconAction label={copied ? "Copied" : "Copy answer"} onClick={copy}>
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </IconAction>
      {canShowDetails && (
        <IconAction label="Details" onClick={onToggleDetails} expanded={detailsOpen}>
          <BarChart3 className="size-4" />
        </IconAction>
      )}
    </div>
  )
}

// A single citation with no card: a file/page chip, the section context (clamped
// to two lines), the verbatim quote as a left-accented block, and a "Show full
// page" toggle that reveals the full extracted page text (headers/footers
// stripped) with the quote highlighted and scrolled into view.
function CitationCard({
  citation,
  documents,
  verified,
}: {
  citation: Citation
  documents: ManualDocument[]
  verified: boolean
}) {
  const [open, setOpen] = useState(false)
  const markRef = useRef<HTMLSpanElement>(null)

  const context = citationContextBefore(documents, citation.fileName, citation.page, citation.quote)
  const highlight = open
    ? citationPageHighlight(documents, citation.fileName, citation.page, citation.quote)
    : null

  useEffect(() => {
    if (open) markRef.current?.scrollIntoView({ block: "center" })
  }, [open])

  return (
    <li className="rounded-[14px] border border-border bg-card p-3">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          verified ? "border-success/30 bg-success/10 text-success" : "border-border bg-background text-muted-foreground"
        }`}
      >
        {verified && <CheckCircle2 className="size-3" aria-hidden />}
        {verified && "Verified · "}
        {citation.fileName} · p. {citation.page}
      </span>
      {context && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{context}</p>
      )}
      <blockquote className="mt-1.5 border-l-[3px] border-accent-strong bg-accent-strong/5 py-1.5 pl-3 text-sm leading-relaxed text-foreground">
        {citation.quote}
      </blockquote>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1.5 text-xs font-medium text-accent-strong transition-colors hover:underline"
      >
        {open ? "Hide full page" : "Show full page"}
      </button>

      {open && highlight && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
          {highlight.matchStart >= 0 ? (
            <>
              {highlight.text.slice(0, highlight.matchStart)}
              <span ref={markRef} className="rounded bg-brand-soft px-0.5 text-foreground">
                {highlight.text.slice(highlight.matchStart, highlight.matchEnd)}
              </span>
              {highlight.text.slice(highlight.matchEnd)}
            </>
          ) : (
            highlight.text
          )}
        </div>
      )}
    </li>
  )
}
