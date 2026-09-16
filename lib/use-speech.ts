"use client"

// Plays spoken answers streamed from /api/speak. Streams via MediaSource where
// supported (playback starts before the whole file arrives) and falls back to
// buffered playback otherwise (e.g. Safari, which lacks MSE for audio/mpeg).

import { useCallback, useEffect, useRef, useState } from "react"

export interface SpeakCallbacks {
  // performance.now() reference (recording stop) for question-to-first-audio.
  sinceMark?: number | null
  onPlaying?: (t: { ttsMs: number; questionToFirstAudioMs: number | null }) => void
  onDuration?: (seconds: number) => void
  onError?: (message: string) => void
}

const AUDIO_MIME = "audio/mpeg"

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const cleanup = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.onplaying = null
      audio.onended = null
      audio.onerror = null
      audio.ondurationchange = null
      try {
        audio.pause()
      } catch {
        // ignore
      }
      audio.removeAttribute("src")
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (abortRef.current) {
      try {
        abortRef.current.abort()
      } catch {
        // ignore
      }
      abortRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    cleanup()
    setSpeaking(false)
    setBlocked(false)
  }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  const speak = useCallback(
    async (text: string, cbs: SpeakCallbacks = {}) => {
      // Any new playback replaces the current one.
      cleanup()
      setBlocked(false)
      setSpeaking(false)

      const requestStart = performance.now()
      const controller = new AbortController()
      abortRef.current = controller

      let res: Response
      try {
        res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        cbs.onError?.(err instanceof Error ? err.message : "Could not reach the speech service.")
        return
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        cbs.onError?.(data?.error ?? "Speech synthesis failed.")
        return
      }

      const audio = new Audio()
      audioRef.current = audio

      let durationReported = false
      const reportDuration = () => {
        if (durationReported) return
        const d = audio.duration
        if (Number.isFinite(d) && d > 0) {
          durationReported = true
          cbs.onDuration?.(d)
        }
      }

      audio.onplaying = () => {
        const now = performance.now()
        setSpeaking(true)
        setBlocked(false)
        cbs.onPlaying?.({
          ttsMs: now - requestStart,
          questionToFirstAudioMs: cbs.sinceMark != null ? now - cbs.sinceMark : null,
        })
      }
      audio.ondurationchange = reportDuration
      audio.onended = () => {
        reportDuration()
        setSpeaking(false)
      }
      audio.onerror = () => {
        // Errors also fire during teardown; only surface while actively loading.
        if (audioRef.current === audio) setSpeaking(false)
      }

      const canStream = typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(AUDIO_MIME)

      if (canStream) {
        const mediaSource = new MediaSource()
        const url = URL.createObjectURL(mediaSource)
        objectUrlRef.current = url
        audio.src = url

        mediaSource.addEventListener(
          "sourceopen",
          () => {
            let sourceBuffer: SourceBuffer
            try {
              sourceBuffer = mediaSource.addSourceBuffer(AUDIO_MIME)
            } catch {
              return
            }
            const reader = res.body!.getReader()

            const appendChunk = (chunk: Uint8Array) =>
              new Promise<void>((resolve) => {
                sourceBuffer.addEventListener("updateend", () => resolve(), { once: true })
                try {
                  sourceBuffer.appendBuffer(chunk)
                } catch {
                  resolve()
                }
              })

            const pump = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  if (value) await appendChunk(value)
                }
              } catch {
                // aborted or network error — fall through to close the stream
              }
              try {
                if (mediaSource.readyState === "open") mediaSource.endOfStream()
              } catch {
                // ignore
              }
            }
            void pump()
          },
          { once: true },
        )
      } else {
        // Buffered fallback: wait for the whole file, then play.
        try {
          const blob = await res.blob()
          if (audioRef.current !== audio) return
          const url = URL.createObjectURL(blob)
          objectUrlRef.current = url
          audio.src = url
        } catch (err) {
          if (!controller.signal.aborted) {
            cbs.onError?.(err instanceof Error ? err.message : "Could not load the audio.")
          }
          return
        }
      }

      try {
        await audio.play()
      } catch {
        // Autoplay was blocked — surface a Play button instead of failing.
        setSpeaking(false)
        setBlocked(true)
      }
    },
    [cleanup],
  )

  return { speaking, blocked, speak, stop }
}
