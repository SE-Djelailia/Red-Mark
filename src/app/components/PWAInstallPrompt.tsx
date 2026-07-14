import { useState, useEffect } from "react";
import { Download, X, Smartphone, AlertCircle, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    isStandalone: false,
    hasServiceWorker: false,
    canInstall: false,
    userAgent: "",
  });

  useEffect(() => {
    // Gather debug info
    const info = {
      isStandalone: window.matchMedia("(display-mode: standalone)").matches,
      hasServiceWorker: "serviceWorker" in navigator,
      canInstall: false,
      userAgent: navigator.userAgent,
    };
    setDebugInfo(info);

    // Check if already installed
    if (info.isStandalone) {
      setIsInstalled(true);
      console.log("✅ PWA is already installed and running in standalone mode");
      return;
    }

    // Check if already dismissed
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed = Math.floor(
        (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        console.log(
          `ℹ️ PWA install prompt dismissed ${daysSinceDismissed} days ago, will show again in ${7 - daysSinceDismissed} days`,
        );
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      console.log("✅ beforeinstallprompt event fired - PWA is installable!");
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setDebugInfo((prev) => ({ ...prev, canInstall: true }));

      // Show prompt after 5 seconds (reduced from 30 for testing)
      setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful installation
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowPrompt(false);
      console.log("✅ PWA installed successfully!");
    });

    // Show debug info in console after 3 seconds
    setTimeout(() => {
      console.log("=== PWA Debug Info ===");
      console.log("Is Standalone:", info.isStandalone);
      console.log("Has Service Worker Support:", info.hasServiceWorker);
      console.log("beforeinstallprompt fired:", deferredPrompt !== null);
      console.log("User Agent:", info.userAgent);
      console.log("=====================");

      // If not installable after 3 seconds, show debug mode
      if (!deferredPrompt && !info.isStandalone) {
        console.log("⚠️ PWA install prompt not available. This might be because:");
        console.log("  1. App is running in an iframe (Figma Make)");
        console.log("  2. App is not served over HTTPS");
        console.log("  3. Chrome's installability criteria not met");
        console.log("  4. Service worker not yet registered");
        console.log("\nTo test PWA installation:");
        console.log("  1. Deploy to a production environment with HTTPS");
        console.log("  2. Open in Chrome (not in iframe)");
        console.log("  3. Wait for Chrome's install prompt");
      }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("✅ User accepted the install prompt");
    } else {
      console.log("ℹ️ User dismissed the install prompt");
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", new Date().toISOString());
    console.log("ℹ️ PWA install prompt dismissed by user");
  };

  // Show debug info button in dev mode
  const showDebugButton = !isInstalled && !showPrompt && !deferredPrompt;

  return (
    <>
      {/* Debug Info Button (bottom left corner) */}
      {showDebugButton && (
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="fixed bottom-24 left-4 z-40 w-10 h-10 bg-[#1A1A1A] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#E10600] transition-colors"
          title="PWA Debug Info"
        >
          <AlertCircle size={20} />
        </button>
      )}

      {/* Debug Info Panel */}
      {showDebug && (
        <div className="fixed bottom-36 left-4 right-4 md:left-4 md:right-auto md:max-w-md z-50 animate-in slide-in-from-bottom-5">
          <div className="bg-[#1A1A1A] text-white rounded-xl shadow-2xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2">
                <AlertCircle size={18} className="text-[#E10600]" />
                PWA Debug Info
              </h3>
              <button
                onClick={() => setShowDebug(false)}
                className="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {debugInfo.isStandalone ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <X size={16} className="text-red-500" />
                )}
                <span>Standalone Mode: {debugInfo.isStandalone ? "Yes" : "No"}</span>
              </div>

              <div className="flex items-center gap-2">
                {debugInfo.hasServiceWorker ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <X size={16} className="text-red-500" />
                )}
                <span>
                  Service Worker: {debugInfo.hasServiceWorker ? "Supported" : "Not Supported"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {deferredPrompt ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <X size={16} className="text-red-500" />
                )}
                <span>Install Prompt: {deferredPrompt ? "Available" : "Not Available"}</span>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400">
                  {deferredPrompt
                    ? "✅ PWA is installable! Prompt will appear in a few seconds."
                    : "⚠️ PWA install not available in this environment. Deploy to HTTPS domain to enable installation."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install Prompt */}
      {showPrompt && deferredPrompt && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-5">
          <div className="bg-[#1A1A1A] text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#E10600] to-[#C00500] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                  <Smartphone size={24} className="text-[#E10600]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Installer RedMark</h3>
                  <p className="text-xs text-white/90">Accès rapide depuis l'écran d'accueil</p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-[#E10600] mt-0.5">✓</span>
                  <span>Fonctionne hors ligne sur les chantiers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#E10600] mt-0.5">✓</span>
                  <span>Accès instantané comme une app native</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#E10600] mt-0.5">✓</span>
                  <span>Notifications en temps réel</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#E10600] mt-0.5">✓</span>
                  <span>Économise l'espace de stockage</span>
                </li>
              </ul>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium min-h-[44px]"
                >
                  Plus tard
                </button>
                <button
                  onClick={handleInstall}
                  className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Download size={18} />
                  <span>Installer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
