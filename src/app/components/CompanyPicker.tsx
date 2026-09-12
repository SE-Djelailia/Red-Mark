// Picks a company for a lot, or creates one for the firm.
//
// This is the first surface in the app to expose `companies`, which is
// FIRM-SCOPED rather than project-scoped: a company created while editing one
// project's lots is immediately available to every project in the firm.
// That is the point of the table, and the copy says so, because a user who
// expects a per-project list would otherwise create "Plomberie ABC" five
// times.
//
// Two modes in one control, rather than a picker plus a separate "manage
// companies" screen: on site the company is named at the moment the lot is
// defined, and forcing a detour to a directory screen first is how the field
// ends up blank.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Plus, Search, X } from "lucide-react";
import {
  createCompany,
  getCompanies,
  normalizeCompanyName,
  type Company,
  type CompanyInput,
} from "../../lib/lotApi";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import XSpinner from "./ui-kit/XSpinner";

interface Props {
  /** Currently linked company, or null. */
  value: Company | null;
  onChange: (company: Company | null) => void;
  /** Read-only when the caller cannot edit lots. */
  disabled?: boolean;
}

export default function CompanyPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setCompanies(await getCompanies());
    } catch (e) {
      console.error("❌ Failed to load companies:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Loading is triggered by opening, not by mount: most lots never touch
    // the picker, and the firm's directory is not worth fetching for them.
    if (!open || companies.length > 0 || loadError) return;

    let cancelled = false;
    void (async () => {
      // Inside the callback, not the effect body — see LotTab.
      setLoading(true);
      try {
        const rows = await getCompanies();
        if (!cancelled) setCompanies(rows);
      } catch (e) {
        console.error("❌ Failed to load companies:", e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.trade ?? "").toLowerCase().includes(q) ||
        (c.contactName ?? "").toLowerCase().includes(q),
    );
  }, [companies, query]);

  // An exact name match means "create" would collide with the firm's unique
  // index, so the create affordance is suppressed and the existing row is
  // offered instead.
  const normalized = normalizeCompanyName(query);
  const exactExists = companies.some(
    (c) => c.name.trim().toLowerCase() === normalized.toLowerCase(),
  );
  const canOfferCreate = normalized.length > 0 && !exactExists;

  if (creating) {
    return (
      <CompanyForm
        initialName={normalized}
        onCancel={() => setCreating(false)}
        onCreated={(c) => {
          setCompanies((prev) =>
            [...prev, c].sort((a, b) => a.name.localeCompare(b.name, "fr")),
          );
          onChange(c);
          setCreating(false);
          setOpen(false);
          setQuery("");
        }}
      />
    );
  }

  return (
    <div>
      <label className={labelClassName}>Entreprise</label>

      {/* The resting control: shows the linked company, or invites one. */}
      {!open && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="flex-1 min-w-0 min-h-[44px] px-3 rounded-[4px] border border-line-strong bg-surface text-left flex items-center justify-between gap-2 hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast)"
          >
            {value ? (
              <span className="min-w-0">
                <span className="block text-sm text-ink truncate">{value.name}</span>
                {(value.trade || value.contactName) && (
                  <span className="block text-xs text-muted truncate">
                    {[value.trade, value.contactName].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm text-muted">Aucune entreprise</span>
            )}
            <Search size={16} className="text-muted flex-shrink-0" />
          </button>

          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Retirer l'entreprise"
              className="min-h-[44px] px-3 rounded-[4px] border border-line text-muted hover:text-ink hover:border-line-strong transition-colors duration-(--duration-fast)"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* The open picker. Inline rather than a nested modal: this control is
          already inside the lot editor, and stacking a second overlay on a
          phone leaves no way back that reads as obvious. */}
      {open && (
        <div
          ref={panelRef}
          className="border border-line-strong rounded-[4px] bg-surface overflow-hidden rm-fade"
        >
          <div className="p-2 border-b border-line flex items-center gap-2">
            <Search size={16} className="text-muted flex-shrink-0 ml-1" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une entreprise…"
              className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none min-h-[36px]"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              aria-label="Fermer"
              className="text-muted hover:text-ink transition-colors duration-(--duration-fast) px-1 min-h-[36px]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="py-6 flex justify-center">
                <XSpinner size={24} />
              </div>
            ) : loadError ? (
              <div className="p-4 text-center">
                <p className="text-sm text-muted mb-2">
                  Impossible de charger les entreprises.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="text-sm font-medium text-ink underline underline-offset-2"
                >
                  Réessayer
                </button>
              </div>
            ) : (
              <>
                {filtered.map((c) => {
                  const selected = value?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`w-full text-left px-3 py-2.5 border-b border-line min-h-[44px] flex items-center gap-2 transition-colors ${
                        selected ? "bg-subtle" : "hover:bg-subtle"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink truncate">{c.name}</span>
                        {(c.trade || c.contactName) && (
                          <span className="block text-xs text-muted truncate">
                            {[c.trade, c.contactName].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      {selected && <Check size={16} className="text-ink flex-shrink-0" />}
                    </button>
                  );
                })}

                {filtered.length === 0 && !canOfferCreate && (
                  <p className="px-3 py-6 text-sm text-muted text-center">
                    {companies.length === 0
                      ? "Aucune entreprise dans votre firme."
                      : "Aucun résultat."}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Create. Ink outline, not a red fill — the lot editor's primary
              action is its own save button, and a second red here would put
              two on one sheet. */}
          {!loading && !loadError && (
            <div className="p-2 border-t border-line">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full min-h-[44px] px-3 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle transition-colors duration-(--duration-fast) flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                {canOfferCreate ? `Créer « ${normalized} »` : "Nouvelle entreprise"}
              </button>
              <p className="text-xs text-muted mt-2 text-center text-pretty">
                Les entreprises sont partagées par toute la firme et réutilisables
                d'un projet à l'autre.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The create form. Mirrors the columns on `companies`, nothing more. */
function CompanyForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (c: Company) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CompanyInput>({
    name: initialName,
    contactName: "",
    address: "",
    phone: "",
    email: "",
    trade: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof CompanyInput, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!normalizeCompanyName(form.name)) {
      toast.error("Le nom de l'entreprise est requis.");
      return;
    }
    setSaving(true);
    try {
      onCreated(await createCompany(form));
      toast.success("Entreprise créée.");
    } catch (e) {
      console.error("❌ Failed to create company:", e);
      // The firm-scoped unique index is the likeliest failure, and "already
      // exists" is far more actionable than the raw constraint name.
      const msg = String((e as { message?: string })?.message ?? "");
      toast.error(
        msg.includes("companies_org_name_key") || msg.includes("duplicate")
          ? "Une entreprise portant ce nom existe déjà dans votre firme."
          : "Impossible de créer l'entreprise.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-line-strong rounded-[4px] bg-surface p-3 rm-fade">
      <p className="rm-label mb-3">Nouvelle entreprise</p>

      <div className="space-y-3">
        <div>
          <label className={labelClassName}>Nom *</label>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClassName}
            placeholder="Ex : Construction ABC"
          />
        </div>

        {/* Two columns from sm — these are short paired fields, and stacking
            them all wastes the width even on a phone in landscape. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClassName}>Corps de métier</label>
            <input
              value={form.trade ?? ""}
              onChange={(e) => set("trade", e.target.value)}
              className={inputClassName}
              placeholder="Ex : Plomberie"
            />
          </div>
          <div>
            <label className={labelClassName}>Personne-ressource</label>
            <input
              value={form.contactName ?? ""}
              onChange={(e) => set("contactName", e.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Téléphone</label>
            <input
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Courriel</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              className={inputClassName}
            />
          </div>
        </div>

        <div>
          <label className={labelClassName}>Adresse</label>
          <input
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 min-h-[44px] px-4 rounded-[4px] border border-line-strong text-ink text-sm font-medium hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast)"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 min-h-[44px] px-4 rounded-[4px] border border-ink bg-ink text-white text-sm font-semibold hover:bg-ink/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast) flex items-center justify-center gap-2"
        >
          {saving && <XSpinner size={16} tone="current" />}
          Créer
        </button>
      </div>
    </div>
  );
}
