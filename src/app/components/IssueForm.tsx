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

const PRIORITIES: { value: Issue["priority"]; label: string; dot: string }[] = [
  { value: "high", label: "Élevé", dot: "bg-orange-500" },
  { value: "medium", label: "Moyen", dot: "bg-blue-500" },
  { value: "low", label: "Faible", dot: "bg-gray-500" },
];

const DISCIPLINES = ["Architecture", "Structure", "Mécanique", "Électricité", "Plomberie"];

interface Props {
  projectId: string;
  visitId: string;
  // Present when created from a pin (LocationPinPanel's context) — read-only
  // here; the linked location is never editable from this form.
  locationId?: string | null;
  // When present, the form edits this issue; when absent, it creates a new one.
  issue?: Issue | null;
  onSaved: (issue: Issue) => void;
  onCancel: () => void;
}

type AssigneeMode = "none" | "member" | "external";

// Canonical create/edit form for issues (déficiences), reused by every issue
// surface (IssueDetail, IssueManagement, VisitDetail, LocationPinPanel — see
// Stage 3 of the consolidation plan). Photos reuse LocationPinPanel's
// capture/compress/upload/offline-queue flow, generalized to attach via
// photos.issue_id instead of a per-location payload.
export default function IssueForm({ projectId, visitId, locationId, issue, onSaved, onCancel }: Props) {
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
      setExistingPhotos([]);
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

      const photosChanged = uploadedRefs.length > 0 || removedPhotoIds.length > 0;
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
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Titre *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Fissure dans le béton"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Détails de la déficience..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent resize-none"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Priorité</label>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`py-2.5 px-3 rounded-lg border-2 transition-all flex items-center gap-2 justify-center min-h-[44px] ${
                priority === p.value
                  ? "border-[#E10600] bg-[#E10600]/10"
                  : "border-gray-200 hover:border-gray-300"
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
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Statut</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setStatus("open")}
            className={`py-2.5 px-3 rounded-lg border-2 transition-all text-sm min-h-[44px] ${
              status === "open"
                ? "border-red-500 bg-red-50 text-red-700"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            Ouvert
          </button>
          <button
            type="button"
            onClick={() => setStatus("resolved")}
            className={`py-2.5 px-3 rounded-lg border-2 transition-all text-sm min-h-[44px] ${
              status === "resolved"
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            Résolu
          </button>
        </div>
      </div>

      {/* Discipline */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Discipline</label>
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
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
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Date d'échéance</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
        />
      </div>

      {/* Assigned to */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Assigné à</label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={selectMemberMode}
            className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 text-sm min-h-[40px] ${
              assigneeMode === "member"
                ? "border-[#E10600] bg-[#E10600]/10"
                : "border-gray-200 hover:border-gray-300"
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
                ? "border-[#E10600] bg-[#E10600]/10"
                : "border-gray-200 hover:border-gray-300"
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
          />
        )}
        {assigneeMode !== "none" && (
          <button
            type="button"
            onClick={clearAssignee}
            className="text-xs text-gray-500 hover:text-[#E10600] mt-1.5"
          >
            Retirer l'assignation
          </button>
        )}
      </div>

      {/* Location — read-only */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Emplacement</label>
        <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          {loadingLocation
            ? "Chargement…"
            : location
              ? `${location.locationNumber}${location.name ? ` — ${location.name}` : ""}`
              : "Aucun emplacement lié"}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Étiquettes</label>
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
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent text-sm"
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium min-h-[44px]"
          >
            Ajouter
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-[#1A1A1A] rounded-full text-xs"
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
        <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Photos</label>
        <PhotoCaptureButtons onFilesSelected={handleFilesSelected} disabled={saving} />
        {(visiblePhotos.length > 0 || newPhotoFiles.length > 0) && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {visiblePhotos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
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
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
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
          className="flex-1 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium min-h-[44px]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 font-medium min-h-[44px]"
        >
          {saving ? (isEdit ? "Enregistrement…" : "Création…") : isEdit ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </div>
  );
}
