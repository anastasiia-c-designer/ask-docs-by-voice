"use client"

// Microphone capture: tap to start recording, tap again to stop. On stop it
// posts the audio to /api/transcribe and hands the transcript back to the page,
// which sends it to /api/ask exactly like a typed question. The text input
// remains available as a fallback.

import { useRef, useState } from "react"
import { Mic, Square, Loader2 } from "lucide-react"
import type { TranscribeResponse } from "@/lib/types"

export interface VoiceResult {
  transcript: string
  transcriptionModel: string
  recordingSeconds: number
  transcriptionMs: number
  // performance.now() at the moment recording stopped, for the
  // question-to-first-audible-answer measurement.
  recordingStopAt: number
}

interface VoiceControlsProps {
  disabled?: boolean
  busy?: boolean
  hintTerms: string[]
  onRecordingStart: () => void
  onResult: (result: VoiceResult) => void
  onEmpty: () => void
  onError: (message: string) => void
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

type Status = "idle" | "recording" | "transcribing"

export function VoiceControls({
  disabled,
  busy,
  hintTerms,
  onRecordingStart,
  onResult,
  onEmpty,
  onError,
}: VoiceControlsProps) {
  const [status, setStatus] = useState<Status>("idle")

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startAtRef = useRef(0)
  const mimeRef = useRef("")

  const supported =
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function finish() {
    const recordingStopAt = performance.now()
    const recordingSeconds = (recordingStopAt - startAtRef.current) / 1000
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
    if (disabled || busy || status !== "idle") return

    // Stop any answer currently being spoken before we start listening.
    onRecordingStart()

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
  }

  function stop() {
    if (status !== "recording") return
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  function toggle() {
    if (status === "recording") stop()
    else void start()
  }

  const isRecording = status === "recording"
  const isTranscribing = status === "transcribing"

  const label = isRecording
    ? "Stop recording"
    : isTranscribing
      ? "Transcribing…"
      : "Tap to speak"

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || busy || isTranscribing}
        aria-pressed={isRecording}
        aria-label={label}
        className={[
          "flex size-20 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          isRecording
            ? "animate-pulse border-destructive bg-destructive text-destructive-foreground"
            : "border-border bg-primary text-primary-foreground hover:opacity-90",
        ].join(" ")}
      >
        {isTranscribing ? (
          <Loader2 className="size-7 animate-spin" />
        ) : isRecording ? (
          <Square className="size-7" />
        ) : (
          <Mic className="size-8" />
        )}
      </button>
      <span className="text-sm font-medium text-foreground" aria-live="polite">
        {label}
      </span>
    </div>
  )
}
