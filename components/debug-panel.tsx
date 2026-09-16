"use client"

import type { TokenUsage } from "@/lib/types"

interface DebugPanelProps {
  ingestionMs: number | null
  serverMs: number | null
  usage: TokenUsage | null
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm text-foreground">{value}</dd>
    </div>
  )
}

export function DebugPanel({ ingestionMs, serverMs, usage }: DebugPanelProps) {
  const hasData = ingestionMs !== null || serverMs !== null || usage !== null
  if (!hasData) return null

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Debug
      </h2>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          label="Ingestion"
          value={ingestionMs !== null ? `${ingestionMs.toFixed(0)} ms` : "—"}
        />
        <Metric label="Response" value={serverMs !== null ? `${serverMs.toFixed(0)} ms` : "—"} />
        <Metric label="Input tokens" value={usage ? String(usage.inputTokens) : "—"} />
        <Metric label="Output tokens" value={usage ? String(usage.outputTokens) : "—"} />
      </dl>
    </div>
  )
}
