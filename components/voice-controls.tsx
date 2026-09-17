"use client"

// Microphone capture plus the single compact composer bar. The bar holds a text
// input and one round action button; tap the mic to start recording, tap again
// (the button becomes Stop) to stop. On stop it posts audio to /api/transcribe
// and hands the transcript back to the page, which sends it to /api/ask exactly
// like a typed question. Typing a question and pressing Send (or Enter) asks it
// as text.
//
// The bar surfaces every phase of a turn inline: idle (input + mic/send),
// recording (live waveform + elapsed + Stop), transcribing, thinking (from the
// page while /api/ask runs), speaking (from the page while the answer plays,
// with a Stop button), and error (inline message + Try again). Motion is
// replaced with static indicators when the user prefers reduced motion.
//
// The recording pipeline (MediaRecorder, AnalyserNode metering, transcription)
// is unchanged from the previous version; only its controls were restyled.

import { useEffect, useRef, useState } from "react"
import { Mic, Square, Loader2, AlertCircle, RotateCcw, ArrowUp } from "lucide-react"
import type { TranscribeResponse } from "@/lib/types"
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion"

export interface VoiceResult {
  transcript: string
  transcriptionModel: string
  recordingSeconds: number
  transcriptionMs: number
  // performance.now() at the moment recording stopped, for the
  // question-to-first-audible-answer measurement.
  recordingStopAt: number
}

export type ExternalPhase = "idle" | "thinking" | "speaking"

interface VoiceControlsProps {
  disabled?: boolean
  hintTerms: string[]
  externalPhase: ExternalPhase
  errorMessage?: string | null
  onRecordingStart: () => void
  onResult: (result: VoiceResult) => void
  onEmpty: () => void
  onError: (message: string) => void
  onStopSpeaking: () => void
  onRetry: () => void
  onAsk: (question: string) => void
}

// A transcript shorter than this is treated as "didn't catch that".
const MIN_TRANSCRIPT_CHARS = 2

// Number of bars in the recording waveform.
const BAR_COUNT = 20
// Resting waveform (also used under reduced motion, when metering is off).
const STATIC_BARS = Array.from({ length: BAR_COUNT }, () => 0.35)

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ]
  for (const candidate of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return ""
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4"
  if (mime.includes("ogg")) return "ogg"
  return "webm"
}

function formatElapsed(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

type InternalStatus = "idle" | "recording" | "transcribing"
type DisplayPhase = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error"

export function VoiceControls({
  disabled,
  hintTerms,
  externalPhase,
  errorMessage,
  onRecordingStart,
  onResult,
  onEmpty,
  onError,
  onStopSpeaking,
  onRetry,
  onAsk,
}: VoiceControlsProps) {
  const [status, setStatus] = useState<InternalStatus>("idle")
  const [bars, setBars] = useState<number[]>(STATIC_BARS)
  const [elapsed, setElapsed] = useState(0)
  const [text, setText] = useState("")
  const reducedMotion = usePrefersReducedMotion()

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startAtRef = useRef(0)
  const mimeRef = useRef("")

  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const supported =
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia

  function stopMeters() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setBars(STATIC_BARS)
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      stopMeters()
      releaseStream()
    }
  }, [])

  function startMeters(stream: MediaStream) {
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed((performance.now() - startAtRef.current) / 1000)
    }, 200)

    if (reducedMotion) return

    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteTimeDomainData(data)
        // Downsample the time-domain buffer into BAR_COUNT RMS bars.
        const groupSize = Math.floor(data.length / BAR_COUNT) || 1
        const next: number[] = []
        for (let g = 0; g < BAR_COUNT; g++) {
          let sumSquares = 0
          for (let i = 0; i < groupSize; i++) {
            const v = (data[g * groupSize + i] - 128) / 128
            sumSquares += v * v
          }
          const rms = Math.sqrt(sumSquares / groupSize)
          next.push(Math.min(1, rms * 2.6))
        }
        setBars(next)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      // Level metering is optional; recording still works without it.
    }
  }

  async function finish() {
    const recordingStopAt = performance.now()
    const recordingSeconds = (recordingStopAt - startAtRef.current) / 1000
    stopMeters()
    releaseStream()

    const mime = mimeRef.current || "audio/webm"
    const blob = new Blob(chunksRef.current, { type: mime })
    chunksRef.current = []

    if (blob.size === 0) {
      setStatus("idle")
      onEmpty()
      return
    }

    setStatus("transcribing")

    const file = new File([blob], `recording.${extensionFor(mime)}`, { type: mime })
    const form = new FormData()
    form.append("audio", file)
    if (hintTerms.length) form.append("hint", hintTerms.join(", "))

    const started = performance.now()
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form })
      const transcriptionMs = performance.now() - started

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        onError(data?.error ?? "Transcription failed. Please try again or type your question.")
        setStatus("idle")
        return
      }

      const data = (await res.json()) as TranscribeResponse
      const transcript = (data.transcript ?? "").trim()
      setStatus("idle")

      if (transcript.length < MIN_TRANSCRIPT_CHARS) {
        onEmpty()
        return
      }

      onResult({
        transcript,
        transcriptionModel: data.model,
        recordingSeconds,
        transcriptionMs,
        recordingStopAt,
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transcription request failed.")
      setStatus("idle")
    }
  }

  async function start() {
    if (disabled || status !== "idle" || externalPhase === "thinking") return

    // Stop any answer currently being spoken before we start listening, and
    // clear any prior error.
    onRecordingStart()
    onRetry()

    const mime = pickMimeType()
    if (!supported || mime === "") {
      onError("Voice recording isn’t supported in this browser. You can type your question instead.")
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        onError("Microphone access was blocked. Allow microphone permission, or type your question instead.")
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        onError("No microphone was found. You can type your question instead.")
      } else {
        onError("Could not start recording. You can type your question instead.")
      }
      return
    }

    streamRef.current = stream
    mimeRef.current = mime
    chunksRef.current = []

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime })
    } catch {
      recorder = new MediaRecorder(stream)
    }
    recorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      void finish()
    }

    startAtRef.current = performance.now()
    recorder.start()
    setStatus("recording")
    startMeters(stream)
  }

  function stop() {
    if (status !== "recording") return
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  // Resolve the single phase the bar should present.
  const phase: DisplayPhase =
    status === "recording"
      ? "recording"
      : status === "transcribing"
        ? "transcribing"
        : externalPhase === "speaking"
          ? "speaking"
          : externalPhase === "thinking"
            ? "thinking"
            : errorMessage
              ? "error"
              : "idle"

  const statusText: string = {
    idle: "",
    recording: "Listening…",
    transcribing: "Transcribing…",
    thinking: "Checking the manual…",
    speaking: "Answering…",
    error: errorMessage ?? "Something went wrong",
  }[phase]

  function submitText() {
    const question = text.trim()
    if (!question || disabled || phase !== "idle") return
    onAsk(question)
    setText("")
  }

  const hasText = text.trim().length > 0
  const busy = phase === "transcribing" || phase === "thinking"

  // The single round action button on the right of the bar.
  function ActionButton() {
    if (phase === "recording") {
      return (
        <button
          type="button"
          onClick={stop}
          aria-pressed
          aria-label="Stop recording"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Square className="size-5 fill-current" />
        </button>
      )
    }
    if (phase === "speaking") {
      return (
        <button
          type="button"
          onClick={onStopSpeaking}
          aria-label="Stop answer"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted"
        >
          <Square className="size-4 fill-current" />
        </button>
      )
    }
    if (busy) {
      return (
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Loader2 className={reducedMotion ? "size-5" : "size-5 animate-spin"} />
        </span>
      )
    }
    if (phase === "idle" && hasText) {
      return (
        <button
          type="button"
          onClick={submitText}
          disabled={disabled}
          aria-label="Send question"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ArrowUp className="size-5" />
        </button>
      )
    }
    // idle (no text) or error → mic to (re)start recording.
    return (
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled}
        aria-label="Ask by voice"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Mic className="size-5" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-2 pl-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {phase === "idle" && (
          <>
            <label htmlFor="composer" className="sr-only">
              Ask by voice or type a question
            </label>
            <input
              id="composer"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  e.preventDefault()
                  submitText()
                }
              }}
              placeholder="Ask by voice or type a question…"
              disabled={disabled}
              className="h-7 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
          </>
        )}

        {phase === "recording" && (
          <>
            <div className="flex h-7 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
              {bars.map((b, i) => (
                <span
                  key={i}
                  className="w-[3px] shrink-0 rounded-full bg-primary"
                  style={{
                    height: `${Math.max(12, Math.round(b * 100))}%`,
                    transition: reducedMotion ? undefined : "height 90ms linear",
                  }}
                />
              ))}
            </div>
            <span className="shrink-0 text-sm font-medium text-foreground">Listening…</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatElapsed(elapsed)}
            </span>
          </>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 className={reducedMotion ? "size-4" : "size-4 animate-spin"} aria-hidden />
            {statusText}
          </div>
        )}

        {phase === "speaking" && (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="flex items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={reducedMotion ? "block w-0.5 rounded-full bg-primary" : "eq-bar block w-0.5 rounded-full bg-primary"}
                  style={{ height: 14, animationDelay: `${i * 140}ms` }}
                />
              ))}
            </span>
            Answering…
          </div>
        )}

        {phase === "error" && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-destructive" title={statusText}>
              {statusText}
            </span>
            <button
              type="button"
              onClick={() => void start()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <RotateCcw className="size-3" />
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Live status for screen readers (visual status shown inline above). */}
      <span className="sr-only" aria-live="polite">
        {statusText}
      </span>

      <ActionButton />
    </div>
  )
}
