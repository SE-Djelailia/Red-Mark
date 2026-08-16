// Resolving the "zone" label of a photo — the human-readable answer to
// "where was this taken?".
//
// There are two eras of that data:
//
//   NEW  photos.location_id -> locations row ("A-101 — Bureau")
//   OLD  photos.location JSONB {floor, room} free text ("Niveau 1 - Cuisine")
//
// The free-text inputs were replaced by the structured picker, so nothing
// writes floor/room any more. Old rows still carry it and are NOT migrated,
// so every read site has to prefer the FK and fall back to the legacy text.
// Centralised here because there are four such sites (the report generator,
// the visit photo filter, the visit grid badge, the lightbox caption) and
// four hand-rolled copies of this precedence would drift.

import type { Location } from "./locationsApi";
import type { LocationExtras } from "./supabase";

/**
 * The minimum a photo must expose to be given a zone label.
 *
 * Structural rather than `Pick<Photo, …>`: several screens carry their own
 * trimmed view-model of a photo, and those declare `location_id?: string |
 * null` where the generated row type has it required-and-nullable. Accepting
 * both spellings keeps every caller usable without widening the row type.
 */
export interface ZonedPhoto {
  location_id?: string | null;
  location?: LocationExtras | null;
}

/** "A-101 — Bureau", or just "A-101" when the location has no name. */
export function locationLabel(loc: Pick<Location, "locationNumber" | "name">): string {
  return loc.name ? `${loc.locationNumber} — ${loc.name}` : loc.locationNumber;
}

/** The legacy free-text label, or null when a photo has none. */
export function legacyZoneLabel(photo: ZonedPhoto): string | null {
  const floor = photo.location?.floor?.trim();
  const room = photo.location?.room?.trim();
  if (floor && room) return `${floor} - ${room}`;
  return room || floor || null;
}

/**
 * The zone label for one photo, preferring its linked location.
 *
 * `locationsById` is whatever the caller already has loaded; a photo whose
 * location_id is not in that map (not yet fetched, or the location was
 * deleted) falls through to the legacy text rather than rendering blank.
 */
export function resolvePhotoZone(
  photo: ZonedPhoto,
  locationsById: Map<string, Pick<Location, "locationNumber" | "name">>,
): string | null {
  if (photo.location_id) {
    const loc = locationsById.get(photo.location_id);
    if (loc) return locationLabel(loc);
  }
  return legacyZoneLabel(photo);
}

/** Convenience for the report, which must always print something. */
export function resolvePhotoZoneOrDefault(
  photo: ZonedPhoto,
  locationsById: Map<string, Pick<Location, "locationNumber" | "name">>,
  fallback = "Zone non spécifiée",
): string {
  return resolvePhotoZone(photo, locationsById) ?? fallback;
}

/** Index helper so callers don't each rebuild the same Map. */
export function indexLocations(
  locations: Pick<Location, "id" | "locationNumber" | "name">[],
): Map<string, Pick<Location, "locationNumber" | "name">> {
  return new Map(locations.map((l) => [l.id, l]));
}
