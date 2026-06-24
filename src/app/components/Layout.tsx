import { Outlet } from "react-router";
import { Navigate } from "react-router";
import { useAuth } from "../../contexts/useAuth";
import BottomNav from "./BottomNav";
import OfflineIndicator from "./OfflineIndicator";
import PWAInstallPrompt from "./PWAInstallPrompt";
import PWAUpdateNotification from "./PWAUpdateNotification";
import PilotBanner from "./PilotBanner";
import AppHeader from "./AppHeader";

export default function Layout() {
  const { user, loading } = useAuth();

  // Protection : Rediriger vers login si pas connecté
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E10600] mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-20">
      <AppHeader />
      <PilotBanner />
      <OfflineIndicator />
      <PWAInstallPrompt />
      <PWAUpdateNotification />
      <Outlet />
      <BottomNav />
    </div>
  );
}