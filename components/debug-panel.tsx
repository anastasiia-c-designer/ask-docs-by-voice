"use client"

import { useState } from "react"
import { computeCostUsd } from "@/lib/config"
import type { AnswerStatus, Citation, FailedAttempt, Timing, TokenUsage } from "@/lib/types"

// One recorded answer, holding everything the test-log rows need.
export interface TestLogEntry {
  question: string
  status: AnswerStatus
  answer: string
  citations: Citation[]
  verified: boolean
  attempts: number
  totalMs: number
  openAiMs: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  costUsd: number | null
}

interface DebugPanelProps {
  ingestionMs: number | null
  timing: Timing | null
  usage: TokenUsage | null
  model: string | null
  failedAttempt: FailedAttempt | null
  log: TestLogEntry[]
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm text-foreground">{value}</dd>
    </div>
  )
}

const HEADER_CELLS = [
  "Question",
  "Status",
  "Answer",
  "Citations",
  "Verified",
  "Attempts",
  "Total ms",
  "OpenAI ms",
  "Input tokens",
  "Cached tokens",
  "Output tokens",
  "Cost USD",
]

// Escape a value for use inside a Markdown table cell.
function cell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim()
}

function formatCitations(citations: Citation[]): string {
  if (!citations.length) return "—"
  return citations.map((c) => `${c.fileName} p.${c.page}: ${c.quote}`).join(" ; ")
}

function formatCost(cost: number | null): string {
  return cost === null ? "price unknown" : cost.toFixed(5)
}

function rowFor(entry: TestLogEntry): string {
  return `| ${[
    cell(entry.question),
    entry.status,
    cell(entry.answer),
    cell(formatCitations(entry.citations)),
    entry.verified ? "yes" : "no",
    String(entry.attempts),
    entry.totalMs.toFixed(0),
    entry.openAiMs.toFixed(0),
    String(entry.inputTokens),
    String(entry.cachedTokens),
    String(entry.outputTokens),
    formatCost(entry.costUsd),
  ].join(" | ")} |`
}

function fullLogMarkdown(log: TestLogEntry[]): string {
  const header = `| ${HEADER_CELLS.join(" | ")} |`
  const sep = `| ${HEADER_CELLS.map(() => "---").join(" | ")} |`
  return [header, sep, ...log.map(rowFor)].join("\n")
}

function CopyButton({ label, getText }: { label: string; getText: () => string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      {copied ? "Copied" : label}
    </button>
  )
}

export function DebugPanel({ ingestionMs, timing, usage, model, failedAttempt, log }: DebugPanelProps) {
  const hasData = ingestionMs !== null || timing !== null || usage !== null || log.length > 0
  if (!hasData) return null

  const cost =
    usage && model
      ? computeCostUsd(model, {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
        })
      : null

  const latest = log.length ? log[log.length - 1] : null

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Debug</h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Metric label="Ingestion" value={ingestionMs !== null ? `${ingestionMs.toFixed(0)} ms` : "—"} />
        <Metric label="Total server" value={timing ? `${timing.totalMs.toFixed(0)} ms` : "—"} />
        <Metric label="OpenAI call" value={timing ? `${timing.openAiMs.toFixed(0)} ms` : "—"} />
        <Metric label="Verification" value={timing ? `${timing.verificationMs.toFixed(0)} ms` : "—"} />
        <Metric label="Attempts" value={timing ? String(timing.attempts) : "—"} />
        <Metric label="Input tokens" value={usage ? String(usage.inputTokens) : "—"} />
        <Metric label="Cached input" value={usage ? String(usage.cachedInputTokens) : "—"} />
        <Metric label="Output tokens" value={usage ? String(usage.outputTokens) : "—"} />
        <Metric label="Reasoning tokens" value={usage ? String(usage.reasoningTokens) : "—"} />
        <Metric label="Model" value={model ?? "—"} />
        <Metric label="Cost / question" value={usage ? formatCost(cost) : "—"} />
      </dl>

      {failedAttempt && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive">
            Unverified — failed attempt
          </p>
          <p className="mt-1.5 text-sm text-foreground">{failedAttempt.answer}</p>
          {failedAttempt.citations.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {failedAttempt.citations.map((c, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {c.fileName} p.{c.page}:
                  </span>{" "}
                  {c.quote}
                </li>
              ))}
            </ul>
          )}
          {failedAttempt.invalidReasons.length > 0 && (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
              {failedAttempt.invalidReasons.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Test log ({log.length})
          </span>
          {latest && (
            <CopyButton label="Copy as Markdown row" getText={() => rowFor(latest)} />
          )}
          <CopyButton label="Copy full log" getText={() => fullLogMarkdown(log)} />
        </div>
      )}
    </div>
  )
}
