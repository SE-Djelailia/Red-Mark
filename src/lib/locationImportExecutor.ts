// Writes a confirmed ImportPlan to Supabase. Everything up to this point
// (parsing, planning) is read-only — this is the only place in the Locations
// import feature that actually calls createLevel/createLocation/updateLocation.
//
// Order of operations:
//   1. Create new levels, so their real ids exist.
//   2. Create new locations (using resolved level ids).
//   3. Update existing locations whose scalar fields changed.
//   4. Resolve and apply parent links last, since a parent may be a location
//      created in step 2 (forward reference within the same file).
//
// Each write is independent (Supabase has no simple multi-statement JS
// transaction here), so failures are collected rather than thrown — a
// single bad row shouldn't abort an otherwise-successful import of
// hundreds of others.

import { createLevel, createLocation, updateLocation } from "./locationsApi";
import type { ImportPlan, ParentRef } from "./locationImportPlanner";

export interface ExecuteResult {
  levelsCreated: number;
  locationsCreated: number;
  locationsUpdated: number;
  parentLinksSet: number;
  errors: string[];
}

function normalizeLevelKey(name: string): string {
  return name.trim().toLowerCase();
}

export async function executeImportPlan(projectId: string, plan: ImportPlan): Promise<ExecuteResult> {
  const result: ExecuteResult = {
    levelsCreated: 0,
    locationsCreated: 0,
    locationsUpdated: 0,
    parentLinksSet: 0,
    errors: [],
  };

  // 1. Create new levels
  const levelIdByKey = new Map<string, string>();
  for (const level of plan.levels) {
    if (!level.isNew) {
      levelIdByKey.set(normalizeLevelKey(level.name), level.existingId as string);
      continue;
    }
    try {
      const created = await createLevel(projectId, level.name, level.sortOrder ?? 0);
      levelIdByKey.set(normalizeLevelKey(level.name), created.id);
      result.levelsCreated++;
    } catch (err) {
      result.errors.push(`Niveau "${level.name}" : ${(err as Error).message}`);
    }
  }

  // 2. Create new locations
  const locationIdByRowNumber = new Map<number, string>();
  const locationIdByLevelAndNumber = new Map<string, string>();
  for (const loc of plan.locations) {
    if (loc.kind === "update") {
      locationIdByRowNumber.set(loc.rowNumber, loc.existingId);
      continue;
    }
    const levelId = levelIdByKey.get(normalizeLevelKey(loc.levelName));
    if (!levelId) {
      result.errors.push(`Ligne ${loc.rowNumber} : niveau "${loc.levelName}" introuvable après création.`);
      continue;
    }
    try {
      const created = await createLocation({
        projectId,
        levelId,
        locationNumber: loc.locationNumber,
        name: loc.name,
        type: loc.type,
        discipline: loc.discipline,
      });
      locationIdByRowNumber.set(loc.rowNumber, created.id);
      locationIdByLevelAndNumber.set(`${normalizeLevelKey(loc.levelName)}::${loc.locationNumber}`, created.id);
      result.locationsCreated++;
    } catch (err) {
      result.errors.push(`Ligne ${loc.rowNumber} ("${loc.locationNumber}") : ${(err as Error).message}`);
    }
  }

  // 3. Update existing locations whose scalar fields changed
  for (const loc of plan.locations) {
    if (loc.kind !== "update" || !loc.changed) continue;
    try {
      await updateLocation(loc.existingId, {
        name: loc.name,
        discipline: loc.discipline,
        type: loc.type,
      });
      result.locationsUpdated++;
    } catch (err) {
      result.errors.push(`Ligne ${loc.rowNumber} ("${loc.locationNumber}") : ${(err as Error).message}`);
    }
  }

  // 4. Resolve and apply parent links (may reference rows created in step 2)
  const resolveParentId = (ref: ParentRef): string | null => {
    if (ref.kind === "existing") return ref.id;
    return locationIdByLevelAndNumber.get(`${normalizeLevelKey(ref.level)}::${ref.locationNumber}`) ?? null;
  };

  for (const [rowNumber, ref] of plan.resolvedParents) {
    const locationId = locationIdByRowNumber.get(rowNumber);
    const parentId = resolveParentId(ref);
    if (!locationId || !parentId) {
      result.errors.push(`Ligne ${rowNumber} : lien parent non résolu.`);
      continue;
    }
    if (locationId === parentId) {
      result.errors.push(`Ligne ${rowNumber} : un emplacement ne peut pas être son propre parent.`);
      continue;
    }
    try {
      await updateLocation(locationId, { parentLocationId: parentId });
      result.parentLinksSet++;
    } catch (err) {
      result.errors.push(`Ligne ${rowNumber} : lien parent — ${(err as Error).message}`);
    }
  }

  return result;
}
