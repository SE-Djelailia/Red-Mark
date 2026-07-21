import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { getIssuesByProject, type Issue } from "../../lib/issuesApi";
import IssueForm from "./IssueForm";
import IssueView from "./IssueView";

// TEMPORARY Stage 2 test harness — exercises IssueForm/IssueView standalone,
// without wiring them into any of the 4 real issue surfaces (that's Stage 3).
// Not linked from any nav; reached only via /dev/issue-form-test. Safe to
// delete once Stage 3 lands and the real surfaces cover this ground.
//
// Usage: /dev/issue-form-test?projectId=<uuid>&visitId=<uuid>[&locationId=<uuid>]
export default function IssueFormTestRoute() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const visitId = searchParams.get("visitId") || "";
  const locationId = searchParams.get("locationId") || undefined;

  const [mode, setMode] = useState<"create" | "view" | "edit">("create");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  const refresh = () => {
    if (!projectId) return;
    getIssuesByProject(projectId).then(setIssues);
  };

  useEffect(refresh, [projectId]);

  if (!projectId || !visitId) {
    return (
      <div className="p-6 max-w-xl mx-auto text-sm text-gray-600">
        <h1 className="text-lg font-semibold text-[#1A1A1A] mb-2">IssueForm / IssueView — test harness</h1>
        <p>
          Add <code>?projectId=&lt;uuid&gt;&amp;visitId=&lt;uuid&gt;</code> to the URL (both required;{" "}
          <code>locationId</code> optional) pointing at a real dev project/visit.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-[#1A1A1A] text-white px-6 py-6">
        <h1 className="text-xl font-semibold">IssueForm / IssueView — test harness</h1>
        <p className="text-xs text-gray-400 mt-1">projectId={projectId} · visitId={visitId}</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setActiveIssue(null);
              setMode("create");
            }}
            className="px-4 py-2 bg-[#E10600] text-white rounded-lg text-sm font-medium min-h-[44px]"
          >
            Nouvelle déficience
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">
            Déficiences du projet ({issues.length})
          </h2>
          {issues.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune déficience — créez-en une ci-dessus.</p>
          ) : (
            <div className="space-y-1.5">
              {issues.map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    setActiveIssue(i);
                    setMode("view");
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#E10600] hover:bg-gray-50 min-h-[44px]"
                >
                  <div className="text-sm text-[#1A1A1A] font-medium truncate">{i.title}</div>
                  <div className="text-xs text-gray-500">
                    {i.status} · {i.priority} · {i.photos.length} photo(s)
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === "create" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-[#1A1A1A] mb-4">Nouvelle déficience</h2>
            <IssueForm
              projectId={projectId}
              visitId={visitId}
              locationId={locationId}
              onSaved={(issue) => {
                setActiveIssue(issue);
                setMode("view");
                refresh();
              }}
              onCancel={() => setMode("view")}
            />
          </div>
        )}

        {mode === "view" && activeIssue && (
          <IssueView
            issue={activeIssue}
            projectId={projectId}
            onIssueUpdated={(issue) => {
              setActiveIssue(issue);
              refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
