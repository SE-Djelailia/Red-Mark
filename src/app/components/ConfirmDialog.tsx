import { AlertTriangle } from "lucide-react";
import { useModalOpen } from "../../hooks/useModalOpen";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useModalOpen(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-xl max-w-sm w-full p-6 border border-line shadow-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              destructive ? "bg-open/10 text-open" : "bg-subtle text-ink"
            }`}
          >
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {description && (
              <p className="text-sm text-body mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-surface border border-line text-ink rounded-lg hover:bg-subtle transition-colors font-medium min-h-[44px]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-lg font-medium min-h-[44px] text-white transition-colors ${
              destructive ? "bg-brand-600 hover:bg-brand-700" : "bg-ink hover:bg-body"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
