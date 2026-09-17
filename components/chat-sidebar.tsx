"use client"

// The product-shell sidebar: brand, a New chat button, the in-memory chat list,
// and a footer note. Rendered both as the fixed desktop rail and inside the
// mobile slide-in drawer.

import { Plus } from "lucide-react"
import { LogoMark } from "@/components/logo"

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
}

function summaryLine(documentCount: number, questionCount: number): string {
  const docs = `${documentCount} ${documentCount === 1 ? "document" : "documents"}`
  const qs = `${questionCount} ${questionCount === 1 ? "question" : "questions"}`
  return `${docs} · ${qs}`
}

export function ChatSidebar({ chats, activeId, onSelect, onNewChat }: ChatSidebarProps) {
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
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                    "flex w-full min-w-0 flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  ].join(" ")}
                >
                  <span title={chat.title} className="w-full min-w-0 truncate text-sm font-medium">
                    {chat.title}
                  </span>
                  <span
                    className={[
                      "w-full min-w-0 truncate text-xs",
                      active ? "text-sidebar-accent-foreground/80" : "text-muted-foreground",
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

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
          Chats and documents stay in this tab only. Nothing is stored.
        </p>
      </div>
    </div>
  )
}
