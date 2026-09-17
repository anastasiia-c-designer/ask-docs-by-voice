// The Pagewise logo mark: a violet circle with five white/lavender bars forming
// a soundwave. The same artwork is saved as app/icon.svg for the favicon.

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
      <circle cx="16" cy="16" r="16" fill="#4B37B2" />
      <rect x="8.43" y="13.76" width="2.3" height="4.48" rx="1.15" fill="#FFFFFF" />
      <rect x="11.64" y="11.4" width="2.3" height="9.2" rx="1.15" fill="#FFFFFF" />
      <rect x="14.85" y="7.55" width="2.3" height="16.9" rx="1.15" fill="#D8CFFE" />
      <rect x="18.06" y="11.4" width="2.3" height="9.2" rx="1.15" fill="#FFFFFF" />
      <rect x="21.27" y="13.76" width="2.3" height="4.48" rx="1.15" fill="#FFFFFF" />
    </svg>
  )
}
