import { useEffect, useMemo, useState } from "react";
import { X, Search, Check, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { updatePhotosMetadata, type PhotoMetadataPatch } from "../../lib/supabaseApi";
import type { Photo } from "../../lib/supabase";
import { getLocations, type Location } from "../../lib/locationsApi";
import { locationLabel } from "../../lib/photoZone";
import { useModalOpen } from "../../hooks/useModalOpen";
import { inputClassName, labelClassName, textareaClassName } from "./ui-kit/Input";

// Editing metadata (local, description, tags) on photos that are already
// uploaded — the fix for the common field case of shooting fast and
// labelling later.
//
// One component, two modes, because the difference is only which fields are
// safe to apply to many rows at once:
//
//   SINGLE (1 photo)  local + description + tags, pre-filled, replaces.
//   BULK   (N photos) local + ADD tags. No description.
//
// The bulk restrictions are deliberate and are about not destroying data the
// user cannot see:
//
//   - A single description box applied to twelve photos would silently
//     overwrite eleven distinct captions.
//   - "Set tags" across a selection would wipe tags that were never shown.
//     Bulk tagging therefore ADDS to each photo's existing set.
//
// Location is the genuine bulk case (several photos of one room shot
// together) and is safely idempotent, so it is offered in both modes.

/** The minimum a caller's photo view-model must expose to be edited. */
export interface EditablePhoto {
  id: string;
  location_id?: string | null;
  description?: string | null;
  tags?: string[] | null;
}

interface Props {
  open: boolean;
  /** The photos being edited. One = single mode, more = bulk mode. */
  photos: EditablePhoto[];
  projectId: string;
  onCancel: () => void;
  /**
   * The rows that were actually written, so the calling surface can patch
   * its own list. Without this the grid keeps rendering the old badge and
   * the edit looks like it failed.
   */
  onSaved: (updated: Photo[]) => void;
}

export default function PhotoMetadataEditor({
  open,
  photos,
  projectId,
  onCancel,
  onSaved,
}: Props) {
  useModalOpen(open);

  const bulk = photos.length > 1;
  const single = photos.length === 1 ? photos[0] : null;

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationSearch, setLocationSearch] = useState("");

  // "" means "leave unchanged" in bulk mode and "no local" in single mode —
  // disambiguated by `locationTouched` below, because those two are
  // genuinely different intents and a bare empty string cannot express both.
  const [locationId, setLocationId] = useState("");
  const [locationTouched, setLocationTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed whenever the sheet opens on a different set. Keyed on the ids so
  // reopening on the same photo doesn't clobber an in-progress edit.
  const photoKey = photos.map((p) => p.id).join(",");
  useEffect(() => {
    if (!open) return;
    setLocationId(single?.location_id ?? "");
    setLocationTouched(false);
    setDescription(single?.description ?? "");
    // Bulk starts with an EMPTY tag list because those tags are additions,
    // not the current state of any one photo.
    setTags(single ? (single.tags ?? []) : []);
    setTagInput("");
    setLocationSearch("");
  }, [open, photoKey, single]);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLocationsLoading(true);
    getLocations(projectId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch((e) => {
        console.error("Error loading locations for photo editor:", e);
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) =>
        l.locationNumber.toLowerCase().includes(q) || (l.name || "").toLowerCase().includes(q),
    );
  }, [locations, locationSearch]);

  if (!open) return null;

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const pickLocation = (id: string) => {
    setLocationId(id);
    setLocationTouched(true);
  };

  const handleSave = async () => {
    const patch: PhotoMetadataPatch = {};

    if (single) {
      // Single mode replaces: every field shown is sent, so clearing one
      // actually clears it.
      patch.location_id = locationId || null;
      patch.description = description.trim() || null;
      patch.tags = tags;
    } else {
      // Bulk sends ONLY what the user deliberately set. An untouched field
      // must not be written — sending `location_id: null` because the user
      // never opened the picker would strip locals from photos that had one.
      if (locationTouched) patch.location_id = locationId || null;
    }

    const addingTags = bulk && tags.length > 0;
    if (Object.keys(patch).length === 0 && !addingTags) {
      toast.error("Aucune modification à enregistrer.");
      return;
    }

    setSaving(true);
    try {
      let result;
      if (addingTags) {
        // Tags are per-photo unions, so each row needs its own patch — one
        // shared `tags` array would replace rather than add. Done as a
        // sequence of single-photo calls through the same batch helper so
        // partial failure is still reported honestly.
        const perPhoto = await Promise.all(
          photos.map((p) =>
            updatePhotosMetadata([p.id], {
              ...patch,
              tags: Array.from(new Set([...(p.tags ?? []), ...tags])),
            }),
          ),
        );
        result = {
          updated: perPhoto.flatMap((r) => r.updated),
          failed: perPhoto.flatMap((r) => r.failed),
        };
      } else {
        result = await updatePhotosMetadata(
          photos.map((p) => p.id),
          patch,
        );
      }

      const { updated, failed } = result;

      if (updated.length > 0) onSaved(updated);

      if (failed.length === 0) {
        toast.success(
          updated.length === 1
            ? "Photo mise à jour."
            : `${updated.length} photos mises à jour.`,
        );
        onCancel();
      } else if (updated.length === 0) {
        console.error("Photo metadata update failed:", failed[0]?.error);
        toast.error(
          "Échec de la mise à jour. Vous n'avez peut-être pas les droits sur ces photos.",
        );
      } else {
        // The honest middle case: some rows landed, some didn't. Naming both
        // numbers matters — the surface behind this sheet now shows a mix.
        console.error("Partial photo metadata update:", failed);
        toast.warning(
          `${updated.length} photo${updated.length !== 1 ? "s" : ""} mise${updated.length !== 1 ? "s" : ""} à jour, ${failed.length} échec${failed.length !== 1 ? "s" : ""}.`,
        );
        onCancel();
      }
    } catch (e) {
      console.error("Error updating photo metadata:", e);
      toast.error("Échec de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const selectedLocation = locations.find((l) => l.id === locationId);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={bulk ? "Modifier les photos" : "Modifier la photo"}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
          <h3 className="text-base font-medium text-ink">
            {bulk ? `Modifier ${photos.length} photos` : "Modifier la photo"}
          </h3>
          <button
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center text-faint hover:text-ink rounded-lg"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Location */}
          <div>
            <label className={labelClassName}>
              Local{bulk ? " (appliqué à toutes les photos)" : ""}
            </label>
            {locationsLoading ? (
              <p className="text-sm text-muted">Chargement des locaux…</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted">
                Aucun local importé pour ce projet. Importez la liste depuis l'onglet{" "}
                <strong>Locaux</strong> du projet.
              </p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    type="text"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    placeholder="Rechercher un local…"
                    className={`${inputClassName} pl-10`}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto border border-line rounded-lg divide-y divide-line">
                  <button
                    onClick={() => pickLocation("")}
                    aria-pressed={locationTouched && !locationId}
                    className={`w-full text-left px-4 py-3 min-h-[44px] transition-colors ${
                      locationTouched && !locationId
                        ? "bg-brand-50 text-brand-strong font-medium"
                        : "hover:bg-subtle text-muted"
                    }`}
                  >
                    Aucun local
                  </button>
                  {filteredLocations.length === 0 ? (
                    <p className="text-sm text-muted px-4 py-3">
                      Aucun local ne correspond à cette recherche.
                    </p>
                  ) : (
                    filteredLocations.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => pickLocation(l.id)}
                        aria-pressed={locationId === l.id}
                        className={`w-full text-left px-4 py-3 min-h-[44px] flex items-center justify-between gap-2 transition-colors ${
                          locationId === l.id
                            ? "bg-brand-50 text-brand-strong font-medium"
                            : "hover:bg-subtle text-ink"
                        }`}
                      >
                        <span className="truncate">{locationLabel(l)}</span>
                        {locationId === l.id && <Check size={16} className="flex-shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
                {bulk && !locationTouched && (
                  <p className="text-xs text-muted mt-1.5">
                    Le local actuel de chaque photo est conservé tant qu'aucun choix n'est fait.
                  </p>
                )}
                {bulk && locationTouched && (
                  <p className="text-xs text-brand-strong mt-1.5 flex items-center gap-1">
                    <MapPin size={12} className="flex-shrink-0" />
                    {selectedLocation
                      ? `« ${locationLabel(selectedLocation)} » sera appliqué aux ${photos.length} photos.`
                      : `Le local sera retiré des ${photos.length} photos.`}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Description — single only. A shared box would overwrite each
              photo's own caption with one line of text. */}
          {!bulk && (
            <div>
              <label className={labelClassName}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex : fissure au coin nord-est du mur"
                className={textareaClassName}
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className={labelClassName}>
              {bulk ? "Ajouter des étiquettes" : "Étiquettes"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Ex : façade"
                className={inputClassName}
              />
              <button
                onClick={addTag}
                className="px-3 bg-subtle hover:bg-line rounded-lg text-ink min-h-[44px] flex items-center justify-center flex-shrink-0"
                aria-label="Ajouter l'étiquette"
              >
                <Plus size={18} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-subtle rounded-full text-xs text-ink"
                  >
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      className="text-faint hover:text-ink"
                      aria-label={`Retirer ${t}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {bulk && (
              <p className="text-xs text-muted mt-1.5">
                Ces étiquettes s'ajoutent à celles déjà présentes; aucune n'est retirée.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-line flex-shrink-0">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-3 border border-line-strong rounded-lg text-body font-medium hover:bg-subtle transition-colors min-h-[44px] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check size={18} />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
