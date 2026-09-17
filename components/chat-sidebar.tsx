"use client"

// The product-shell sidebar: brand, a New chat button, the in-memory chat list,
// and a Test log entry in the footer. Rendered both as the fixed desktop rail
// and inside the mobile slide-in drawer.

import { Plus } from "lucide-react"
import { LogoMark } from "@/components/logo"
import { TestLog } from "@/components/test-log"
import type { TestLogEntry } from "@/lib/types"

export interface ChatSummary {
  id: string
  title: string
  documentCount: number
  questionCount: number
}

interface ChatSidebarProps {
  chats: ChatSummary[]
  activeId: string
  onSelect: (id: string) => void
  onNewChat: () => void
  logEntries: TestLogEntry[]
  ingestionMs: number | null
}

function summaryLine(documentCount: number, questionCount: number): string {
  const docs = `${documentCount} ${documentCount === 1 ? "document" : "documents"}`
  const qs = `${questionCount} ${questionCount === 1 ? "question" : "questions"}`
  return `${docs} · ${qs}`
}

export function ChatSidebar({
  chats,
  activeId,
  onSelect,
  onNewChat,
  logEntries,
  ingestionMs,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-5 pb-4">
        <LogoMark className="size-7 shrink-0" />
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground">Pagewise</span>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-card px-3 py-2 text-sm font-medium text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent"
        >
          <Plus className="size-4" aria-hidden />
          New chat
        </button>
      </div>

      <div className="px-4 pt-5 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Chats</span>
      </div>

      <nav aria-label="Chats" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 pb-2">
        <ul className="flex min-w-0 flex-col gap-1">
          {chats.map((chat) => {
            const active = chat.id === activeId
            return (
              <li key={chat.id} className="w-full overflow-hidden">
                <button
                  type="button"
                  onClick={() => onSelect(chat.id)}
                  aria-current={active ? "true" : undefined}
                  className={[
                    "flex w-full min-w-0 flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-brand-soft text-sidebar-foreground"
                      : "text-sidebar-foreground hover:bg-background",
                  ].join(" ")}
                >
                  <span title={chat.title} className="w-full min-w-0 truncate text-sm font-medium">
                    {chat.title}
                  </span>
                  <span
                    className={[
                      "w-full min-w-0 truncate text-xs text-muted-foreground",
                    ].join(" ")}
                  >
                    {summaryLine(chat.documentCount, chat.questionCount)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {(logEntries.length > 0 || ingestionMs !== null) && (
        <div className="border-t border-sidebar-border px-4 py-3">
          <TestLog entries={logEntries} ingestionMs={ingestionMs} />
        </div>
      )}
    </div>
  )
}
