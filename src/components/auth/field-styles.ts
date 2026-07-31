// Shared field/button styling for the dark "Ink & Constellation" auth scene.
// Utility-only so tailwind-merge cleanly overrides the base primitives.

export const FIELD_LABEL =
  'text-[0.7rem] font-medium tracking-[0.14em] text-white/50 uppercase'

export const FIELD_INPUT =
  'h-11 rounded-xl border-white/10 bg-white/[0.04] px-4 text-[0.95rem] text-white placeholder:text-white/25 transition-colors focus-visible:border-[var(--gold)]/50 focus-visible:ring-2 focus-visible:ring-[var(--gold)]/15'

export const PRIMARY_BTN =
  'h-11 w-full rounded-xl border-0 bg-[linear-gradient(180deg,#ecd7a0,#cdae6e)] text-[0.95rem] font-semibold text-[#2a2413] shadow-[0_12px_30px_-12px_rgba(210,180,120,0.7)] transition-all hover:brightness-[1.06] hover:bg-[linear-gradient(180deg,#efdcaa,#d3b473)]'

export const GHOST_BTN =
  'h-11 w-full rounded-xl text-[0.9rem] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white'
