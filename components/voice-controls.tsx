"use client"

// Microphone capture and the single central voice control. Tap to start
// recording, tap again to stop; on stop it posts audio to /api/transcribe and
// hands the transcript back to the page, which sends it to /api/ask exactly
// like a typed question.
//
// The button surfaces every phase of a voice turn with its own look and label:
// idle, recording (live level ring + elapsed), transcribing, thinking (from the
// page while /api/ask runs), speaking (from the page while the answer plays),
// and error. Motion is replaced with static indicators when the user prefers
// reduced motion.

import { useEffect, useRef, useState } from "react"
import { Mic, Square, Loader2, BookOpen, AlertCircle, RotateCcw } from "lucide-react"
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
}

// A transcript shorter than this is treated as "didn't catch that".
const MIN_TRANSCRIPT_CHARS = 2

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
}: VoiceControlsProps) {
  const [status, setStatus] = useState<InternalStatus>("idle")
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
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
    setLevel(0)
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
        let sumSquares = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sumSquares += v * v
        }
        const rms = Math.sqrt(sumSquares / data.length)
        // Gentle curve so speech reads as a lively but calm ring.
        setLevel(Math.min(1, rms * 2.6))
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

  // Resolve the single phase the button should present.
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

  const label: string = {
    idle: "Tap to ask",
    recording: "Listening… tap to stop",
    transcribing: "Got it, transcribing…",
    thinking: "Checking the manual…",
    speaking: "Answering…",
    error: errorMessage ?? "Something went wrong",
  }[phase]

  function handleClick() {
    if (phase === "recording") return stop()
    if (phase === "speaking") return onStopSpeaking()
    if (phase === "idle" || phase === "error") return void start()
    // transcribing / thinking: busy, no action.
  }

  const interactionDisabled = disabled || phase === "transcribing" || phase === "thinking"

  const circleClasses: Record<DisplayPhase, string> = {
    idle: "bg-primary text-primary-foreground hover:opacity-90",
    recording: "bg-primary text-primary-foreground",
    transcribing: "bg-muted text-muted-foreground",
    thinking: `bg-muted text-muted-foreground${reducedMotion ? "" : " animate-pulse"}`,
    speaking: "bg-primary text-primary-foreground hover:opacity-90",
    error: "border border-destructive bg-background text-destructive hover:bg-destructive/5",
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative flex size-24 items-center justify-center">
        {/* Live level ring while recording (static ring under reduced motion). */}
        {phase === "recording" && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/15"
            style={{
              transform: `scale(${reducedMotion ? 1.15 : 1 + level * 0.4})`,
              transition: reducedMotion ? undefined : "transform 90ms linear",
            }}
          />
        )}
        <button
          type="button"
          onClick={handleClick}
          disabled={interactionDisabled}
          aria-pressed={phase === "recording"}
          aria-label={
            phase === "speaking" ? "Stop answer" : phase === "recording" ? "Stop recording" : label
          }
          className={[
            "relative flex size-20 items-center justify-center rounded-full transition-colors disabled:cursor-default disabled:opacity-70",
            circleClasses[phase],
          ].join(" ")}
        >
          {phase === "idle" && <Mic className="size-8" />}
          {phase === "error" && <Mic className="size-8" />}
          {phase === "recording" && <Square className="size-6 fill-current" />}
          {phase === "transcribing" && (
            <Loader2 className={reducedMotion ? "size-7" : "size-7 animate-spin"} />
          )}
          {phase === "thinking" && <BookOpen className="size-7" />}
          {phase === "speaking" && (
            <span className="flex items-end gap-1" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="eq-bar block w-1 rounded-full bg-current"
                  style={{ height: 22, animationDelay: `${i * 140}ms` }}
                />
              ))}
            </span>
          )}
        </button>
      </div>

      <div className="flex min-h-10 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          {phase === "error" && <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />}
          <span
            className={[
              "text-sm font-medium text-pretty text-center",
              phase === "error" ? "text-destructive" : "text-foreground",
            ].join(" ")}
            aria-live="polite"
          >
            {label}
          </span>
        </div>

        {phase === "recording" && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground" aria-hidden>
            {formatElapsed(elapsed)}
          </span>
        )}

        {phase === "speaking" && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Square className="size-3 fill-current" />
            Stop
          </button>
        )}

        {phase === "error" && (
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RotateCcw className="size-3" />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
