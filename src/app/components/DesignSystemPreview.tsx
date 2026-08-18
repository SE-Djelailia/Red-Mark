import { useState } from "react";
import { MapPin, Camera, Plus, ChevronRight, Clock } from "lucide-react";
import { LogoLockup } from "./ui-kit/Logo";

/**
 * Living specimen of "The Architect's Red Pen".
 *
 * Route: /design (outside /app — it needs no session and grants nothing).
 * Not linked from anywhere; it exists to review the SYSTEM, not to ship.
 *
 * Every value here comes from design-tokens.css. If a colour or size is
 * hardcoded in this file, that is a bug in the system, not a shortcut.
 *
 * Read this screen for the RED BUDGET: at rest there is exactly one red
 * fill (the primary action) plus leading rules. Everything else earns its
 * hierarchy from weight and ink.
 */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rm-hairline pt-6">
      <p className="rm-label mb-5">{label}</p>
      {children}
    </section>
  );
}

export default function DesignSystemPreview() {
  const [tab, setTab] = useState<"specimen" | "screen">("specimen");

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── TITLE BLOCK ────────────────────────────────────────────────
          The drawing-sheet header: hairline rule, tracked uppercase
          labels above their values. */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-3xl mx-auto px-6 pt-8 pb-6">
          <LogoLockup size={28} />
          <h1 className="text-3xl font-semibold text-ink mt-6 tracking-[-0.02em]">
            The Architect's Red Pen
          </h1>
          <p className="text-base text-body mt-2 max-w-lg">
            The interface is the drawing. Red is the pen — and it only marks what
            needs attention.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-8 pt-6 rm-hairline">
            {[
              ["Système", "v1 · proposé"],
              ["Rouge", "#E10600"],
              ["Grille", "4 px"],
              ["Rayon max", "4 px"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="rm-label">{k}</p>
                <p className="text-sm text-ink font-medium mt-1 rm-figures">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs — the active one takes a red rule, not a red fill. */}
        <div className="max-w-3xl mx-auto px-6 flex gap-6">
          {(["specimen", "screen"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 -mb-px border-b-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-brand-600 text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t === "specimen" ? "Éléments" : "Écran type"}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {tab === "specimen" ? <Specimen /> : <ExampleScreen />}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SPECIMEN — the vocabulary
   ═══════════════════════════════════════════════════════════════════════ */

function Specimen() {
  return (
    <>
      <Section label="Typographie">
        <div className="space-y-5">
          <div>
            <p className="rm-label mb-1">Display · 28 / 600 / −0.02em</p>
            <p className="text-3xl font-semibold text-ink tracking-[-0.02em]">
              Rapport de visite
            </p>
          </div>
          <div>
            <p className="rm-label mb-1">Heading · 22 / 600</p>
            <p className="text-xl font-semibold text-ink tracking-[-0.01em]">
              Déficiences relevées
            </p>
          </div>
          <div>
            <p className="rm-label mb-1">Body · 16 / 400</p>
            <p className="text-base text-body max-w-lg">
              Le cadre de porte en acier a été installé; l'ajustement du seuil reste
              à corriger avant la réception provisoire.
            </p>
          </div>
          <div>
            <p className="rm-label mb-1">Label · 11 / 600 / +0.08em</p>
            <p className="rm-label">Emplacement · Discipline · Échéance</p>
          </div>
        </div>
      </Section>

      <Section label="Le rouge — budget">
        <div className="space-y-3">
          <p className="text-sm text-body max-w-lg">
            Un seul aplat rouge par écran. Tout le reste tire sa hiérarchie de la
            graisse et de l'encre.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button className="h-11 px-5 bg-brand-600 text-white rounded-[4px] text-sm font-medium hover:bg-brand-700 active:bg-brand-800 transition-colors">
              Action principale
            </button>
            <button className="h-11 px-5 bg-surface text-ink border border-ink rounded-[4px] text-sm font-medium hover:bg-subtle transition-colors">
              Secondaire
            </button>
            <button className="h-11 px-5 text-ink rounded-[4px] text-sm font-medium hover:bg-subtle transition-colors">
              Tertiaire
            </button>
          </div>
        </div>
      </Section>

      <Section label="La marque RedMark — le filet">
        <div className="space-y-2">
          <div className="rm-rule rm-rule-active bg-surface border-y border-r border-line py-3">
            <p className="text-sm font-medium text-ink">Actif · urgent · principal</p>
            <p className="text-xs text-muted mt-0.5">Filet rouge 2 px en bord d'attaque</p>
          </div>
          <div className="rm-rule bg-surface border-y border-r border-line py-3">
            <p className="text-sm font-medium text-ink">Au repos</p>
            <p className="text-xs text-muted mt-0.5">Filet d'encre 2 px</p>
          </div>
        </div>
      </Section>

      <Section label="Champs">
        <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="rm-label block mb-1.5">Local</label>
            <input
              defaultValue="A-101 — Bureau"
              className="w-full h-11 px-3 bg-subtle border border-line-strong rounded-[4px] text-sm text-ink focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-colors"
            />
          </div>
          <div>
            <label className="rm-label block mb-1.5">Échéance</label>
            <input
              defaultValue="2026-09-01"
              className="w-full h-11 px-3 bg-subtle border border-line-strong rounded-[4px] text-sm text-ink rm-figures focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-colors"
            />
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Le focus est en encre, jamais en rouge — se déplacer n'est pas une alerte.
        </p>
      </Section>

      <Section label="Badges">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center h-5 px-2 rounded-[2px] bg-brand-600 text-white text-[11px] font-semibold tracking-[0.08em] uppercase">
            Signalé
          </span>
          {["À corriger", "Corrigé"].map((s) => (
            <span
              key={s}
              className="inline-flex items-center h-5 px-2 rounded-[2px] border border-line-strong text-muted text-[11px] font-semibold tracking-[0.08em] uppercase"
            >
              {s}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-[2px] border border-line-strong text-[11px] font-semibold tracking-[0.08em] uppercase text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-resolved" />
            Vérifié
          </span>
        </div>
      </Section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EXAMPLE SCREEN — the system doing real work.
   A location detail page, restyled. Same information as the live screen.
   ═══════════════════════════════════════════════════════════════════════ */

function ExampleScreen() {
  const visits = [
    { date: "14 août 2026", photos: 4, issues: 2, active: true },
    { date: "2 juillet 2026", photos: 6, issues: 0, active: false },
    { date: "19 mai 2026", photos: 3, issues: 1, active: false },
  ];

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="bg-surface border border-line rounded-[4px]">
        <div className="px-5 pt-5 pb-4">
          <p className="rm-label">Local</p>
          <h2 className="text-xl font-semibold text-ink tracking-[-0.01em] mt-1">
            A-101 — Bureau
          </h2>
        </div>
        <div className="grid grid-cols-3 border-t border-line">
          {[
            ["Niveau", "1"],
            ["Discipline", "Architecture"],
            ["Déficiences", "3"],
          ].map(([k, v], i) => (
            <div key={k} className={`px-5 py-3 ${i > 0 ? "border-l border-line" : ""}`}>
              <p className="rm-label">{k}</p>
              <p className="text-sm text-ink font-medium mt-0.5 rm-figures">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deficiencies — one red rule marks the outstanding one */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <p className="rm-label">Déficiences</p>
          <button className="text-xs font-medium text-brand-strong hover:underline">
            Tout voir
          </button>
        </div>
        <div className="bg-surface border border-line rounded-[4px] divide-y divide-line">
          <button className="w-full text-left flex items-center gap-3 px-4 py-3 border-l-2 border-l-brand-600 hover:bg-subtle transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                Seuil de porte non ajusté
              </p>
              <p className="text-xs text-muted mt-0.5 rm-figures flex items-center gap-1.5">
                14 août 2026 · 4 j
                <span className="text-brand-strong font-medium inline-flex items-center gap-1">
                  <Clock size={10} /> En retard
                </span>
              </p>
            </div>
            <span className="inline-flex items-center h-5 px-2 rounded-[2px] bg-brand-600 text-white text-[11px] font-semibold tracking-[0.08em] uppercase flex-shrink-0">
              Signalé
            </span>
          </button>
          <button className="w-full text-left flex items-center gap-3 px-4 py-3 border-l-2 border-l-transparent hover:bg-subtle transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                Scellant périmétrique manquant
              </p>
              <p className="text-xs text-muted mt-0.5 rm-figures">2 juillet 2026 · 47 j</p>
            </div>
            <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-[2px] border border-line-strong text-[11px] font-semibold tracking-[0.08em] uppercase text-muted flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-resolved" />
              Vérifié
            </span>
          </button>
        </div>
      </div>

      {/* Visits — active one takes the rule */}
      <div>
        <p className="rm-label mb-3">Visites à cet emplacement</p>
        <div className="bg-surface border border-line rounded-[4px] divide-y divide-line">
          {visits.map((v) => (
            <button
              key={v.date}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 border-l-2 hover:bg-subtle transition-colors ${
                v.active ? "border-l-brand-600" : "border-l-transparent"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink rm-figures">{v.date}</p>
                <p className="text-xs text-muted mt-0.5">
                  {[
                    v.photos > 0 && `${v.photos} photos`,
                    v.issues > 0 && `${v.issues} déficience${v.issues > 1 ? "s" : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ChevronRight size={16} className="text-faint flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div>
        <p className="rm-label mb-3">Photos</p>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-square bg-subtle border border-line rounded-[4px] flex items-center justify-center"
            >
              <Camera size={18} className="text-faint" />
            </div>
          ))}
        </div>
      </div>

      {/* The one red fill on this screen */}
      <div className="flex gap-3 pt-2">
        <button className="flex-1 h-11 bg-brand-600 text-white rounded-[4px] text-sm font-medium hover:bg-brand-700 active:bg-brand-800 transition-colors inline-flex items-center justify-center gap-2">
          <Plus size={16} />
          Ajouter une déficience
        </button>
        <button className="h-11 px-5 bg-surface text-ink border border-ink rounded-[4px] text-sm font-medium hover:bg-subtle transition-colors inline-flex items-center gap-2">
          <MapPin size={16} />
          Photos
        </button>
      </div>
    </div>
  );
}
