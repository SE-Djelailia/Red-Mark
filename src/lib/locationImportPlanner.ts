// Pure diff computation for the Locations import. Takes the parsed rows
// plus the project's current levels/locations (fetched once, read-only) and
// produces an ImportPlan describing exactly what would be written — new
// levels, new locations, updates to existing locations, and anything left
// untouched. No Supabase calls here: this is what powers the preview screen,
// and running it twice with the same inputs always produces the same plan.
//
// Design note: a location's Parent cell is only ever applied when it has a
// non-empty value that resolves to a real location on the same level. A
// blank Parent cell never clears an existing parent link — re-exporting a
// sheet that happens to omit some Parent values shouldn't silently detach
// elements from their rooms. name/discipline/type, by contrast, are always
// synced to whatever the sheet says (including clearing to blank), since
// those are plain scalar fields the sheet is meant to be authoritative for.

import type { Level, Location } from "./locationsApi";
import type { LocationType, ParsedLocationRow, ParseRowError } from "./locationImportParser";

export interface PlannedLevel {
  name: string;
  isNew: boolean;
  existingId: string | null;
  sortOrder: number | null; // set only for new levels
}

interface ResolvedRowBase {
  rowNumber: number;
  levelName: string;
  locationNumber: string;
  name: string | null;
  type: LocationType;
  discipline: string | null;
  parentLocationNumber: string | null;
}

export interface PlannedNewLocation extends ResolvedRowBase {
  kind: "new";
}

export interface PlannedLocationUpdate extends ResolvedRowBase {
  kind: "update";
  existingId: string;
  changed: boolean;
}

export type PlannedLocationRow = PlannedNewLocation | PlannedLocationUpdate;

export interface ParentWarning {
  rowNumber: number;
  message: string;
}

// Identifies a resolved parent target: either an existing DB row, or a
// location this same import is about to create (referenced by level+number
// since it has no id yet).
export type ParentRef = { kind: "existing"; id: string } | { kind: "newRow"; level: string; locationNumber: string };

export interface ImportPlan {
  levels: PlannedLevel[];
  locations: PlannedLocationRow[];
  // rowNumber -> resolved parent (only present when the row had a non-empty
  // Parent value that resolved successfully)
  resolvedParents: Map<number, ParentRef>;
  parentWarnings: ParentWarning[];
  duplicateErrors: ParseRowError[];
  summary: {
    newLocations: number;
    updatedLocations: number;
    untouchedLocations: number;
    deletedLocations: 0;
    newLevels: number;
  };
}

function normalizeLevelKey(name: string): string {
  return name.trim().toLowerCase();
}

export function buildImportPlan(
  parsedRows: ParsedLocationRow[],
  existingLevels: Level[],
  existingLocations: Location[],
): ImportPlan {
  // --- Levels: first-appearance order, case-insensitive match against existing ---
  const existingLevelByKey = new Map(existingLevels.map((l) => [normalizeLevelKey(l.name), l]));
  const levelPlanByKey = new Map<string, PlannedLevel>();
  let nextSortOrder = existingLevels.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1;

  parsedRows.forEach((row) => {
    const key = normalizeLevelKey(row.level);
    if (levelPlanByKey.has(key)) return;
    const existing = existingLevelByKey.get(key);
    if (existing) {
      levelPlanByKey.set(key, { name: existing.name, isNew: false, existingId: existing.id, sortOrder: null });
    } else {
      levelPlanByKey.set(key, { name: row.level, isNew: true, existingId: null, sortOrder: nextSortOrder++ });
    }
  });

  // --- De-duplicate rows within the file itself: same (level, number) twice is ambiguous ---
  const seenInFile = new Set<string>();
  const duplicateErrors: ParseRowError[] = [];
  const dedupedRows: ParsedLocationRow[] = [];
  parsedRows.forEach((row) => {
    const fileKey = `${normalizeLevelKey(row.level)}::${row.locationNumber}`;
    if (seenInFile.has(fileKey)) {
      duplicateErrors.push({
        rowNumber: row.rowNumber,
        message: `Doublon dans le fichier pour "${row.locationNumber}" au niveau "${row.level}" (une occurrence précédente sera utilisée).`,
      });
      return;
    }
    seenInFile.add(fileKey);
    dedupedRows.push(row);
  });

  // --- Match each row against existing locations (level id + location_number, case-sensitive number) ---
  const existingLocationByLevelAndNumber = new Map<string, Location>();
  existingLocations.forEach((loc) => {
    existingLocationByLevelAndNumber.set(`${loc.levelId}::${loc.locationNumber}`, loc);
  });

  const matchedExistingIds = new Set<string>();
  const locations: PlannedLocationRow[] = dedupedRows.map((row) => {
    const levelPlan = levelPlanByKey.get(normalizeLevelKey(row.level))!;
    const existing = levelPlan.existingId
      ? existingLocationByLevelAndNumber.get(`${levelPlan.existingId}::${row.locationNumber}`)
      : undefined;

    if (existing) {
      matchedExistingIds.add(existing.id);
      const changed =
        existing.name !== row.name || existing.discipline !== row.discipline || existing.type !== row.type;
      return {
        kind: "update",
        rowNumber: row.rowNumber,
        levelName: levelPlan.name,
        locationNumber: row.locationNumber,
        name: row.name,
        type: row.type,
        discipline: row.discipline,
        parentLocationNumber: row.parentLocationNumber,
        existingId: existing.id,
        changed,
      } satisfies PlannedLocationUpdate;
    }

    return {
      kind: "new",
      rowNumber: row.rowNumber,
      levelName: levelPlan.name,
      locationNumber: row.locationNumber,
      name: row.name,
      type: row.type,
      discipline: row.discipline,
      parentLocationNumber: row.parentLocationNumber,
    } satisfies PlannedNewLocation;
  });

  // --- Resolve parent references (same level only), forward-references included ---
  // Lookup covers: every existing location in the project (in case a parent
  // already exists but isn't itself re-listed in this file) plus every row
  // this import is about to create/update.
  const parentLookup = new Map<string, ParentRef>();
  existingLocations.forEach((loc) => {
    parentLookup.set(`${loc.levelId}::${loc.locationNumber}`, { kind: "existing", id: loc.id });
  });
  locations.forEach((loc) => {
    const levelPlan = levelPlanByKey.get(normalizeLevelKey(loc.levelName))!;
    const ref: ParentRef =
      loc.kind === "update"
        ? { kind: "existing", id: loc.existingId }
        : { kind: "newRow", level: loc.levelName, locationNumber: loc.locationNumber };
    const key = levelPlan.existingId
      ? `${levelPlan.existingId}::${loc.locationNumber}`
      : `new::${normalizeLevelKey(loc.levelName)}::${loc.locationNumber}`;
    parentLookup.set(key, ref);
  });

  const resolvedParents = new Map<number, ParentRef>();
  const parentWarnings: ParentWarning[] = [];
  locations.forEach((loc) => {
    if (!loc.parentLocationNumber) return;
    const levelPlan = levelPlanByKey.get(normalizeLevelKey(loc.levelName))!;
    const key = levelPlan.existingId
      ? `${levelPlan.existingId}::${loc.parentLocationNumber}`
      : `new::${normalizeLevelKey(loc.levelName)}::${loc.parentLocationNumber}`;
    const resolved = parentLookup.get(key);
    if (resolved) {
      resolvedParents.set(loc.rowNumber, resolved);
    } else {
      parentWarnings.push({
        rowNumber: loc.rowNumber,
        message: `Parent "${loc.parentLocationNumber}" introuvable au niveau "${loc.levelName}" — l'emplacement sera importé sans lien parent.`,
      });
    }
  });

  const existingById = new Map(existingLocations.map((loc) => [loc.id, loc]));
  const parentActuallyChanged = (loc: PlannedLocationUpdate): boolean => {
    const resolved = resolvedParents.get(loc.rowNumber);
    if (!resolved) return false;
    if (resolved.kind === "newRow") return true; // can't already be set to a row that didn't exist
    const existing = existingById.get(loc.existingId);
    return !!existing && existing.parentLocationId !== resolved.id;
  };

  const untouchedLocations = existingLocations.filter((loc) => !matchedExistingIds.has(loc.id)).length;
  const newLocations = locations.filter((l) => l.kind === "new").length;
  const updatedLocations = locations.filter(
    (l) => l.kind === "update" && (l.changed || parentActuallyChanged(l)),
  ).length;

  return {
    levels: Array.from(levelPlanByKey.values()),
    locations,
    resolvedParents,
    parentWarnings,
    duplicateErrors,
    summary: {
      newLocations,
      updatedLocations,
      untouchedLocations,
      deletedLocations: 0,
      newLevels: Array.from(levelPlanByKey.values()).filter((l) => l.isNew).length,
    },
  };
}
