"use client"

// The running list of question/answer turns for the current session, oldest at
// the top and newest at the bottom, rendered as a chat transcript.

import { AnswerDisplay } from "@/components/answer-display"
import type { ConversationTurn, ManualDocument } from "@/lib/types"

interface ConversationProps {
  turns: ConversationTurn[]
  documents: ManualDocument[]
  onPlay: (text: string) => void
}

export function Conversation({ turns, documents, onPlay }: ConversationProps) {
  if (turns.length === 0) return null

  return (
    <section aria-label="Conversation" className="flex flex-col gap-6">
      {turns.map((turn) => (
        <AnswerDisplay key={turn.id} turn={turn} documents={documents} onPlay={onPlay} />
      ))}
    </section>
  )
}
