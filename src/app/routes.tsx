import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { SupabaseAuthProvider } from "../contexts/SupabaseAuthContext"; // ✅ Using Supabase Auth
import { ModalOpenProvider } from "../contexts/ModalOpenContext";
import Layout from "./components/Layout";
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

// Root component that provides SupabaseAuthContext to all routes
function RootLayout() {
  return (
    <SupabaseAuthProvider>
      <ModalOpenProvider>
        <MigrationPrompt />
        <Outlet />
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
        path: "/icon-generator",
        Component: IconGenerator,
      },
      {
        path: "/app",
        Component: Layout,
        children: [
          { index: true, Component: ProjectList },
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
          { path: "branding", element: <Navigate to="/app/profile" replace /> },
          { path: "*", element: <Navigate to="/app/projects" replace /> },
        ],
      },
    ],
  },
]);
