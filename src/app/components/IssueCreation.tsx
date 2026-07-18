import { useState } from "react";
import {
  X,
  User,
  Calendar,
  AlertCircle,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { getTodayForInput } from "../../lib/dateUtils";
import { useModalOpen } from "../../hooks/useModalOpen";

export interface Issue {
  id: string;
  title: string;
  description: string;
  photoUrl?: string;
  photoId?: string;
  status: "open" | "in_progress" | "resolved" | "verified";
  priority: "low" | "medium" | "high" | "critical";
  assignedTo: string;
  assignedToEmail: string;
  createdBy: string;
  createdAt: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  phase: string;
  room: string;
  tags: string[];
  comments: {
    id: string;
    author: string;
    text: string;
    timestamp: string;
  }[];
  resolutionPhoto?: string;
  trade?: string;
  severity?: "minor" | "moderate" | "major" | "critical";
  relatedPhotoIds?: string[];
  floorPlanId?: string | null;
  pinId?: string | null;
}

export const ISSUE_TRADES = [
  "Architecture",
  "Structure",
  "Mécanique",
  "Électrique",
  "Plomberie",
  "Ventilation",
  "Civil",
  "Enveloppe du bâtiment",
  "Finition",
  "Sécurité",
  "Autre",
] as const;

interface IssueCreationProps {
  photoUrl?: string;
  photoId?: string;
  projectId?: string;
  projectName?: string;
  phase?: string;
  room?: string;
  defaultTags?: string[];
  onClose: () => void;
  onSave: (issue: Issue) => void;
}

export default function IssueCreation({
  photoUrl,
  photoId,
  projectId = "1",
  projectName = "CHUM - Centre hospitalier de l'Université de Montréal",
  phase = "Fondation",
  room = "",
  defaultTags = [],
  onClose,
  onSave,
}: IssueCreationProps) {
  useModalOpen();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Issue["priority"]>("medium");
  const [assignedTo, setAssignedTo] = useState("Pierre Lafontaine");
  const [assignedToEmail, setAssignedToEmail] = useState("p.lafontaine@pomerleau.ca");
  const [dueDate, setDueDate] = useState(getTodayForInput());
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultTags);
  const [trade, setTrade] = useState<string>("Architecture");
  const [severity, setSeverity] = useState<"minor" | "moderate" | "major" | "critical">("moderate");

  const teamMembers = [
    { name: "Pierre Lafontaine", email: "p.lafontaine@pomerleau.ca", role: "Entrepreneur général" },
    { name: "Marie-Claude Bouchard", email: "mc.bouchard@jlp.ca", role: "Architecte" },
    { name: "François Dubois", email: "f.dubois@ingenieur.ca", role: "Ingénieur structure" },
    { name: "Sophie Martin", email: "s.martin@eme.ca", role: "ÉMÉ" },
    { name: "Jean-François Tremblay", email: "jf.tremblay@jlp.ca", role: "Architecte principal" },
  ];

  const availableTags = [
    "Problème ÉMÉ",
    "Déficience",
    "À corriger",
    "Non-conformité",
    "Équipement",
    "Sécurité",
    "Structure",
    "Finition",
    "Urgent",
  ];

  const priorityColors = {
    low: "bg-gray-500",
    medium: "bg-blue-500",
    high: "bg-orange-500",
    critical: "bg-red-600",
  };

  const priorityLabels = {
    low: "Faible",
    medium: "Moyenne",
    high: "Élevée",
    critical: "Critique",
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newIssue: Issue = {
      id: Date.now().toString(),
      title,
      description,
      photoUrl,
      photoId,
      status: "open",
      priority,
      assignedTo,
      assignedToEmail,
      createdBy: "Jean-François Tremblay",
      createdAt: new Date().toISOString(),
      dueDate,
      projectId,
      projectName,
      phase,
      room,
      tags: selectedTags,
      comments: [],
      trade,
      severity,
      relatedPhotoIds: photoId ? [photoId] : [],
    };

    onSave(newIssue);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
        <div className="bg-white rounded-xl max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
          {/* Header - Sticky */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
            <h2 className="text-xl text-[#1A1A1A] font-medium">Créer une déficience</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Form - Scrollable */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Photo Preview */}
            {photoUrl && (
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <img src={photoUrl} alt="Photo de référence" className="w-full h-48 object-cover" />
              </div>
            )}

            {/* Project Info */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Projet:</span>
                <span className="text-[#1A1A1A] font-medium">{projectName}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Phase:</span>
                  <span className="px-2 py-0.5 bg-[#E10600] text-white rounded text-xs">
                    {phase}
                  </span>
                </div>
                {room && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Emplacement:</span>
                    <span className="text-[#1A1A1A]">{room}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Titre de la déficience *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Fissure dans la dalle de béton"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Description détaillée *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez le problème en détail..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 resize-none"
                rows={4}
                required
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Priorité *</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["low", "medium", "high", "critical"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-3 px-4 rounded-lg border-2 transition-all ${
                      priority === p
                        ? "border-[#E10600] bg-[#E10600]/10"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${priorityColors[p]}`} />
                      <span className="text-sm">{priorityLabels[p]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Trade / Discipline */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Discipline *</label>
              <select
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                required
              >
                {ISSUE_TRADES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity */}
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

            {/* Assigned To */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Assigner à *</label>
              <select
                value={assignedTo}
                onChange={(e) => {
                  const member = teamMembers.find((m) => m.name === e.target.value);
                  setAssignedTo(e.target.value);
                  if (member) setAssignedToEmail(member.email);
                }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                required
              >
                {teamMembers.map((member) => (
                  <option key={member.email} value={member.name}>
                    {member.name} - {member.role}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Date d'échéance *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                required
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Catégories</label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all min-h-[44px] ${
                      selectedTags.includes(tag)
                        ? "bg-[#E10600] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* Footer - Sticky */}
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3 bg-white rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[48px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium min-h-[48px]"
            >
              Créer la déficience
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
