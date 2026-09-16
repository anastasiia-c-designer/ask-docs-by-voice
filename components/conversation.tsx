"use client"

// The running list of question/answer turns for the current session, oldest at
// the top and newest at the bottom. Spoken-answer controls attach to the most
// recent turn only.

import type { ReactNode } from "react"
import { AnswerDisplay } from "@/components/answer-display"
import type { ConversationTurn, ManualDocument } from "@/lib/types"

interface ConversationProps {
  turns: ConversationTurn[]
  documents: ManualDocument[]
  latestSpeechControls?: ReactNode
}

export function Conversation({ turns, documents, latestSpeechControls }: ConversationProps) {
  if (turns.length === 0) return null

  return (
    <section aria-label="Conversation" className="flex flex-col gap-4">
      {turns.map((turn, index) => (
        <AnswerDisplay
          key={turn.id}
          turn={turn}
          documents={documents}
          speechControls={index === turns.length - 1 ? latestSpeechControls : undefined}
        />
      ))}
    </section>
  )
}
