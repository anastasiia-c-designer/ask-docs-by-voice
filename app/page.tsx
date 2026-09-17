"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Menu, X } from "lucide-react"
import { DocumentUploader } from "@/components/document-uploader"
import { Conversation } from "@/components/conversation"
import { VoiceControls, type VoiceResult, type ExternalPhase } from "@/components/voice-controls"
import { ChatSidebar, type ChatSummary } from "@/components/chat-sidebar"
import { LogoMark } from "@/components/logo"
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

// Fixed starter questions shown only for the bundled sample manuals. These are
// hard-coded (never model-generated) and disappear once the chat has a turn.
const SAMPLE_QUESTIONS = [
  "What room size is the AP-200 for?",
  "Can I run the AP-400 on Turbo all night?",
  "How much does the AP-400 weigh?",
]

// Voice metadata attached to a question that came from speech.
interface VoiceMeta {
  transcriptionModel: string
  recordingSeconds: number
  transcriptionMs: number
  recordingStopAt: number
}

// A single in-memory chat: its own documents, conversation, and ingestion time.
// Nothing is persisted — chats live only for the lifetime of the tab.
interface Chat {
  id: string
  title: string
  documents: ManualDocument[]
  turns: ConversationTurn[]
  ingestionMs: number | null
  // True only when the documents came from "Try sample manuals"; gates the
  // suggested starter questions.
  fromSample: boolean
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

function emptyChat(): Chat {
  return { id: newId(), title: "New chat", documents: [], turns: [], ingestionMs: null, fromSample: false }
}

export default function Page() {
  // Seed exactly one chat, created once (not on every render).
  const firstChat = useRef<Chat | null>(null)
  if (firstChat.current === null) firstChat.current = emptyChat()

  const [chats, setChats] = useState<Chat[]>([firstChat.current])
  const [activeId, setActiveId] = useState<string>(firstChat.current.id)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const speech = useSpeech()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Latest values for async callbacks that outlive a render (e.g. a voice turn
  // whose transcription resolves after the user switched chats).
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  // The chat a recording belongs to, captured when recording starts, so its
  // answer always lands in the chat where the question was asked.
  const recordingChatIdRef = useRef(activeId)

  const activeChat = chats.find((c) => c.id === activeId) ?? chats[0]
  const documents = activeChat.documents
  const turns = activeChat.turns
  const ingestionMs = activeChat.ingestionMs

  const hintTerms = useMemo(() => extractHintTerms(documents), [documents])

  const lastTurn = turns[turns.length - 1]
  // Auto-scroll to the newest turn as it appears, as its answer resolves, and
  // when switching chats.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [turns.length, lastTurn?.pending, activeId])

  function updateChat(chatId: string, fn: (chat: Chat) => Chat) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? fn(c) : c)))
  }

  function patchTurn(chatId: string, id: string, fn: (turn: ConversationTurn) => ConversationTurn) {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, turns: c.turns.map((t) => (t.id === id ? fn(t) : t)) } : c,
      ),
    )
  }

  function patchMetrics(chatId: string, id: string, fn: (m: TestLogEntry) => TestLogEntry) {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              turns: c.turns.map((t) =>
                t.id === id && t.metrics ? { ...t, metrics: fn(t.metrics) } : t,
              ),
            }
          : c,
      ),
    )
  }

  function selectChat(id: string) {
    if (id === activeId) {
      setDrawerOpen(false)
      return
    }
    // Switching chats stops any recording (VoiceControls remounts via key) and
    // any audio playback.
    speech.stop()
    setActiveId(id)
    setVoiceError(null)
    setLoading(false)
    setDrawerOpen(false)
  }

  function newChat() {
    speech.stop()
    const chat = emptyChat()
    setChats((prev) => [...prev, chat])
    setActiveId(chat.id)
    setVoiceError(null)
    setLoading(false)
    setDrawerOpen(false)
  }

  function handleDocumentsReady(docs: ManualDocument[], ms: number, title: string, fromSample: boolean) {
    speech.stop()
    const id = activeIdRef.current
    const trimmed = title.trim().slice(0, 60)
    updateChat(id, (c) => ({
      ...c,
      documents: docs,
      ingestionMs: ms,
      turns: [],
      title: trimmed || c.title,
      fromSample,
    }))
    setVoiceError(null)
  }

  function handleReplace() {
    speech.stop()
    const id = activeIdRef.current
    updateChat(id, (c) => ({
      ...c,
      documents: [],
      ingestionMs: null,
      turns: [],
      title: "New chat",
      fromSample: false,
    }))
    setVoiceError(null)
  }

  async function runAsk(question: string, voice: VoiceMeta | null, chatId?: string) {
    const targetId = chatId ?? activeIdRef.current
    const chat = chatsRef.current.find((c) => c.id === targetId)
    if (!chat) return

    const docsForAsk = chat.documents
    const history: QaTurn[] = chat.turns
      .slice(-MAX_HISTORY_TURNS)
      .filter((t): t is ConversationTurn & { result: AnswerResult } => t.result !== null)
      .map((t) => ({ question: t.question, answer: t.result.answer }))

    const setActiveLoading = (value: boolean) => {
      if (targetId === activeIdRef.current) setLoading(value)
    }

    const id = newId()
    // Show the transcript immediately with a skeleton for the pending answer.
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              turns: [
                ...c.turns,
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
              ],
            }
          : c,
      ),
    )
    setActiveLoading(true)
    if (targetId === activeIdRef.current) setVoiceError(null)

    const askStart = performance.now()
    let data: AskResponse
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: docsForAsk, question, history }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        patchTurn(targetId, id, (t) => ({
          ...t,
          pending: false,
          error: d?.error ?? `Request failed with status ${res.status}.`,
        }))
        setActiveLoading(false)
        return
      }
      data = (await res.json()) as AskResponse
    } catch (err) {
      patchTurn(targetId, id, (t) => ({
        ...t,
        pending: false,
        error: err instanceof Error ? err.message : "The request failed.",
      }))
      setActiveLoading(false)
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

    patchTurn(targetId, id, (t) => ({
      ...t,
      pending: false,
      result,
      model: data.model,
      reasoningEffort: data.reasoningEffort ?? null,
      verificationMs: data.timing.verificationMs,
      failedAttempt: data.failedAttempt ?? null,
      metrics,
    }))
    setActiveLoading(false)

    // Voice questions auto-play and record voice timing/cost — but only if their
    // chat is still the active one. Typed questions are spoken on demand.
    if (voice && targetId === activeIdRef.current) {
      speech.speak(data.answer, {
        sinceMark: voice.recordingStopAt,
        onPlaying: ({ ttsMs, questionToFirstAudioMs }) =>
          patchMetrics(targetId, id, (m) => ({ ...m, ttsMs, questionToFirstAudioMs })),
        onDuration: (seconds) =>
          patchMetrics(targetId, id, (m) => {
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
    void runAsk(
      transcript,
      {
        transcriptionModel: meta.transcriptionModel,
        recordingSeconds: meta.recordingSeconds,
        transcriptionMs: meta.transcriptionMs,
        recordingStopAt: meta.recordingStopAt,
      },
      recordingChatIdRef.current,
    )
  }

  function handleDidNotCatch() {
    setVoiceError("I didn’t catch that. Tap the mic to try again.")
    speech.speak(DID_NOT_CATCH, { sinceMark: null })
  }

  function handleRecordingStart() {
    speech.stop()
    setVoiceError(null)
    recordingChatIdRef.current = activeIdRef.current
  }

  // Play any message's answer on demand (per-message action row). Uses the same
  // playback path as voice auto-play; speak() replaces any current playback.
  function handlePlay(text: string) {
    speech.speak(text, { sinceMark: null, onError: (message) => setVoiceError(message) })
  }

  const hasDocuments = documents.length > 0
  // Starter pills: only for sample-loaded chats, and only before the first turn.
  const showSuggestions = hasDocuments && activeChat.fromSample && turns.length === 0
  const logEntries = turns
    .map((t) => t.metrics)
    .filter((m): m is TestLogEntry => m !== null)

  const chatSummaries: ChatSummary[] = chats.map((c) => ({
    id: c.id,
    title: c.title,
    documentCount: c.documents.length,
    questionCount: c.turns.length,
  }))

  const externalPhase: ExternalPhase = speech.speaking ? "speaking" : loading ? "thinking" : "idle"

  return (
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar md:flex">
        <ChatSidebar
          chats={chatSummaries}
          activeId={activeId}
          onSelect={selectChat}
          onNewChat={newChat}
          logEntries={logEntries}
          ingestionMs={ingestionMs}
        />
      </aside>

      {/* Mobile slide-in drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[80%] flex-col border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <ChatSidebar
              chats={chatSummaries}
              activeId={activeId}
              onSelect={selectChat}
              onNewChat={newChat}
              logEntries={logEntries}
              ingestionMs={ingestionMs}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact mobile header */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <LogoMark className="size-6 shrink-0" />
          <span className="truncate text-sm font-medium text-foreground">{activeChat.title}</span>
        </header>

        <main className={`relative flex flex-1 flex-col ${!hasDocuments ? "empty-gradient" : ""}`}>
          {!hasDocuments ? (
            <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center px-4 py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <LogoMark className="size-12" />
                <h1 className="text-[26px] leading-tight tracking-tight text-balance md:text-[32px]">
                  <span className="block font-light text-foreground">Ask your manual</span>
                  <span className="block font-bold text-foreground">out loud.</span>
                </h1>
              </div>
              <div className="mt-8 w-full">
                <DocumentUploader
                  documents={documents}
                  onDocumentsReady={handleDocumentsReady}
                  onReplace={handleReplace}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur md:sticky md:top-0 md:z-10">
                <div className="mx-auto flex w-full max-w-[720px] items-center gap-3">
                  <h1 className="hidden max-w-[45%] shrink-0 truncate text-sm font-semibold tracking-tight md:block">
                    {activeChat.title}
                  </h1>
                  <div className="min-w-0 flex-1">
                    <DocumentUploader
                      documents={documents}
                      onDocumentsReady={handleDocumentsReady}
                      onReplace={handleReplace}
                    />
                  </div>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-6 pb-40">
                {turns.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground text-pretty">
                    Tap the mic below and ask your first question.
                  </p>
                ) : (
                  <Conversation turns={turns} documents={documents} onPlay={handlePlay} />
                )}

                <div ref={bottomRef} />
              </div>

              <div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 backdrop-blur md:left-[260px]">
                {/* Fade from the scrolling conversation into the composer. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent to-background"
                />
                <div className="mx-auto max-w-[720px] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {showSuggestions && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {SAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => runAsk(q, null)}
                          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <VoiceControls
                    key={activeId}
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
                    onAsk={(q) => runAsk(q, null)}
                  />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
