"use client"

// A lightweight hover/focus tooltip anchored to its trigger. The bubble is
// rendered into a document.body portal and positioned with `fixed` coordinates
// computed from the trigger's bounding rect, so it can never be pushed to the
// page corner or clipped by an ancestor's `overflow`/`transform` (which is what
// breaks tooltips positioned as normal descendants).

import { useCallback, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function Tooltip({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  const show = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Anchor 8px above the trigger's top-center; the bubble shifts itself up and
    // left by its own size via the translate classes below.
    setCoords({ top: r.top - 8, left: r.left + r.width / 2 })
  }, [])
  const hide = useCallback(() => setCoords(null), [])

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={`inline-flex ${className ?? ""}`}
    >
      {children}
      {coords &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="pointer-events-none z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}
