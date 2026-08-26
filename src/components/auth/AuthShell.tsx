import Link from 'next/link'
import type { ReactNode } from 'react'
import { ConstellationField } from './ConstellationField'

const PRINCIPLES = [
  'Capture anything — notes, files, half-formed thoughts.',
  'Every idea links to every other, automatically.',
  'Ask questions; get answers drawn from your own mind.',
]

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-[oklch(0.10_0.018_68)] text-white/90">
      <ConstellationField />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col lg:flex-row lg:items-stretch">
        {/* Brand / hero */}
        <section className="flex flex-1 flex-col justify-between px-8 pt-12 pb-6 lg:px-16 lg:py-20">
          <header className="animate-rise" style={{ animationDelay: '40ms' }}>
            <BrandMark />
          </header>

          <div className="hidden max-w-md lg:block">
            <h2
              className="animate-rise font-display mt-5 text-[3.2rem] leading-[1.05] font-light text-white"
              style={{ animationDelay: '160ms' }}
            >
              Think in{' '}
              <em className="font-display text-[oklch(0.75_0.14_65)] italic not-italic" style={{ fontStyle: 'italic' }}>connections</em>,{' '}
              not folders.
            </h2>
            <ul className="mt-10 space-y-4">
              {PRINCIPLES.map((line, i) => (
                <li
                  key={line}
                  className="animate-rise flex items-start gap-3 text-[13.5px] text-white/50 leading-relaxed"
                  style={{ animationDelay: `${280 + i * 80}ms` }}
                >
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[oklch(0.65_0.14_62)] opacity-80" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p
            className="animate-rise mt-10 hidden text-xs text-white/20 lg:block font-mono tracking-tight"
            style={{ animationDelay: '560ms' }}
          >
            © {new Date().getFullYear()} graphbrain
          </p>
        </section>

        {/* Auth card */}
        <section className="flex flex-1 items-center justify-center px-6 pb-14 lg:px-14 lg:py-20">
          <div
            className="animate-rise w-full max-w-sm"
            style={{ animationDelay: '220ms' }}
          >
            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-[oklch(0.15_0.018_68)] p-8 shadow-[0_24px_64px_-16px_oklch(0_0_0/0.7),0_4px_16px_-4px_oklch(0_0_0/0.4)]">
              {eyebrow && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[oklch(0.75_0.14_65)] mb-2.5">
                  {eyebrow}
                </p>
              )}
              <h1 className="font-display text-[2rem] leading-tight font-light text-white mb-1">
                {title}
              </h1>
              <p className="text-sm text-white/40 mb-7">{subtitle}</p>

              {children}
            </div>

            <p className="mt-5 text-center text-[13px] text-white/35">{footer}</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3 group">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[oklch(0.65_0.14_62)] shadow-[0_2px_12px_oklch(0.65_0.14_62/0.40)]">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="4.5" r="2.1" fill="white" />
          <circle cx="4" cy="13.5" r="1.7" fill="white" opacity="0.75" />
          <circle cx="14" cy="13.5" r="1.7" fill="white" opacity="0.75" />
          <path d="M9 6.6 4.8 11.9M9 6.6l4.2 5.3M4.8 13.5h8.4" stroke="white" strokeWidth="1" opacity="0.5" />
        </svg>
      </span>
      <span className="font-display text-[18px] tracking-tight text-white/90 group-hover:text-white transition-colors">graphbrain</span>
    </Link>
  )
}
