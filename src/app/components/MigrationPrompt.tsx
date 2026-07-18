import { useState, useEffect } from "react";
import { Database, Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { migrateLocalDataToSupabase, needsMigration } from "../../lib/migrationToSupabase";
import { useSupabaseAuth } from "../../contexts/SupabaseAuthContext";
import { useModalOpen } from "../../hooks/useModalOpen";
import { toast } from "sonner";

export default function MigrationPrompt() {
  const { user } = useSupabaseAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  useModalOpen(showPrompt);

  useEffect(() => {
    if (user?.id) {
      // Vérifier si l'utilisateur a besoin de migrer
      const needsIt = needsMigration(user.id);
      setShowPrompt(needsIt);
    }
  }, [user?.id]); // ✅ Fixed: use user.id instead of user object

  const handleMigrate = async () => {
    if (!user) return;

    try {
      setMigrating(true);
      await migrateLocalDataToSupabase(user.id);
      setMigrationComplete(true);

      // Cacher le prompt après 3 secondes
      setTimeout(() => {
        setShowPrompt(false);
      }, 3000);
    } catch (error) {
      console.error("Migration error:", error);
      toast.error("Erreur lors de la migration");
    } finally {
      setMigrating(false);
    }
  };

  const handleSkip = () => {
    setShowPrompt(false);
    toast.info("Vous pourrez migrer vos données plus tard depuis les paramètres");
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        {migrationComplete ? (
          // Success state
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-2">Migration réussie ! 🎉</h2>
            <p className="text-gray-600 text-sm">
              Toutes vos données ont été transférées vers Supabase. Elles sont maintenant sécurisées
              dans le cloud !
            </p>
          </div>
        ) : (
          // Migration prompt
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Database size={24} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#1A1A1A]">Migration vers Supabase</h2>
                  <p className="text-xs text-gray-500">Base de données cloud sécurisée</p>
                </div>
              </div>
              {!migrating && (
                <button
                  onClick={handleSkip}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-r">
              <div className="flex gap-2">
                <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-1">Pourquoi migrer ?</p>
                  <ul className="space-y-1 text-xs">
                    <li>
                      ✅ Vos données seront <strong>sauvegardées dans le cloud</strong>
                    </li>
                    <li>
                      ✅ <strong>Accessibles de n'importe quel appareil</strong>
                    </li>
                    <li>
                      ✅ <strong>Protégées contre la perte</strong> (cache vidé, etc.)
                    </li>
                    <li>
                      ✅ <strong>Synchronisation automatique</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="w-full py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:bg-[#A00400] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {migrating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Migration en cours...
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    Migrer mes données
                  </>
                )}
              </button>

              {!migrating && (
                <button
                  onClick={handleSkip}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Plus tard
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Cette opération peut prendre quelques minutes selon la quantité de données.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
