import { useEffect, useRef, useState } from "react";
import { X, Upload, FileImage } from "lucide-react";

interface Props {
  open: boolean;
  file: File | null;
  defaultName?: string;
  onCancel: () => void;
  onConfirm: (data: {
    name: string;
    level: string;
    description: string;
    file: File;
  }) => void;
  saving?: boolean;
}

export default function FloorPlanUploadModal({
  open,
  file,
  defaultName,
  onCancel,
  onConfirm,
  saving,
}: Props) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName || file?.name.replace(/\.[^.]+$/, "") || "");
    setLevel("");
    setDescription("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, file, defaultName]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open || !file) return null;

  const valid = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] overflow-y-auto"
      onClick={onCancel}
    >
      <div className="min-h-screen flex items-center justify-center py-8 px-4">
        <div
          className="bg-white rounded-xl w-full max-w-md shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
            <h2 className="text-xl text-[#1A1A1A] font-medium">
              Téléverser un plan
            </h2>
            <button
              onClick={onCancel}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Fermer"
            >
              <X size={22} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
              {preview ? (
                <img
                  src={preview}
                  alt="Aperçu du plan"
                  className="w-full h-40 object-contain"
                />
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-300">
                  <FileImage size={40} />
                </div>
              )}
              <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 truncate">
                {file.name} · {(file.size / 1024).toFixed(0)} Ko
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">
                Nom du plan *
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Niveau 1 — Aile Nord"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">
                Niveau / Étage
              </label>
              <input
                type="text"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Ex. RDC, Niveau 2, Sous-sol"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">
                Description (optionnel)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex. Plan tel que construit, révision 3"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 resize-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex gap-3 bg-white rounded-b-xl">
            <button
              onClick={onCancel}
              className="flex-1 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[48px]"
            >
              Annuler
            </button>
            <button
              onClick={() =>
                onConfirm({
                  name: name.trim(),
                  level: level.trim(),
                  description: description.trim(),
                  file,
                })
              }
              disabled={!valid || saving}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium min-h-[48px] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              {saving ? "Téléversement…" : "Téléverser"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
