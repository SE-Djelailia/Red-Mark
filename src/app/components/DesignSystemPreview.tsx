import { useState } from "react";
import {
  MapPin,
  Camera,
  Plus,
  ChevronRight,
  Clock,
  AlertCircle,
  Check,
  CircleAlert,
  Search,
  Trash2,
  Pencil,
  Download,
  Upload,
  Calendar,
  FileText,
  Building2,
  Bell,
  Settings,
  X,
  ArrowRight,
  ChevronDown,
  Filter,
  Image,
  Mic,
} from "lucide-react";
import { ICON_SIZE, iconRed } from "../../lib/icons";
import {
  MarkX,
  StateSignale,
  StateACorriger,
  StateCorrige,
  StateVerifie,
  IconPhoto,
  IconLocation,
  IconVisit,
} from "./ui-kit/RedMarkIcons";
import XSpinner from "./ui-kit/XSpinner";
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
  const [tab, setTab] = useState<"specimen" | "icons" | "screen">("specimen");

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
          {(["specimen", "icons", "screen"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 -mb-px border-b-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-brand-600 text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t === "specimen" ? "Éléments" : t === "icons" ? "Icônes" : "Écran type"}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {tab === "specimen" ? <Specimen /> : tab === "icons" ? <IconSpecimen /> : <ExampleScreen />}
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
                  <Clock size={12} /> En retard
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
              <Camera size={16} className="text-faint" />
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

/* ═══════════════════════════════════════════════════════════════════════
   ICON SPECIMEN — the restyled lucide base
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Renders the SAME icon twice: once as lucide ships it (round caps, stroke 2)
 * and once under our rule. The pair is the whole argument — the difference is
 * quiet at 16px and obvious at 40px, which is exactly why it has to be set
 * globally rather than judged per icon.
 *
 * The "before" side opts OUT by overriding the presentation attributes with
 * inline style, which outranks the class rule. Nothing else in the app does
 * this; it exists so the comparison is honest.
 */
function CapCompare({ size }: { size: number }) {
  const before = { strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const icons = [Plus, X, Check, ChevronRight, ArrowRight] as const;
  return (
    <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-[4px] overflow-hidden">
      {(["Lucide par défaut", "RedMark"] as const).map((heading, col) => (
        <div key={heading} className="bg-surface p-4">
          <p className="rm-label mb-3">{heading}</p>
          <div className="flex items-center gap-4 text-ink">
            {icons.map((Ico, i) => (
              <Ico key={i} size={size} style={col === 0 ? before : undefined} />
            ))}
          </div>
          <p className="text-2xs text-muted mt-3 rm-figures">
            {col === 0 ? "trait 2 · bouts ronds" : "trait 1.5 · bouts carrés"}
          </p>
        </div>
      ))}
    </div>
  );
}

function IconCell({ icon: Ico, name, size }: { icon: typeof Plus; name: string; size: number }) {
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <Ico size={size} className="text-ink" />
      <span className="text-2xs text-muted text-center leading-tight">{name}</span>
    </div>
  );
}

function IconSpecimen() {
  const set: [typeof Plus, string][] = [
    [Camera, "Camera"],
    [Image, "Image"],
    [MapPin, "MapPin"],
    [Calendar, "Calendar"],
    [Clock, "Clock"],
    [FileText, "FileText"],
    [Building2, "Building2"],
    [Search, "Search"],
    [Filter, "Filter"],
    [Bell, "Bell"],
    [Settings, "Settings"],
    [Pencil, "Pencil"],
    [Trash2, "Trash2"],
    [Download, "Download"],
    [Upload, "Upload"],
    [Mic, "Mic"],
    [Plus, "Plus"],
    [Check, "Check"],
    [X, "X"],
    [ChevronRight, "ChevronRight"],
    [ChevronDown, "ChevronDown"],
    [ArrowRight, "ArrowRight"],
  ];

  return (
    <>
      <Section label="La règle">
        <div className="space-y-3 text-sm text-body">
          <p>
            Une seule règle CSS sur <code className="text-ink">.lucide</code> retraite les 365
            icônes de l'app — aucun site d'appel modifié. Le trait passe de 2 à 1.5, et les bouts
            ronds deviennent carrés.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-4 rm-hairline">
            {[
              ["Trait", "1.5"],
              ["Bouts", "carrés"],
              ["Jonctions", "onglet"],
              ["Couleur", "currentColor"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="rm-label">{k}</p>
                <p className="text-sm text-ink font-medium mt-1">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section label="Avant / après — 40 px">
        <CapCompare size={40} />
        <p className="text-xs text-muted mt-3">
          À 40 px l'écart saute aux yeux : le bout rond arrondit la fin du trait, le bout carré la
          coupe net — comme la plume levée de la feuille. C'est la même logique que le logo, dont
          les barres sont dessinées en polygones précisément pour obtenir des coupes franches.
        </p>
      </Section>

      <Section label="Avant / après — 16 px (taille réelle)">
        <CapCompare size={16} />
        <p className="text-xs text-muted mt-3">
          À la taille d'usage, l'écart est ténu mais cumulatif : c'est le trait plus fin qui porte
          l'essentiel, en alignant l'icône sur le poids du texte et sur les filets de 1 px.
        </p>
      </Section>

      <Section label="Échelle">
        <div className="border border-line rounded-[4px] bg-surface divide-y divide-line">
          {(
            [
              ["xs", ICON_SIZE.xs, "métadonnée dense, dans une pastille"],
              ["sm", ICON_SIZE.sm, "en ligne avec le texte · défaut"],
              ["md", ICON_SIZE.md, "boutons, navigation, en-têtes"],
              ["lg", ICON_SIZE.lg, "titres de page, états vides"],
            ] as const
          ).map(([token, px, use]) => (
            <div key={token} className="flex items-center gap-4 px-4 py-3">
              <div className="w-8 flex justify-center text-ink">
                <MapPin size={px} />
              </div>
              <span className="rm-label w-8">{token}</span>
              <span className="text-sm text-ink rm-figures w-10">{px} px</span>
              <span className="text-sm text-muted">{use}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          Quatre pas, tous multiples de 4. L'audit avant ce système a relevé 21 tailles distinctes,
          dont 13, 15, 17, 19, 21 et 34 — des valeurs qui ne s'alignent sur rien.
        </p>
      </Section>

      <Section label="Jeu de base — encre">
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 border border-line rounded-[4px] bg-surface p-2">
          {set.map(([Ico, name]) => (
            <IconCell key={name} icon={Ico} name={name} size={ICON_SIZE.md} />
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          Toutes en <code className="text-ink">currentColor</code> : une icône hérite de la couleur
          de son texte. Aucune n'est rouge par elle-même.
        </p>
      </Section>

      <Section label="Le budget rouge">
        <div className="border border-line rounded-[4px] bg-surface divide-y divide-line">
          {(
            [
              [CircleAlert, "deficiency", "Déficience ouverte, ou son compte"],
              [AlertCircle, "alert", "Erreur réelle, ou action destructive"],
              [MapPin, "active", "Élément de navigation actif"],
            ] as const
          ).map(([Ico, reason, why]) => (
            <div key={reason} className="flex items-center gap-4 px-4 py-3">
              <div className="w-8 flex justify-center">
                <Ico size={ICON_SIZE.md} className={iconRed(reason)} />
              </div>
              <span className="rm-label w-24">{reason}</span>
              <span className="text-sm text-muted">{why}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          Trois raisons, et rien d'autre. Si aucune ne s'applique, l'icône est à l'encre — même
          quand elle « semble importante ». C'est le même test que pour les aplats : deux rouges
          visibles en même temps, c'est qu'il y en a un de trop.
        </p>
      </Section>

      <Section label="La marque — déficience">
        <div className="border border-line rounded-[4px] bg-surface p-6">
          <div className="flex items-end gap-8 text-ink">
            {[ICON_SIZE.xs, ICON_SIZE.sm, ICON_SIZE.md, ICON_SIZE.lg, 40].map((px) => (
              <div key={px} className="flex flex-col items-center gap-2">
                <MarkX size={px} />
                <span className="text-2xs text-muted rm-figures">{px}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <MarkX size={40} className={iconRed("deficiency")} />
              <span className="text-2xs text-muted">rouge</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Le X du logo, redessiné en trait sur la grille 24 — pas le logo mis à l'échelle. Le logo
          est en polygones pleins sur une boîte 0–100 : à 16 px il pèserait plus lourd que ses
          voisines. Les bouts carrés de la règle .lucide donnent les mêmes coupes franches que les
          polygones du logo. Rouge uniquement quand la déficience est ouverte.
        </p>
      </Section>

      <Section label="Le cycle de vie — série">
        <div className="grid grid-cols-4 border border-line rounded-[4px] bg-surface divide-x divide-line">
          {(
            [
              [StateSignale, "signalé", "signalée, intacte"],
              [StateACorriger, "à corriger", "assignée"],
              [StateCorrige, "corrigé", "entrepreneur"],
              [StateVerifie, "vérifié", "contresignée"],
            ] as const
          ).map(([Ico, label, note]) => (
            <div key={label} className="flex flex-col items-center gap-2 py-5 px-2">
              <Ico size={ICON_SIZE.lg} className="text-ink" />
              <span className="rm-label text-center">{label}</span>
              <span className="text-2xs text-muted text-center leading-tight">{note}</span>
            </div>
          ))}
        </div>
        {/* Same four at real size — the set has to survive 16px, where a
            distinction carried by a single stroke either holds or collapses. */}
        <div className="flex items-center gap-6 mt-4 px-4 py-3 border border-line rounded-[4px] bg-surface text-ink">
          <span className="rm-label">16 px</span>
          <StateSignale size={ICON_SIZE.sm} />
          <StateACorriger size={ICON_SIZE.sm} />
          <StateCorrige size={ICON_SIZE.sm} />
          <StateVerifie size={ICON_SIZE.sm} />
          <span className="rm-label ml-4">rouge — ouvert</span>
          <StateSignale size={ICON_SIZE.sm} className={iconRed("deficiency")} />
          <StateACorriger size={ICON_SIZE.sm} className={iconRed("deficiency")} />
        </div>
        <p className="text-xs text-muted mt-3">
          Un cadre constant (14×14) porte la série ; seul l'intérieur change, et chaque état ajoute
          un trait au précédent. « Plus avancé » se lit donc comme « plus annoté » — comme un plan
          qui se couvre de corrections. Les deux premiers états sont ouverts, donc rouges ; corrigé
          et vérifié sont à l'encre, jamais en vert.
        </p>
      </Section>

      <Section label="Les noms propres — sur mesure vs lucide">
        <div className="border border-line rounded-[4px] bg-surface divide-y divide-line">
          {(
            [
              [IconPhoto, Camera, "photo", "la prise, pas l'appareil"],
              [IconLocation, MapPin, "local", "un local sur plan, pas une épingle GPS"],
              [IconVisit, Calendar, "visite", "un jour daté, pas un mois"],
            ] as const
          ).map(([Custom, Lucide, name, why]) => (
            <div key={name} className="flex items-center gap-5 px-4 py-4">
              <div className="flex items-center gap-3 w-24">
                <Custom size={ICON_SIZE.lg} className="text-ink" />
                <Custom size={ICON_SIZE.sm} className="text-ink" />
              </div>
              <div className="flex items-center gap-3 w-20 text-faint">
                <Lucide size={ICON_SIZE.lg} />
                <Lucide size={ICON_SIZE.sm} />
              </div>
              <div className="min-w-0">
                <p className="rm-label">{name}</p>
                <p className="text-sm text-muted mt-0.5">{why}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          À gauche le tracé sur mesure, à droite l'équivalent lucide en gris. Seuls ces trois noms
          méritent un dessin propre : ils veulent dire ici quelque chose de précis qu'un glyphe
          générique dilue. Tout le reste — recherche, réglages, téléversement — veut dire partout la
          même chose, et la version lucide retraitée vaut mieux qu'un redessin.
        </p>
      </Section>

      <Section label="Le chargeur — la marque en train de se faire">
        <div className="border border-line rounded-[4px] bg-surface p-6">
          <div className="flex items-end gap-10">
            {[16, 24, 40, 64].map((px) => (
              <div key={px} className="flex flex-col items-center gap-3">
                <XSpinner size={px} label={null} />
                <span className="text-2xs text-muted rm-figures">{px}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-3">
              <div className="bg-brand-600 rounded-[4px] p-3">
                <XSpinner size={24} tone="current" label={null} className="text-white" />
              </div>
              <span className="text-2xs text-muted">sur bouton</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Les deux barres se tracent puis se lèvent, décalées d'un tiers de cycle : le X se
          construit comme une main le dessine, une diagonale puis l'autre. Le décalage
          <code className="text-ink"> stroke-dashoffset </code> continue dans le même sens en
          sortie — un stylo qui se lève, pas un tracé qui rembobine. Rouge parce que c'est la
          marque, et parce qu'un chargeur est seul à l'écran : rien ne lui dispute l'attention.
        </p>
        <p className="text-xs text-muted mt-2">
          <span className="rm-label">Mouvement réduit</span> — avec
          <code className="text-ink"> prefers-reduced-motion </code>, le X reste entièrement tracé
          et pulse doucement en opacité. Pas de <code className="text-ink">animation: none</code> :
          les barres seraient invisibles, et le seul signal d'activité disparaîtrait.
        </p>
      </Section>

      <Section label="Cohérence — sur mesure parmi les lucide">
        <div className="flex flex-wrap items-center gap-5 px-4 py-5 border border-line rounded-[4px] bg-surface text-ink">
          <Search size={ICON_SIZE.md} />
          <IconPhoto size={ICON_SIZE.md} />
          <Filter size={ICON_SIZE.md} />
          <IconLocation size={ICON_SIZE.md} />
          <Bell size={ICON_SIZE.md} />
          <IconVisit size={ICON_SIZE.md} />
          <Settings size={ICON_SIZE.md} />
          <MarkX size={ICON_SIZE.md} />
          <Download size={ICON_SIZE.md} />
          <StateVerifie size={ICON_SIZE.md} />
          <Pencil size={ICON_SIZE.md} />
        </div>
        <p className="text-xs text-muted mt-3">
          Mélange délibéré : sur mesure et lucide en alternance, sans étiquette. Si le regard
          accroche sur l'une d'elles, c'est qu'elle est à corriger — c'est le test de cette série.
        </p>
      </Section>
    </>
  );
}
