// Landing page copy, both languages side by side.
//
// Kept in one file rather than a full i18n library: this is ONE page and the
// app itself is French-only, so the toggle exists for anglophone clients and
// partners reading the site, not as the start of a localisation effort.
// Pairing every string with its translation in a single object makes a
// missing translation a type error rather than a silent fallback to French.

export type Lang = "fr" | "en";

export interface Copy {
  nav: { signIn: string; langLabel: string };
  hero: {
    eyebrow: string;
    headline: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  mockups: { label: string; frames: { label: string; caption: string }[] };
  benefits: { label: string; items: { title: string; body: string }[] };
  contact: {
    label: string;
    headline: string;
    body: string;
    cta: string;
    emailLabel: string;
  };
  footer: { rights: string; tagline: string };
  mailSubject: string;
}

export const CONTACT_EMAIL = "info@red-mark.ca";

export const COPY: Record<Lang, Copy> = {
  fr: {
    nav: { signIn: "Se connecter", langLabel: "Langue" },
    hero: {
      eyebrow: "Visites de chantier",
      headline: "Le carnet de chantier des firmes d'architecture.",
      sub: "RedMark documente vos visites de chantier — photos localisées, déficiences suivies, rapports prêts à envoyer. Conçu pour le terrain, pas pour le bureau.",
      ctaPrimary: "Demander une démo",
      ctaSecondary: "Se connecter",
    },
    mockups: {
      label: "L'application",
      frames: [
        { label: "Visite", caption: "Une visite, tout son contenu" },
        { label: "Déficience", caption: "Le cycle de vie d'une déficience" },
        { label: "Rapport", caption: "Le rapport, prêt à envoyer" },
      ],
    },
    benefits: {
      label: "Ce que ça change",
      items: [
        {
          title: "Des rapports professionnels",
          body: "Le rapport de visite se génère à partir de ce que vous avez déjà saisi sur place. Numéroté, daté, prêt à transmettre au client et à l'entrepreneur.",
        },
        {
          title: "Fonctionne hors ligne",
          body: "Les chantiers n'ont pas de réseau. Photos et notes sont enregistrées sur l'appareil et se synchronisent d'elles-mêmes au retour du signal.",
        },
        {
          title: "Les déficiences, suivies",
          body: "Signalée, à corriger, corrigée, vérifiée. Chaque changement d'état est horodaté — vous savez ce qui reste ouvert et depuis combien de temps.",
        },
        {
          title: "L'historique visuel du bâtiment",
          body: "Chaque photo est rattachée à un local. Vous revoyez le même coin de mur visite après visite, dans l'ordre, sans fouiller.",
        },
      ],
    },
    contact: {
      label: "Contact",
      headline: "Voir RedMark sur vos projets.",
      body: "Une démonstration de vingt minutes, sur un de vos chantiers plutôt que sur des données d'exemple.",
      cta: "Demander une démo",
      emailLabel: "Ou écrivez-nous",
    },
    footer: {
      rights: "Tous droits réservés.",
      tagline: "Conçu au Québec pour les firmes d'architecture.",
    },
    mailSubject: "Démo RedMark",
  },
  en: {
    nav: { signIn: "Sign in", langLabel: "Language" },
    hero: {
      eyebrow: "Site visits",
      headline: "The site notebook for architecture firms.",
      sub: "RedMark documents your site visits — located photos, tracked deficiencies, reports ready to send. Built for the field, not the office.",
      ctaPrimary: "Request a demo",
      ctaSecondary: "Sign in",
    },
    mockups: {
      label: "The application",
      frames: [
        { label: "Visit", caption: "One visit, everything in it" },
        { label: "Deficiency", caption: "A deficiency's lifecycle" },
        { label: "Report", caption: "The report, ready to send" },
      ],
    },
    benefits: {
      label: "What changes",
      items: [
        {
          title: "Professional reports",
          body: "The visit report is generated from what you already recorded on site. Numbered, dated, ready for the client and the contractor.",
        },
        {
          title: "Works offline",
          body: "Sites have no signal. Photos and notes are stored on the device and sync themselves once you are back in range.",
        },
        {
          title: "Deficiencies, tracked",
          body: "Reported, to correct, corrected, verified. Every change of state is timestamped — you know what is still open, and for how long.",
        },
        {
          title: "A building's visual history",
          body: "Every photo is tied to a room. You see the same corner of wall visit after visit, in order, without digging.",
        },
      ],
    },
    contact: {
      label: "Contact",
      headline: "See RedMark on your own projects.",
      body: "A twenty-minute walkthrough, on one of your sites rather than on sample data.",
      cta: "Request a demo",
      emailLabel: "Or write to us",
    },
    footer: {
      rights: "All rights reserved.",
      tagline: "Built in Québec for architecture firms.",
    },
    mailSubject: "RedMark demo",
  },
};
