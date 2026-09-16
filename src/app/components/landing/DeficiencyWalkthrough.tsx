// WORKFLOW 03 — RAISING A DÉFICIENCE, AND ITS LIFECYCLE
//
// The third frame. The déficience raised here is the one the report in
// workflow 04 prints, and it belongs to the visit in workflow 02 — one job,
// followed through.
//
// THE NARRATIVE:
//
//   1. The form, with the déficience already titled — the architect has
//      typed what they saw. Priority and lot sit beneath it.
//   2. Priority moves to Élevée. The chip takes the leading rule.
//   3. A tap on Signaler. The button presses.
//   4. The déficience appears in the list at SIGNALÉ — the first of the
//      four lifecycle states, and the one red is actually for.
//   5-7. The state advances: À CORRIGER, CORRIGÉ, VÉRIFIÉ. Each step swaps
//      the glyph and the rule colour, and the row's leading rule goes from
//      red to resolved green at the end — the ONE place in the system where
//      green is permitted, because "done" has to be tellable from "red pen".
//   8. Hold on VÉRIFIÉ. The rest frame.
//
// The lifecycle is the product's distinctive vocabulary — four custom
// glyphs nobody else has — so it gets the most screen time of any beat
// here: four steps, not one. Showing all four states IS the demo.
import { useRef } from "react";
import {
  MarkX,
  StateSignale,
  StateACorriger,
  StateCorrige,
  StateVerifie,
} from "../ui-kit/RedMarkIcons";
import { Tap } from "./WalkthroughParts";
import { DEMO_ISSUES, DEMO_PROJECT } from "./demoProject";
import { useInView, useWalkthrough, type WalkStep } from "./useWalkthrough";

const STEPS: WalkStep[] = [
  { hold: 1400 }, // 0 · the form, titled
  { hold: 900 }, // 1 · priority set to Élevée
  { hold: 560 }, // 2 · tap Signaler
  { hold: 1500 }, // 3 · the déficience appears — SIGNALÉ
  { hold: 1300 }, // 4 · À CORRIGER
  { hold: 1300 }, // 5 · CORRIGÉ
  { hold: 1300 }, // 6 · VÉRIFIÉ
  { hold: 2600 }, // 7 · held — closed out
];

const REST_STEP = 7;

/** The déficience this story follows. */
const ISSUE = DEMO_ISSUES[0];

/**
 * The four lifecycle states, in order.
 *
 * Colour is the rule the design system already fixes: red for the three
 * open states (a déficience IS the red pen's subject), resolved green for
 * VÉRIFIÉ alone — the single place green is allowed, because the eye has to
 * tell "done" from "still open" at a glance down a list.
 */
const LIFECYCLE = [
  { label: "Signalé", Glyph: StateSignale, tone: "text-brand-600", rule: "var(--color-brand-600)" },
  { label: "À corriger", Glyph: StateACorriger, tone: "text-brand-600", rule: "var(--color-brand-600)" },
  { label: "Corrigé", Glyph: StateCorrige, tone: "text-brand-600", rule: "var(--color-brand-600)" },
  { label: "Vérifié", Glyph: StateVerifie, tone: "text-resolved", rule: "var(--color-resolved)" },
] as const;

export function DeficiencyWalkthrough() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useInView(hostRef);
  const { step, still } = useWalkthrough(STEPS, REST_STEP, inView);

  const highPriority = step >= 1;
  const raised = step >= 3;
  // Steps 3..6 map onto lifecycle 0..3, then hold at the last.
  const stateIndex = Math.min(Math.max(step - 3, 0), LIFECYCLE.length - 1);
  const state = LIFECYCLE[stateIndex];

  const tapVisible = step >= 1 && step <= 3 && !still;
  const tapX = step === 1 ? 82 : 50;
  const tapY = step === 1 ? 104 : step === 2 ? 74 : 110;

  return (
    <div ref={hostRef} className="absolute inset-0 bg-canvas overflow-hidden" aria-hidden="true">
      <div className="px-3.5 pt-3 pb-2.5 border-b border-line bg-surface">
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
            <p className="text-[11px] font-semibold text-ink leading-tight truncate">
              Nouvelle déficience
            </p>
            <p className="text-[8px] text-muted leading-tight truncate mt-px">
              {DEMO_PROJECT.shortName} · {DEMO_PROJECT.visitDate}
            </p>
          </div>
          <MarkX className="w-3 h-3 text-brand-600 shrink-0" />
        </div>
      </div>

      <div className="px-3.5 pt-3">
        {/* ── The déficience, as typed ────────────────────────────── */}
        <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
          Titre
        </p>
        <div className="rounded-[4px] border border-line-strong bg-surface px-2 py-1.5">
          <p className="text-[8.5px] text-ink leading-snug">{ISSUE.title}</p>
        </div>

        {/* ── Priority ────────────────────────────────────────────────
            Two chips. The selected one takes the 2px leading rule — the
            system's marked-row treatment, not a red fill: selection is not
            an alarm. */}
        <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1 mt-2.5">
          Priorité
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {["Normale", "Élevée"].map((label) => {
            const on = label === "Élevée" ? highPriority : !highPriority;
            return (
              <div
                key={label}
                className="h-[19px] rounded-[4px] border bg-surface flex items-center justify-center"
                style={{
                  transition: "border-color 120ms var(--ease-out), box-shadow 120ms var(--ease-out)",
                  borderColor: on ? "var(--color-line-strong)" : "var(--color-line)",
                  boxShadow: on ? "inset 2px 0 0 0 var(--color-brand-600)" : "none",
                }}
              >
                <span className={`text-[7.5px] leading-none ${on ? "text-ink font-medium" : "text-muted"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Lot + étape — the two selects that say WHO and WHEN ──── */}
        <div className="grid grid-cols-2 gap-1.5 mt-2.5">
          <div>
            <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
              Lot
            </p>
            <div className="h-[19px] rounded-[4px] border border-line-strong bg-subtle px-1.5 flex items-center">
              <span className="text-[7px] text-ink leading-none truncate">{ISSUE.lot}</span>
            </div>
          </div>
          <div>
            <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
              Étape
            </p>
            <div className="h-[19px] rounded-[4px] border border-line-strong bg-subtle px-1.5 flex items-center">
              <span className="text-[7px] text-ink leading-none truncate">{ISSUE.stage}</span>
            </div>
          </div>
        </div>

        {/* Primary action — the one red fill. */}
        <div className="mt-3">
          <div
            className="h-[22px] rounded-[4px] bg-brand-600 text-white flex items-center justify-center"
            style={{
              transition: "transform 120ms var(--ease-out), filter 120ms var(--ease-out)",
              transform: step === 2 ? "scale(0.97)" : "scale(1)",
              filter: step === 2 ? "brightness(0.92)" : "none",
            }}
          >
            <span className="text-[8px] font-semibold leading-none">Signaler la déficience</span>
          </div>
        </div>

        {/* ── The déficience in the list, advancing through its states ──
            The row is the app's marked row. Its leading rule carries the
            state's colour, so the lifecycle is legible from the rule alone
            — which is how it reads scanning a real list. */}
        <div
          className="mt-3.5"
          style={{
            transition: "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
            opacity: raised ? 1 : 0,
            transform: raised ? "translateY(0)" : "translateY(6px)",
          }}
        >
          <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1.5">
            Déficiences
          </p>
          <div
            className="bg-surface pl-2 py-1.5 pr-2 rounded-r-[4px] border-y border-r border-line"
            style={{
              borderLeftWidth: "2px",
              borderLeftStyle: "solid",
              // 320ms: slower than a state change, because this IS the
              // narrative beat — the eye should follow the colour moving.
              transition: "border-left-color 320ms var(--ease-out)",
              borderLeftColor: state.rule,
            }}
          >
            <div className="flex items-center gap-1.5">
              {/* The glyph swaps with the state. Keyed so React remounts it
                  and the fade reads as a change, not a redraw. */}
              <state.Glyph
                key={state.label}
                className={`w-2.5 h-2.5 shrink-0 rm-fade ${state.tone}`}
              />
              <span className="text-[8px] text-ink leading-tight truncate flex-1">
                {ISSUE.short}
              </span>
              <span
                key={`${state.label}-chip`}
                className={`text-[6.5px] font-semibold uppercase tracking-[0.06em] leading-none shrink-0 rm-fade ${state.tone}`}
              >
                {state.label}
              </span>
            </div>
            <p className="text-[6.5px] text-muted leading-none mt-1 truncate">
              {ISSUE.location} · {ISSUE.lot}
            </p>
          </div>

          {/* The lifecycle track: four ticks, filled up to the current
              state. Makes the sequence legible as a PROGRESSION rather than
              four unrelated labels. */}
          <div className="flex items-center gap-1 mt-2">
            {LIFECYCLE.map((s, i) => (
              <span
                key={s.label}
                className="h-0.5 flex-1 rounded-full"
                style={{
                  transition: "background-color 320ms var(--ease-out)",
                  backgroundColor:
                    i <= stateIndex && raised ? s.rule : "var(--color-line)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {tapVisible && <Tap x={tapX} y={tapY} firing={step === 2} />}
    </div>
  );
}
