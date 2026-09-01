import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { PageHeaderProvider } from "../../contexts/PageHeaderContext";
import {
  processQueue,
  getQueuedItems,
  reconcileStaleUploads,
  isRetriableStatus,
} from "../../lib/uploadQueue";

// How often to re-attempt a queue that still has retriable items while the
// app is online. Long enough not to hammer a bad connection, short enough
// that a photo isn't stranded for the rest of a site visit.
const QUEUE_RETRY_INTERVAL_MS = 60_000;
import BottomNav from "./BottomNav";
import OfflineIndicator from "./OfflineIndicator";
import PWAInstallPrompt from "./PWAInstallPrompt";
import PWAUpdateNotification from "./PWAUpdateNotification";
import AppHeader from "./AppHeader";
import ErrorBoundary from "./ErrorBoundary";
import FirmGate from "./FirmGate";
import ProfileCompletionGate from "./ProfileCompletionGate";
import { XSpinnerBlock } from "./ui-kit/XSpinner";

export default function Layout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Drain any photos queued while offline as soon as connectivity comes back.
  //
  // Gated on `user`, NOT just navigator.onLine. This effect runs on the very
  // first render — above the loading/redirect guards below, because hooks
  // always run — so it used to fire before Supabase had restored its session
  // from IndexedDB. The storage INSERT policy requires
  // `foldername[1] = auth.uid()`, so a drain that won that race got a 403:
  // a PERMANENT verdict for a photo that was actually fine.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const drain = (trigger: string) => {
      if (cancelled || !navigator.onLine) return;
      console.log(`🔄 Upload queue drain triggered by: ${trigger}`);
      processQueue()
        .then(({ uploaded, failed, permanent, skipped }) => {
          if (skipped || cancelled) return;
          if (uploaded > 0) {
            toast.success(`${uploaded} photo(s) envoyée(s) depuis la file d'attente hors ligne.`);
          }
          // Split by verdict: "we'll try again" and "this will never work" are
          // different messages, and conflating them is what let a permanently
          // rejected photo look like it was still syncing.
          if (permanent > 0) {
            toast.error(
              `${permanent} photo(s) refusée(s) par le serveur. Touchez « Réessayer » sur l'indicateur.`,
              { duration: 10000 },
            );
          }
          if (failed > 0) {
            toast.error(
              `${failed} photo(s) en attente n'ont pas pu être envoyées, nouvelle tentative automatique.`,
            );
          }
        })
        .catch((error: unknown) => {
          console.error("❌ Error processing upload queue:", error);
        });
    };

    const handleOnline = () => drain("online event");

    // A page load kills any in-flight request, so anything still marked
    // "uploading" is stale — reset it before the first drain, or the
    // indicator spins for a request that no longer exists.
    void reconcileStaleUploads()
      .catch((error: unknown) => console.error("❌ Error reconciling upload queue:", error))
      .finally(() => drain("mount (session restored)"));

    // Periodic sweep: the "online" event only fires on a TRANSITION, so a
    // drain that failed while already online had nothing left to retry it
    // short of a full app reload. Stops itself once the queue is empty.
    const interval = window.setInterval(() => {
      if (!navigator.onLine) return;
      void getQueuedItems()
        .then((items) => {
          if (items.some((item) => isRetriableStatus(item.status))) {
            drain("periodic retry");
          }
        })
        .catch((error: unknown) => console.error("❌ Error polling upload queue:", error));
    }, QUEUE_RETRY_INTERVAL_MS);

    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
    };
    // Keyed on the id, not the user object: a token refresh hands back a new
    // object identity, which would tear down and restart the retry timer.
  }, [user?.id]);

  // Protection : Rediriger vers login si pas connecté
  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <XSpinnerBlock size={48} />
          <p className="mt-4 text-muted">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Firm membership is checked BEFORE the app chrome renders. Every list in
  // here is firm-scoped by RLS, so a user with no firm would otherwise get a
  // fully working app containing nothing at all — which reads as data loss.
  return (
    <FirmGate>
    <ProfileCompletionGate>
    <PageHeaderProvider>
      <div className="min-h-screen bg-canvas pb-14 md:pb-16">
        <AppHeader />
        <OfflineIndicator />
        <PWAInstallPrompt />
        <PWAUpdateNotification />
        {/* Per-route boundary wrapping ONLY the routed screen. A crash in
            one screen leaves the header and bottom nav mounted, so the user
            can navigate somewhere else instead of being stuck — the whole
            point on a site visit. Keyed on the pathname so navigating away
            clears the fallback automatically. */}
        <ErrorBoundary resetKeys={[location.pathname]}>
          <Outlet />
        </ErrorBoundary>
        <BottomNav />
      </div>
    </PageHeaderProvider>
    </ProfileCompletionGate>
    </FirmGate>
  );
}
