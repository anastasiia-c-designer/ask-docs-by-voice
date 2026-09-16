"use client"

import { useMemo, useRef, useState } from "react"
import { Square, Volume2 } from "lucide-react"
import { DocumentUploader } from "@/components/document-uploader"
import { QuestionInput } from "@/components/question-input"
import { Conversation } from "@/components/conversation"
import { VoiceControls, type VoiceResult } from "@/components/voice-controls"
import { DebugPanel, type TestLogEntry } from "@/components/debug-panel"
import { Button } from "@/components/ui/button"
import {
  computeCostUsd,
  computeTranscriptionCostUsd,
  computeTtsCostUsd,
  extractHintTerms,
  DEFAULT_TTS_MODEL,
} from "@/lib/config"
import { useSpeech } from "@/lib/use-speech"
import type {
  AnswerResult,
  AskResponse,
  ConversationTurn,
  FailedAttempt,
  ManualDocument,
  QaTurn,
  Timing,
  TokenUsage,
} from "@/lib/types"

const MAX_HISTORY_TURNS = 6
const DID_NOT_CATCH = "I didn't catch that. Please try again."

// Voice metadata attached to a question that came from speech.
interface VoiceMeta {
  transcriptionModel: string
  recordingSeconds: number
  transcriptionMs: number
  recordingStopAt: number
}

function sumCosts(parts: (number | null)[]): number | null {
  const known = parts.filter((p): p is number => p !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

export default function Page() {
  const [documents, setDocuments] = useState<ManualDocument[]>([])
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [ingestionMs, setIngestionMs] = useState<number | null>(null)
  const [timing, setTiming] = useState<Timing | null>(null)
  const [usage, setUsage] = useState<TokenUsage | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(null)
  const [failedAttempt, setFailedAttempt] = useState<FailedAttempt | null>(null)
  const [log, setLog] = useState<TestLogEntry[]>([])

  const speech = useSpeech()
  const latestAnswerRef = useRef<string | null>(null)

  const hintTerms = useMemo(() => extractHintTerms(documents), [documents])

  function resetSession() {
    speech.stop()
    setTurns([])
    setError(null)
    setNotice(null)
    setTiming(null)
    setUsage(null)
    setModel(null)
    setReasoningEffort(null)
    setFailedAttempt(null)
    setLog([])
    latestAnswerRef.current = null
  }

  function handleDocumentsReady(docs: ManualDocument[], ms: number) {
    setDocuments(docs)
    setIngestionMs(ms)
    resetSession()
  }

  function handleReplace() {
    setDocuments([])
    setIngestionMs(null)
    resetSession()
  }

  function patchEntry(id: string, fn: (entry: TestLogEntry) => TestLogEntry) {
    setLog((prev) => prev.map((entry) => (entry.id === id ? fn(entry) : entry)))
  }

  async function runAsk(question: string, voice: VoiceMeta | null) {
    setLoading(true)
    setError(null)
    setNotice(null)
    setFailedAttempt(null)

    const history: QaTurn[] = turns
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({ question: t.question, answer: t.result.answer }))

    const askStart = performance.now()
    let data: AskResponse
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, question, history }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error ?? `Request failed with status ${res.status}.`)
        setLoading(false)
        return
      }
      data = (await res.json()) as AskResponse
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.")
      setLoading(false)
      return
    }
    const askMs = performance.now() - askStart

    const result: AnswerResult = {
      status: data.status,
      answer: data.answer,
      citations: data.citations,
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`

    setTurns((prev) => [...prev, { id, question, inputMode: voice ? "voice" : "text", result }])
    setUsage(data.usage ?? null)
    setTiming(data.timing)
    setModel(data.model)
    setReasoningEffort(data.reasoningEffort ?? null)
    setFailedAttempt(data.failedAttempt ?? null)
    latestAnswerRef.current = data.answer

    const modelCostUsd =
      data.usage && data.model
        ? computeCostUsd(data.model, {
            inputTokens: data.usage.inputTokens,
            cachedInputTokens: data.usage.cachedInputTokens,
            cacheWriteTokens: data.usage.cacheWriteInputTokens,
            outputTokens: data.usage.outputTokens,
          })
        : null

    const transcriptionUsd = voice
      ? computeTranscriptionCostUsd(voice.transcriptionModel, voice.recordingSeconds)
      : null

    const entry: TestLogEntry = {
      id,
      question,
      inputMode: voice ? "voice" : "text",
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
      modelCostUsd,
      recordingSeconds: voice ? voice.recordingSeconds : null,
      transcriptionMs: voice ? voice.transcriptionMs : null,
      askMs: voice ? askMs : null,
      ttsMs: null,
      questionToFirstAudioMs: null,
      ttsSeconds: null,
      transcriptionUsd,
      ttsUsd: null,
      totalCostUsd: sumCosts([modelCostUsd, transcriptionUsd]),
    }
    setLog((prev) => [...prev, entry])
    setLoading(false)

    // Speak the answer. Voice questions auto-play and record voice timing/cost;
    // typed questions are spoken only on demand via the Play button.
    if (voice) {
      speech.speak(data.answer, {
        sinceMark: voice.recordingStopAt,
        onPlaying: ({ ttsMs, questionToFirstAudioMs }) =>
          patchEntry(id, (e) => ({ ...e, ttsMs, questionToFirstAudioMs })),
        onDuration: (seconds) =>
          patchEntry(id, (e) => {
            const ttsUsd = computeTtsCostUsd(DEFAULT_TTS_MODEL, seconds)
            return {
              ...e,
              ttsSeconds: seconds,
              ttsUsd,
              totalCostUsd: sumCosts([e.modelCostUsd, e.transcriptionUsd, ttsUsd]),
            }
          }),
        onError: (message) => setError(message),
      })
    }
  }

  function handleVoiceResult(voiceResult: VoiceResult) {
    const { transcript, ...meta } = voiceResult
    void runAsk(transcript, {
      transcriptionModel: meta.transcriptionModel,
      recordingSeconds: meta.recordingSeconds,
      transcriptionMs: meta.transcriptionMs,
      recordingStopAt: meta.recordingStopAt,
    })
  }

  function handleDidNotCatch() {
    setNotice(DID_NOT_CATCH)
    latestAnswerRef.current = DID_NOT_CATCH
    speech.speak(DID_NOT_CATCH, { sinceMark: null })
  }

  function handleRecordingStart() {
    speech.stop()
    setNotice(null)
    setError(null)
  }

  function handlePlayLatest() {
    const text = latestAnswerRef.current
    if (!text) return
    speech.speak(text, { sinceMark: null, onError: (message) => setError(message) })
  }

  const hasDocuments = documents.length > 0

  const latestSpeechControls =
    turns.length > 0 ? (
      speech.speaking ? (
        <Button variant="outline" size="sm" onClick={speech.stop}>
          <Square className="mr-1.5 size-3.5" />
          Stop
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handlePlayLatest}>
          <Volume2 className="mr-1.5 size-3.5" />
          Play answer
        </Button>
      )
    ) : null

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-balance">Ask your manual</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Upload equipment manuals and ask by voice or text. Answers are grounded only in what the
          documents actually say, with a verbatim quote and page reference, and read back aloud.
        </p>
      </header>

      <DocumentUploader
        documents={documents}
        onDocumentsReady={handleDocumentsReady}
        onReplace={handleReplace}
      />

      <Conversation
        turns={turns}
        documents={documents}
        latestSpeechControls={latestSpeechControls}
      />

      {notice && (
        <div role="status" className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-card-foreground">{notice}</p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-card p-4">
          <p className="text-sm font-medium text-destructive">Something went wrong</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {hasDocuments && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <VoiceControls
            disabled={!hasDocuments}
            busy={loading}
            hintTerms={hintTerms}
            onRecordingStart={handleRecordingStart}
            onResult={handleVoiceResult}
            onEmpty={handleDidNotCatch}
            onError={(message) => setError(message)}
          />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or type</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <QuestionInput onAsk={(q) => runAsk(q, null)} disabled={!hasDocuments} loading={loading} />
        </div>
      )}

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
