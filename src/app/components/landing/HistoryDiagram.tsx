// THE HISTORY DIAGRAM — how a project becomes a documented building memory.
//
// STAGE 1: the static drawing. Stage 2 adds scroll-driven reveal on top of
// it, which is why every node carries a data-node id and every connector a
// data-edge id — those are the handles the animation will take. Nothing here
// depends on animation existing; the sheet must read whole at rest.
//
// WHAT IT IS, AND WHAT IT IS NOT
//
// This is a CONCEPTUAL map, not a screenshot. The real screens live in the
// frames above it for sales calls; this explains the STRUCTURE those screens
// sit on — that every part of a site visit connects into one history, so
// nothing is lost. The message is the connections, so the connections are
// drawn as carefully as the nodes.
//
// DRAWN AS AN ARCHITECT'S SHEET, NOT A SAAS INFOGRAPHIC
//
//   · A 1200×600 sheet, read LEFT TO RIGHT like a process drawing — root at
//     the left, the documented history at the right. Six columns, one per
//     narrative level, on a 24-unit grid.
//   · Nodes are TITLE BLOCKS: a 1px ink rule, a tracked uppercase label, a
//     glyph, 4px radius. No shadows, no gradients, no pills.
//   · Connectors are HAIRLINE ORTHOGONAL RUNS with square caps and mitre
//     joins — a drafted line, not a curved arrow. Where a run must show
//     direction, it ends in a square terminal, the way a dimension line does.
//   · RED IS THE PEN, AND IT MARKS ONLY WHAT MEANS SOMETHING: the déficience
//     node, the lifecycle track, and the mark inside the history. Every
//     structural thing — membres, lots, étapes, visites, photos — is ink and
//     grey. Green appears once, on VÉRIFIÉ, where the system permits it.
//   · Every glyph is the app's own (RedMarkIcons), drawn inline by the same
//     paths, so the diagram and the interface share one vocabulary.
//
// GEOMETRY
//
// All coordinates are on whole or half units. Column x-positions and the row
// y-positions are declared once (COLS / ROWS) and every node and edge is
// computed from them, so moving a column moves its connectors. Node sizes
// are fixed per kind so a column of them aligns.

import type { ReactNode } from "react";

/* ── THE GRID ───────────────────────────────────────────────────────────── */

const W = 1200;
const H = 600;

/**
 * Column centre x, one per narrative level.
 *
 * SOLVED, not chosen: each column sits one uniform 22px gutter past the
 * previous column's right edge, starting from a 32px margin. Node widths
 * differ (the root is 188, the lifecycle states 140, the rest 176), so the
 * centres are uneven while the GUTTERS are even — which is what the eye
 * reads. Hand-placing them twice produced a 12px gutter somewhere each
 * time; solving them from the widths cannot. Right edge lands at 1174,
 * inside the 1183 sheet frame.
 */
const COLS = {
  project: 126,
  structure: 330,
  visit: 528,
  detail: 726,
  lifecycle: 906,
  history: 1086,
} as const;

/** Row centre y for the three-high stacks. */
const ROWS = { top: 200, mid: 330, low: 460 } as const;

/* ── NODE PRIMITIVES ────────────────────────────────────────────────────── */

const NODE_W = 176;
const NODE_H = 56;
const SMALL_W = 140;
const SMALL_H = 44;

type Tone = "ink" | "red" | "resolved";

/**
 * A title block. The glyph sits in its own cell on the left, ruled off from
 * the label — the way a drawing's title block separates the symbol column
 * from the text column.
 */
function Node({
  id,
  cx,
  cy,
  w = NODE_W,
  h = NODE_H,
  label,
  sub,
  glyph,
  tone = "ink",
  root = false,
}: {
  id: string;
  cx: number;
  cy: number;
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  glyph?: ReactNode;
  tone?: Tone;
  root?: boolean;
}) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const cell = glyph ? h : 0;
  const stroke =
    tone === "red"
      ? "var(--color-brand-600)"
      : tone === "resolved"
        ? "var(--color-resolved)"
        : root
          ? "var(--color-ink)"
          : "var(--color-line-strong)";
  const labelColor = tone === "red" ? "var(--color-brand-600)" : "var(--color-ink)";

  return (
    <g data-node={id} className="rm-dg-node">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill="var(--color-surface)"
        stroke={stroke}
        strokeWidth={root || tone !== "ink" ? 1.5 : 1}
      />
      {glyph && (
        <>
          {/* The glyph cell's rule. */}
          <path
            d={`M${x + cell} ${y} L${x + cell} ${y + h}`}
            stroke={stroke}
            strokeWidth={1}
            strokeOpacity={tone === "ink" && !root ? 1 : 0.4}
          />
          <g
            transform={`translate(${x + cell / 2 - 10} ${cy - 10})`}
            style={{ color: tone === "ink" ? "var(--color-ink)" : stroke }}
          >
            {glyph}
          </g>
        </>
      )}
      <text
        x={x + cell + 12}
        y={sub ? cy - 3 : cy + 4}
        className="rm-dg-label"
        fill={labelColor}
      >
        {label}
      </text>
      {sub && (
        <text x={x + cell + 12} y={cy + 13} className="rm-dg-sub" fill="var(--color-muted)">
          {sub}
        </text>
      )}
    </g>
  );
}

/**
 * An inline glyph on lucide's 24-grid, stroked in currentColor. The paths
 * are the app's own (RedMarkIcons) so the diagram and the UI share a hand.
 */
function G({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  );
}

const FRAME = <rect x="5" y="5" width="14" height="14" />;

const GLYPH = {
  project: (
    <G>
      {/* A sheet with a title block in its corner — the drawing itself. */}
      <rect x="4" y="3" width="16" height="18" />
      <path d="M4 16 L20 16" />
      <path d="M13 16 L13 21" />
    </G>
  ),
  members: (
    <G>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20 L3.5 17.5 C3.5 15 6 14 9 14 C12 14 14.5 15 14.5 17.5 L14.5 20" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M20.5 20 L20.5 18 C20.5 16 19 15 17 15" />
    </G>
  ),
  lots: (
    <G>
      {/* Contractual divisions: a plan split into parcels. */}
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 12 L21 12" />
      <path d="M12 4 L12 20" />
    </G>
  ),
  stages: (
    <G>
      <rect x="3.5" y="9.5" width="5" height="5" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" stroke="none" />
      <rect x="15.5" y="9.5" width="5" height="5" />
      <path d="M8.5 12 L9.5 12" />
      <path d="M14.5 12 L15.5 12" />
    </G>
  ),
  visit: (
    <G>
      <rect x="4" y="5" width="16" height="15" />
      <path d="M4 9.5 L20 9.5" />
      <path d="M9 3 L9 6" />
      <path d="M15 3 L15 6" />
      <rect x="10.5" y="13" width="3" height="3" fill="currentColor" stroke="none" />
    </G>
  ),
  photo: (
    <G>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 16 L21 16" />
      <circle cx="12" cy="10.5" r="2.5" />
    </G>
  ),
  location: (
    <G>
      <path d="M4 20 L4 4 L20 4 L20 20 L14 20" />
      <path d="M9 12.5 L12 15.5 L15 12.5" />
      <path d="M12 8 L12 15.5" />
    </G>
  ),
  observation: (
    <G>
      {/* A note: ruled lines on a sheet. */}
      <rect x="4" y="3" width="16" height="18" />
      <path d="M8 9 L16 9" />
      <path d="M8 13 L16 13" />
      <path d="M8 17 L12 17" />
    </G>
  ),
  mark: (
    <G>
      <path d="M5 5 L19 19" />
      <path d="M19 5 L5 19" />
    </G>
  ),
  signale: (
    <G>
      {FRAME}
      <path d="M9 9 L15 15" />
      <path d="M15 9 L9 15" />
    </G>
  ),
  acorriger: (
    <G>
      {FRAME}
      <path d="M9 9 L15 15" />
      <path d="M15 9 L9 15" />
      <path d="M3 21 L21 3" />
    </G>
  ),
  corrige: (
    <G>
      {FRAME}
      <path d="M8.5 12 L11 14.5 L15.5 9.5" />
    </G>
  ),
  verifie: (
    <G>
      {FRAME}
      <path d="M8.5 11 L11 13.5 L15.5 8.5" />
      <path d="M8 16.5 L16 16.5" />
    </G>
  ),
  report: (
    <G>
      {/* The deliverable: a sheet with a title block and a folded corner. */}
      <path d="M5 3 L15 3 L19 7 L19 21 L5 21 Z" />
      <path d="M15 3 L15 7 L19 7" />
      <path d="M8 12 L16 12" />
      <path d="M8 16 L16 16" />
    </G>
  ),
};

/* ── CONNECTORS ─────────────────────────────────────────────────────────── */

/**
 * An orthogonal run: out from the source's right edge, across to a spine x,
 * up or down, then into the target's left edge. Square caps, mitre joins.
 * Rendered with a square terminal at the target so direction reads without
 * an arrowhead — a dimension-line convention, not a flowchart one.
 */
function Edge({
  id,
  from,
  to,
  spineX,
  tone = "ink",
  terminal = true,
}: {
  id: string;
  from: [number, number];
  to: [number, number];
  spineX: number;
  tone?: Tone;
  terminal?: boolean;
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const d =
    y1 === y2
      ? `M${x1} ${y1} L${x2} ${y2}`
      : `M${x1} ${y1} L${spineX} ${y1} L${spineX} ${y2} L${x2} ${y2}`;
  const stroke =
    tone === "red"
      ? "var(--color-brand-600)"
      : tone === "resolved"
        ? "var(--color-resolved)"
        : "var(--color-line-strong)";
  return (
    <g data-edge={id} className="rm-dg-edge">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      {terminal && (
        <rect x={x2 - 3} y={y2 - 3} width={6} height={6} fill={stroke} />
      )}
    </g>
  );
}

/** A tracked uppercase column heading, with its ordinal. */
function ColumnHead({ x, n, label }: { x: number; n: string; label: string }) {
  return (
    <g data-col={n}>
      <text x={x} y={92} textAnchor="middle" className="rm-dg-col-n" fill="var(--color-faint)">
        {n}
      </text>
      <text x={x} y={112} textAnchor="middle" className="rm-dg-col" fill="var(--color-muted)">
        {label}
      </text>
    </g>
  );
}

/* ── THE SHEET ──────────────────────────────────────────────────────────── */

export function HistoryDiagram({ className = "" }: { className?: string }) {
  const c = COLS;
  const r = ROWS;

  // Edge endpoints. Right edge of a node = cx + w/2; left edge = cx - w/2.
  const R = (cx: number, w = NODE_W) => cx + w / 2;
  const L = (cx: number, w = NODE_W) => cx - w / 2;

  // Spines sit at the midpoint between adjacent columns, so vertical runs
  // land in the gutter and never cross a node.
  const spine = {
    ps: (c.project + c.structure) / 2,
    sv: (c.structure + c.visit) / 2,
    vd: (c.visit + c.detail) / 2,
    dl: (c.detail + c.lifecycle) / 2,
    lh: (c.lifecycle + c.history) / 2,
  };

  // Fixed y-anchors for the right-hand columns.
  const LOC_Y = r.top + NODE_H / 2 + 22 + SMALL_H / 2; // local, hung under photos
  const RAIL_X = spine.dl + 6; // where the photo/observation runs turn up
  const RAIL_Y = 132; // the top rail, above every node, below the heads
  const HIST_Y = 240;
  const REPORT_Y = 352;
  const PUNCH_Y = 440;

  // Lifecycle: four small nodes on one vertical track.
  const life = [
    { id: "signale", y: 192, label: "Signalé", glyph: GLYPH.signale, tone: "red" as Tone },
    { id: "acorriger", y: 280, label: "À corriger", glyph: GLYPH.acorriger, tone: "red" as Tone },
    { id: "corrige", y: 368, label: "Corrigé", glyph: GLYPH.corrige, tone: "red" as Tone },
    { id: "verifie", y: 456, label: "Vérifié", glyph: GLYPH.verifie, tone: "resolved" as Tone },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`rm-dg ${className}`}
      role="img"
      aria-labelledby="rm-dg-title rm-dg-desc"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <title id="rm-dg-title">Comment RedMark documente l'historique d'un projet</title>
      <desc id="rm-dg-desc">
        Un projet, sa structure, ses visites, le détail de chaque visite, le cycle de vie
        d'une déficience, et l'historique documenté d'où sortent les rapports.
      </desc>

      <style>{`
        .rm-dg-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
        .rm-dg-sub   { font-size: 10.5px; font-weight: 400; }
        .rm-dg-col   { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
        .rm-dg-col-n { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; font-variant-numeric: tabular-nums; }
        .rm-dg-note  { font-size: 10.5px; }
        .rm-dg-message { font-size: 13px; font-weight: 500; letter-spacing: -0.005em; }
        .rm-dg-title { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      `}</style>

      {/* ── SHEET FRAME ──────────────────────────────────────────────
          The drawing border, and the title block in the lower right —
          the two things that make a sheet a sheet. */}
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="var(--color-canvas)" stroke="var(--color-line)" />
      <rect x={16.5} y={16.5} width={W - 33} height={H - 33} fill="none" stroke="var(--color-line-strong)" />

      {/* Column dividers: hairlines between the six levels. */}
      {[
        (c.project + c.structure) / 2,
        (c.structure + c.visit) / 2,
        (c.visit + c.detail) / 2,
        (c.detail + c.lifecycle) / 2,
        (c.lifecycle + c.history) / 2,
      ].map((x) => (
        <path key={x} d={`M${x} 76 L${x} ${H - 16 - 64 - 16}`} stroke="var(--color-line)" strokeWidth={1} strokeDasharray="1 5" />
      ))}

      {/* ── COLUMN HEADS ─────────────────────────────────────────── */}
      <ColumnHead x={c.project} n="01" label="Projet" />
      <ColumnHead x={c.structure} n="02" label="Structure" />
      <ColumnHead x={c.visit} n="03" label="Visites" />
      <ColumnHead x={c.detail} n="04" label="Détail" />
      <ColumnHead x={c.lifecycle} n="05" label="Cycle de vie" />
      <ColumnHead x={c.history} n="06" label="Historique" />

      {/* ── EDGES (drawn under the nodes) ────────────────────────── */}
      <g>
        {/* Project → the three structural children. */}
        <Edge id="p-members" from={[R(c.project, 188), r.mid]} to={[L(c.structure), r.top]} spineX={spine.ps} />
        <Edge id="p-lots" from={[R(c.project, 188), r.mid]} to={[L(c.structure), r.mid]} spineX={spine.ps} />
        <Edge id="p-stages" from={[R(c.project, 188), r.mid]} to={[L(c.structure), r.low]} spineX={spine.ps} />

        {/* Structure → visit. All three converge on the one visit node. */}
        <Edge id="s-visit-1" from={[R(c.structure), r.top]} to={[L(c.visit), r.mid]} spineX={spine.sv} terminal={false} />
        <Edge id="s-visit-2" from={[R(c.structure), r.mid]} to={[L(c.visit), r.mid]} spineX={spine.sv} terminal={false} />
        <Edge id="s-visit-3" from={[R(c.structure), r.low]} to={[L(c.visit), r.mid]} spineX={spine.sv} />

        {/* Visit → its three kinds of content. The déficience run is red:
            from here on, this is the pen's subject. */}
        <Edge id="v-photos" from={[R(c.visit), r.mid]} to={[L(c.detail), r.top]} spineX={spine.vd} />
        <Edge id="v-obs" from={[R(c.visit), r.mid]} to={[L(c.detail), r.mid]} spineX={spine.vd} />
        <Edge id="v-def" from={[R(c.visit), r.mid]} to={[L(c.detail), r.low]} spineX={spine.vd} tone="red" />

        {/* Photos → local: a photo is tagged to a room. A short drop under
            the photos node. */}
        <Edge id="ph-loc" from={[c.detail, r.top + NODE_H / 2]} to={[c.detail, LOC_Y - SMALL_H / 2]} spineX={c.detail} />

        {/* ── THE TWO ROUTES INTO THE HISTORY ─────────────────────
            Photos and observations go OVER the lifecycle column on a top
            rail: they are already facts the moment they are taken, and have
            no lifecycle to pass through. Drawing them through column 05 —
            which the first pass did — read as if photos were assigned and
            verified, which is false. The rail keeps that meaning honest. */}
        <Edge id="ph-rail" from={[R(c.detail), r.top]} to={[RAIL_X, r.top]} spineX={RAIL_X} terminal={false} />
        <Edge id="ob-rail" from={[R(c.detail), r.mid]} to={[RAIL_X, r.mid]} spineX={RAIL_X} terminal={false} />
        <path
          data-edge="rail"
          className="rm-dg-edge"
          d={`M${RAIL_X} ${r.mid} L${RAIL_X} ${RAIL_Y} L${spine.lh} ${RAIL_Y} L${spine.lh} ${HIST_Y} L${L(c.history)} ${HIST_Y}`}
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth={1}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />

        {/* Déficience → the lifecycle track. */}
        <Edge id="d-life" from={[R(c.detail), r.low]} to={[L(c.lifecycle, SMALL_W), life[0].y]} spineX={spine.dl} tone="red" />

        {/* The track: one red rule the states hang on, turning green for
            the last run into VÉRIFIÉ — the one permitted green. */}
        <path
          data-edge="life-track"
          className="rm-dg-edge"
          d={`M${c.lifecycle} ${life[0].y + SMALL_H / 2} L${c.lifecycle} ${life[2].y + SMALL_H / 2}`}
          stroke="var(--color-brand-600)"
          strokeWidth={1.5}
          strokeLinecap="butt"
        />
        <path
          data-edge="life-track-end"
          className="rm-dg-edge"
          d={`M${c.lifecycle} ${life[2].y + SMALL_H / 2} L${c.lifecycle} ${life[3].y - SMALL_H / 2}`}
          stroke="var(--color-resolved)"
          strokeWidth={1.5}
          strokeLinecap="butt"
        />

        {/* VÉRIFIÉ → history: the closed déficience enters the record. */}
        <Edge id="life-hist" from={[R(c.lifecycle, SMALL_W), life[3].y]} to={[L(c.history), HIST_Y]} spineX={spine.lh} tone="resolved" />

        {/* History → the two outputs. */}
        <Edge id="h-report" from={[c.history, HIST_Y + NODE_H / 2]} to={[c.history, REPORT_Y - NODE_H / 2]} spineX={c.history} />
        <Edge id="h-punch" from={[c.history, REPORT_Y + NODE_H / 2]} to={[c.history, PUNCH_Y - SMALL_H / 2]} spineX={c.history} />
      </g>

      {/* ── NODES ────────────────────────────────────────────────── */}

      {/* 01 · The root. Heavier rule: this is the thing everything hangs
          from. */}
      <Node id="project" cx={c.project} cy={r.mid} w={188} label="Créer un projet" sub="Le dossier" glyph={GLYPH.project} root />

      {/* 02 · Structure. */}
      <Node id="members" cx={c.structure} cy={r.top} label="Membres" sub="L'équipe du projet" glyph={GLYPH.members} />
      <Node id="lots" cx={c.structure} cy={r.mid} label="Lots" sub="+ entreprises" glyph={GLYPH.lots} />
      <Node id="stages" cx={c.structure} cy={r.low} label="Étapes" sub="Fondation → Finitions" glyph={GLYPH.stages} />

      {/* 03 · The visit. */}
      <Node id="visit" cx={c.visit} cy={r.mid} label="Visite" sub="Étapes · météo · présents" glyph={GLYPH.visit} />

      {/* 04 · Detail. */}
      <Node id="photos" cx={c.detail} cy={r.top} label="Photos" sub="Localisées" glyph={GLYPH.photo} />
      <Node id="location" cx={c.detail} cy={LOC_Y} w={SMALL_W} h={SMALL_H} label="Local" glyph={GLYPH.location} />
      <Node id="observations" cx={c.detail} cy={r.mid} label="Observations" sub="Notes de chantier" glyph={GLYPH.observation} />
      <Node id="deficiency" cx={c.detail} cy={r.low} label="Déficience" sub="Lot · étape · photo" glyph={GLYPH.mark} tone="red" />

      {/* 05 · The lifecycle, on its track. */}
      {life.map((s) => (
        <Node key={s.id} id={s.id} cx={c.lifecycle} cy={s.y} w={SMALL_W} h={SMALL_H} label={s.label} glyph={s.glyph} tone={s.tone} />
      ))}

      {/* 06 · The history, and what comes out of it. The mark inside is
          red: the history's whole point is that the déficiences are in it. */}
      <Node id="history" cx={c.history} cy={HIST_Y} label="L'historique" sub="Tout, relié, filtrable" glyph={GLYPH.mark} tone="red" root />
      <Node id="report" cx={c.history} cy={REPORT_Y} label="Rapport" sub="Note de visite" glyph={GLYPH.report} />
      <Node id="punchlist" cx={c.history} cy={PUNCH_Y} label="Liste de déf." sub="Déficiences ouvertes" glyph={GLYPH.report} />

      {/* ── THE MESSAGE ──────────────────────────────────────────
          A general note, where a sheet carries its notes: bottom left, in
          the band the title block leaves free. Set as a note, not a
          headline — the drawing says it; this only writes it down. */}
      <g data-node="message" transform={`translate(32 ${H - 16 - 64})`}>
        <text x={0} y={14} className="rm-dg-col" fill="var(--color-muted)">Note générale</text>
        <text x={0} y={34} className="rm-dg-message" fill="var(--color-ink)">
          Chaque photo, observation et déficience reste reliée à son projet.
        </text>
        <text x={0} y={52} className="rm-dg-message" fill="var(--color-ink)">
          Rien ne se perd.
        </text>
      </g>

      {/* ── TITLE BLOCK ──────────────────────────────────────────── */}
      <g data-node="titleblock" transform={`translate(${W - 16 - 384} ${H - 16 - 64})`}>
        <rect x={0.5} y={0.5} width={383} height={63} fill="var(--color-surface)" stroke="var(--color-line-strong)" />
        <path d="M0.5 32.5 L343.5 32.5" stroke="var(--color-line)" />
        <path d="M184.5 0.5 L184.5 63.5" stroke="var(--color-line)" />
        <path d="M280.5 32.5 L280.5 63.5" stroke="var(--color-line)" />
        <path d="M343.5 0.5 L343.5 63.5" stroke="var(--color-line)" />
        <text x={12} y={14} className="rm-dg-col" fill="var(--color-muted)">Feuille</text>
        <text x={12} y={26} className="rm-dg-title" fill="var(--color-ink)">L'historique documenté</text>
        <text x={196} y={14} className="rm-dg-col" fill="var(--color-muted)">Projet</text>
        <text x={196} y={26} className="rm-dg-note" fill="var(--color-ink)">Comment tout se relie</text>
        <text x={12} y={46} className="rm-dg-col" fill="var(--color-muted)">Échelle</text>
        <text x={12} y={58} className="rm-dg-note" fill="var(--color-ink)">Conceptuelle</text>
        <text x={196} y={46} className="rm-dg-col" fill="var(--color-muted)">Dessiné par</text>
        <text x={196} y={58} className="rm-dg-note" fill="var(--color-ink)">RedMark</text>
        <text x={292} y={46} className="rm-dg-col" fill="var(--color-muted)">Nº</text>
        <text x={292} y={58} className="rm-dg-note rm-figures" fill="var(--color-ink)">A-01</text>
        {/* The mark, in the block's last cell. Red: the sheet's signature. */}
        <g transform="translate(353 22)" style={{ color: "var(--color-brand-600)" }}>{GLYPH.mark}</g>
      </g>
    </svg>
  );
}
