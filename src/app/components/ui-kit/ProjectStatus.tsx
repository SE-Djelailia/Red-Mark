// Project status chip — single source for the styles AND the French labels.
//
// This existed as two independent copies (ProjectList + ProjectEditModal),
// both of which covered only four of the six values in Project["status"];
// a project that was `active` or `archived` rendered an undefined class and
// an empty label. Typing the maps as total Records means adding a status is
// a compile error here rather than a blank chip at runtime.
import type { ProjectStatus } from "../../../lib/supabase";

// The closed vocabulary, NOT Project["status"] (which is `string | null`:
// the column is plain text with a DEFAULT and no CHECK, so the database can
// return anything, including null). Keeping this total is the whole point of
// the file — every map below is a Record over it, so adding a status is a
// compile error here rather than a blank chip at runtime. Rows are coerced
// into the union by normalizeProjectStatus at the boundary.
type Status = ProjectStatus;

// Neutral by design: project status is context, not urgency. The states
// meaning "currently relevant" get a subtle brand tint; the rest stay grey.
const STATUS_STYLE: Record<Status, string> = {
  planning: "bg-subtle text-body",
  "in-progress": "bg-brand-50 text-brand-strong",
  active: "bg-brand-50 text-brand-strong",
  "on-hold": "bg-subtle text-muted",
  completed: "bg-subtle text-muted",
  archived: "bg-subtle text-muted",
};

const STATUS_LABEL: Record<Status, string> = {
  planning: "Planification",
  "in-progress": "En cours",
  active: "Actif",
  "on-hold": "En pause",
  completed: "Complété",
  archived: "Archivé",
};

// Dropdown options, derived from the label map above so a status can never
// exist in the type but be missing from the picker — the bug this replaces
// was a hand-written 4-item list in two places, which silently reset an
// `archived` project to another status on save.
//
// Ordered by project lifecycle rather than object key order (which is
// incidental). The Record<Status, number> forces exhaustiveness: adding a
// value to Project["status"] without giving it a rank here is a compile
// error, not a quietly missing option.
const STATUS_RANK: Record<Status, number> = {
  planning: 0,
  "in-progress": 1,
  active: 2,
  "on-hold": 3,
  completed: 4,
  archived: 5,
};

export const PROJECT_STATUS_OPTIONS: { value: Status; label: string }[] = (
  Object.keys(STATUS_RANK) as Status[]
)
  .sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])
  .map((value) => ({ value, label: STATUS_LABEL[value] }));

/**
 * Coerces a raw `projects.status` value into the closed union.
 *
 * The column has a DEFAULT of 'active' but no CHECK constraint and no NOT
 * NULL, so a row can legitimately carry null or an unrecognised string.
 * Both fall back to "active" — the DEFAULT the database itself would have
 * applied — rather than rendering an undefined class and an empty label,
 * which is what the untyped code did before.
 */
export function normalizeProjectStatus(value: string | null | undefined): Status {
  return value && value in STATUS_LABEL ? (value as Status) : "active";
}

export function ProjectStatusBadge({ status }: { status: string | null | undefined }) {
  const safe = normalizeProjectStatus(status);
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${STATUS_STYLE[safe]}`}
    >
      {STATUS_LABEL[safe]}
    </span>
  );
}

export { STATUS_STYLE as PROJECT_STATUS_STYLE, STATUS_LABEL as PROJECT_STATUS_LABEL };
