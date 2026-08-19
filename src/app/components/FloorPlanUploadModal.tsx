import { useEffect, useRef, useState } from "react";
import { X, Upload, FileImage } from "lucide-react";
import { useModalOpen } from "../../hooks/useModalOpen";

interface Props {
  open: boolean;
  file: File | null;
  defaultName?: string;
  onCancel: () => void;
  onConfirm: (data: { name: string; level: string; description: string; file: File }) => void;
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
  useModalOpen(open && !!file);
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
    <div className="fixed inset-0 bg-black/50 z-[60] overflow-y-auto" onClick={onCancel}>
      <div className="min-h-screen flex items-center justify-center py-8 pb-20 px-4 safe-area-bottom">
        <div
          className="bg-surface rounded-[4px] w-full max-w-md shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="px-6 py-4 border-b border-line flex items-center justify-between rounded-t-xl">
            <h2 className="text-xl text-ink font-medium">Téléverser un plan</h2>
            <button
              onClick={onCancel}
              className="w-10 h-10 flex items-center justify-center hover:bg-subtle rounded-full transition-colors"
              aria-label="Fermer"
            >
              <X size={22} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="rounded-[4px] border border-line overflow-hidden bg-canvas">
              {preview ? (
                <img src={preview} alt="Aperçu du plan" className="w-full h-40 object-contain" />
              ) : (
                <div className="h-40 flex items-center justify-center text-faint">
                  <FileImage size={40} />
                </div>
              )}
              <div className="px-3 py-2 text-xs text-muted border-t border-line truncate">
                {file.name} · {(file.size / 1024).toFixed(0)} Ko
              </div>
            </div>

            <div>
              <label className="block text-sm text-ink mb-2">Nom du plan *</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Niveau 1 — Aile Nord"
                className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm text-ink mb-2">Niveau / Étage</label>
              <input
                type="text"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Ex. RDC, Niveau 2, Sous-sol"
                className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm text-ink mb-2">Description (optionnel)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex. Plan tel que construit, révision 3"
                className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 resize-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-line flex gap-3 bg-surface rounded-b-xl">
            <button
              onClick={onCancel}
              className="flex-1 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors font-medium min-h-[48px]"
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
              className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors font-medium min-h-[48px] disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
