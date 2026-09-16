"use client"

// Swappable input surface. A later step will add a voice-based variant that
// exposes the same onAsk(question) contract, so keep this component's public
// interface stable and free of answer-rendering concerns.

import { useState } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"

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
    <div className="flex flex-col gap-2">
      <label htmlFor="question" className="sr-only">
        Ask a question about your manuals
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
        placeholder="Ask a question about your manuals…"
        rows={3}
        disabled={disabled}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Press Enter to ask, Shift+Enter for a new line.
        </span>
        <Button onClick={submit} disabled={disabled || loading || !value.trim()}>
          <Send className="mr-1.5 size-3.5" />
          {loading ? "Asking…" : "Ask"}
        </Button>
      </div>
    </div>
  )
}
