import { useEffect, useState, useRef } from "react";
import {
  X,
  Plus,
  Link2,
  ChevronLeft,
  Search,
  AlertCircle,
  Camera,
  ImagePlus,
  Images,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createIssue,
  getIssuesByProject,
  updateIssue,
  getIssueErrorMessage,
} from "../../lib/issuesApi";
import { ISSUE_TRADES } from "./IssueCreation";
import { saveIssueExtras, updatePin } from "../../lib/floorPlansApi";
import type { FloorPlanPin } from "../../lib/floorPlansApi";
import { getSiteVisits, getPhotos } from "../../lib/supabaseApi";
import { notifyProjectOwner } from "../../lib/notificationsApi";
import { supabase } from "../../lib/supabase";
import { compressImage } from "../../lib/imageCompression";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";

type Severity = "minor" | "moderate" | "major" | "critical";

interface Props {
  open: boolean;
  pin: FloorPlanPin | null;
  projectId: string;
  floorPlanId: string;
  onClose: () => void;
  onLinked: (
    pin: FloorPlanPin,
    issue: { id: string; title: string; priority: string; status: string },
  ) => void;
}

export default function PinIssueDialog({
  open,
  pin,
  projectId,
  floorPlanId,
  onClose,
  onLinked,
}: Props) {
  const { user } = useAuth();
  useModalOpen(open && !!pin);
  const [mode, setMode] = useState<"choose" | "create" | "link">("choose");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [trade, setTrade] = useState<string>("Architecture");
  const [severity, setSeverity] = useState<Severity>("moderate");
  const [saving, setSaving] = useState(false);

  const [issues, setIssues] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loadingIssues, setLoadingIssues] = useState(false);

  const [visits, setVisits] = useState<{ id: string; visit_date: string; phase?: string }[]>([]);
  const [visitId, setVisitId] = useState<string>("");

  // Photo state
  const [selectedPhotos, setSelectedPhotos] = useState<
    { id: string; url: string; preview?: string }[]
  >([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<
    { id: string; url: string; storage_path: string }[]
  >([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setTitle("");
    setDescription("");
    setTrade("Architecture");
    setSeverity("moderate");
    setFilter("");
    setVisitId("");
    setSelectedPhotos([]);
    setShowGallery(false);
  }, [open, pin?.id]);

  // Load project gallery when showGallery opens
  useEffect(() => {
    if (!showGallery || !projectId) return;
    let cancelled = false;
    (async () => {
      setLoadingGallery(true);
      try {
        // Get all visits then all photos for the project
        const visitList = await getSiteVisits(projectId);
        const allPhotos: any[] = [];
        for (const v of visitList) {
          const photos = await getPhotos(v.id);
          allPhotos.push(...photos);
        }
        if (!cancelled) {
          // Get signed URLs
          const withUrls = await Promise.all(
            allPhotos.slice(0, 30).map(async (p) => {
              try {
                const { data } = await supabase.storage
                  .from("project-photos")
                  .createSignedUrl(p.storage_path, 3600);
                return { id: p.id, url: data?.signedUrl ?? "", storage_path: p.storage_path };
              } catch {
                return { id: p.id, url: "", storage_path: p.storage_path };
              }
            }),
          );
          setGalleryPhotos(withUrls.filter((p) => p.url));
        }
      } catch (e) {
        console.error("Gallery load error", e);
      } finally {
        if (!cancelled) setLoadingGallery(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showGallery, projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getSiteVisits(projectId);
        if (!cancelled) setVisits(list as any);
      } catch (e) {
        console.error("Could not load visits for pin dialog", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  useEffect(() => {
    if (mode !== "link" || !projectId) return;
    let cancelled = false;
    (async () => {
      setLoadingIssues(true);
      try {
        const list = await getIssuesByProject(projectId);
        if (!cancelled) setIssues(list);
      } catch {
        if (!cancelled) toast.error("Impossible de charger les déficiences");
      } finally {
        if (!cancelled) setLoadingIssues(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, projectId]);

  if (!open || !pin) return null;

  const severityToPriority = (s: Severity): "low" | "medium" | "high" | "critical" => {
    if (s === "minor") return "low";
    if (s === "moderate") return "medium";
    if (s === "major") return "high";
    return "critical";
  };

  async function handlePhotoFiles(files: FileList | null) {
    if (!files || !user?.id) return;
    setUploadingPhoto(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const compressed = await compressImage(file);
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${projectId}/issues/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("project-photos").upload(path, compressed);
        if (error) throw error;
        const { data } = await supabase.storage
          .from("project-photos")
          .createSignedUrl(path, 3600 * 24 * 30);
        if (data?.signedUrl) {
          setSelectedPhotos((prev) => [
            ...prev,
            { id: path, url: data.signedUrl, preview: URL.createObjectURL(file) },
          ]);
        }
      }
    } catch (e: any) {
      toast.error("Erreur lors de l'ajout de la photo : " + e.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function toggleGalleryPhoto(photo: { id: string; url: string; storage_path: string }) {
    setSelectedPhotos((prev) => {
      const exists = prev.find((p) => p.id === photo.id);
      if (exists) return prev.filter((p) => p.id !== photo.id);
      return [...prev, { id: photo.id, url: photo.url }];
    });
  }

  async function linkPinToIssue(issueId: string, issuePreview: any) {
    if (!pin) return;
    const updated = await updatePin(pin.id, { issue_id: issueId });
    await saveIssueExtras(issueId, {
      trade: issuePreview.trade,
      severity: issuePreview.severity,
      floor_plan_id: floorPlanId,
      pin_id: pin.id,
    });
    onLinked(updated, {
      id: issueId,
      title: issuePreview.title,
      priority: issuePreview.priority,
      status: issuePreview.status,
    });
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    setSaving(true);
    try {
      const priority = severityToPriority(severity);
      const issue = await createIssue({
        visitId: visitId || "",
        projectId,
        title: title.trim(),
        description: description.trim(),
        priority,
        status: "open",
        assignedTo: "",
        photos: selectedPhotos.map((p) => ({ id: p.id, url: p.url })),
        tags: [trade],
        location: "",
      });
      await linkPinToIssue(issue.id, {
        title: issue.title,
        priority: issue.priority,
        status: issue.status,
        trade,
        severity,
      });
      toast.success("Déficience créée et liée au pin");

      if (user) {
        const actorName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
        notifyProjectOwner({
          projectId,
          actorId: user.id,
          actorName,
          type: "issue_created",
          message: "a créé une nouvelle déficience",
          issueId: issue.id,
          visitId: visitId || undefined,
        });
      }
    } catch (e: any) {
      toast.error("Création échouée : " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async (issue: any) => {
    setSaving(true);
    try {
      if (visitId && issue.visitId !== visitId) {
        await updateIssue(issue.id, { visitId });
      }
      await linkPinToIssue(issue.id, {
        title: issue.title,
        priority: issue.priority,
        status: issue.status,
        trade: issue.tags?.[0] || "",
        severity: "moderate",
      });
      toast.success("Pin lié à la déficience existante");
    } catch (e) {
      console.error("Error linking pin to issue:", e);
      toast.error(getIssueErrorMessage(e, "Liaison échouée."));
    } finally {
      setSaving(false);
    }
  };

  const filtered = issues.filter((i) =>
    (i.title || "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[55] overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen flex items-end sm:items-center justify-center sm:py-8 px-0 sm:px-4">
        <div
          className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            {mode !== "choose" && (
              <button
                onClick={() => setMode("choose")}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full -ml-2"
                aria-label="Retour"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            <h2 className="flex-1 text-xl text-[#1A1A1A] font-medium">
              {mode === "choose" && "Lier le pin"}
              {mode === "create" && "Nouvelle déficience"}
              {mode === "link" && "Lier à une déficience"}
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full"
              aria-label="Fermer"
            >
              <X size={22} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {mode === "choose" && (
              <>
                <p className="text-sm text-gray-600">
                  Pin enregistré à {(pin.x * 100).toFixed(1)}%, {(pin.y * 100).toFixed(1)}%. Que
                  souhaitez-vous faire ?
                </p>
                <button
                  onClick={() => setMode("create")}
                  className="w-full p-4 bg-white border-2 border-[#E10600] rounded-xl flex items-center gap-3 hover:bg-[#E10600]/5 transition-colors text-left min-h-[64px]"
                >
                  <div className="w-10 h-10 rounded-full bg-[#E10600] text-white flex items-center justify-center flex-shrink-0">
                    <Plus size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A]">Créer une déficience</div>
                    <div className="text-xs text-gray-500">Nouvelle déficience liée à ce pin</div>
                  </div>
                </button>
                <button
                  onClick={() => setMode("link")}
                  className="w-full p-4 bg-white border-2 border-gray-200 rounded-xl flex items-center gap-3 hover:border-[#E10600] transition-colors text-left min-h-[64px]"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 text-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                    <Link2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A]">
                      Lier à une déficience existante
                    </div>
                    <div className="text-xs text-gray-500">
                      Choisir parmi les déficiences du projet
                    </div>
                  </div>
                </button>
              </>
            )}

            {mode === "create" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">Titre *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex. Fissure dalle béton"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Décrire la déficience…"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">Discipline *</label>
                  <select
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                  >
                    {ISSUE_TRADES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">Sévérité *</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { v: "minor", l: "Mineure" },
                        { v: "moderate", l: "Modérée" },
                        { v: "major", l: "Majeure" },
                        { v: "critical", l: "Critique" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setSeverity(opt.v)}
                        className={`py-2 rounded-lg text-sm transition-all min-h-[44px] border ${
                          severity === opt.v
                            ? "bg-[#E10600] text-white border-[#E10600]"
                            : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">
                    Visite associée (optionnel)
                  </label>
                  <select
                    value={visitId}
                    onChange={(e) => setVisitId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                  >
                    <option value="">— Aucune (projet uniquement) —</option>
                    {visits.map((v) => (
                      <option key={v.id} value={v.id}>
                        {new Date(v.visit_date).toLocaleDateString("fr-CA")}
                        {v.phase ? ` · ${v.phase}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    La déficience apparaîtra dans cette visite ainsi que sur le plan.
                  </p>
                </div>
                {/* Photos */}
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">Photos</label>

                  {/* Selected photos preview */}
                  {selectedPhotos.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-3">
                      {selectedPhotos.map((p) => (
                        <div
                          key={p.id}
                          className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200"
                        >
                          <img
                            src={p.preview ?? p.url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPhotos((prev) => prev.filter((x) => x.id !== p.id))
                            }
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {/* Galerie / fichier */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      <ImagePlus size={16} />
                      <span>Fichier</span>
                    </button>
                    {/* Caméra */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      <Camera size={16} />
                      <span>Caméra</span>
                    </button>
                    {/* Galerie du projet */}
                    <button
                      type="button"
                      onClick={() => setShowGallery(true)}
                      disabled={uploadingPhoto}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      <Images size={16} />
                      <span>Galerie</span>
                    </button>
                  </div>

                  {uploadingPhoto && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <Loader2 size={12} className="animate-spin" />
                      Téléversement en cours…
                    </div>
                  )}

                  {/* Hidden file inputs */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoFiles(e.target.files)}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoFiles(e.target.files)}
                  />
                </div>
              </div>
            )}

            {mode === "link" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-[#1A1A1A] mb-2">
                    Visite associée (optionnel)
                  </label>
                  <select
                    value={visitId}
                    onChange={(e) => setVisitId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                  >
                    <option value="">— Garder la visite actuelle de la déficience —</option>
                    {visits.map((v) => (
                      <option key={v.id} value={v.id}>
                        {new Date(v.visit_date).toLocaleDateString("fr-CA")}
                        {v.phase ? ` · ${v.phase}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Rechercher une déficience…"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                  />
                </div>
                {loadingIssues ? (
                  <div className="text-sm text-gray-500 text-center py-6">Chargement…</div>
                ) : filtered.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <AlertCircle size={28} className="mx-auto text-gray-300 mb-2" />
                    <div className="text-sm text-gray-600">Aucune déficience trouvée</div>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {filtered.map((iss) => (
                      <li key={iss.id}>
                        <button
                          onClick={() => handleLink(iss)}
                          disabled={saving}
                          className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:border-[#E10600] transition-colors text-left min-h-[64px] disabled:opacity-50"
                        >
                          <div className="text-sm font-medium text-[#1A1A1A] truncate">
                            {iss.title}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                iss.priority === "critical"
                                  ? "bg-red-100 text-red-700"
                                  : iss.priority === "high"
                                    ? "bg-orange-100 text-orange-700"
                                    : iss.priority === "medium"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {iss.priority}
                            </span>
                            <span>{iss.status}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {mode === "create" && (
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 bg-white rounded-b-xl">
              <button
                onClick={() => setMode("choose")}
                className="flex-1 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[48px]"
              >
                Retour
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !title.trim()}
                className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium min-h-[48px] disabled:opacity-50"
              >
                {saving ? "Création…" : "Créer et lier"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Gallery modal */}
      {showGallery && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGallery(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-medium text-[#1A1A1A]">Photos du projet</h3>
              <button
                onClick={() => setShowGallery(false)}
                className="w-11 h-11 flex items-center justify-center hover:bg-gray-100 rounded-full"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingGallery ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Chargement des photos…</span>
                </div>
              ) : galleryPhotos.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  Aucune photo dans ce projet
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {galleryPhotos.map((photo) => {
                    const isSelected = selectedPhotos.some((p) => p.id === photo.id);
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => toggleGalleryPhoto(photo)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${isSelected ? "border-[#E10600] ring-2 ring-[#E10600]/30" : "border-transparent"}`}
                      >
                        <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#E10600]/20 flex items-center justify-center">
                            <div className="w-7 h-7 bg-[#E10600] rounded-full flex items-center justify-center">
                              <X size={14} className="text-white rotate-45" />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setShowGallery(false)}
                className="w-full py-3 bg-[#E10600] text-white rounded-lg font-medium hover:bg-[#C00500] transition-colors"
              >
                Confirmer ({selectedPhotos.length} photo{selectedPhotos.length !== 1 ? "s" : ""})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
