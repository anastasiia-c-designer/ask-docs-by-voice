"use client"

import { useState } from "react"
import { DocumentUploader } from "@/components/document-uploader"
import { QuestionInput } from "@/components/question-input"
import { AnswerDisplay } from "@/components/answer-display"
import { DebugPanel, type TestLogEntry } from "@/components/debug-panel"
import { computeCostUsd } from "@/lib/config"
import type {
  AnswerResult,
  AskResponse,
  FailedAttempt,
  ManualDocument,
  QaTurn,
  Timing,
  TokenUsage,
} from "@/lib/types"

const MAX_HISTORY_TURNS = 6

export default function Page() {
  const [documents, setDocuments] = useState<ManualDocument[]>([])
  const [history, setHistory] = useState<QaTurn[]>([])
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [ingestionMs, setIngestionMs] = useState<number | null>(null)
  const [timing, setTiming] = useState<Timing | null>(null)
  const [usage, setUsage] = useState<TokenUsage | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(null)
  const [failedAttempt, setFailedAttempt] = useState<FailedAttempt | null>(null)
  const [log, setLog] = useState<TestLogEntry[]>([])

  function resetSession() {
    setHistory([])
    setResult(null)
    setError(null)
    setTiming(null)
    setUsage(null)
    setModel(null)
    setReasoningEffort(null)
    setFailedAttempt(null)
    setLog([])
  }

  function handleDocumentsReady(docs: ManualDocument[], ms: number) {
    setDocuments(docs)
    setIngestionMs(ms)
    // New documents start a fresh session.
    resetSession()
  }

  function handleReplace() {
    setDocuments([])
    setIngestionMs(null)
    resetSession()
  }

  async function handleAsk(question: string) {
    setLoading(true)
    setError(null)
    setResult(null)
    setFailedAttempt(null)

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, question, history: history.slice(-MAX_HISTORY_TURNS) }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Request failed with status ${res.status}.`)
        return
      }

      const data = (await res.json()) as AskResponse

      setResult({ status: data.status, answer: data.answer, citations: data.citations })
      setUsage(data.usage ?? null)
      setTiming(data.timing)
      setModel(data.model)
      setReasoningEffort(data.reasoningEffort ?? null)
      setFailedAttempt(data.failedAttempt ?? null)
      setHistory((prev) => [...prev, { question, answer: data.answer }].slice(-MAX_HISTORY_TURNS))

      const costUsd =
        data.usage && data.model
          ? computeCostUsd(data.model, {
              inputTokens: data.usage.inputTokens,
              cachedInputTokens: data.usage.cachedInputTokens,
              cacheWriteTokens: data.usage.cacheWriteInputTokens,
              outputTokens: data.usage.outputTokens,
            })
          : null

      const entry: TestLogEntry = {
        question,
        status: data.status,
        answer: data.answer,
        citations: data.citations,
        verified: data.status !== "unverified",
        attempts: data.timing.attempts,
        totalMs: data.timing.totalMs,
        openAiMs: data.timing.openAiMs,
        inputTokens: data.usage?.inputTokens ?? 0,
        cachedTokens: data.usage?.cachedInputTokens ?? 0,
        cacheWriteTokens: data.usage?.cacheWriteInputTokens ?? 0,
        outputTokens: data.usage?.outputTokens ?? 0,
        costUsd,
      }
      setLog((prev) => [...prev, entry])
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.")
    } finally {
      setLoading(false)
    }
  }

  const hasDocuments = documents.length > 0

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-balance">Ask your manual</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Upload equipment manuals and get answers grounded only in what the documents actually say,
          with a verbatim quote and page reference.
        </p>
      </header>

      <DocumentUploader
        documents={documents}
        onDocumentsReady={handleDocumentsReady}
        onReplace={handleReplace}
      />

      {hasDocuments && <QuestionInput onAsk={handleAsk} disabled={!hasDocuments} loading={loading} />}

      <AnswerDisplay result={result} error={error} />

      <DebugPanel
        ingestionMs={ingestionMs}
        timing={timing}
        usage={usage}
        model={model}
        reasoningEffort={reasoningEffort}
        failedAttempt={failedAttempt}
        log={log}
      />
    </main>
  )
}
