"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Menu, X } from "lucide-react"
import { DocumentUploader } from "@/components/document-uploader"
import { DocumentsMenu } from "@/components/documents-menu"
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
  // Set once the user renames the chat by hand. A manual name always wins and is
  // never overwritten when documents are (re)loaded.
  titleManual: boolean
  // True once documents have been loaded into this chat at least once. Stays true
  // even after "Replace documents" clears them, so the chat keeps counting as an
  // existing chat in the sidebar.
  everHadDocuments: boolean
  // A one-off system notice shown at the top of the conversation after documents
  // are replaced in a chat that had messages. Not a ConversationTurn: never sent
  // to the model and never in the test log.
  replaceNotice: string | null
  // Bridges "Replace documents" (which clears the turns) to the subsequent
  // document load: records that the just-cleared conversation had at least one
  // message, so the notice is shown only in that case.
  pendingReplaceHadMessages: boolean
}

// Natural-language join of the loaded file names for the replace notice.
function formatFileNames(docs: ManualDocument[]): string {
  const names = docs.map((d) => d.fileName)
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

// Chat title = first file's name without ".pdf", plus " +1" when a second file
// is loaded alongside it.
function deriveTitle(docs: ManualDocument[]): string {
  const first = docs[0]?.fileName ?? ""
  const base = first.replace(/\.pdf$/i, "").slice(0, 60)
  return docs.length > 1 ? `${base} +1` : base
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
  return {
    id: newId(),
    title: "New chat",
    documents: [],
    turns: [],
    ingestionMs: null,
    fromSample: false,
    titleManual: false,
    everHadDocuments: false,
    replaceNotice: null,
    pendingReplaceHadMessages: false,
  }
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

  function handleDocumentsReady(docs: ManualDocument[], ms: number, fromSample: boolean) {
    speech.stop()
    const id = activeIdRef.current
    updateChat(id, (c) => ({
      ...c,
      documents: docs,
      ingestionMs: ms,
      turns: [],
      // A manual name always wins; otherwise derive from the file names.
      title: c.titleManual ? c.title : deriveTitle(docs) || c.title,
      fromSample,
      everHadDocuments: true,
      // Only surface the replace notice when the prior conversation had messages.
      replaceNotice: c.pendingReplaceHadMessages
        ? `Documents replaced with ${formatFileNames(docs)}. Earlier answers came from the previous documents, so the conversation was cleared.`
        : null,
      pendingReplaceHadMessages: false,
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
      // Keep a manual name across the replace; otherwise reset to the default.
      title: c.titleManual ? c.title : "New chat",
      fromSample: false,
      // Clear any prior notice while empty; remember whether this replace cleared
      // a non-empty conversation so the next load can show the notice.
      replaceNotice: null,
      pendingReplaceHadMessages: c.turns.length > 0,
    }))
    setVoiceError(null)
  }

  function renameChat(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return // empty value keeps the old name
    updateChat(id, (c) => ({ ...c, title: trimmed.slice(0, 60), titleManual: true }))
  }

  function deleteChat(id: string) {
    const remaining = chats.filter((c) => c.id !== id)
    if (id === activeId) {
      speech.stop()
      setVoiceError(null)
      setLoading(false)
      setDrawerOpen(false)
      if (remaining.length === 0) {
        // Nothing left: fall back to a fresh empty chat (the empty state).
        const chat = emptyChat()
        setChats([chat])
        setActiveId(chat.id)
        return
      }
      // Switch to the most recent remaining chat (chats are in creation order).
      setActiveId(remaining[remaining.length - 1].id)
    }
    setChats(remaining)
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
  // Centered "start" layout: documents are loaded but no question has been asked
  // yet. Flips to the normal bottom-pinned layout the moment the first turn
  // appears, driving the composer slide + heading/glow fade.
  const isStartState = hasDocuments && turns.length === 0
  // Starter pills: only for sample-loaded chats, and only before the first turn.
  const showSuggestions = hasDocuments && activeChat.fromSample && turns.length === 0
  const logEntries = turns
    .map((t) => t.metrics)
    .filter((m): m is TestLogEntry => m !== null)

  const chatSummaries: ChatSummary[] = chats.map((c) => ({
    id: c.id,
    title: c.title,
    documentCount: c.documents.length,
    everHadDocuments: c.everHadDocuments,
  }))

  // The product shell (sidebar + mobile menu) is revealed the first time any
  // chat has documents, and stays revealed for the rest of the session — even
  // after "New chat" shows the empty state again, or documents are replaced.
  const sidebarRevealedRef = useRef(false)
  if (chats.some((c) => c.documents.length > 0)) sidebarRevealedRef.current = true
  const sidebarVisible = sidebarRevealedRef.current

  const externalPhase: ExternalPhase = speech.speaking ? "speaking" : loading ? "thinking" : "idle"

  return (
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      {sidebarVisible && (
        <aside className="sticky top-0 hidden h-svh w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar md:flex">
          <ChatSidebar
            chats={chatSummaries}
            activeId={activeId}
            onSelect={selectChat}
            onNewChat={newChat}
            onRename={renameChat}
            onDelete={deleteChat}
            logEntries={logEntries}
            ingestionMs={ingestionMs}
          />
        </aside>
      )}

      {/* Mobile slide-in drawer */}
      {sidebarVisible && drawerOpen && (
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
              onRename={renameChat}
              onDelete={deleteChat}
              logEntries={logEntries}
              ingestionMs={ingestionMs}
            />
          </aside>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {sidebarVisible ? (
          /* Compact mobile header with menu button (mobile only) */
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden relative">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
            >
              <Menu className="size-5" />
            </button>
            <LogoMark className="size-6 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{activeChat.title}</span>
            {hasDocuments && (
              <DocumentsMenu documents={documents} onReplace={handleReplace} variant="compact" />
            )}
          </header>
        ) : (
          /* First-visit header: logo mark + wordmark, not clickable, overlaid
             top-left on both desktop and mobile until the sidebar appears. */
          <header className="absolute left-0 top-0 z-30 flex items-center gap-2 px-4 py-3 md:px-6 md:py-4">
            <LogoMark className="size-7 shrink-0" />
            <span className="text-base font-semibold tracking-tight text-foreground">Pagewise</span>
          </header>
        )}

        <main className={`relative flex flex-1 flex-col ${!hasDocuments ? "empty-gradient" : ""}`}>
          {!hasDocuments ? (
            <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center px-4 pt-12 pb-[calc(3rem+16vh)]">
              <div className="flex flex-col items-center gap-4 text-center">
                {sidebarVisible && <LogoMark className="size-12" />}
                <h1 className="text-[26px] leading-tight tracking-tight text-balance md:text-[32px]">
                  <span className="block font-light text-foreground">Ask your manual</span>
                  <span className="block font-bold text-foreground">out loud.</span>
                </h1>
              </div>
              <div className="mt-8 w-full">
                <DocumentUploader onDocumentsReady={handleDocumentsReady} />
              </div>
            </div>
          ) : (
            <>
              <div className="hidden border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur md:sticky md:top-0 md:z-10 md:block">
                <div className="mx-auto flex w-full max-w-[720px] items-center justify-end">
                  <DocumentsMenu documents={documents} onReplace={handleReplace} variant="bar" />
                </div>
              </div>

              <div className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-6 pb-40">
                {activeChat.replaceNotice && (
                  <div role="note" className="mb-6 flex items-center gap-3">
                    <span aria-hidden className="h-px flex-1 bg-border" />
                    <span className="max-w-[80%] text-center text-xs leading-relaxed text-muted-foreground text-pretty">
                      {activeChat.replaceNotice}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>
                )}
                {turns.length > 0 && (
                  <Conversation turns={turns} documents={documents} onPlay={handlePlay} />
                )}

                <div ref={bottomRef} />
              </div>

              <div
                className={`fixed inset-x-0 bottom-0 z-20 transition-transform duration-300 ease-out md:left-[260px] ${
                  isStartState
                    ? "translate-y-[calc(-50svh+50%)]"
                    : "translate-y-0 bg-background/95 backdrop-blur"
                }`}
              >
                {/* Fade from the scrolling conversation into the composer. Only
                    when there is scrollable content behind it (normal state). */}
                {!isStartState && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent to-background"
                  />
                )}
                <div className="relative mx-auto max-w-[720px] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {/* Soft, wide lavender glow behind the centered composer. Fades
                      out with the heading once the first question is sent. */}
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[340px] w-[680px] max-w-[130vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-opacity duration-300 ease-out ${
                      isStartState ? "opacity-25" : "opacity-0"
                    }`}
                    style={{ background: "radial-gradient(closest-side, var(--accent-strong), transparent)" }}
                  />
                  {/* Start-state heading sitting directly above the composer;
                      fades out as the composer slides to the bottom. */}
                  <div
                    aria-hidden={!isStartState}
                    className={`absolute inset-x-0 bottom-full mb-6 flex flex-col items-center gap-1 px-4 text-center transition-opacity duration-300 ease-out ${
                      isStartState ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                  >
                    <h2 className="text-[22px] font-medium leading-tight tracking-tight text-foreground text-balance md:text-[26px]">
                      Ready when you are
                    </h2>
                    <p className="text-sm text-muted-foreground text-pretty">
                      Ask about <span className="font-medium text-foreground/90">{activeChat.title}</span>
                    </p>
                  </div>
                  {showSuggestions && (
                    <div className="mb-3 flex flex-wrap justify-center gap-2">
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
