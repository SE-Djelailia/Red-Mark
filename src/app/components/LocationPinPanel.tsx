import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { X, MapPin, Plus, Camera as CameraIcon } from "lucide-react";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useAuth } from "../../contexts/useAuth";
import type { Location } from "../../lib/locationsApi";
import { createIssue, updateIssue, getIssuesByLocation, type Issue } from "../../lib/issuesApi";
import { uploadPhoto } from "../../lib/supabaseApi";
import { addToQueue } from "../../lib/uploadQueue";
import { compressImage } from "../../lib/imageCompression";
import PhotoCaptureButtons from "./PhotoCaptureButtons";

const PRIORITIES: { value: Issue["priority"]; label: string; dot: string }[] = [
  { value: "low", label: "Faible", dot: "bg-gray-500" },
  { value: "medium", label: "Moyenne", dot: "bg-blue-500" },
  { value: "high", label: "Élevée", dot: "bg-orange-500" },
  { value: "critical", label: "Critique", dot: "bg-red-600" },
];

const STATUS_LABEL: Record<Issue["status"], string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Résolue",
};

// Network failures surface as TypeError (fetch's own error type) rather than the
// PostgrestError/StorageError objects Supabase throws for validation/permission
// failures — same check used by PhotoUploadPage.tsx.
function isNetworkError(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}

interface Props {
  open: boolean;
  projectId: string;
  // Present only when the plan was opened from within an active visit (see
  // PlanFileViewer.tsx). Issues (and their photos) created from this panel
  // are linked to it — without one, issue-creation is disabled below rather
  // than creating a visit-less issue, since every other issue-creation flow
  // in this app is visit-scoped.
  visitId?: string;
  location: Location | null;
  onClose: () => void;
}

// Shown when the user taps an existing pin on a plan: location metadata, a
// flat list of issues already attached to this location (title/status/date
// — deliberately not the interwoven timeline view, which stays deferred),
// and a minimal quick-create form (title/description/priority/photos) that
// creates a new issue with issues.location_id set to this location.
export default function LocationPinPanel({ open, projectId, visitId, location, onClose }: Props) {
  useModalOpen(open);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Issue["priority"]>("medium");
  const [photos, setPhotos] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !location) return;
    setShowCreateForm(false);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setPhotos([]);
    setLoadingIssues(true);
    getIssuesByLocation(location.id)
      .then(setIssues)
      .finally(() => setLoadingIssues(false));
  }, [open, location]);

  if (!open || !location) return null;

  const handleFilesSelected = (files: FileList) => {
    setPhotos((prev) => [...prev, ...Array.from(files)]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Le titre est requis.");
      return;
    }
    if (!visitId || !user) return; // button is disabled in this state, guard for safety

    setCreating(true);
    try {
      // Issue first — nothing photo-related is orphaned if this step fails
      // or the user backs out beforehand.
      const issue = await createIssue({
        visitId,
        projectId,
        title: title.trim(),
        description: description.trim(),
        priority,
        status: "open",
        photos: [],
        tags: [],
        location: location.name || location.locationNumber,
        locationId: location.id,
      });

      let queuedCount = 0;
      const uploadedRefs: { id: string; url: string }[] = [];
      for (const file of photos) {
        try {
          const compressed = await compressImage(file);
          try {
            const photo = await uploadPhoto(compressed, user.id, projectId, visitId, {
              locationId: location.id,
            });
            uploadedRefs.push({ id: photo.id, url: photo.file_url });
          } catch (uploadError) {
            if (!isNetworkError(uploadError)) throw uploadError;
            await addToQueue({
              file: compressed,
              userId: user.id,
              projectId,
              visitId,
              tags: [],
              locationId: location.id,
            });
            queuedCount++;
          }
        } catch (e: any) {
          toast.error(`Échec de l'envoi d'une photo : ${e.message || e}`);
        }
      }

      if (uploadedRefs.length > 0) {
        await updateIssue(issue.id, { photos: uploadedRefs });
      }
      if (queuedCount > 0) {
        toast.info(
          "Photo mise en file d'attente — elle sera associée au projet et au local, mais devra être rattachée manuellement à la déficience une fois synchronisée.",
        );
      }

      toast.success("Déficience créée");
      navigate(`/app/projects/${projectId}/issues/${issue.id}`);
    } catch (e: any) {
      toast.error("Création échouée : " + e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-medium text-[#1A1A1A] truncate">
                {location.locationNumber}
                {location.name ? ` — ${location.name}` : ""}
              </div>
              {location.discipline && (
                <div className="text-xs text-gray-500 truncate">{location.discipline}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-[#1A1A1A] rounded-lg flex-shrink-0"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <h4 className="text-sm font-medium text-[#1A1A1A] mb-2">
              Déficiences ({loadingIssues ? "…" : issues.length})
            </h4>
            {loadingIssues ? (
              <div className="text-sm text-gray-500">Chargement…</div>
            ) : issues.length === 0 ? (
              <div className="text-sm text-gray-500">Aucune déficience à ce local pour le moment.</div>
            ) : (
              <div className="space-y-1.5">
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => navigate(`/app/projects/${projectId}/issues/${issue.id}`)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#E10600] hover:bg-gray-50 min-h-[44px]"
                  >
                    <div className="text-sm text-[#1A1A1A] font-medium truncate">{issue.title}</div>
                    <div className="text-xs text-gray-500">
                      {STATUS_LABEL[issue.status]} · {issue.createdDate}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!visitId ? (
            <div className="text-sm text-gray-500 border-t border-gray-200 pt-4">
              Ouvrez ce plan depuis une visite pour créer une déficience.
            </div>
          ) : !showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-[#1A1A1A] hover:border-[#E10600] hover:text-[#E10600] min-h-[44px]"
            >
              <Plus size={16} />
              Créer une déficience
            </button>
          ) : (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Titre</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                />
              </div>
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Priorité</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`py-2.5 px-3 rounded-lg border-2 transition-all flex items-center gap-2 justify-center ${
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
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Photos</label>
                <PhotoCaptureButtons onFilesSelected={handleFilesSelected} disabled={creating} />
                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {photos.map((file, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          disabled={creating}
                          className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                          aria-label="Retirer la photo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                    <CameraIcon size={12} />
                    Facultatif — vous pouvez aussi ajouter des photos plus tard depuis la fiche
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                  className="flex-1 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 font-medium min-h-[44px]"
                >
                  {creating ? "Création…" : "Créer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
