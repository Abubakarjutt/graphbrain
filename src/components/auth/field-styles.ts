// Shared field/button styling for the dark auth scene.
// Utility-only so tailwind-merge cleanly overrides the base primitives.

export const FIELD_LABEL =
  'text-[0.7rem] font-medium tracking-[0.14em] text-white/50 uppercase'

export const FIELD_INPUT =
  'h-11 rounded-xl border-white/10 bg-white/[0.04] px-4 text-[0.95rem] text-white placeholder:text-white/25 transition-colors focus-visible:border-indigo-400/50 focus-visible:ring-2 focus-visible:ring-indigo-400/20'

export const PRIMARY_BTN =
  'h-11 w-full rounded-xl border-0 bg-[linear-gradient(180deg,#6366f1,#4338ca)] text-[0.95rem] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(79,70,229,0.7)] transition-all hover:brightness-[1.08]'

export const GHOST_BTN =
  'h-11 w-full rounded-xl text-[0.9rem] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white'
