import { useEffect, useState } from "react";
import { X, User, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { createIssue, updateIssue, type Issue } from "../../lib/issuesApi";
import { getLocation, type Location } from "../../lib/locationsApi";
import { getProjectTeammates, type Teammate } from "../../lib/commentsApi";
import { uploadIssuePhotos } from "../../lib/issuePhotoUpload";
import SecureImage from "./SecureImage";
import PhotoCaptureButtons from "./PhotoCaptureButtons";
import { inputClassName, labelClassName, textareaClassName } from "./ui-kit/Input";
import { PRIORITY_OPTIONS } from "./ui-kit/Badge";

const DISCIPLINES = ["Architecture", "Structure", "Mécanique", "Électricité", "Plomberie"];

interface Props {
  projectId: string;
  visitId: string;
  // Present when created from a pin (LocationPinPanel's context) — read-only
  // here; the linked location is never editable from this form.
  locationId?: string | null;
  // When present, the form edits this issue; when absent, it creates a new one.
  issue?: Issue | null;
  // Create mode only: photos already uploaded elsewhere (e.g. selected from
  // a visit's photo grid) to attach immediately — shown/removable exactly
  // like an existing issue's photos, just pre-populated instead of loaded
  // from an issue that doesn't exist yet.
  initialPhotos?: Issue["photos"];
  onSaved: (issue: Issue) => void;
  onCancel: () => void;
}

type AssigneeMode = "none" | "member" | "external";

// Canonical create/edit form for issues (déficiences), reused by every issue
// surface (IssueDetail, IssueManagement, VisitDetail, LocationPinPanel — see
// Stage 3 of the consolidation plan). Photos reuse LocationPinPanel's
// capture/compress/upload/offline-queue flow, generalized to attach via
// photos.issue_id instead of a per-location payload.
export default function IssueForm({
  projectId,
  visitId,
  locationId,
  issue,
  initialPhotos,
  onSaved,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const isEdit = !!issue;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Issue["priority"]>("medium");
  const [status, setStatus] = useState<Issue["status"]>("open");
  const [discipline, setDiscipline] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [assigneeMode, setAssigneeMode] = useState<AssigneeMode>("none");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [assignedToName, setAssignedToName] = useState("");

  const [location, setLocation] = useState<Location | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const [existingPhotos, setExistingPhotos] = useState<Issue["photos"]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProjectTeammates(projectId).then(setTeammates);
  }, [projectId]);

  useEffect(() => {
    const effectiveLocationId = issue?.locationId ?? locationId ?? null;
    if (!effectiveLocationId) {
      setLocation(null);
      return;
    }
    setLoadingLocation(true);
    getLocation(effectiveLocationId)
      .then(setLocation)
      .catch((e) => console.error("Error loading linked location:", e))
      .finally(() => setLoadingLocation(false));
  }, [issue?.locationId, locationId]);

  useEffect(() => {
    if (!issue) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setStatus("open");
      setDiscipline("");
      setDueDate("");
      setTags([]);
      setAssigneeMode("none");
      setAssignedToUserId("");
      setAssignedToName("");
      setExistingPhotos(initialPhotos || []);
      setRemovedPhotoIds([]);
      setNewPhotoFiles([]);
      return;
    }
    setTitle(issue.title);
    setDescription(issue.description);
    setPriority(issue.priority);
    setStatus(issue.status);
    setDiscipline(issue.discipline || "");
    setDueDate(issue.dueDate || "");
    setTags(issue.tags);
    if (issue.assignedToUserId) {
      setAssigneeMode("member");
      setAssignedToUserId(issue.assignedToUserId);
      setAssignedToName("");
    } else if (issue.assignedToName || issue.assignedTo) {
      setAssigneeMode("external");
      setAssignedToUserId("");
      setAssignedToName(issue.assignedToName || issue.assignedTo || "");
    } else {
      setAssigneeMode("none");
      setAssignedToUserId("");
      setAssignedToName("");
    }
    setExistingPhotos(issue.photos);
    setRemovedPhotoIds([]);
    setNewPhotoFiles([]);
  }, [issue]);

  const selectMemberMode = () => {
    setAssigneeMode("member");
    setAssignedToName("");
  };
  const selectExternalMode = () => {
    setAssigneeMode("external");
    setAssignedToUserId("");
  };
  const clearAssignee = () => {
    setAssigneeMode("none");
    setAssignedToUserId("");
    setAssignedToName("");
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const handleFilesSelected = (files: FileList) => {
    setNewPhotoFiles((prev) => [...prev, ...Array.from(files)]);
  };
  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  };
  const toggleRemoveExistingPhoto = (photoId: string) => {
    setRemovedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId],
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Le titre est requis.");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const payload = {
        projectId,
        visitId,
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        discipline: discipline || undefined,
        dueDate: dueDate || null,
        assignedTo: assigneeMode === "external" ? assignedToName.trim() : "",
        assignedToName: assigneeMode === "external" ? assignedToName.trim() : "",
        assignedToUserId: assigneeMode === "member" ? assignedToUserId || null : null,
        tags,
        location: location ? location.name || location.locationNumber : "",
        locationId: location?.id || null,
        photos: [] as Issue["photos"],
      };

      let savedIssue: Issue;
      if (issue) {
        const updated = await updateIssue(issue.id, payload);
        if (!updated) throw new Error("Cette déficience n'existe plus.");
        savedIssue = updated;
      } else {
        savedIssue = await createIssue(payload);
      }

      const { uploaded: uploadedRefs, queuedCount } = await uploadIssuePhotos(newPhotoFiles, {
        userId: user.id,
        projectId,
        visitId,
        locationId: location?.id,
      });

      // For a brand-new issue, existingPhotos only ever holds initialPhotos
      // (pre-selected already-uploaded photos) — those still need attaching
      // even if nothing else about photos changed in this save.
      const photosChanged =
        uploadedRefs.length > 0 || removedPhotoIds.length > 0 || (!issue && existingPhotos.length > 0);
      if (photosChanged) {
        const keptExisting = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id));
        const finalPhotos = [...keptExisting, ...uploadedRefs];
        const updated = await updateIssue(savedIssue.id, { photos: finalPhotos });
        if (updated) savedIssue = updated;
      }

      if (queuedCount > 0) {
        toast.info(
          "Photo mise en file d'attente — elle sera associée au projet et au local, mais devra être rattachée manuellement à la déficience une fois synchronisée.",
        );
      }
      toast.success(issue ? "Déficience modifiée" : "Déficience créée");
      onSaved(savedIssue);
    } catch (e: any) {
      toast.error((issue ? "Modification échouée : " : "Création échouée : ") + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const visiblePhotos = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id));

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className={labelClassName}>Titre *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Fissure dans le béton"
          className={inputClassName}
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelClassName}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Détails de la déficience..."
          rows={4}
          className={textareaClassName}
        />
      </div>

      {/* Priority */}
      <div>
        <label className={labelClassName}>Priorité</label>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITY_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`py-2.5 px-3 rounded-lg border-2 transition-all flex items-center gap-2 justify-center min-h-[44px] ${
                priority === p.value
                  ? "border-brand-600 bg-brand-600/10"
                  : "border-line hover:border-line-strong"
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${p.dot}`} />
              <span className="text-sm">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <label className={labelClassName}>Statut</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setStatus("open")}
            className={`py-2.5 px-3 rounded-lg border-2 transition-all text-sm min-h-[44px] ${
              status === "open"
                ? "border-brand-600 bg-brand-50 text-brand-strong"
                : "border-line hover:border-line-strong"
            }`}
          >
            Ouvert
          </button>
          <button
            type="button"
            onClick={() => setStatus("resolved")}
            className={`py-2.5 px-3 rounded-lg border-2 transition-all text-sm min-h-[44px] ${
              status === "resolved"
                ? "border-resolved bg-resolved/10 text-resolved"
                : "border-line hover:border-line-strong"
            }`}
          >
            Résolu
          </button>
        </div>
      </div>

      {/* Discipline */}
      <div>
        <label className={labelClassName}>Discipline</label>
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className={inputClassName}
        >
          <option value="">Non spécifiée</option>
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Due date */}
      <div>
        <label className={labelClassName}>Date d'échéance</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={inputClassName}
        />
      </div>

      {/* Assigned to */}
      <div>
        <label className={labelClassName}>Assigné à</label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={selectMemberMode}
            className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 text-sm min-h-[40px] ${
              assigneeMode === "member"
                ? "border-brand-600 bg-brand-600/10"
                : "border-line hover:border-line-strong"
            }`}
          >
            <Users size={14} />
            Membre du projet
          </button>
          <button
            type="button"
            onClick={selectExternalMode}
            className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 text-sm min-h-[40px] ${
              assigneeMode === "external"
                ? "border-brand-600 bg-brand-600/10"
                : "border-line hover:border-line-strong"
            }`}
          >
            <User size={14} />
            Externe
          </button>
        </div>
        {assigneeMode === "member" && (
          <select
            value={assignedToUserId}
            onChange={(e) => setAssignedToUserId(e.target.value)}
            className={inputClassName}
          >
            <option value="">Sélectionner un membre</option>
            {teammates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || t.email}
              </option>
            ))}
          </select>
        )}
        {assigneeMode === "external" && (
          <input
            type="text"
            value={assignedToName}
            onChange={(e) => setAssignedToName(e.target.value)}
            placeholder="Nom de l'entrepreneur externe"
            className={inputClassName}
          />
        )}
        {assigneeMode !== "none" && (
          <button
            type="button"
            onClick={clearAssignee}
            className="text-xs text-muted hover:text-brand-600 mt-1.5"
          >
            Retirer l'assignation
          </button>
        )}
      </div>

      {/* Location — read-only */}
      <div>
        <label className={labelClassName}>Emplacement</label>
        <div className="w-full px-4 py-3 bg-canvas border border-line rounded-lg text-sm text-body">
          {loadingLocation
            ? "Chargement…"
            : location
              ? `${location.locationNumber}${location.name ? ` — ${location.name}` : ""}`
              : "Aucun emplacement lié"}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className={labelClassName}>Étiquettes</label>
        <div className="flex gap-2 mb-2">
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
            placeholder="Ajouter une étiquette"
            className="flex-1 px-4 py-2.5 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent text-sm"
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 py-2.5 bg-subtle hover:bg-line rounded-lg text-sm font-medium min-h-[44px]"
          >
            Ajouter
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-subtle text-ink rounded-full text-xs"
              >
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`Retirer ${t}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Photos */}
      <div>
        <label className={labelClassName}>Photos</label>
        <PhotoCaptureButtons onFilesSelected={handleFilesSelected} disabled={saving} />
        {(visiblePhotos.length > 0 || newPhotoFiles.length > 0) && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {visiblePhotos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-lg overflow-hidden border border-line"
              >
                <SecureImage
                  storagePath={photo.storagePath}
                  alt="Photo de la déficience"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => toggleRemoveExistingPhoto(photo.id)}
                  disabled={saving}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                  aria-label="Retirer la photo"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {newPhotoFiles.map((file, index) => (
              <div
                key={index}
                className="relative aspect-square rounded-lg overflow-hidden border border-line"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Nouvelle photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveNewPhoto(index)}
                  disabled={saving}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                  aria-label="Retirer la photo"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-3 bg-subtle text-ink rounded-lg hover:bg-line disabled:opacity-50 font-medium min-h-[44px]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium min-h-[44px]"
        >
          {saving ? (isEdit ? "Enregistrement…" : "Création…") : isEdit ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </div>
  );
}
