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
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="grain relative flex min-h-screen w-full overflow-hidden bg-[#0b0c10] text-white/90">
      {/* Atmosphere: layered radial washes + the drifting knowledge graph. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 60rem at 18% 12%, rgba(96,84,52,0.28), transparent 60%),' +
            'radial-gradient(50rem 50rem at 90% 90%, rgba(40,52,88,0.30), transparent 55%),' +
            'radial-gradient(30rem 30rem at 75% 20%, rgba(120,96,48,0.14), transparent 60%)',
        }}
      />
      <ConstellationField />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col lg:flex-row lg:items-stretch">
        {/* Brand / hero */}
        <section className="flex flex-1 flex-col justify-between px-8 pt-12 pb-6 lg:px-14 lg:py-16">
          <header className="animate-rise" style={{ animationDelay: '40ms' }}>
            <BrandMark />
          </header>

          <div className="hidden max-w-md lg:block">
            <p
              className="animate-rise text-xs font-medium tracking-[0.32em] text-[var(--gold)] uppercase"
              style={{ animationDelay: '120ms' }}
            >
              A second brain
            </p>
            <h2
              className="animate-rise font-display mt-5 text-[2.9rem] leading-[1.05] font-light text-white"
              style={{ animationDelay: '200ms' }}
            >
              Think in{' '}
              <em className="font-display text-[var(--gold)] italic">connections</em>,
              not folders.
            </h2>
            <ul className="mt-9 space-y-3.5">
              {PRINCIPLES.map((line, i) => (
                <li
                  key={line}
                  className="animate-rise flex items-start gap-3 text-sm text-white/55"
                  style={{ animationDelay: `${320 + i * 90}ms` }}
                >
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--gold)] shadow-[0_0_10px_2px_rgba(214,184,122,0.6)]" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p
            className="animate-rise mt-10 hidden text-xs text-white/30 lg:block"
            style={{ animationDelay: '640ms' }}
          >
            © {new Date().getFullYear()} graphbrain — knowledge, connected.
          </p>
        </section>

        {/* Auth card */}
        <section className="flex flex-1 items-center justify-center px-6 pb-14 lg:px-14 lg:py-16">
          <div
            className="animate-rise w-full max-w-sm"
            style={{ animationDelay: '260ms' }}
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
              {/* top inner-highlight hairline */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

              <p className="text-[0.7rem] font-medium tracking-[0.28em] text-[var(--gold)] uppercase">
                {eyebrow}
              </p>
              <h1 className="font-display mt-2 text-[1.9rem] leading-tight font-normal text-white">
                {title}
              </h1>
              <p className="mt-1.5 text-sm text-white/45">{subtitle}</p>

              <div className="gold-rule my-6" />

              {children}
            </div>

            <p className="mt-6 text-center text-sm text-white/45">{footer}</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      {/* Monogram: a tiny three-node graph. */}
      <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-[var(--gold)]/40 bg-[var(--gold)]/10">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M4 13.5 9 4l5 9.5" stroke="rgba(226,198,138,0.5)" strokeWidth="1" />
          <circle cx="9" cy="4" r="2.1" fill="#e2c68a" />
          <circle cx="4" cy="13.5" r="1.7" fill="#e2c68a" />
          <circle cx="14" cy="13.5" r="1.7" fill="#e2c68a" />
        </svg>
      </span>
      <span className="font-display text-xl tracking-tight text-white">graphbrain</span>
    </Link>
  )
}
