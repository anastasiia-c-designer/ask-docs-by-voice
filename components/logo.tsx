// The Pagewise logo mark. The tallest bar uses the app accent color token
// (--primary) via currentColor; the paper body and remaining bars keep their
// fixed brand colors. The same artwork is saved as app/icon.svg for the favicon.

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
        fill="#1C1B19"
      />
      <path d="M19.5 2.5V8a2 2 0 0 0 2 2H27z" fill="#5C5A55" />
      <rect x="10" y="17" width="2.4" height="6" rx="1.2" fill="#FAF8F4" />
      <rect x="14" y="13" width="2.4" height="14" rx="1.2" className="text-primary" fill="currentColor" />
      <rect x="18" y="15" width="2.4" height="10" rx="1.2" fill="#FAF8F4" />
      <rect x="22" y="18" width="2.4" height="4" rx="1.2" fill="#FAF8F4" />
    </svg>
  )
}
