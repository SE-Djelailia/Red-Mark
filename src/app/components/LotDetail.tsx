// LOT DETAIL — what is related to one contractual lot.
//
// WHAT A LOT IS GENUINELY RELATED TO, AND WHAT IT IS NOT
//
// Exactly two things: its DÉFICIENCES (issues.lot_id) and its COMPANY
// (lots.company_id). That is the whole graph — `issues` is the only table in
// the schema carrying a lot_id at all.
//
// In particular there is NO lot↔visit relationship, and this screen
// deliberately does not manufacture one. A visit links to STAGES
// (site_visit_stages), never to lots. "Visits where this lot's déficiences
// were flagged" is derivable — issues carries both lot_id and visit_id — but
// it means something much narrower than it appears to: a lot inspected three
// times with nothing found would show ZERO visits, which on site reads as
// "never inspected". That is the same infer-a-relationship trap
// ReportGenerator.tsx already had to undo once, where coverage inferred from
// a borrowed photo silently enrolled unrelated visits into a report's
// history. Coverage is a statement someone makes, not a by-product.
//
// So: déficiences and company. The stage detail view is the one with visits,
// because stages have a real link table behind them.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Building2, Mail, MapPin, Phone, User } from "lucide-react";
import { getLot, type Lot } from "../../lib/lotApi";
import { getIssuesByLot, type Issue } from "../../lib/issuesApi";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { useSmartBack } from "../../hooks/useSmartBack";
import { Card, Section } from "./ui-kit/Card";
import RelatedIssues, { StatusSummary } from "./RelatedIssues";

export default function LotDetail() {
  const { projectId, lotId } = useParams<{ projectId: string; lotId: string }>();
  const navigate = useNavigate();
  const goBack = useSmartBack(`/app/projects/${projectId}`);

  const [lot, setLot] = useState<Lot | null>(null);
  const [loadingLot, setLoadingLot] = useState(true);
  const [lotLoadError, setLotLoadError] = useState<string | null>(null);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issuesLoadError, setIssuesLoadError] = useState(false);

  // Split loads, like LocationDetail: without the lot itself there is nothing
  // to show, so it gets the full-page error. A déficience-list failure is a
  // section-level problem and must not blank the header.
  const loadLot = useCallback(async () => {
    if (!lotId) return;
    setLoadingLot(true);
    setLotLoadError(null);
    try {
      const row = await getLot(lotId);
      if (!row) throw new Error("Lot introuvable.");
      setLot(row);
    } catch (e) {
      console.error("Error loading lot:", e);
      setLotLoadError(
        e instanceof Error && e.message ? e.message : "Impossible de charger ce lot.",
      );
    } finally {
      setLoadingLot(false);
    }
  }, [lotId]);

  const loadIssues = useCallback(() => {
    if (!lotId) return;
    setLoadingIssues(true);
    setIssuesLoadError(false);
    getIssuesByLot(lotId)
      .then(setIssues)
      .catch((e) => {
        console.error("Error loading issues for lot:", e);
        setIssuesLoadError(true);
      })
      .finally(() => setLoadingIssues(false));
  }, [lotId]);

  useEffect(() => {
    void loadLot();
  }, [loadLot]);
  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  usePageHeader("Lot", loadingLot ? undefined : (lot?.name ?? undefined));

  if (lotLoadError) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <p className="text-sm text-ink mb-4">{lotLoadError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => void loadLot()}
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

  const company = lot?.company ?? null;

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

      {/* Two columns from 700px, matching LocationDetail: iPad mini portrait
          is 744px, so Tailwind's md (768px) would leave the smallest and most
          arm's-length iPad on the phone layout. `contents` below that
          dissolves the wrappers so the phone keeps this source order —
          déficiences first, reference material after. */}
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
                  emptyLabel="Aucune déficience n'est assignée à ce lot pour le moment."
                />
              </div>
            </Section>
          </div>

          <div className="contents min-[700px]:block min-[700px]:space-y-6">
            <Section title="Entreprise">
              <Card className="p-5">
                {company ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-3">
                      <Building2 size={16} className="text-muted flex-shrink-0" />
                      <span className="font-medium text-ink">{company.name}</span>
                    </div>
                    {company.trade && (
                      <div className="flex items-center gap-3">
                        <span className="w-4 flex-shrink-0" />
                        <span className="text-body">{company.trade}</span>
                      </div>
                    )}
                    {company.contactName && (
                      <div className="flex items-center gap-3">
                        <User size={16} className="text-muted flex-shrink-0" />
                        <span className="text-body">{company.contactName}</span>
                      </div>
                    )}
                    {company.phone && (
                      <div className="flex items-center gap-3">
                        <Phone size={16} className="text-muted flex-shrink-0" />
                        {/* tel:/mailto: — on an iPad on site, the point of
                            showing a contractor's number is to call it. */}
                        <a href={`tel:${company.phone}`} className="text-body hover:text-ink">
                          {company.phone}
                        </a>
                      </div>
                    )}
                    {company.email && (
                      <div className="flex items-center gap-3">
                        <Mail size={16} className="text-muted flex-shrink-0" />
                        <a
                          href={`mailto:${company.email}`}
                          className="text-body hover:text-ink break-all"
                        >
                          {company.email}
                        </a>
                      </div>
                    )}
                    {company.address && (
                      <div className="flex items-start gap-3">
                        <MapPin size={16} className="text-muted flex-shrink-0 mt-0.5" />
                        <span className="text-body">{company.address}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Aucune entreprise n'est associée à ce lot.
                  </p>
                )}
              </Card>
            </Section>

            {lot?.description && (
              <Section title="Description">
                <Card className="p-5">
                  <p className="text-sm text-body whitespace-pre-wrap text-pretty">
                    {lot.description}
                  </p>
                </Card>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
