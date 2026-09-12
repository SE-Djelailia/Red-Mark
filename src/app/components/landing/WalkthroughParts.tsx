// Shared pieces for the animated walkthroughs.
//
// These recreate REAL app chrome — the same tokens, the same 4px radius, the
// same 2px leading rule for a marked row, the same 11px tracked title-block
// labels. Nothing here invents a style: if a value is not in
// design-tokens.css it does not appear, which is what keeps the mockups
// indistinguishable from the product rather than "inspired by" it.
//
// Everything is aria-hidden and pointer-events-none. A walkthrough is a
// moving illustration, not an interface: exposing fake buttons to the
// accessibility tree would announce controls that do nothing. The frames
// carry the real caption text for that.
import { IconPhoto, IconVisit, MarkX } from "../ui-kit/RedMarkIcons";

/* ── THE CURSOR ──────────────────────────────────────────────────────────
   A simulated pointer is what turns a sequence of states into "someone is
   using this". Drawn as a hollow ring rather than an OS arrow: the app is
   used on a phone, so the gesture is a TAP, and a tap has no arrow.

   The ring is ink, never red — a cursor is not one of the four things red
   is for, and a red pointer over a red primary button would double the
   budget on a single frame.
─────────────────────────────────────────────────────────────────────────── */
export function Tap({ x, y, firing }: { x: number; y: number; firing: boolean }) {
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        // The cursor GLIDES between targets; only the ripple is instant.
        // 420ms is slower than any UI transition in the system on purpose:
        // a hand moving across a screen is not a state change.
        transition: "left 420ms var(--ease-out), top 420ms var(--ease-out)",
        transform: "translate(-50%, -50%)",
      }}
      aria-hidden="true"
    >
      <span className="relative block w-4 h-4">
        <span className="absolute inset-0 rounded-full border-[1.5px] border-ink/70 bg-ink/5" />
        {/* The contact ripple, keyed to the press so it reads as cause. */}
        <span
          className="absolute inset-0 rounded-full border-[1.5px] border-ink/50"
          style={{
            transition: "transform 320ms var(--ease-out), opacity 320ms var(--ease-out)",
            // Expands AND fades as it goes: the ripple is the trace a tap
            // leaves behind, so it has to be visible at contact and gone by
            // the time it has spread.
            transform: firing ? "scale(2.1)" : "scale(1)",
            opacity: firing ? 0 : 0.9,
          }}
        />
      </span>
    </div>
  );
}

/* ── PHONE APP CHROME ───────────────────────────────────────────────────── */

/** The global light header: back chevron, title, and the app's X mark. */
export function AppHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-3 pt-2.5 pb-2 border-b border-line bg-surface">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-3 h-3 text-muted shrink-0" aria-hidden="true">
          <path
            d="M15 5 L8 12 L15 19"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="butt"
            strokeLinejoin="miter"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-ink leading-tight truncate">{title}</p>
          {sub && <p className="text-[8px] text-muted leading-tight truncate mt-px">{sub}</p>}
        </div>
        <MarkX className="w-2.5 h-2.5 text-brand-600 shrink-0" />
      </div>
    </div>
  );
}

/**
 * The offline pill — the real one from OfflineIndicator.tsx: ink ground,
 * white text, 4px radius, WifiOff glyph. Reproduced rather than imported
 * because the real component subscribes to the sync queue.
 */
export function OfflinePill({ shown, pending }: { shown: boolean; pending: number }) {
  return (
    <div
      className="absolute left-1/2 bottom-11 z-10 -translate-x-1/2 pointer-events-none"
      style={{
        transition: "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
        opacity: shown ? 1 : 0,
        transform: shown ? "translate(-50%, 0)" : "translate(-50%, 6px)",
      }}
      aria-hidden="true"
    >
      <div className="bg-ink text-white px-2 py-1 rounded-[4px] shadow-lg flex items-center gap-1.5 whitespace-nowrap">
        {/* WifiOff, drawn to the icon rules: butt caps, miter joins, 1.5. */}
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="butt" strokeLinejoin="miter">
            <path d="M2 2 L22 22" />
            <path d="M5 12.5 A10 10 0 0 1 9 10" />
            <path d="M8.5 16 A5 5 0 0 1 11 14.6" />
            <path d="M12 19.5 L12 19.5" />
          </g>
        </svg>
        <span className="text-[7px] font-medium leading-none">Mode hors ligne</span>
        {pending > 0 && (
          <span className="text-[7px] leading-none opacity-80">• {pending} en attente</span>
        )}
      </div>
    </div>
  );
}

/** The bottom tab bar. The active tab takes the 2px leading rule, not a fill. */
export function BottomNav({ active }: { active: "visites" | "photos" | "defic" }) {
  const tabs = [
    { id: "visites" as const, label: "Visites", icon: IconVisit },
    { id: "photos" as const, label: "Photos", icon: IconPhoto },
    { id: "defic" as const, label: "Déficiences", icon: MarkX },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 h-9 border-t border-line bg-surface flex">
      {tabs.map((t) => {
        const on = t.id === active;
        const Icon = t.icon;
        return (
          <div
            key={t.id}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
            style={{
              // Active nav is ink + weight, never a red fill — the active-nav
              // rule. Red on a tab bar would burn the budget on navigation.
              boxShadow: on ? "inset 0 2px 0 0 var(--color-ink)" : undefined,
            }}
          >
            <Icon className={`w-2.5 h-2.5 ${on ? "text-ink" : "text-muted"}`} />
            <span
              className={`text-[6px] leading-none ${on ? "text-ink font-semibold" : "text-muted"}`}
            >
              {t.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A field that fills itself in.
 *
 * `chars` is how much of `value` has been typed — driving it from the parent
 * keeps every field on the one timeline rather than each running its own.
 */
export function FillField({
  label,
  value,
  chars,
  focused,
}: {
  label: string;
  value: string;
  chars: number;
  focused: boolean;
}) {
  const shown = value.slice(0, chars);
  return (
    <div>
      <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
        {label}
      </p>
      <div
        className="h-[18px] rounded-[4px] border bg-surface px-1.5 flex items-center"
        style={{
          // Focus is an INK ring, never red. Same rule as every real input.
          borderColor: focused ? "var(--color-ink)" : "var(--color-line-strong)",
          boxShadow: focused ? "0 0 0 2px rgb(20 20 20 / 0.10)" : "none",
          transition: "border-color 120ms var(--ease-out), box-shadow 120ms var(--ease-out)",
        }}
      >
        <span className="text-[8px] text-ink leading-none truncate">{shown}</span>
        {focused && chars < value.length && (
          <span className="ml-px w-px h-2 bg-ink animate-pulse" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
