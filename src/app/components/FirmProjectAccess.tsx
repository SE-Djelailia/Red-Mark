import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "./ui-kit/Card";
import { selectClassName } from "./ui-kit/Input";
import Button from "./ui-kit/Button";
import type { FirmMember } from "../../hooks/useFirm";
import {
  assignToProject,
  describeProjectAccessError,
  listFirmProjects,
  listProjectAssignments,
  PROJECT_ROLE_LABEL,
  setProjectRole,
  unassignFromProject,
  type FirmProject,
  type ProjectAssignment,
  type ProjectRole,
} from "../../lib/firmProjectsApi";

/**
 * Project access matrix.
 *
 * Project-centric rather than a literal members × projects grid: a real grid
 * needs horizontal scroll on anything narrower than a laptop, and this screen
 * has to stay usable on a phone even though it is mostly a desk task. Each
 * project expands to show its roster.
 *
 * Names come from the firm roster already loaded by useFirm() and are matched
 * in memory. That is not just an optimization — project_members has no
 * inferable PostgREST relationship to profiles, so there is no embed to use.
 */

const ROLE_OPTIONS: ProjectRole[] = ["owner", "editor", "commenter"];

function MemberName({ members, userId }: { members: FirmMember[]; userId: string }) {
  const member = members.find((m) => m.userId === userId);
  if (!member) {
    // Someone on the project who is not in the firm roster should be
    // impossible — the composite FK forbids it. Shown rather than hidden so a
    // violated invariant is visible instead of silently swallowed.
    return <span className="text-sm text-muted italic">Utilisateur inconnu</span>;
  }
  return (
    <div className="min-w-0">
      <div className="text-sm text-ink truncate">{member.name}</div>
      <div className="text-xs text-muted truncate">{member.email}</div>
    </div>
  );
}

function ProjectRow({
  project,
  members,
  expanded,
  onToggle,
}: {
  project: FirmProject;
  members: FirmMember[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [assignments, setAssignments] = useState<ProjectAssignment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("editor");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssignments(await listProjectAssignments(project.id));
    } catch (error) {
      console.error("Error loading project assignments:", error);
      toast.error(describeProjectAccessError(error, "Impossible de charger l'équipe du projet."));
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    if (expanded && assignments === null) void load();
  }, [expanded, assignments, load]);

  const assignedIds = new Set((assignments ?? []).map((a) => a.userId));
  const assignable = members.filter((m) => !assignedIds.has(m.userId));

  async function handleAdd() {
    if (!addUserId) return;
    setBusyUserId(addUserId);
    try {
      await assignToProject(project.id, addUserId, addRole);
      toast.success("Accès accordé.");
      setAddUserId("");
      setAdding(false);
      await load();
    } catch (error) {
      console.error("Error assigning to project:", error);
      toast.error(describeProjectAccessError(error, "Impossible d'accorder l'accès."));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRole(userId: string, role: ProjectRole) {
    setBusyUserId(userId);
    try {
      await setProjectRole(project.id, userId, role);
      await load();
    } catch (error) {
      console.error("Error changing project role:", error);
      toast.error(describeProjectAccessError(error, "Impossible de changer le rôle."));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    setBusyUserId(userId);
    try {
      await unassignFromProject(project.id, userId);
      toast.success("Accès retiré.");
      await load();
    } catch (error) {
      console.error("Error unassigning from project:", error);
      toast.error(describeProjectAccessError(error, "Impossible de retirer l'accès."));
    } finally {
      setBusyUserId(null);
    }
  }

  const count = assignments?.length;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-4 py-3 min-h-11 flex items-center justify-between gap-3 text-left hover:bg-subtle transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <FolderOpen size={20} className="text-muted flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm text-ink truncate">{project.name}</div>
            <div className="text-xs text-muted">
              {count === undefined
                ? "Toucher pour voir l'équipe"
                : `${count} membre${count > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-faint flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={16} className="text-faint flex-shrink-0" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-line">
          {loading && <div className="px-4 py-4 text-sm text-muted">Chargement…</div>}

          {!loading && assignments?.length === 0 && (
            <div className="px-4 py-4 text-sm text-muted">Personne n'a accès à ce projet.</div>
          )}

          {!loading &&
            (assignments ?? []).map((a) => (
              <div
                key={a.userId}
                className="px-4 py-3 flex items-center justify-between gap-3 border-b border-line last:border-b-0"
              >
                <MemberName members={members} userId={a.userId} />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={a.role}
                    disabled={busyUserId === a.userId}
                    onChange={(e) => void handleRole(a.userId, e.target.value as ProjectRole)}
                    aria-label={`Rôle sur ${project.name}`}
                    className={`${selectClassName} w-auto min-h-[36px] py-1.5 text-xs`}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {PROJECT_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleRemove(a.userId)}
                    disabled={busyUserId === a.userId}
                    aria-label={`Retirer l'accès de ce membre à ${project.name}`}
                    className="p-2 rounded-[4px] text-muted hover:text-open hover:bg-open/5 disabled:opacity-50"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}

          {!loading && !adding && assignable.length > 0 && (
            <div className="px-4 py-3">
              <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                <UserPlus size={16} aria-hidden="true" />
                Ajouter un membre
              </Button>
            </div>
          )}

          {!loading && !adding && assignable.length === 0 && (assignments?.length ?? 0) > 0 && (
            <div className="px-4 py-3 text-xs text-muted">
              Toute la firme a déjà accès à ce projet.
            </div>
          )}

          {adding && (
            <div className="px-4 py-3 flex flex-col sm:flex-row gap-2">
              <select
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                aria-label="Membre à ajouter"
                className={`${selectClassName} sm:flex-1`}
              >
                <option value="">Choisir un membre…</option>
                {assignable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} — {m.email}
                  </option>
                ))}
              </select>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as ProjectRole)}
                aria-label="Rôle sur le projet"
                className={`${selectClassName} sm:w-44`}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {PROJECT_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button size="md" onClick={() => void handleAdd()} disabled={!addUserId || !!busyUserId}>
                  <Plus size={16} aria-hidden="true" />
                  Ajouter
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setAdding(false);
                    setAddUserId("");
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function FirmProjectAccess({ members }: { members: FirmMember[] }) {
  const [projects, setProjects] = useState<FirmProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFirmProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((err) => {
        console.error("Error loading firm projects:", err);
        if (!cancelled) {
          setError(describeProjectAccessError(err, "Impossible de charger les projets."));
          setProjects([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card className="px-4 py-4">
        <p className="text-sm text-open">{error}</p>
      </Card>
    );
  }

  if (projects === null) {
    return (
      <Card className="px-4 py-4">
        <p className="text-sm text-muted">Chargement des projets…</p>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="px-4 py-6 text-center">
        <FolderOpen size={32} className="mx-auto mb-2 text-faint" aria-hidden="true" />
        <p className="text-sm text-muted">Aucun projet dans votre firme pour le moment.</p>
      </Card>
    );
  }

  return (
    <>
      <p className="text-xs text-muted mb-2">
        Vous gérez qui a accès. Le contenu des projets — visites, photos, déficiences — reste
        visible uniquement à leurs membres.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            members={members}
            expanded={expandedId === p.id}
            onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
          />
        ))}
      </div>
    </>
  );
}
