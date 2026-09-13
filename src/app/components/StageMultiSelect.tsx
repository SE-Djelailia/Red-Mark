// Multi-select for a visit's construction stages.
//
// WHY TOGGLE CHIPS RATHER THAN A <select multiple>
//
// A native multi-select needs ctrl/cmd-click to add a second value, which does
// not exist on a touch device — and this app is used primarily on an iPad, on
// site, often with a gloved hand or a stylus. Chips make each stage a single
// 44px tap, and the selected set is readable at a glance without opening
// anything.
//
// The list is short and fixed (a firm's four or five stages), so there is no
// search, no dropdown and no virtualisation: everything is on screen already.
//
// SELECTION IS SHOWN TWICE OVER, deliberately: the fill, and the check glyph.
// Colour alone would fail for a colourblind user and in bright sun on a site,
// which is exactly where this screen is used.
import { Check } from "lucide-react";
import { labelClassName } from "./ui-kit/Input";
import type { ProjectStage } from "../../lib/stagesApi";

export default function StageMultiSelect({
  stages,
  selectedIds,
  onChange,
  disabled = false,
}: {
  stages: ProjectStage[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
    );
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className={labelClassName}>Étapes de construction</label>
        {selectedIds.length > 0 && (
          <span className="rm-figures text-xs text-muted">
            {selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Wraps on a phone, spreads across the width on iPad. No grid: the
          chips are different widths and a grid would stretch them all to the
          longest name, which reads as a table rather than a set of choices. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Étapes de construction">
        {stages.map((stage) => {
          const selected = selectedIds.includes(stage.id);
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => toggle(stage.id)}
              disabled={disabled}
              aria-pressed={selected}
              className={`min-h-[44px] px-3 rounded-[4px] border text-sm font-medium
                flex items-center gap-1.5 transition-colors duration-(--duration-fast)
                disabled:opacity-40 disabled:cursor-not-allowed ${
                  selected
                    ? "bg-ink text-white border-ink"
                    : "bg-surface text-ink border-line-strong hover:bg-subtle"
                }`}
            >
              {/* Reserved space, not conditional rendering: a chip must not
                  change width when it is picked, or the whole row reflows
                  under the finger that just tapped it. */}
              <Check
                size={14}
                className={selected ? "opacity-100" : "opacity-0"}
                aria-hidden="true"
              />
              {stage.name}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted mt-2 text-pretty">
        Une visite peut couvrir plusieurs étapes.
      </p>
    </div>
  );
}
