// WORKFLOW 04 — GENERATING THE REPORT
//
// The last frame, and the payoff: everything captured in the first three
// becomes a numbered document addressed to the client.
//
// WHY THIS ONE IS IN A BROWSER FRAME
//
// The other three are iPad — the app is used on site, one-handed, in the
// cold. A report is the opposite act: sat down, reviewed, sent. Putting the
// deliverable on a desktop surface says that without a word of copy.
//
// THE NARRATIVE:
//
//   1. The generation screen at rest — the visit selected, the covered
//      visits listed, the photo count.
//   2. A tap on Générer. The button presses.
//   3. The number is allocated — A003 lands in the field. This is the beat
//      worth showing: the number comes from the server, sequentially per
//      project, which is why two people cannot collide on one.
//   4. The document assembles: header block, then the observation, then the
//      déficience, each arriving on the system's own curve.
//   5. Hold on the finished sheet. The rest frame.
//
// The document is drawn in the SAME ruled language as the real .docx —
// title block, hairline rules, tracked uppercase labels — so the thing on
// screen is recognisably the thing that arrives in the client's inbox.
import { useRef } from "react";
import { MarkX, StateSignale } from "../ui-kit/RedMarkIcons";
import { Tap } from "./WalkthroughParts";
import { DEMO_ISSUES, DEMO_OBSERVATION, DEMO_PROJECT } from "./demoProject";
import { useInView, useWalkthrough, type WalkStep } from "./useWalkthrough";

const STEPS: WalkStep[] = [
  { hold: 1500 }, // 0 · the generation screen at rest
  { hold: 560 }, // 1 · tap Générer
  { hold: 1000 }, // 2 · the number is allocated
  { hold: 900 }, // 3 · the document's header block lands
  { hold: 900 }, // 4 · the observation
  { hold: 1000 }, // 5 · the déficience
  { hold: 2800 }, // 6 · the finished sheet, held
];

const REST_STEP = 6;

const ISSUE = DEMO_ISSUES[0];

export function ReportWalkthrough() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useInView(hostRef);
  const { step, still } = useWalkthrough(STEPS, REST_STEP, inView);

  const numbered = step >= 2;
  const sheet = step >= 3;
  const hasObservation = step >= 4;
  const hasIssue = step >= 5;

  const tapVisible = step <= 2 && !still;
  const tapX = step === 0 ? 30 : 21;
  const tapY = step === 0 ? 104 : step === 1 ? 79 : 110;

  return (
    <div ref={hostRef} className="absolute inset-0 bg-canvas overflow-hidden flex" aria-hidden="true">
      {/* ── LEFT: the generation panel ──────────────────────────────
          The report screen's settings column, which on a wide surface sits
          beside the working column — the layout the app actually uses at lg. */}
      <div className="w-[38%] border-r border-line bg-surface px-3 py-2.5 flex flex-col">
        <div className="flex items-center gap-1.5 mb-2.5">
          <MarkX className="w-2.5 h-2.5 text-brand-600 shrink-0" />
          <p className="text-[8px] font-semibold text-ink leading-none">Générer un rapport</p>
        </div>

        <p className="text-[6.5px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
          Visite principale
        </p>
        <div className="h-[16px] rounded-[4px] border border-line-strong bg-subtle px-1.5 flex items-center mb-2">
          <span className="text-[6.5px] text-ink leading-none truncate">
            {DEMO_PROJECT.visitDateLong}
          </span>
        </div>

        {/* Covered visits — the multi-visit selection. */}
        <p className="text-[6.5px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
          Visites couvertes
        </p>
        <div className="space-y-0.5 mb-2">
          {["15 août 2026", "29 août 2026", DEMO_PROJECT.visitDateLong].map((d, i) => (
            <div key={d} className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-[1px] border flex items-center justify-center shrink-0"
                style={{
                  borderColor: "var(--color-ink)",
                  backgroundColor: i === 2 ? "var(--color-ink)" : "transparent",
                }}
              />
              <span className="text-[6px] text-body leading-none truncate">{d}</span>
            </div>
          ))}
        </div>

        {/* The allocated number — the beat worth showing. */}
        <p className="text-[6.5px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1">
          N° de note
        </p>
        <div className="h-[16px] rounded-[4px] border border-line-strong bg-subtle px-1.5 flex items-center mb-auto">
          <span
            className="text-[7px] text-ink font-semibold leading-none tabular-nums rm-fade"
            key={numbered ? "n" : "e"}
          >
            {numbered ? DEMO_PROJECT.reportNumber : "—"}
          </span>
        </div>

        {/* Primary action — the one red fill on this screen. */}
        <div
          className="h-[18px] rounded-[4px] bg-brand-600 text-white flex items-center justify-center mt-2"
          style={{
            transition: "transform 120ms var(--ease-out), filter 120ms var(--ease-out)",
            transform: step === 1 ? "scale(0.97)" : "scale(1)",
            filter: step === 1 ? "brightness(0.92)" : "none",
          }}
        >
          <span className="text-[7px] font-semibold leading-none">Générer</span>
        </div>
      </div>

      {/* ── RIGHT: the document ─────────────────────────────────────
          Drawn as a sheet on the canvas ground, in the ruled language of the
          real .docx. */}
      <div className="flex-1 px-4 py-3 overflow-hidden">
        <div
          className="h-full bg-surface border border-line rounded-[4px] px-3.5 py-3 shadow-[0_1px_2px_rgb(20_20_20/0.04)]"
          style={{
            transition: "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
            opacity: sheet ? 1 : 0.25,
            transform: sheet ? "translateY(0)" : "translateY(4px)",
          }}
        >
          {/* Title block — the drawing-sheet header. */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-[8px] font-semibold text-ink leading-tight tracking-[0.04em]">
              NOTE DE VISITE DE CHANTIER
            </p>
            <span className="text-[7px] text-ink font-semibold tabular-nums leading-none shrink-0">
              {numbered ? DEMO_PROJECT.reportNumber : ""}
            </span>
          </div>
          <div className="h-px bg-ink/70 mt-1.5 mb-2" />

          {/* Header pairs, in the label/value grid the document uses. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              ["PROJET", DEMO_PROJECT.name],
              ["NO DOSSIER", DEMO_PROJECT.fileNumber],
              ["PROPRIÉTAIRE", DEMO_PROJECT.client],
              ["DATE", DEMO_PROJECT.visitDateLong],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[5.5px] font-semibold uppercase tracking-[0.08em] text-muted leading-none">
                  {label}
                </p>
                <p className="text-[6.5px] text-ink leading-tight mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>

          <div className="h-px bg-line my-2" />

          {/* OBSERVATIONS — with the photo cross-reference the generator
              computes at render time. */}
          <p className="text-[6px] font-semibold uppercase tracking-[0.08em] text-ink leading-none">
            Observations et actions
          </p>
          <div
            className="mt-1.5 flex gap-1.5"
            style={{
              transition: "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
              opacity: hasObservation ? 1 : 0,
              transform: hasObservation ? "translateY(0)" : "translateY(4px)",
            }}
          >
            <span className="text-[6px] text-muted tabular-nums leading-tight shrink-0">1.1</span>
            <p className="text-[6px] text-body leading-snug">
              {DEMO_OBSERVATION}{" "}
              <span className="text-muted">(voir photos 1 et 3)</span>
            </p>
          </div>

          <div className="h-px bg-line my-2" />

          {/* DÉFICIENCES — the one raised in workflow 03, carrying its
              lifecycle glyph. The single red mark on the sheet. */}
          <p className="text-[6px] font-semibold uppercase tracking-[0.08em] text-ink leading-none">
            Déficiences
          </p>
          <div
            className="mt-1.5 flex items-start gap-1.5"
            style={{
              transition: "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
              opacity: hasIssue ? 1 : 0,
              transform: hasIssue ? "translateY(0)" : "translateY(4px)",
            }}
          >
            <StateSignale className="w-2 h-2 text-brand-600 shrink-0 mt-px" />
            <div className="min-w-0">
              <p className="text-[6px] text-ink leading-snug">{ISSUE.title}</p>
              <p className="text-[5.5px] text-muted leading-none mt-0.5">
                {ISSUE.lot} · Priorité {ISSUE.priority.toLowerCase()}
              </p>
            </div>
          </div>

          {/* The photo plates the references point at. */}
          <div
            className="grid grid-cols-3 gap-1.5 mt-2.5"
            style={{
              transition: "opacity 220ms var(--ease-out)",
              transitionDelay: "120ms",
              opacity: hasIssue ? 1 : 0,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-[2px] border border-line bg-subtle overflow-hidden relative"
              >
                <svg viewBox="0 0 40 30" className="absolute inset-0 w-full h-full" aria-hidden="true">
                  <g stroke="var(--color-line-strong)" strokeWidth="1" fill="none" strokeLinecap="butt">
                    <path d="M0 21 L13 12 L23 18 L30 14 L40 21" />
                    <path d="M0 24 L40 24" />
                  </g>
                  <circle cx="30" cy="7" r="2.5" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" />
                </svg>
                <span className="absolute bottom-0 left-0 bg-ink/85 text-white text-[4.5px] leading-none px-0.5 py-px">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {tapVisible && <Tap x={tapX} y={tapY} firing={step === 1} />}
    </div>
  );
}
