import React from "react";
import {
  Shield,
  Server,
  Lock,
  Database,
  AlertCircle,
  CheckCircle,
  XCircle,
  MapPin,
  FileText,
  Cloud,
  Key,
  ArrowLeft,
} from "lucide-react";
import { useSmartBack } from "../../hooks/useSmartBack";

export default function SecurityPrivacy() {
  const goBack = useSmartBack("/");

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="bg-surface border-b border-line py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-muted hover:text-ink mb-4 transition-colors min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft className="size-5" />
            Retour
          </button>
          <div className="flex items-center gap-4">
            <Shield className="size-10 text-brand-600" />
            <div>
              <h1 className="text-2xl lg:text-[28px] font-semibold tracking-tight text-ink">Sécurité &amp; Confidentialité</h1>
              <p className="text-sm text-muted mt-1">Version Pilote - Transparence totale</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Status du pilote */}
        <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-6 text-brand-strong flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-ink mb-2">
                Version Pilote - Phase de test
              </h2>
              <p className="text-ink mb-3">
                RedMark est actuellement en phase pilote gratuite pour validation du concept. Cette
                version n'est <strong>pas encore conforme à la Loi 25</strong> et ne devrait pas
                être utilisée pour des projets sensibles ou confidentiels.
              </p>
              <div className="bg-subtle rounded p-3 text-sm text-ink">
                <strong>Projets appropriés pour le pilote:</strong>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li>Projets commerciaux standard</li>
                  <li>Projets résidentiels</li>
                  <li>Projets sans NDA strict sur localisation des données</li>
                </ul>
                <strong className="block mt-3">Non approprié pour:</strong>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li>Projets gouvernementaux</li>
                  <li>Projets hospitaliers/santé</li>
                  <li>Projets avec exigences de sécurité nationale</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Où sont les données */}
        <div className="bg-surface rounded-[4px] shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="size-6 text-brand-600" />
            <h2 className="text-xl font-bold">Localisation des données</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Server className="size-5 text-body mt-0.5" />
              <div>
                <h3 className="font-semibold">Infrastructure</h3>
                <p className="text-body text-sm">
                  Supabase (hébergé sur AWS) - Région probablement USA (us-east-1)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Database className="size-5 text-body mt-0.5" />
              <div>
                <h3 className="font-semibold">Base de données</h3>
                <p className="text-body text-sm">
                  PostgreSQL sur Supabase - Stockage des projets, visites, métadonnées
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Cloud className="size-5 text-body mt-0.5" />
              <div>
                <h3 className="font-semibold">Photos de chantier</h3>
                <p className="text-body text-sm">
                  Supabase Storage (bucket privé) - Mêmes serveurs que la base de données
                </p>
              </div>
            </div>

            <div className="bg-subtle rounded p-4 mt-4">
              <p className="text-sm text-ink">
                <strong>Plan post-pilote:</strong> Si le pilote réussit, migration vers
                infrastructure 100% canadienne (AWS ca-central-1 ou Azure Canada) pour conformité
                Loi 25.
              </p>
            </div>
          </div>
        </div>

        {/* Mesures de sécurité actuelles */}
        <div className="bg-surface rounded-[4px] shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="size-6 text-brand-600" />
            <h2 className="text-xl font-bold">Mesures de sécurité en place</h2>
          </div>

          <div className="space-y-3">
            <SecurityItem
              status="active"
              title="Chiffrement en transit (HTTPS/TLS)"
              description="Toutes les communications sont chiffrées"
            />
            <SecurityItem
              status="active"
              title="Chiffrement au repos (AES-256)"
              description="Données chiffrées sur les serveurs"
            />
            <SecurityItem
              status="active"
              title="Authentification JWT"
              description="Tokens sécurisés avec expiration"
            />
            <SecurityItem
              status="active"
              title="Mots de passe hashés (bcrypt)"
              description="Mots de passe jamais stockés en clair"
            />
            <SecurityItem
              status="active"
              title="Bucket photos privé"
              description="Pas d'accès public direct aux photos"
            />
            <SecurityItem
              status="active"
              title="URLs signées temporaires"
              description="Accès aux photos avec expiration automatique"
            />
            <SecurityItem
              status="active"
              title="Isolation des données"
              description="Chaque utilisateur voit uniquement ses projets"
            />
            <SecurityItem
              status="active"
              title="Validation des types de fichiers"
              description="Seules les images sont acceptées (JPEG, PNG, HEIC, WebP)"
            />
            <SecurityItem
              status="active"
              title="Limite de taille de fichiers"
              description="Maximum 50MB par photo"
            />
            <SecurityItem
              status="inactive"
              title="Row-Level Security (RLS)"
              description="Prévu pour la version production"
            />
            <SecurityItem
              status="inactive"
              title="Authentification à deux facteurs (2FA)"
              description="Prévu pour la version production"
            />
            <SecurityItem
              status="inactive"
              title="Audit trail complet"
              description="Prévu pour la version production"
            />
          </div>
        </div>

        {/* Conformité */}
        <div className="bg-surface rounded-[4px] shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="size-6 text-brand-600" />
            <h2 className="text-xl font-bold">Conformité réglementaire</h2>
          </div>

          <div className="space-y-4">
            <ComplianceItem
              status="partial"
              title="Loi 25 (Québec)"
              description="Partiellement conforme - Données actuellement hors Canada"
              note="Migration vers infrastructure canadienne prévue en version production"
            />
            <ComplianceItem
              status="active"
              title="Chiffrement des données personnelles"
              description="Conforme - Chiffrement AES-256 au repos et TLS en transit"
            />
            <ComplianceItem
              status="inactive"
              title="Droit à l'oubli"
              description="Non implémenté - Prévu pour version production"
              note="Actuellement: suppression manuelle possible sur demande"
            />
            <ComplianceItem
              status="active"
              title="Transparence"
              description="Conforme - Documentation complète de la sécurité disponible"
            />
          </div>
        </div>

        {/* Vos droits */}
        <div className="bg-surface rounded-[4px] shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Key className="size-6 text-brand-600" />
            <h2 className="text-xl font-bold">Vos droits sur vos données</h2>
          </div>

          <div className="space-y-3">
            <RightItem
              title="Accès à vos données"
              description="Vous pouvez consulter toutes vos données à tout moment via l'interface"
            />
            <RightItem
              title="Export de vos données"
              description="Fonctionnalité d'export JSON disponible (bientôt)"
            />
            <RightItem
              title="Suppression de compte"
              description="Contactez-nous pour supprimer votre compte et toutes vos données"
            />
            <RightItem
              title="Modification de vos informations"
              description="Vous pouvez modifier vos informations de profil à tout moment"
            />
            <RightItem
              title="Propriété des données"
              description="Vous restez propriétaire de tous vos projets, photos et documents"
            />
          </div>
        </div>

        {/* Contact */}
        <div className="bg-surface border border-line rounded-[4px] p-6">
          <h2 className="text-lg font-semibold text-ink mb-3">Questions ou préoccupations?</h2>
          <p className="text-body mb-4">
            Pour toute question concernant la sécurité, la confidentialité ou l'utilisation de vos
            données, n'hésitez pas à nous contacter.
          </p>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Email:</strong>{" "}
              <a href="mailto:contact@redmark.app" className="text-brand-600 hover:underline">
                contact@redmark.app
              </a>
            </p>
            <p className="text-faint">Nous nous engageons à répondre dans les 24-48 heures.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted pb-8">
          <p>Dernière mise à jour: {new Date().toLocaleDateString("fr-CA")}</p>
          <p className="mt-2">
            RedMark - Outil de documentation photo de chantier pour architectes
          </p>
        </div>
      </div>
    </div>
  );
}

// Composant pour les items de sécurité
function SecurityItem({
  status,
  title,
  description,
}: {
  status: "active" | "inactive";
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded bg-canvas">
      {status === "active" ? (
        <CheckCircle className="size-5 text-body flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="size-5 text-faint flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <h3
          className={`font-semibold text-sm ${status === "active" ? "text-ink" : "text-muted"}`}
        >
          {title}
        </h3>
        <p className={`text-xs ${status === "active" ? "text-body" : "text-faint"}`}>
          {description}
        </p>
      </div>
    </div>
  );
}

// Composant pour les items de conformité
function ComplianceItem({
  status,
  title,
  description,
  note,
}: {
  status: "active" | "partial" | "inactive";
  title: string;
  description: string;
  note?: string;
}) {
  const colors = {
    active: "text-body",
    partial: "text-brand-strong",
    inactive: "text-faint",
  };

  const bgColors = {
    active: "bg-subtle",
    partial: "bg-subtle",
    inactive: "bg-canvas",
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded ${bgColors[status]}`}>
      {status === "active" ? (
        <CheckCircle className="size-5 text-body flex-shrink-0 mt-0.5" />
      ) : status === "partial" ? (
        <AlertCircle className="size-5 text-brand-strong flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="size-5 text-faint flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <h3 className={`font-semibold text-sm ${colors[status]}`}>{title}</h3>
        <p className="text-xs text-body mt-0.5">{description}</p>
        {note && <p className="text-xs text-muted italic mt-1">{note}</p>}
      </div>
    </div>
  );
}

// Composant pour les droits
function RightItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded bg-canvas">
      <CheckCircle className="size-5 text-brand-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-semibold text-sm text-ink">{title}</h3>
        <p className="text-xs text-body">{description}</p>
      </div>
    </div>
  );
}
