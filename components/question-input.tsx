"use client"

// Compact text fallback for the voice-first dock. Same public onAsk(question)
// contract as before, restyled to a single-line input with a send button.

import { useState } from "react"
import { ArrowUp } from "lucide-react"

interface QuestionInputProps {
  onAsk: (question: string) => void
  disabled?: boolean
  loading?: boolean
}

export function QuestionInput({ onAsk, disabled, loading }: QuestionInputProps) {
  const [value, setValue] = useState("")

  function submit() {
    const question = value.trim()
    if (!question || disabled || loading) return
    onAsk(question)
    setValue("")
  }

  return (
    <div className="flex items-end gap-2">
      <label htmlFor="question" className="sr-only">
        Type a question about your manuals
      </label>
      <textarea
        id="question"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Type a question instead…"
        rows={1}
        disabled={disabled}
        className="max-h-32 min-h-10 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || loading || !value.trim()}
        aria-label="Send question"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  )
}
