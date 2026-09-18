// STAGE DETAIL — what is related to one construction stage.
//
// Unlike a lot, a stage has TWO real relationships and both are shown:
//
//   VISITS      via site_visit_stages — a link table the architect writes
//               deliberately through VisitForm's stage multi-select. "This
//               visit covered this stage" is a STATEMENT, which is what makes
//               it safe to display. (The lot detail view has no visits
//               section for exactly the opposite reason; see LotDetail.tsx.)
//
//   DÉFICIENCES via issues.stage_id.
//
// Both counts already have a cheap precedent in getStageUsage, which the
// delete-confirmation path uses. This screen fetches the ROWS rather than the
// counts, and derives the counts from them — one round trip per relationship
// instead of two plus two.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  getProjectStage,
  getVisitsByStage,
  type ProjectStage,
  type StageVisit,
} from "../../lib/stagesApi";
import { getIssuesByStage, type Issue } from "../../lib/issuesApi";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { useSmartBack } from "../../hooks/useSmartBack";
import { parseLocalDate } from "../../lib/dateUtils";
import { Card, Section } from "./ui-kit/Card";
import EmptyState from "./ui-kit/EmptyState";
import { IconVisit } from "./ui-kit/RedMarkIcons";
import RelatedIssues, { StatusSummary } from "./RelatedIssues";

export default function StageDetail() {
  const { projectId, stageId } = useParams<{ projectId: string; stageId: string }>();
  const navigate = useNavigate();
  const goBack = useSmartBack(`/app/projects/${projectId}`);

  const [stage, setStage] = useState<ProjectStage | null>(null);
  const [loadingStage, setLoadingStage] = useState(true);
  const [stageLoadError, setStageLoadError] = useState<string | null>(null);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issuesLoadError, setIssuesLoadError] = useState(false);

  const [visits, setVisits] = useState<StageVisit[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [visitsLoadError, setVisitsLoadError] = useState(false);

  const loadStage = useCallback(async () => {
    if (!stageId) return;
    setLoadingStage(true);
    setStageLoadError(null);
    try {
      const row = await getProjectStage(stageId);
      if (!row) throw new Error("Étape introuvable.");
      setStage(row);
    } catch (e) {
      console.error("Error loading stage:", e);
      setStageLoadError(
        e instanceof Error && e.message ? e.message : "Impossible de charger cette étape.",
      );
    } finally {
      setLoadingStage(false);
    }
  }, [stageId]);

  const loadIssues = useCallback(() => {
    if (!stageId) return;
    setLoadingIssues(true);
    setIssuesLoadError(false);
    getIssuesByStage(stageId)
      .then(setIssues)
      .catch((e) => {
        console.error("Error loading issues for stage:", e);
        setIssuesLoadError(true);
      })
      .finally(() => setLoadingIssues(false));
  }, [stageId]);

  const loadVisits = useCallback(() => {
    if (!stageId) return;
    setLoadingVisits(true);
    setVisitsLoadError(false);
    getVisitsByStage(stageId)
      .then(setVisits)
      .catch((e) => {
        console.error("Error loading visits for stage:", e);
        setVisitsLoadError(true);
      })
      .finally(() => setLoadingVisits(false));
  }, [stageId]);

  useEffect(() => {
    void loadStage();
  }, [loadStage]);
  useEffect(() => {
    loadIssues();
  }, [loadIssues]);
  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  usePageHeader("Étape", loadingStage ? undefined : (stage?.name ?? undefined));

  if (stageLoadError) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <p className="text-sm text-ink mb-4">{stageLoadError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => void loadStage()}
              className="text-sm font-medium text-brand-strong hover:text-brand-800 min-h-[44px]"
            >
              Réessayer
            </button>
            <button onClick={goBack} className="text-sm text-muted hover:text-ink min-h-[44px]">
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      <div className="px-4 sm:px-6 pt-4 max-w-2xl min-[700px]:max-w-6xl mx-auto">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
      </div>

      {/* Same 700px two-column treatment as LocationDetail and LotDetail —
          see the note there for why it is not Tailwind's md. */}
      <div className="px-4 sm:px-6 py-6 max-w-2xl min-[700px]:max-w-6xl mx-auto">
        <div className="grid gap-6 min-[700px]:[grid-template-columns:3fr_2fr] items-start">
          <div className="contents min-[700px]:block min-[700px]:space-y-6">
            <Section title="Déficiences">
              <div className="space-y-4">
                {!loadingIssues && !issuesLoadError && (
                  <Card className="p-5">
                    <StatusSummary issues={issues} />
                  </Card>
                )}
                <RelatedIssues
                  issues={issues}
                  loading={loadingIssues}
                  loadError={issuesLoadError}
                  onRetry={loadIssues}
                  onOpenIssue={(issueId) =>
                    navigate(`/app/projects/${projectId}/issues/${issueId}`)
                  }
                  emptyLabel="Aucune déficience n'a été relevée à cette étape pour le moment."
                />
              </div>
            </Section>
          </div>

          <div className="contents min-[700px]:block min-[700px]:space-y-6">
            <Section
              title={`Visites${!loadingVisits && !visitsLoadError ? ` (${visits.length})` : ""}`}
            >
              {loadingVisits ? (
                <Card className="p-5">
                  <div className="text-sm text-muted">Chargement…</div>
                </Card>
              ) : visitsLoadError ? (
                <Card className="p-5">
                  <div className="text-sm text-brand-strong flex items-center gap-2 flex-wrap">
                    Impossible de charger les visites.
                    <button onClick={loadVisits} className="underline font-medium min-h-[44px]">
                      Réessayer
                    </button>
                  </div>
                </Card>
              ) : visits.length === 0 ? (
                <Card className="p-5">
                  <EmptyState
                    size="compact"
                    icon={<IconVisit size={32} className="text-faint lucide-display" />}
                    label="Aucune visite"
                    message="Aucune visite n'a encore couvert cette étape."
                  />
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  {visits.map((visit) => (
                    <button
                      key={visit.id}
                      onClick={() =>
                        navigate(`/app/projects/${projectId}/visits/${visit.id}`)
                      }
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0 hover:bg-subtle transition-colors min-h-[44px] text-left"
                    >
                      <div className="flex-1 min-w-0">
                        {/* Number leads, as everywhere else a visit is
                            referenced (Stage 27). */}
                        <div className="text-sm font-medium text-ink">
                          Visite n°&nbsp;<span className="rm-figures">{visit.visitNumber}</span>
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {parseLocalDate(visit.visitDate).toLocaleDateString("fr-CA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-faint flex-shrink-0" />
                    </button>
                  ))}
                </Card>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
