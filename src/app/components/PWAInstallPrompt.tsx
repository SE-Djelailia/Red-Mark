import { useState, useEffect } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Already installed — nothing to prompt
    if (window.matchMedia("(display-mode: standalone)").matches) {
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
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after 5 seconds
      setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful installation
    window.addEventListener("appinstalled", () => {
      setShowPrompt(false);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", new Date().toISOString());
  };

  return (
    <>
      {/* Install Prompt */}
      {showPrompt && deferredPrompt && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-5">
          <div className="bg-ink text-white rounded-[4px] shadow-2xl border border-white/15 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-surface rounded-[4px] flex items-center justify-center">
                  <Smartphone size={24} className="text-brand-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Installer RedMark</h3>
                  <p className="text-xs text-white/90">Accès rapide depuis l'écran d'accueil</p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-[4px] transition-colors"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <ul className="space-y-2 text-sm text-faint">
                <li className="flex items-start gap-2">
                  <span className="text-brand-600 mt-0.5">✓</span>
                  <span>Fonctionne hors ligne sur les chantiers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-600 mt-0.5">✓</span>
                  <span>Accès instantané comme une app native</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-600 mt-0.5">✓</span>
                  <span>Notifications en temps réel</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-600 mt-0.5">✓</span>
                  <span>Économise l'espace de stockage</span>
                </li>
              </ul>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-3 bg-white/15 text-white rounded-[4px] hover:bg-white/20 transition-colors font-medium min-h-[44px]"
                >
                  Plus tard
                </button>
                <button
                  onClick={handleInstall}
                  className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors font-medium flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Download size={20} />
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
