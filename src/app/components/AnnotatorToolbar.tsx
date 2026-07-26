import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle as CircleIcon,
  Cloud,
  Crop,
  Eraser,
  MapPin,
  MoreHorizontal,
  Move3d,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { MARKUP_COLORS, type Tool } from "../../lib/annotationModel";

// TOOLBAR CAPACITY — the constraint this layout exists to satisfy.
//
// The full control set is 8 tools + 4 colours + close + prepare + undo +
// redo + clear + save = 19 discrete controls. No flat arrangement fits
// that on a phone; the version this replaces tried, needed ~609px, and
// silently clipped Enregistrer off the right edge of every handset.
//
// So below `sm:` only three tools stay top-level — the ones used most on
// site (eraser, pencil, arrow). Everything else (rectangle, circle, cloud,
// dimension, pin, text) collapses into one tool menu that wears the active
// tool's icon; the four colours collapse to a single swatch button; and
// prepare/undo/redo/clear collapse into an overflow menu.
//
// Verified budget, all drawing controls at the full 44px touch target:
//
//   close 36 + eraser 44 + pencil 44 + arrow 44 + tools 44
//     + colour 44 + more 44 + save 40                = 340px
//   + gaps (6 × 2px + 2px inner) + 12px padding      =  26px
//   ---------------------------------------------------------
//                                              TOTAL  366px
//
//   375px iPhone SE      → fits, 9px slack
//   390px iPhone 12–14   → fits, 24px slack
//   360px Galaxy S8      → 6px over, wraps to a second row (see flex-wrap)
//
// Close is 36px rather than 44 — it is a corner dismiss with nothing
// adjacent to mis-tap, and those 8px are what buy the SE its slack.
//
// From `sm:` up there is width to spare, so everything ungroups inline.

export interface ToolDef {
  tool: Tool;
  icon: typeof Pencil;
  label: string;
}

/** Always top-level, even on the narrowest phone. */
export const PRIMARY_TOOLS: ToolDef[] = [
  { tool: "eraser", icon: Eraser, label: "Gomme" },
  { tool: "pencil", icon: Pencil, label: "Crayon" },
  { tool: "arrow", icon: ArrowUpRight, label: "Flèche" },
];

/** Collapsed into the tool menu on a phone, inline on desktop. */
export const MENU_TOOLS: ToolDef[] = [
  { tool: "rectangle", icon: Square, label: "Rectangle" },
  { tool: "circle", icon: CircleIcon, label: "Cercle" },
  { tool: "cloud", icon: Cloud, label: "Nuage de révision" },
  { tool: "dimension", icon: Move3d, label: "Cote" },
  { tool: "pin", icon: MapPin, label: "Repère numéroté" },
  { tool: "text", icon: Type, label: "Texte" },
];

const ICON_BUTTON =
  "w-11 h-11 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const ACTIVE = "bg-brand-50 text-brand-600";
const INACTIVE = "text-body hover:bg-subtle";

/** Closes a popover on outside pointerdown or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

interface Props {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  color: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
  onPrepare: () => void;
  prepareDisabled: boolean;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onClear: () => void;
  canClear: boolean;
  onSave: () => void;
  isSaving: boolean;
  saveDisabled: boolean;
}

export default function AnnotatorToolbar({
  activeTool,
  onToolChange,
  color,
  onColorChange,
  onClose,
  onPrepare,
  prepareDisabled,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onClear,
  canClear,
  onSave,
  isSaving,
  saveDisabled,
}: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const toolsRef = useDismiss(toolsOpen, () => setToolsOpen(false));
  const colorsRef = useDismiss(colorsOpen, () => setColorsOpen(false));
  const moreRef = useDismiss(moreOpen, () => setMoreOpen(false));

  // The menu button wears the icon of whichever menu tool is selected, so
  // the active tool is always readable without opening the popover.
  const activeMenuTool = MENU_TOOLS.find((t) => t.tool === activeTool);
  const MenuIcon = (activeMenuTool ?? MENU_TOOLS[0]).icon;

  const toolButton = ({ tool, icon: Icon, label }: ToolDef) => (
    <button
      key={tool}
      onClick={() => onToolChange(tool)}
      title={label}
      aria-label={label}
      aria-pressed={activeTool === tool}
      className={`${ICON_BUTTON} ${activeTool === tool ? ACTIVE : INACTIVE}`}
    >
      <Icon size={19} />
    </button>
  );

  const swatch = (value: string, label: string, size: string) => (
    <button
      key={value}
      onClick={() => {
        onColorChange(value);
        setColorsOpen(false);
      }}
      title={label}
      aria-label={label}
      aria-pressed={color === value}
      className={`${size} rounded-full border transition-transform ${
        color === value ? "border-ink scale-110 ring-2 ring-brand-600/30" : "border-line-strong"
      }`}
      style={{ backgroundColor: value }}
    />
  );

  // min-h + flex-wrap rather than a fixed h-14: the layout is measured to
  // fit 375px, but on anything narrower (a 360px Galaxy S8, or a phone in a
  // split view) the row wraps to a second line instead of pushing
  // Enregistrer off the edge. Clipping the save button is exactly the
  // failure this toolbar replaces, so it must not be reachable at any
  // viewport width.
  return (
    <div className="min-h-14 px-1.5 sm:px-4 flex flex-wrap items-center gap-0.5 sm:gap-1.5">
      {/* 36px, not 44: a corner dismiss with nothing adjacent to mis-tap,
          and the 8px it frees is what keeps Enregistrer on a 360px screen. */}
      <button
        onClick={onClose}
        className="w-9 h-11 flex items-center justify-center rounded-lg text-muted hover:bg-subtle transition-colors flex-shrink-0"
        title="Fermer"
        aria-label="Fermer"
      >
        <X size={20} />
      </button>

      {PRIMARY_TOOLS.map(toolButton)}

      {/* Remaining tools: a popover below sm, inline from sm up. */}
      <div className="relative sm:hidden" ref={toolsRef}>
        <button
          onClick={() => setToolsOpen((v) => !v)}
          title="Autres outils"
          aria-label="Autres outils"
          aria-expanded={toolsOpen}
          aria-haspopup="menu"
          className={`${ICON_BUTTON} relative ${activeMenuTool ? ACTIVE : INACTIVE}`}
        >
          <MenuIcon size={19} />
          <ChevronDown size={10} className="absolute bottom-0.5 right-0.5" />
        </button>
        {toolsOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 z-20 bg-surface border border-line rounded-xl shadow-lg p-1 w-52"
          >
            {MENU_TOOLS.map(({ tool, icon: Icon, label }) => (
              <button
                key={tool}
                role="menuitem"
                onClick={() => {
                  onToolChange(tool);
                  setToolsOpen(false);
                }}
                className={`w-full min-h-11 px-3 flex items-center gap-3 rounded-lg text-sm text-left transition-colors ${
                  activeTool === tool ? "bg-brand-50 text-brand-strong" : "text-body hover:bg-subtle"
                }`}
              >
                <Icon size={17} className="flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-1">{MENU_TOOLS.map(toolButton)}</div>

      <div className="hidden sm:block w-px h-6 bg-line mx-1" />

      {/* Colour: one swatch button below sm, all four inline from sm up. */}
      <div className="relative sm:hidden" ref={colorsRef}>
        <button
          onClick={() => setColorsOpen((v) => !v)}
          title="Couleur"
          aria-label="Couleur"
          aria-expanded={colorsOpen}
          aria-haspopup="menu"
          className={`${ICON_BUTTON} ${INACTIVE}`}
        >
          <span
            className="w-6 h-6 rounded-full border border-line-strong block"
            style={{ backgroundColor: color }}
          />
        </button>
        {colorsOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 z-20 bg-surface border border-line rounded-xl shadow-lg p-2 flex items-center gap-2"
          >
            {MARKUP_COLORS.map((c) => swatch(c.value, c.label, "w-9 h-9"))}
          </div>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-1.5">
        {MARKUP_COLORS.map((c) => swatch(c.value, c.label, "w-6 h-6"))}
      </div>

      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        {/* Occasional actions: overflow menu below sm, inline from sm up. */}
        <div className="relative sm:hidden" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            title="Plus d'actions"
            aria-label="Plus d'actions"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`${ICON_BUTTON} ${INACTIVE}`}
          >
            <MoreHorizontal size={19} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 bg-surface border border-line rounded-xl shadow-lg p-1 w-60"
            >
              {[
                {
                  icon: Crop,
                  label: "Préparer l'image",
                  onClick: onPrepare,
                  disabled: prepareDisabled,
                  hint: prepareDisabled ? "Impossible après une annotation" : undefined,
                },
                { icon: Undo2, label: "Annuler", onClick: onUndo, disabled: !canUndo },
                { icon: Redo2, label: "Rétablir", onClick: onRedo, disabled: !canRedo },
                { icon: Trash2, label: "Tout effacer", onClick: onClear, disabled: !canClear },
              ].map(({ icon: Icon, label, onClick, disabled, hint }) => (
                <button
                  key={label}
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    onClick();
                    setMoreOpen(false);
                  }}
                  className="w-full min-h-11 px-3 flex items-center gap-3 rounded-lg text-sm text-left text-body hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Icon size={17} className="flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {hint && <span className="text-[10px] text-muted">{hint}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={onPrepare}
            disabled={prepareDisabled}
            title={
              prepareDisabled
                ? "Recadrer/pivoter n'est possible qu'avant d'annoter"
                : "Préparer l'image"
            }
            className={`${ICON_BUTTON} ${INACTIVE}`}
          >
            <Crop size={18} />
          </button>
          <button onClick={onUndo} disabled={!canUndo} title="Annuler" className={`${ICON_BUTTON} ${INACTIVE}`}>
            <Undo2 size={18} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Rétablir" className={`${ICON_BUTTON} ${INACTIVE}`}>
            <Redo2 size={18} />
          </button>
          <button
            onClick={onClear}
            disabled={!canClear}
            title="Tout effacer"
            className={`${ICON_BUTTON} ${INACTIVE}`}
          >
            <Trash2 size={18} />
          </button>
        </div>

        <button
          onClick={onSave}
          disabled={saveDisabled}
          title="Enregistrer"
          aria-label="Enregistrer"
          className="ml-1 h-11 px-3 sm:px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 active:bg-brand-800 transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
        >
          <Check size={16} />
          <span className="hidden sm:inline">{isSaving ? "Enregistrement…" : "Enregistrer"}</span>
        </button>
      </div>
    </div>
  );
}
