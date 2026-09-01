import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, WifiOff } from "lucide-react";
import { LogoLockup } from "../ui-kit/Logo";
import {
  IconPhoto,
  StateSignale,
  StateACorriger,
  StateCorrige,
  StateVerifie,
} from "../ui-kit/RedMarkIcons";
import { BrowserFrame, PhoneFrame } from "./MockupFrame";
import { COPY, CONTACT_EMAIL, type Lang } from "./copy";

// The public face of RedMark, at "/". The app is untouched at /app/*.
//
// This is a CREDIBILITY page, not a funnel: no pricing, no testimonials, no
// signup. Its job is to make a firm that has already heard about RedMark —
// from a call, a conference, a colleague — believe it is a real product made
// by people who understand their work. Every element is either evidence or a
// way to start a conversation.
//
// It shares the app's design tokens rather than reimplementing them, so the
// site and the product visibly come from the same hand. Red appears exactly
// three times on the page at rest: the logo mark, the hero rule, and the one
// primary CTA. Everything else is ink on paper.

const LANG_KEY = "redmark.lang";

function useLang(): [Lang, (l: Lang) => void] {
  // French is the default because the product is French and the market is
  // Québec. English is available for anglophone partners, and the choice is
  // remembered so a returning visitor is not reset to French each time.
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "fr";
    const saved = window.localStorage.getItem(LANG_KEY);
    return saved === "en" || saved === "fr" ? saved : "fr";
  });

  useEffect(() => {
    window.localStorage.setItem(LANG_KEY, lang);
    // The <html lang> attribute is what screen readers and translation tools
    // read to pick pronunciation; leaving it stale would be a real a11y bug.
    document.documentElement.lang = lang;
  }, [lang]);

  return [lang, setLang];
}

function LangToggle({
  lang,
  setLang,
  label,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  label: string;
}) {
  return (
    <div
      className="flex rounded-[4px] border border-line-strong overflow-hidden divide-x divide-line-strong"
      role="group"
      aria-label={label}
    >
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-(--duration-fast) ease-out ${
            lang === l ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Section wrapper: the hairline + title-block label the app uses. */
function Section({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-line pt-10 sm:pt-14 ${className}`}>
      <p className="rm-label mb-6 sm:mb-8">{label}</p>
      {children}
    </section>
  );
}

export default function Landing() {
  const [lang, setLang] = useLang();
  const t = COPY[lang];
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t.mailSubject)}`;

  // Paired with each benefit in order. The lifecycle benefit takes all four
  // state glyphs rather than one icon — the progression IS the point being
  // made, so showing the set says it faster than the sentence does.
  const benefitIcons = [
    <Check key="report" size={20} className="text-ink" />,
    <WifiOff key="offline" size={20} className="text-ink" />,
    null,
    <IconPhoto key="history" size={20} className="text-ink" />,
  ];

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="bg-surface border-b border-line sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center gap-3">
          <LogoLockup size={21} className="flex-shrink-0" />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LangToggle lang={lang} setLang={setLang} label={t.nav.langLabel} />
            {/* Ink, not red: the page's one red action is "Demander une
                démo". A second red fill in the header would put two on
                screen at once — the test the whole system turns on. */}
            <Link
              to="/app"
              className="px-3 py-1.5 rounded-[4px] border border-ink text-ink text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-subtle transition-colors duration-(--duration-fast) ease-out whitespace-nowrap"
            >
              {t.nav.signIn}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8">
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="py-14 sm:py-24">
          <div className="max-w-2xl">
            <p className="rm-label">{t.hero.eyebrow}</p>
            {/* The one red rule on the page's masthead — the pen's stroke in
                the margin, marking where the statement begins. */}
            <h1 className="mt-5 border-l-2 border-l-brand-600 pl-5 text-[2rem] leading-[1.12] sm:text-[2.75rem] sm:leading-[1.08] font-semibold text-ink tracking-[-0.02em]">
              {t.hero.headline}
            </h1>
            <p className="mt-6 sm:pl-5 text-base sm:text-lg text-body leading-relaxed max-w-xl">
              {t.hero.sub}
            </p>
            <div className="mt-9 sm:pl-5 flex flex-col sm:flex-row gap-3 sm:items-center">
              <a
                href={mailto}
                className="inline-flex items-center justify-center gap-2 px-5 h-12 rounded-[4px] bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:bg-brand-800 transition-colors duration-(--duration-fast) ease-out"
              >
                {t.hero.ctaPrimary}
                <ArrowRight size={16} />
              </a>
              <Link
                to="/app"
                className="inline-flex items-center justify-center px-5 h-12 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle transition-colors duration-(--duration-fast) ease-out"
              >
                {t.hero.ctaSecondary}
              </Link>
            </div>
          </div>
        </section>

        {/* ── MOCKUPS ──────────────────────────────────────────────── */}
        <Section label={t.mockups.label}>
          <div className="grid gap-10 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3 items-start">
            <PhoneFrame
              label={t.mockups.frames[0].label}
              caption={t.mockups.frames[0].caption}
            />
            <PhoneFrame
              label={t.mockups.frames[1].label}
              caption={t.mockups.frames[1].caption}
            />
            <div className="sm:col-span-2 lg:col-span-1">
              <BrowserFrame
                label={t.mockups.frames[2].label}
                caption={t.mockups.frames[2].caption}
              />
            </div>
          </div>
        </Section>

        {/* ── BENEFITS ─────────────────────────────────────────────── */}
        <Section label={t.benefits.label} className="mt-14 sm:mt-20">
          <div className="grid gap-px bg-line border border-line rounded-[4px] overflow-hidden sm:grid-cols-2">
            {t.benefits.items.map((item, i) => (
              <div key={item.title} className="bg-surface p-6 sm:p-7">
                <div className="flex items-center gap-2 h-6">
                  {i === 2 ? (
                    // The lifecycle, shown rather than described. Red on the
                    // two OPEN states, ink on the two closed ones — the same
                    // discipline the app itself applies.
                    <span className="flex items-center gap-1.5" aria-hidden="true">
                      <StateSignale size={16} className="text-brand-600" />
                      <StateACorriger size={16} className="text-brand-600" />
                      <StateCorrige size={16} className="text-muted" />
                      <StateVerifie size={16} className="text-muted" />
                    </span>
                  ) : (
                    benefitIcons[i]
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink tracking-[-0.01em]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-body leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── CONTACT ──────────────────────────────────────────────── */}
        <Section label={t.contact.label} className="mt-14 sm:mt-20">
          <div className="border border-line rounded-[4px] bg-surface p-7 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-semibold text-ink tracking-[-0.02em] max-w-lg">
              {t.contact.headline}
            </h2>
            <p className="mt-3 text-base text-body max-w-lg leading-relaxed">{t.contact.body}</p>
            <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <a
                href={mailto}
                className="inline-flex items-center justify-center gap-2 px-5 h-12 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle transition-colors duration-(--duration-fast) ease-out"
              >
                {t.contact.cta}
                <ArrowRight size={16} />
              </a>
              <p className="text-sm text-muted">
                {t.contact.emailLabel}{" "}
                <a
                  href={mailto}
                  className="text-ink font-medium underline underline-offset-4 decoration-line-strong hover:decoration-ink transition-colors duration-(--duration-fast) ease-out"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </Section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="mt-16 sm:mt-24 border-t border-line bg-surface">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <LogoLockup size={18} />
          <p className="text-xs text-muted sm:ml-auto">{t.footer.tagline}</p>
          <p className="text-xs text-faint rm-figures">
            © {new Date().getFullYear()} RedMark. {t.footer.rights}
          </p>
        </div>
      </footer>
    </div>
  );
}
