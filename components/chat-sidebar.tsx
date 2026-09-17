"use client"

// The product-shell sidebar: brand, a New chat button, the in-memory chat list,
// and a Test log entry in the footer. Rendered both as the fixed desktop rail
// and inside the mobile slide-in drawer.

import { useEffect, useRef, useState } from "react"
import { Plus, MoreHorizontal } from "lucide-react"
import { LogoMark } from "@/components/logo"
import { TestLog } from "@/components/test-log"
import type { TestLogEntry } from "@/lib/types"

export interface ChatSummary {
  id: string
  title: string
  documentCount: number
  // True once documents have been loaded into this chat at least once. Used to
  // decide whether the chat list shows — it must not disappear when a chat's
  // documents are cleared via "Replace documents".
  everHadDocuments: boolean
}

interface ChatSidebarProps {
  chats: ChatSummary[]
  activeId: string
  onSelect: (id: string) => void
  onNewChat: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  logEntries: TestLogEntry[]
  ingestionMs: number | null
}

export function ChatSidebar({
  chats,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  logEntries,
  ingestionMs,
}: ChatSidebarProps) {
  // The Chats section shows once any chat has ever loaded documents, and stays
  // shown afterward — clearing a chat's documents (Replace) must not hide it.
  const anyChats = chats.some((c) => c.everHadDocuments)

  // Only one row is ever in an interactive sub-state at a time.
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // Skips the input's onBlur save when the edit ended via Enter or Escape.
  const skipBlur = useRef(false)

  // Close the open menu / delete confirmation on outside click or Escape.
  const popRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuId && !confirmId) return
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setMenuId(null)
        setConfirmId(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuId(null)
        setConfirmId(null)
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuId, confirmId])

  function commitRename(id: string, value: string) {
    onRename(id, value) // an empty value is ignored by the page (keeps old name)
    setRenamingId(null)
  }

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

      {anyChats ? (
        <>
          <div className="px-4 pt-5 pb-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Chats</span>
          </div>

          <nav aria-label="Chats" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 pb-2">
            <ul className="flex min-w-0 flex-col gap-1">
              {chats.map((chat) => {
                const active = chat.id === activeId
                const isRenaming = renamingId === chat.id
                const menuOpen = menuId === chat.id
                const confirming = confirmId === chat.id

                if (isRenaming) {
                  return (
                    <li key={chat.id} className="w-full">
                      <input
                        autoFocus
                        defaultValue={chat.title}
                        aria-label="Chat name"
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) return
                          if (e.key === "Enter") {
                            e.preventDefault()
                            skipBlur.current = true
                            commitRename(chat.id, e.currentTarget.value)
                          } else if (e.key === "Escape") {
                            e.preventDefault()
                            skipBlur.current = true
                            setRenamingId(null)
                          }
                        }}
                        onBlur={(e) => {
                          if (skipBlur.current) {
                            skipBlur.current = false
                            return
                          }
                          commitRename(chat.id, e.currentTarget.value)
                        }}
                        className="w-full rounded-lg border border-ring bg-background px-3 py-2 text-sm font-medium text-sidebar-foreground outline-none"
                      />
                    </li>
                  )
                }

                return (
                  <li key={chat.id} className="group/item relative w-full">
                    <div
                      className={[
                        "flex w-full min-w-0 items-center rounded-lg border border-transparent transition-colors",
                        active ? "bg-brand-soft" : "hover:bg-background",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(chat.id)}
                        aria-current={active ? "true" : undefined}
                        className="min-w-0 flex-1 truncate py-2 pl-3 pr-1 text-left text-sm font-medium text-sidebar-foreground"
                        title={chat.title}
                      >
                        {chat.title}
                      </button>
                      <button
                        type="button"
                        aria-label="Chat options"
                        aria-haspopup="true"
                        aria-expanded={menuOpen}
                        onClick={() => {
                          setConfirmId(null)
                          setMenuId(menuOpen ? null : chat.id)
                        }}
                        className={[
                          "mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                          "opacity-100 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100",
                          menuOpen || confirming ? "md:opacity-100" : "",
                        ].join(" ")}
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </button>
                    </div>

                    {menuOpen && (
                      <div
                        ref={popRef}
                        role="menu"
                        className="absolute right-2 top-full z-40 mt-1 w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuId(null)
                            setRenamingId(chat.id)
                          }}
                          className="w-full rounded-md px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuId(null)
                            setConfirmId(chat.id)
                          }}
                          className="w-full rounded-md px-3 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-muted"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {confirming && (
                      <div
                        ref={popRef}
                        role="dialog"
                        aria-label="Delete chat"
                        className="absolute right-2 top-full z-40 mt-1 w-52 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
                      >
                        <p className="text-sm font-medium text-foreground">Delete this chat?</p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmId(null)
                              onDelete(chat.id)
                            }}
                            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {(logEntries.length > 0 || ingestionMs !== null) && (
        <div className="border-t border-sidebar-border px-4 py-3">
          <TestLog entries={logEntries} ingestionMs={ingestionMs} />
        </div>
      )}
    </div>
  )
}
