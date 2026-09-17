// The Pagewise logo mark: an ink document with a folded corner and four bars in
// mixed brand colors. The same artwork is saved as app/icon.svg for the favicon.

interface LogoMarkProps {
  className?: string
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Pagewise"
    >
      <path
        d="M8 2.5h11.5L27 10v17.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-23a2 2 0 0 1 2-2z"
        fill="#0E2A3B"
      />
      <path d="M19.5 2.5V8a2 2 0 0 0 2 2H27z" fill="#3E5A6B" />
      <rect x="10" y="17" width="2.4" height="6" rx="1.2" fill="#FFFFFF" />
      <rect x="14" y="13" width="2.4" height="14" rx="1.2" fill="#8B7CFF" />
      <rect x="18" y="15" width="2.4" height="10" rx="1.2" fill="#FFFFFF" />
      <rect x="22" y="18" width="2.4" height="4" rx="1.2" fill="#FFFFFF" />
    </svg>
  )
}
