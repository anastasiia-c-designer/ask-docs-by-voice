"use client"

import { useState } from "react"
import { DocumentUploader } from "@/components/document-uploader"
import { QuestionInput } from "@/components/question-input"
import { AnswerDisplay } from "@/components/answer-display"
import { DebugPanel } from "@/components/debug-panel"
import type { AnswerResult, ManualDocument, QaTurn, TokenUsage, AskResponse } from "@/lib/types"

const MAX_HISTORY_TURNS = 6

export default function Page() {
  const [documents, setDocuments] = useState<ManualDocument[]>([])
  const [history, setHistory] = useState<QaTurn[]>([])
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [ingestionMs, setIngestionMs] = useState<number | null>(null)
  const [serverMs, setServerMs] = useState<number | null>(null)
  const [usage, setUsage] = useState<TokenUsage | null>(null)

  function handleDocumentsReady(docs: ManualDocument[], ms: number) {
    setDocuments(docs)
    setIngestionMs(ms)
    // New documents start a fresh session.
    setHistory([])
    setResult(null)
    setError(null)
    setServerMs(null)
    setUsage(null)
  }

  function handleReplace() {
    setDocuments([])
    setHistory([])
    setResult(null)
    setError(null)
    setIngestionMs(null)
    setServerMs(null)
    setUsage(null)
  }

  async function handleAsk(question: string) {
    setLoading(true)
    setError(null)
    setResult(null)

    const start = performance.now()
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, question, history: history.slice(-MAX_HISTORY_TURNS) }),
      })

      setServerMs(performance.now() - start)

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Request failed with status ${res.status}.`)
        return
      }

      const data = (await res.json()) as AskResponse
      setResult({ status: data.status, answer: data.answer, citations: data.citations })
      setUsage(data.usage ?? null)
      setHistory((prev) => [...prev, { question, answer: data.answer }].slice(-MAX_HISTORY_TURNS))
    } catch (err) {
      setServerMs(performance.now() - start)
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

      {hasDocuments && (
        <QuestionInput onAsk={handleAsk} disabled={!hasDocuments} loading={loading} />
      )}

      <AnswerDisplay result={result} error={error} />

      <DebugPanel ingestionMs={ingestionMs} serverMs={serverMs} usage={usage} />
    </main>
  )
}
