import { useEffect } from "react";
import { Outlet } from "react-router";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { PageHeaderProvider } from "../../contexts/PageHeaderContext";
import { processQueue } from "../../lib/uploadQueue";
import BottomNav from "./BottomNav";
import OfflineIndicator from "./OfflineIndicator";
import PWAInstallPrompt from "./PWAInstallPrompt";
import PWAUpdateNotification from "./PWAUpdateNotification";
import AppHeader from "./AppHeader";

export default function Layout() {
  const { user, loading } = useAuth();

  // Drain any photos queued while offline as soon as connectivity comes back.
  useEffect(() => {
    const handleOnline = () => {
      processQueue()
        .then(({ uploaded, failed }) => {
          if (uploaded > 0) {
            toast.success(
              `${uploaded} photo(s) envoyée(s) depuis la file d'attente hors ligne.`,
            );
          }
          if (failed > 0) {
            toast.error(
              `${failed} photo(s) en attente n'ont pas pu être envoyées, nouvelle tentative au prochain retour en ligne.`,
            );
          }
        })
        .catch((error: unknown) => {
          console.error("❌ Error processing upload queue:", error);
        });
    };

    // Also drain on mount — covers leftover queued items from a previous
    // session when the app is opened while already connected.
    if (navigator.onLine) {
      handleOnline();
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // Protection : Rediriger vers login si pas connecté
  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-4 text-muted">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageHeaderProvider>
      <div className="min-h-screen bg-canvas pb-14 md:pb-16">
        <AppHeader />
        <OfflineIndicator />
        <PWAInstallPrompt />
        <PWAUpdateNotification />
        <Outlet />
        <BottomNav />
      </div>
    </PageHeaderProvider>
  );
}
