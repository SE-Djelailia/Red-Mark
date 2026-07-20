import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

// Same collapse pattern as ProjectDetail's "Détails du projet" — a tap
// target header with a chevron, content only mounted while open. Used to
// reclaim vertical space on screens with several secondary sections
// (VisitDetail) without losing any of the underlying content.
export default function CollapsibleSection({ title, icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] text-left"
      >
        <span className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
          {icon}
          {title}
        </span>
        {open ? (
          <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
