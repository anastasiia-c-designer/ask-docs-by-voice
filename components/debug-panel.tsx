"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { AnswerStatus, Citation, FailedAttempt, InputMode, Timing, TokenUsage } from "@/lib/types"

// One recorded answer, holding everything the test-log rows need. Voice fields
// are null for typed questions.
export interface TestLogEntry {
  id: string
  question: string
  inputMode: InputMode
  status: AnswerStatus
  answer: string
  citations: Citation[]
  verified: boolean
  attempts: number
  totalMs: number
  openAiMs: number
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
  modelCostUsd: number | null
  // Voice-only measurements (null for typed questions).
  recordingSeconds: number | null
  transcriptionMs: number | null
  askMs: number | null
  ttsMs: number | null
  questionToFirstAudioMs: number | null
  ttsSeconds: number | null
  transcriptionUsd: number | null
  ttsUsd: number | null
  totalCostUsd: number | null
}

interface DebugPanelProps {
  ingestionMs: number | null
  timing: Timing | null
  usage: TokenUsage | null
  model: string | null
  reasoningEffort: string | null
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
  "Input",
  "Status",
  "Answer",
  "Citations",
  "Verified",
  "Attempts",
  "Total ms",
  "OpenAI ms",
  "Input tokens",
  "Cached tokens",
  "Cache write tokens",
  "Output tokens",
  "Model cost USD",
  "Recording s",
  "Transcription ms",
  "Ask ms",
  "TTS ms",
  "Q-to-audio ms",
  "Transcription USD",
  "TTS USD (est)",
  "Total cost USD",
]

// Escape a value for use inside a Markdown table cell.
function cell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim()
}

function formatCitations(citations: Citation[]): string {
  if (!citations.length) return "—"
  return citations.map((c) => `${c.fileName} p.${c.page}: ${c.quote}`).join(" ; ")
}

function formatCost(cost: number | null | undefined): string {
  return cost === null || cost === undefined ? "" : cost.toFixed(5)
}

// Number for a cell, or empty string when not applicable (e.g. voice columns
// for a typed question).
function num(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "" : value.toFixed(digits)
}

function rowFor(entry: TestLogEntry): string {
  return `| ${[
    cell(entry.question),
    entry.inputMode,
    entry.status,
    cell(entry.answer),
    cell(formatCitations(entry.citations)),
    entry.verified ? "yes" : "no",
    String(entry.attempts),
    entry.totalMs.toFixed(0),
    entry.openAiMs.toFixed(0),
    String(entry.inputTokens),
    String(entry.cachedTokens),
    String(entry.cacheWriteTokens),
    String(entry.outputTokens),
    formatCost(entry.modelCostUsd),
    num(entry.recordingSeconds, 2),
    num(entry.transcriptionMs),
    num(entry.askMs),
    num(entry.ttsMs),
    num(entry.questionToFirstAudioMs),
    formatCost(entry.transcriptionUsd),
    formatCost(entry.ttsUsd),
    formatCost(entry.totalCostUsd),
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

export function DebugPanel({
  ingestionMs,
  timing,
  usage,
  model,
  reasoningEffort,
  failedAttempt,
  log,
}: DebugPanelProps) {
  const [open, setOpen] = useState(true)

  const hasData = ingestionMs !== null || timing !== null || usage !== null || log.length > 0
  if (!hasData) return null

  const latest = log.length ? log[log.length - 1] : null
  const isVoice = latest?.inputMode === "voice"

  const modelCost = latest ? latest.modelCostUsd : null
  const totalCost = latest ? latest.totalCostUsd ?? latest.modelCostUsd : null

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {open ? "Hide details" : "Show details"}
      </button>

      {open && (
        <div className="mt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Metric label="Ingestion" value={ingestionMs !== null ? `${ingestionMs.toFixed(0)} ms` : "—"} />
            <Metric label="Total server" value={timing ? `${timing.totalMs.toFixed(0)} ms` : "—"} />
            <Metric label="OpenAI call" value={timing ? `${timing.openAiMs.toFixed(0)} ms` : "—"} />
            <Metric label="Verification" value={timing ? `${timing.verificationMs.toFixed(0)} ms` : "—"} />
            <Metric label="Attempts" value={timing ? String(timing.attempts) : "—"} />
            <Metric label="Input tokens" value={usage ? String(usage.inputTokens) : "—"} />
            <Metric label="Cached input" value={usage ? String(usage.cachedInputTokens) : "—"} />
            <Metric label="Cache write" value={usage ? String(usage.cacheWriteInputTokens) : "—"} />
            <Metric label="Output tokens" value={usage ? String(usage.outputTokens) : "—"} />
            <Metric label="Reasoning tokens" value={usage ? String(usage.reasoningTokens) : "—"} />
            <Metric
              label="Model"
              value={model ? `${model} · effort: ${reasoningEffort ?? "none"}` : "—"}
            />
            <Metric label="Model cost" value={formatCostOrDash(modelCost)} />
          </dl>

          {isVoice && latest && (
            <>
              <h3 className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Voice
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
                <Metric label="Recording" value={msOrDash(latest.recordingSeconds, "s", 2)} />
                <Metric label="Transcription" value={msOrDash(latest.transcriptionMs, "ms")} />
                <Metric label="Ask" value={msOrDash(latest.askMs, "ms")} />
                <Metric label="TTS" value={msOrDash(latest.ttsMs, "ms")} />
                <Metric label="Q → first audio" value={msOrDash(latest.questionToFirstAudioMs, "ms")} />
                <Metric label="Audio length" value={msOrDash(latest.ttsSeconds, "s", 2)} />
                <Metric label="Transcription cost" value={formatCostOrDash(latest.transcriptionUsd)} />
                <Metric
                  label="TTS cost (est)"
                  value={formatCostOrDash(latest.ttsUsd)}
                />
              </dl>
            </>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Metric label="Total cost / question" value={formatCostOrDash(totalCost)} />
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
              {latest && <CopyButton label="Copy as Markdown row" getText={() => rowFor(latest)} />}
              <CopyButton label="Copy full log" getText={() => fullLogMarkdown(log)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatCostOrDash(cost: number | null): string {
  return cost === null ? "—" : cost.toFixed(5)
}

function msOrDash(value: number | null, unit: string, digits = 0): string {
  return value === null ? "—" : `${value.toFixed(digits)} ${unit}`
}
