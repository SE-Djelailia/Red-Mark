// WORKFLOW 01 — CREATING THE PROJECT
//
// The first frame of a four-part story. Everything the other three
// walkthroughs show belongs to the project created here, so this one
// establishes the job: its name, where it is, and whose it is.
//
// THE NARRATIVE:
//
//   1. The empty form, at rest. Three labelled fields, nothing in them.
//   2. The name types itself in — the longest field, so it carries the
//      beat that says "someone is filling this in".
//   3. The address follows, then the client. Each field takes focus as it
//      fills (ink ring, never red), and releases it when the next begins.
//   4. A tap on Créer. The button presses.
//   5. The project card lands in the list with the system's 220ms curve,
//      carrying its file number and its four construction stages — which
//      is what the NEXT walkthrough visits.
//   6. Hold. The rest frame: the project exists.
//
// Typing is driven by a character count from the parent timeline rather
// than per-field timers, so every field is on one clock and the loop is
// exact. Same reason useWalkthrough exists at all.
import { useRef } from "react";
import { MarkX } from "../ui-kit/RedMarkIcons";
import { FillField, Tap } from "./WalkthroughParts";
import { DEMO_PROJECT, DEMO_STAGES } from "./demoProject";
import { useInView, useWalkthrough, type WalkStep } from "./useWalkthrough";

const STEPS: WalkStep[] = [
  { hold: 1200 }, // 0 · the empty form
  { hold: 1500 }, // 1 · the project name types in
  { hold: 1100 }, // 2 · the address
  { hold: 900 }, // 3 · the client
  { hold: 520 }, // 4 · cursor reaches Créer, the button presses
  { hold: 1200 }, // 5 · the project card lands
  { hold: 2600 }, // 6 · held — the project exists
];

const REST_STEP = 6;

/** How many characters of each field are typed at a given step. */
function charsFor(step: number, field: 0 | 1 | 2, value: string): number {
  // A field is empty before its step, fully typed after it. During its own
  // step it is shown complete: the FillField caret does the "being typed"
  // work, and a per-character timer would need a second clock.
  const filledFrom = [1, 2, 3][field];
  if (step < filledFrom) return 0;
  return value.length;
}

export function ProjectWalkthrough() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useInView(hostRef);
  const { step, still } = useWalkthrough(STEPS, REST_STEP, inView);

  const created = step >= 5;

  // The cursor comes up from the lower right, presses Créer, and withdraws.
  // It is absent while the fields fill: a keyboard is doing that work, and a
  // tap ring hovering over a typing field would be a lie about the gesture.
  const tapVisible = step >= 3 && step <= 5 && !still;
  const tapX = step === 3 ? 84 : 50;
  const tapY = step === 3 ? 104 : step === 4 ? 86 : 110;

  return (
    <div ref={hostRef} className="absolute inset-0 bg-canvas overflow-hidden" aria-hidden="true">
      {/* Header: a new project has no title yet, so the screen names itself. */}
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
          <p className="text-[11px] font-semibold text-ink leading-tight flex-1">Nouveau projet</p>
          <MarkX className="w-3 h-3 text-brand-600 shrink-0" />
        </div>
      </div>

      <div className="px-3.5 pt-3">
        {/* ── The form ────────────────────────────────────────────────
            Three fields, in the order the real form asks for them. On iPad
            the form is two-up from md, which is what the wider frame shows
            off — the name spans both columns because it is the long one. */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <FillField
              label="Nom du projet"
              value={DEMO_PROJECT.name}
              chars={charsFor(step, 0, DEMO_PROJECT.name)}
              focused={step === 1}
            />
          </div>
          <FillField
            label="Adresse"
            value={DEMO_PROJECT.address}
            chars={charsFor(step, 1, DEMO_PROJECT.address)}
            focused={step === 2}
          />
          <FillField
            label="Client"
            value={DEMO_PROJECT.client}
            chars={charsFor(step, 2, DEMO_PROJECT.client)}
            focused={step === 3}
          />
        </div>

        {/* Primary action — the ONE red fill on this screen. */}
        <div className="mt-3">
          <div
            className="h-[22px] rounded-[4px] bg-brand-600 text-white flex items-center justify-center"
            style={{
              transition: "transform 120ms var(--ease-out), filter 120ms var(--ease-out)",
              transform: step === 4 ? "scale(0.97)" : "scale(1)",
              filter: step === 4 ? "brightness(0.92)" : "none",
            }}
          >
            <span className="text-[8px] font-semibold leading-none">Créer le projet</span>
          </div>
        </div>

        {/* ── The project, once created ───────────────────────────────
            Arrives on the system's own 220ms curve. Carries the file number
            and the four stages, because a project in this app is not just a
            name — it is a numbered job with a construction sequence, and the
            next three walkthroughs all hang off it. */}
        <div
          className="mt-3.5"
          style={{
            transition: "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
            opacity: created ? 1 : 0,
            transform: created ? "translateY(0)" : "translateY(6px)",
          }}
        >
          <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1.5">
            Projets
          </p>
          {/* The marked row: 2px leading rule, the system's own treatment for
              "this is the one". */}
          <div className="border-l-2 border-l-brand-600 bg-surface pl-2 py-1.5 pr-2 rounded-r-[4px] border-y border-r border-line">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[8.5px] text-ink font-medium leading-tight min-w-0">
                {DEMO_PROJECT.name}
              </p>
              <span className="text-[7px] text-muted leading-none shrink-0 tabular-nums mt-px">
                {DEMO_PROJECT.fileNumber}
              </span>
            </div>
            <p className="text-[7px] text-muted leading-tight mt-1">{DEMO_PROJECT.address}</p>

            {/* The firm's stages, copied onto the new project. */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {DEMO_STAGES.map((s, i) => (
                <span
                  key={s}
                  className="px-1 py-px rounded-[3px] border border-line bg-subtle text-[6px] text-body leading-none"
                  style={{
                    transition: "opacity 220ms var(--ease-out)",
                    transitionDelay: `${120 + i * 70}ms`,
                    opacity: created ? 1 : 0,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tapVisible && <Tap x={tapX} y={tapY} firing={step === 4} />}
    </div>
  );
}
