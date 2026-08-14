import { useState } from "react";
import { FIRM_ROLES, OTHER_ROLE_LABEL, isKnownRole } from "../../../lib/roles";
import { inputClassName, selectClassName } from "./Input";

/**
 * Job-title picker: the canonical list plus an "Autre…" escape hatch.
 *
 * The stored value is always the plain string — a picked title and a typed one
 * are indistinguishable downstream, which is what lets `role` stay free text
 * in the database while the UI stays consistent.
 *
 * WHY THE MODE IS DERIVED RATHER THAN STORED
 *
 * These forms are pre-filled asynchronously (from a profile read, or from what
 * an admin typed on the invitation). A mode kept purely in state would be
 * computed once on mount and then be wrong when the value arrives. So "show
 * the free-text box" is derived from the value itself — a non-empty value that
 * is not in the list must be a custom one — with a local flag covering the one
 * case the value cannot express: the user has just chosen "Autre…" and has not
 * typed anything yet.
 */
export default function RolePicker({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (role: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const [otherSelected, setOtherSelected] = useState(false);
  const showOther = otherSelected || (value !== "" && !isKnownRole(value));

  return (
    <div className="space-y-2">
      <select
        id={id}
        required={required}
        disabled={disabled}
        value={showOther ? OTHER_ROLE_LABEL : value}
        onChange={(e) => {
          const picked = e.target.value;
          if (picked === OTHER_ROLE_LABEL) {
            setOtherSelected(true);
            onChange("");
          } else {
            setOtherSelected(false);
            onChange(picked);
          }
        }}
        className={selectClassName}
      >
        <option value="">Choisir un titre…</option>
        {FIRM_ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
        <option value={OTHER_ROLE_LABEL}>{OTHER_ROLE_LABEL}</option>
      </select>

      {showOther && (
        <input
          type="text"
          autoFocus={otherSelected}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Votre titre"
          aria-label="Titre personnalisé"
          className={inputClassName}
        />
      )}
    </div>
  );
}
