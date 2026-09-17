"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Square, Volume2 } from "lucide-react"
import { DocumentUploader } from "@/components/document-uploader"
import { QuestionInput } from "@/components/question-input"
import { Conversation } from "@/components/conversation"
import { VoiceControls, type VoiceResult, type ExternalPhase } from "@/components/voice-controls"
import { TestLog } from "@/components/test-log"
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
  ManualDocument,
  QaTurn,
  TestLogEntry,
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

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

export default function Page() {
  const [documents, setDocuments] = useState<ManualDocument[]>([])
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ingestionMs, setIngestionMs] = useState<number | null>(null)

  const speech = useSpeech()
  const latestAnswerRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const hintTerms = useMemo(() => extractHintTerms(documents), [documents])

  const lastTurn = turns[turns.length - 1]
  // Auto-scroll to the newest turn as it appears and as its answer resolves.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [turns.length, lastTurn?.pending])

  function resetSession() {
    speech.stop()
    setTurns([])
    setVoiceError(null)
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

  function patchTurn(id: string, fn: (turn: ConversationTurn) => ConversationTurn) {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)))
  }

  function patchMetrics(id: string, fn: (m: TestLogEntry) => TestLogEntry) {
    setTurns((prev) =>
      prev.map((t) => (t.id === id && t.metrics ? { ...t, metrics: fn(t.metrics) } : t)),
    )
  }

  async function runAsk(question: string, voice: VoiceMeta | null) {
    const history: QaTurn[] = turns
      .slice(-MAX_HISTORY_TURNS)
      .filter((t): t is ConversationTurn & { result: AnswerResult } => t.result !== null)
      .map((t) => ({ question: t.question, answer: t.result.answer }))

    const id = newId()
    // Show the transcript immediately with a skeleton for the pending answer.
    setTurns((prev) => [
      ...prev,
      {
        id,
        question,
        inputMode: voice ? "voice" : "text",
        pending: true,
        result: null,
        error: null,
        model: null,
        reasoningEffort: null,
        verificationMs: null,
        failedAttempt: null,
        metrics: null,
      },
    ])
    setLoading(true)
    setVoiceError(null)

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
        patchTurn(id, (t) => ({
          ...t,
          pending: false,
          error: d?.error ?? `Request failed with status ${res.status}.`,
        }))
        setLoading(false)
        return
      }
      data = (await res.json()) as AskResponse
    } catch (err) {
      patchTurn(id, (t) => ({
        ...t,
        pending: false,
        error: err instanceof Error ? err.message : "The request failed.",
      }))
      setLoading(false)
      return
    }
    const askMs = performance.now() - askStart

    const result: AnswerResult = {
      status: data.status,
      answer: data.answer,
      citations: data.citations,
    }

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

    const metrics: TestLogEntry = {
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

    patchTurn(id, (t) => ({
      ...t,
      pending: false,
      result,
      model: data.model,
      reasoningEffort: data.reasoningEffort ?? null,
      verificationMs: data.timing.verificationMs,
      failedAttempt: data.failedAttempt ?? null,
      metrics,
    }))
    latestAnswerRef.current = data.answer
    setLoading(false)

    // Voice questions auto-play and record voice timing/cost; typed questions
    // are spoken only on demand via the Play button.
    if (voice) {
      speech.speak(data.answer, {
        sinceMark: voice.recordingStopAt,
        onPlaying: ({ ttsMs, questionToFirstAudioMs }) =>
          patchMetrics(id, (m) => ({ ...m, ttsMs, questionToFirstAudioMs })),
        onDuration: (seconds) =>
          patchMetrics(id, (m) => {
            const ttsUsd = computeTtsCostUsd(DEFAULT_TTS_MODEL, seconds)
            return {
              ...m,
              ttsSeconds: seconds,
              ttsUsd,
              totalCostUsd: sumCosts([m.modelCostUsd, m.transcriptionUsd, ttsUsd]),
            }
          }),
        onError: (message) => setVoiceError(message),
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
    setVoiceError("I didn’t catch that. Tap the mic to try again.")
    latestAnswerRef.current = DID_NOT_CATCH
    speech.speak(DID_NOT_CATCH, { sinceMark: null })
  }

  function handleRecordingStart() {
    speech.stop()
    setVoiceError(null)
  }

  function handlePlayLatest() {
    const text = latestAnswerRef.current
    if (!text) return
    speech.speak(text, { sinceMark: null, onError: (message) => setVoiceError(message) })
  }

  const hasDocuments = documents.length > 0
  const logEntries = turns
    .map((t) => t.metrics)
    .filter((m): m is TestLogEntry => m !== null)

  const externalPhase: ExternalPhase = speech.speaking ? "speaking" : loading ? "thinking" : "idle"

  const latestSpeechControls =
    turns.length > 0 && lastTurn?.result ? (
      speech.speaking ? (
        <button
          type="button"
          onClick={speech.stop}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Square className="size-3 fill-current" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={handlePlayLatest}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Volume2 className="size-3.5" />
          Play answer
        </button>
      )
    ) : null

  return (
    <main className="mx-auto flex min-h-svh max-w-[640px] flex-col px-4">
      <header className="flex flex-col gap-1 pt-8 pb-6">
        <h1 className="text-xl font-semibold tracking-tight text-balance">Ask your manual</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Ask your equipment manuals by voice or text. Every answer is grounded only in what the
          documents say, with a verbatim quote and page reference, read back aloud.
        </p>
      </header>

      {!hasDocuments ? (
        <div className="pb-10">
          <DocumentUploader
            documents={documents}
            onDocumentsReady={handleDocumentsReady}
            onReplace={handleReplace}
          />
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-4 border-b border-border/60 bg-background/90 px-4 pb-3 pt-1 backdrop-blur">
            <DocumentUploader
              documents={documents}
              onDocumentsReady={handleDocumentsReady}
              onReplace={handleReplace}
            />
          </div>

          <div className="flex-1 pt-6 pb-[19rem]">
            {turns.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground text-pretty">
                Tap the mic below and ask your first question.
              </p>
            ) : (
              <Conversation
                turns={turns}
                documents={documents}
                latestSpeechControls={latestSpeechControls}
              />
            )}

            <div className="mt-6">
              <TestLog entries={logEntries} ingestionMs={ingestionMs} />
            </div>
            <div ref={bottomRef} />
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
            <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 pb-5 pt-4">
              <VoiceControls
                disabled={!hasDocuments}
                hintTerms={hintTerms}
                externalPhase={externalPhase}
                errorMessage={voiceError}
                onRecordingStart={handleRecordingStart}
                onResult={handleVoiceResult}
                onEmpty={handleDidNotCatch}
                onError={(message) => setVoiceError(message)}
                onStopSpeaking={speech.stop}
                onRetry={() => setVoiceError(null)}
              />
              <QuestionInput onAsk={(q) => runAsk(q, null)} disabled={loading} loading={loading} />
            </div>
          </div>
        </>
      )}
    </main>
  )
}
