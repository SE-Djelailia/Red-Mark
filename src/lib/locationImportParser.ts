// Pure Excel parsing/validation for the Locations import feature. No
// Supabase calls here — this only turns a workbook into validated rows (or
// errors), so it can be reasoned about and tested independently of the
// diffing (locationImportPlanner.ts) and writing (locationImportExecutor.ts)
// that happen afterward.

import * as XLSX from "xlsx";

export type LocationType = "room" | "element" | "roof" | "envelope" | "exterior" | "parking";

export interface ParsedLocationRow {
  rowNumber: number; // 1-indexed spreadsheet row (header is row 1), for error messages
  locationNumber: string;
  name: string | null;
  level: string;
  type: LocationType;
  discipline: string | null;
  parentLocationNumber: string | null; // raw, unresolved — resolved later by the planner
}

export interface ParseRowError {
  rowNumber: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedLocationRow[];
  errors: ParseRowError[];
  // Set when a required column couldn't be found at all — a fatal error
  // that means `rows` is always empty, distinct from per-row errors.
  headerError: string | null;
}

type CanonicalColumn = "locationNumber" | "name" | "level" | "type" | "discipline" | "parentLocation";

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  locationNumber: ["location number", "numero", "no"],
  name: ["name", "nom"],
  level: ["level", "niveau"],
  type: ["type"],
  discipline: ["discipline"],
  parentLocation: ["parent location", "parent"],
};

const TYPE_ALIASES: Record<string, LocationType> = {
  room: "room",
  salle: "room",
  element: "element",
  roof: "roof",
  toiture: "roof",
  toit: "roof",
  envelope: "envelope",
  enveloppe: "envelope",
  facade: "envelope",
  exterior: "exterior",
  exterieur: "exterior",
  parking: "parking",
  stationnement: "parking",
};

const REQUIRED_COLUMNS: CanonicalColumn[] = ["locationNumber", "level", "type"];

// Strip accents, trim, lowercase, collapse internal whitespace — used for
// both header matching and Type value matching so "Élément", "élément ",
// "ELEMENT" all resolve the same way.
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return String(cell).trim();
}

function resolveHeaders(headerRow: unknown[]): {
  columns: Partial<Record<CanonicalColumn, number>>;
  headerError: string | null;
} {
  const columns: Partial<Record<CanonicalColumn, number>> = {};

  headerRow.forEach((cell, index) => {
    const normalized = normalize(cellToString(cell));
    if (!normalized) return;
    (Object.keys(HEADER_ALIASES) as CanonicalColumn[]).forEach((canonical) => {
      if (columns[canonical] !== undefined) return; // first match wins
      if (HEADER_ALIASES[canonical].includes(normalized)) {
        columns[canonical] = index;
      }
    });
  });

  const missing = REQUIRED_COLUMNS.filter((col) => columns[col] === undefined);
  if (missing.length > 0) {
    const labels: Record<CanonicalColumn, string> = {
      locationNumber: "Location Number / Numéro",
      name: "Name / Nom",
      level: "Level / Niveau",
      type: "Type",
      discipline: "Discipline",
      parentLocation: "Parent Location / Parent",
    };
    return {
      columns,
      headerError: `Colonnes requises introuvables : ${missing.map((m) => labels[m]).join(", ")}.`,
    };
  }

  return { columns, headerError: null };
}

function parseRows(
  dataRows: unknown[][],
  columns: Partial<Record<CanonicalColumn, number>>,
): ParseResult {
  const rows: ParsedLocationRow[] = [];
  const errors: ParseRowError[] = [];

  dataRows.forEach((rawRow, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const get = (col: CanonicalColumn) =>
      columns[col] !== undefined ? cellToString(rawRow[columns[col] as number]) : "";

    const locationNumber = get("locationNumber");
    const level = get("level");
    const typeRaw = get("type");
    const name = get("name");
    const discipline = get("discipline");
    const parentLocation = get("parentLocation");

    // Skip fully blank rows silently — not an error, just trailing
    // whitespace in the sheet.
    if (!locationNumber && !level && !typeRaw && !name && !discipline && !parentLocation) {
      return;
    }

    if (!locationNumber) {
      errors.push({ rowNumber, message: "Numéro d'emplacement manquant." });
      return;
    }
    if (!level) {
      errors.push({ rowNumber, message: "Niveau manquant." });
      return;
    }
    if (!typeRaw) {
      errors.push({ rowNumber, message: "Type manquant." });
      return;
    }

    const type = TYPE_ALIASES[normalize(typeRaw)];
    if (!type) {
      errors.push({
        rowNumber,
        message: `Type invalide "${typeRaw}" — attendu room/salle, element/élément, roof/toiture, envelope/enveloppe, exterior/extérieur ou parking/stationnement.`,
      });
      return;
    }

    rows.push({
      rowNumber,
      locationNumber,
      name: name || null,
      level,
      type,
      discipline: discipline || null,
      parentLocationNumber: parentLocation || null,
    });
  });

  return { rows, errors, headerError: null };
}

export function parseWorkbook(data: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], errors: [], headerError: "Le classeur ne contient aucune feuille." };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });

  if (grid.length === 0) {
    return { rows: [], errors: [], headerError: "La feuille est vide." };
  }

  const [headerRow, ...dataRows] = grid;
  const { columns, headerError } = resolveHeaders(headerRow);
  if (headerError) {
    return { rows: [], errors: [], headerError };
  }

  return parseRows(dataRows, columns);
}

export function parseWorkbookFile(file: File): Promise<ParseResult> {
  return file.arrayBuffer().then((buffer) => parseWorkbook(buffer));
}

// Generates and triggers a browser download of the canonical import
// template: bilingual headers plus one example row demonstrating the
// parent-linking pattern (a room and an element that references it).
export function downloadLocationImportTemplate(): void {
  const headers = [
    "Location Number / Numéro",
    "Name / Nom",
    "Level / Niveau",
    "Type",
    "Discipline",
    "Parent Location / Parent",
  ];
  const exampleRows = [
    ["202", "Salle mécanique", "Niveau 3", "room", "Mechanical", ""],
    ["D-312", "", "Niveau 3", "element", "Architecture", "202"],
    ["R-1", "Toit principal", "Toit", "roof", "Enveloppe", ""],
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
  sheet["!cols"] = headers.map(() => ({ wch: 24 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Emplacements");
  XLSX.writeFile(workbook, "modele-emplacements.xlsx");
}
