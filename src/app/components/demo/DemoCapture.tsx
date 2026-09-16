// /demo-capture — the camera stage for the landing page's screenshots.
//
// WHAT THIS IS FOR
//
// The landing page used to show HAND-RECREATED approximations of the app's
// screens. They drifted from the real UI the moment anything was restyled, and
// every frame size needed its type re-tuned by hand. This route removes both
// problems at the source: it mounts the REAL screen components against fixture
// data, and a Playwright script photographs them. The landing page then shows
// those photographs. A screenshot of IssueForm cannot drift from IssueForm.
//
// HOW IT IS SAFE
//
//   · The fake network (demoFetch) refuses to install on any other path.
//   · Every value comes from demoProject.ts, which is entirely fictional —
//     the landing page is public, so no real project may appear here.
//   · The route is not linked from anywhere. It is a tool, not a page.
//
// WHY THE SHELL IS REBUILT RATHER THAN REUSING Layout
//
// Layout redirects to /login when there is no session, mounts the offline photo
// queue, the header and the bottom nav. A capture wants ONE screen, framed
// tightly, with no chrome competing for the shot. So this provides only the
// providers the screens genuinely need.
//
// ADDING A SCREEN
//
// Add rows to demoFetch's TABLES, then add an entry to SCREENS below. If a
// screen needs props, give them here from demoProject. Nothing else changes —
// and in particular, the screen component itself is never modified to suit the
// camera.

import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { SupabaseAuthProvider } from "../../../contexts/SupabaseAuthContext";
import { DEMO_IDS } from "../landing/demoProject";
import { installDemoFetch } from "./demoFetch";
import IssueForm from "../IssueForm";
import ProjectList from "../ProjectList";

/**
 * The screens the capture script knows how to photograph.
 *
 * `host` reproduces the wrapper the screen has INSIDE the real app, because a
 * screen photographed out of its container is not a photograph of the app.
 * IssueForm, for instance, is never edge-to-edge: IssueView mounts it in a
 * bordered surface card with p-5 (IssueView.tsx), so the capture does the same.
 * ProjectList is a full-bleed screen and gets no host.
 */
const SCREENS: Record<
  string,
  { label: string; host?: string; render: () => React.ReactNode }
> = {
  issueform: {
    label: "Nouvelle déficience",
    // Matches IssueView's wrapper exactly, plus the page gutter the app's
    // routed screens carry.
    host: "p-5 md:p-6",
    render: () => (
      <div className="bg-surface rounded-[4px] border border-line p-5">
        <IssueForm
          projectId={DEMO_IDS.project}
          visitId={DEMO_IDS.visit}
          onSaved={() => {}}
          onCancel={() => {}}
        />
      </div>
    ),
  },
  projectlist: {
    label: "Projets",
    render: () => <ProjectList />,
  },
};

// Not exported: this file is a component, and a non-component export breaks
// Fast Refresh. The capture script keeps its own copy of the keys.
const DEMO_SCREEN_KEYS = Object.keys(SCREENS);

// Installed at MODULE scope, not in an effect or a useMemo.
//
// The providers below call supabase.auth.getSession() while they mount, and
// ProjectList fetches on its first effect — both of which run before any effect
// of this component would. Installing here means the fake network is in place
// before the module's consumers exist at all. (useMemo would be wrong twice
// over: React may discard and recompute it, and it is not a place for effects.)
// installDemoFetch is idempotent and refuses to run off the capture route.
installDemoFetch();

/**
 * Signals to Playwright that React has mounted and committed.
 *
 * useSyncExternalStore rather than a setState-in-effect: the server/initial
 * snapshot is "false" and the client snapshot is "true", so the attribute flips
 * on commit without an effect writing state during render. The capture script
 * waits on this attribute instead of a fixed timeout, so a slow machine cannot
 * produce a half-rendered screenshot.
 */
const neverChanges = () => () => {};

export default function DemoCapture() {
  const [params] = useSearchParams();
  const screen = params.get("screen") ?? "";
  const ready = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );

  const entry = SCREENS[screen];

  if (!entry) {
    return (
      <div className="min-h-screen bg-canvas p-8 font-mono text-sm text-ink">
        <p className="font-semibold mb-3">/demo-capture</p>
        <p className="text-muted mb-4">Ajoutez ?screen=… — écrans disponibles :</p>
        <ul className="space-y-1">
          {DEMO_SCREEN_KEYS.map((k) => (
            <li key={k}>
              <a className="text-brand-600 underline" href={`/demo-capture?screen=${k}`}>
                {k}
              </a>{" "}
              <span className="text-muted">— {SCREENS[k].label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <SupabaseAuthProvider>
      {/* data-demo-ready is the capture script's signal. bg-canvas matches the
          app's own ground so the screenshot has no foreign backdrop. */}
      <div
        data-demo-ready={ready ? "true" : "false"}
        data-demo-screen={screen}
        className={`min-h-screen bg-canvas ${entry.host ?? ""}`}
      >
        {entry.render()}
      </div>
    </SupabaseAuthProvider>
  );
}
