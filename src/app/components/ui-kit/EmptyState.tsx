import type { ReactNode } from "react";

// The considered empty state.
//
// An empty list is the FIRST thing a new user sees on most screens, so it is
// the app's introduction, not an error. Three parts, in the drawing-sheet
// order the rest of the system uses:
//
//   ICON     a custom glyph naming the noun that is absent, at display
//            weight — the déficience X, IconPhoto, IconVisit.
//   LABEL    the title-block voice: "AUCUNE DÉFICIENCE", not a sentence.
//   MESSAGE  one line saying what would be here, in plain language.
//   ACTION   optional, and deliberately INK OUTLINE, never red.
//
// WHY THE ACTION IS NEVER RED. Most screens carrying an empty state also
// carry a red primary — the FloatingActions FAB is on every project screen,
// and IssueView/VisitDetail have their own. A red empty-state button would
// put two red fills in one viewport, which is the one test the whole system
// turns on. Ink outline is the system's secondary, and it is enough: on an
// otherwise empty screen it is the only thing to press.

interface Action {
  label: string;
  onClick: () => void;
}

interface Props {
  icon: ReactNode;
  /** Title-block voice — short, uppercase-rendered by `rm-label`. */
  label: string;
  message: string;
  action?: Action;
  /** `compact` for empty states inside a card/section rather than a page. */
  size?: "default" | "compact";
  className?: string;
}

export default function EmptyState({
  icon,
  label,
  message,
  action,
  size = "default",
  className = "",
}: Props) {
  const compact = size === "compact";
  return (
    <div
      className={`text-center ${compact ? "py-8" : "py-12"} px-4 ${className}`}
      // The whole block is one announcement; without this a screen reader
      // reads the label and message as two unrelated fragments.
      role="status"
    >
      <div className="flex justify-center mb-3" aria-hidden="true">
        {icon}
      </div>
      <p className="rm-label">{label}</p>
      <p className={`${compact ? "text-xs" : "text-sm"} text-muted mt-2 max-w-xs mx-auto`}>
        {message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center justify-center px-4 min-h-11 rounded-[4px] border border-ink text-ink text-sm font-medium hover:bg-subtle active:bg-line transition-colors duration-(--duration-fast) ease-out"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
