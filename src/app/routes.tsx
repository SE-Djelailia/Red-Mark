import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { SupabaseAuthProvider } from "../contexts/SupabaseAuthContext"; // ✅ Using Supabase Auth
import { ModalOpenProvider } from "../contexts/ModalOpenContext";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./components/Login";
import ProjectList from "./components/ProjectList";
import ProjectDetail from "./components/ProjectDetail";
import SiteVisitCreation from "./components/SiteVisitCreation";
import QuickVisit from "./components/QuickVisit";
import SearchView from "./components/SearchView";
import Profile from "./components/Profile";
import ReportGenerator from "./components/ReportGenerator";
import IssueManagement from "./components/IssueManagement";
import Dashboard from "./components/Dashboard";
import IssueDetail from "./components/IssueDetail";
import VisitDetail from "./components/VisitDetail";
import IconGenerator from "./components/IconGenerator";
import SecurityPrivacy from "./components/SecurityPrivacy";
import PhotoUploadPage from "./components/PhotoUploadPage";
import PlanFileViewer from "./components/PlanFileViewer";
import LocationDetail from "./components/LocationDetail";
import MigrationPrompt from "./components/MigrationPrompt"; // ✅ Migration prompt
import FirmAdmin from "./components/FirmAdmin";
import SetPassword from "./components/SetPassword";
import AuthCallback from "./components/AuthCallback";
import DesignSystemPreview from "./components/DesignSystemPreview";
import PlatformAdmin from "./components/PlatformAdmin";

// Root component that provides SupabaseAuthContext to all routes
function RootLayout() {
  return (
    <SupabaseAuthProvider>
      <ModalOpenProvider>
        {/* Top-level net, inside the auth provider so the fallback can still
            reach session/context if it ever needs to. Catches anything the
            per-route boundary in Layout doesn't — including crashes in the
            unauthenticated routes (Login, SecurityPrivacy) and in the
            chrome itself. */}
        <ErrorBoundary>
          <MigrationPrompt />
          <Outlet />
        </ErrorBoundary>
      </ModalOpenProvider>
    </SupabaseAuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/",
        Component: Login,
      },
      {
        path: "/security",
        Component: SecurityPrivacy,
      },
      {
        // Landing page for Supabase invite / recovery links. MUST stay outside
        // /app: that branch is wrapped in Layout, which requires a session and
        // then firm membership — neither of which someone setting their first
        // password can be expected to clear beforehand.
        //
        // This path is what the edge function passes as `redirectTo`, and it
        // must be on Supabase's allowed Redirect URLs list.
        path: "/auth/set-password",
        Component: SetPassword,
      },
      {
        // OAuth (Microsoft) return. Outside /app for the same reason as
        // /auth/set-password: it must render BEFORE a session exists, which
        // is exactly what Layout refuses to do. It waits for the token
        // exchange to finish, then forwards to /app — where FirmGate applies
        // the normal firm-membership check.
        //
        // This exact path must be on Supabase's allowed Redirect URLs list,
        // for every origin the app is served from.
        path: "/auth/callback",
        Component: AuthCallback,
      },
      {
        // Design-system specimen. Outside /app: it needs no session and
        // grants nothing. Not linked from anywhere — it exists to review
        // the visual system, not to ship as a feature.
        path: "/design",
        Component: DesignSystemPreview,
      },
      {
        // Platform-operator surface. MUST stay outside /app, like
        // /auth/set-password above and for a related reason: /app is wrapped in
        // Layout → FirmGate, which stops anyone who belongs to no firm. A
        // platform operator belongs to no firm BY DESIGN, so this screen would
        // be permanently unreachable in there.
        //
        // Not linked from anywhere in the app. That is presentation, not access
        // control — the component renders a generic "page introuvable" for a
        // non-operator, and every call behind it is re-authorized against the
        // platform_operators allowlist server-side.
        path: "/platform",
        Component: PlatformAdmin,
      },
      {
        path: "/icon-generator",
        Component: IconGenerator,
      },
      {
        path: "/app",
        Component: Layout,
        children: [
          { index: true, element: <Navigate to="/app/dashboard" replace /> },
          { path: "projects", Component: ProjectList },
          { path: "projects/:id", Component: ProjectDetail },
          { path: "projects/:projectId/visits/:visitId", Component: VisitDetail },
          { path: "projects/:projectId/visits/:visitId/add-photos", Component: PhotoUploadPage },
          { path: "projects/:projectId/visits/:visitId/issues/:issueId", Component: IssueDetail },
          { path: "projects/:projectId/issues/:issueId", Component: IssueDetail },
          { path: "projects/:projectId/plan-files/:planFileId", Component: PlanFileViewer },
          { path: "projects/:projectId/locations/:locationId", Component: LocationDetail },
          { path: "projects/:id/visit/new", Component: SiteVisitCreation },
          { path: "projects/:id/report", Component: ReportGenerator },
          { path: "new-visit", Component: QuickVisit },
          { path: "dashboard", Component: Dashboard },
          { path: "issues", Component: IssueManagement }, // Legacy route
          { path: "search", Component: SearchView },
          { path: "profile", Component: Profile },
          // Renders its own "réservé aux administrateurs" state for a
          // non-admin rather than being route-guarded — and every write it
          // makes is re-authorized server-side regardless.
          { path: "firm", Component: FirmAdmin },
          { path: "branding", element: <Navigate to="/app/profile" replace /> },
          { path: "*", element: <Navigate to="/app/dashboard" replace /> },
        ],
      },
    ],
  },
]);
