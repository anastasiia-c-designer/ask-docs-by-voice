"use client"

// The "Details" panel for a single turn: that turn's timing, tokens and cost,
// plus its failed attempt (when unverified) and a "Copy as Markdown row" action.
// Visibility is controlled by the parent's actions row via the `open` prop.

import { useState } from "react"
import type { ConversationTurn } from "@/lib/types"
import { rowFor } from "@/lib/test-log"

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs text-foreground">{value}</dd>
    </div>
  )
}

function cost(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `$${value.toFixed(5)}`
}

function withUnit(value: number | null | undefined, unit: string, digits = 0): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(digits)} ${unit}`
}

function CopyRowButton({ turn }: { turn: ConversationTurn }) {
  const [copied, setCopied] = useState(false)
  if (!turn.metrics) return null

  async function copy() {
    if (!turn.metrics) return
    try {
      await navigator.clipboard.writeText(rowFor(turn.metrics))
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
      {copied ? "Copied" : "Copy as Markdown row"}
    </button>
  )
}

export function TurnDetails({ turn, open }: { turn: ConversationTurn; open: boolean }) {
  const m = turn.metrics
  if (!m || !open) return null

  const isVoice = turn.inputMode === "voice"

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Metric
              label="Model"
              value={turn.model ? `${turn.model} · ${turn.reasoningEffort ?? "none"}` : "—"}
            />
            <Metric label="Attempts" value={String(m.attempts)} />
            <Metric label="Total server" value={withUnit(m.totalMs, "ms")} />
            <Metric label="OpenAI call" value={withUnit(m.openAiMs, "ms")} />
            <Metric label="Verification" value={withUnit(turn.verificationMs, "ms")} />
            <Metric label="Input tokens" value={String(m.inputTokens)} />
            <Metric label="Cached input" value={String(m.cachedTokens)} />
            <Metric label="Cache write" value={String(m.cacheWriteTokens)} />
            <Metric label="Output tokens" value={String(m.outputTokens)} />
            <Metric label="Model cost" value={cost(m.modelCostUsd)} />
          </dl>

          {isVoice && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Metric label="Recording" value={withUnit(m.recordingSeconds, "s", 2)} />
              <Metric label="Transcription" value={withUnit(m.transcriptionMs, "ms")} />
              <Metric label="Ask" value={withUnit(m.askMs, "ms")} />
              <Metric label="TTS" value={withUnit(m.ttsMs, "ms")} />
              <Metric label="Q → first audio" value={withUnit(m.questionToFirstAudioMs, "ms")} />
              <Metric label="Audio length" value={withUnit(m.ttsSeconds, "s", 2)} />
              <Metric label="Transcription cost" value={cost(m.transcriptionUsd)} />
              <Metric label="TTS cost (est)" value={cost(m.ttsUsd)} />
              <Metric label="Total cost" value={cost(m.totalCostUsd ?? m.modelCostUsd)} />
            </dl>
          )}

          {turn.failedAttempt && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-destructive">
                Unverified — failed attempt
              </p>
              <p className="mt-1.5 text-sm text-foreground">{turn.failedAttempt.answer}</p>
              {turn.failedAttempt.citations.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {turn.failedAttempt.citations.map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {c.fileName} p.{c.page}:
                      </span>{" "}
                      {c.quote}
                    </li>
                  ))}
                </ul>
              )}
              {turn.failedAttempt.invalidReasons.length > 0 && (
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                  {turn.failedAttempt.invalidReasons.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <CopyRowButton turn={turn} />
          </div>
    </div>
  )
}
