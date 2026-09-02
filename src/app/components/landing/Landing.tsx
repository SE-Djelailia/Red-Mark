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
import SheetBackdrop from "./SheetBackdrop";
import { useReveal } from "./useReveal";
import { COPY, CONTACT_EMAIL, type Lang } from "./copy";

// The public face of RedMark, at "/". The app is untouched at /app/*.
//
// A CREDIBILITY page, not a funnel: no pricing, no testimonials, no signup.
// Its job is to make a firm that has already heard about RedMark believe it
// is a real product made by people who understand their work.
//
// It is deliberately more expressive than the app — bigger type, a drafting
// sheet underlay, scroll reveals — but expressiveness is spent on SCALE,
// STRUCTURE and RHYTHM, never on colour. The red budget is unchanged from
// the app's: at rest this page shows exactly ONE red fill (the hero CTA),
// plus the hero rule, the logo, and the two open-state lifecycle glyphs.
// A richer page is not a redder page.

const LANG_KEY = "redmark.lang";

function useLang(): [Lang, (l: Lang) => void] {
  // French default: the product is French and the market is Québec. English
  // exists for anglophone partners, and the choice persists so a returning
  // visitor is not reset each time.
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "fr";
    const saved = window.localStorage.getItem(LANG_KEY);
    return saved === "en" || saved === "fr" ? saved : "fr";
  });

  useEffect(() => {
    window.localStorage.setItem(LANG_KEY, lang);
    // What screen readers and translation tools read to pick pronunciation.
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

/**
 * A numbered section, the way a drawing sheet numbers its views.
 *
 * The number is the structure made visible: "01 —", "02 —" tells the eye
 * there is a system before it reads a word. Rule above, title block below,
 * then the content — the same order a titled drawing uses.
 */
function Section({
  n,
  label,
  lead,
  children,
  className = "",
}: {
  n: string;
  label: string;
  lead?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`rm-reveal border-t border-line pt-8 sm:pt-10 ${className}`}>
      <div className="flex items-baseline gap-3">
        <span className="rm-label rm-figures text-faint">{n}</span>
        <span className="rm-label">{label}</span>
      </div>
      {lead && (
        <p className="mt-5 sm:mt-6 text-xl sm:text-2xl text-ink font-medium tracking-[-0.01em] max-w-xl leading-snug">
          {lead}
        </p>
      )}
      <div className="mt-8 sm:mt-12">{children}</div>
    </section>
  );
}

export default function Landing() {
  const [lang, setLang] = useLang();
  const t = COPY[lang];
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t.mailSubject)}`;
  const contactRef = useReveal<HTMLElement>();

  const benefitIcons = [
    <Check key="report" size={20} className="text-ink" />,
    <WifiOff key="offline" size={20} className="text-ink" />,
    null,
    <IconPhoto key="history" size={20} className="text-ink" />,
  ];

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="bg-surface/90 backdrop-blur-sm border-b border-line sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center gap-3">
          <LogoLockup size={21} className="flex-shrink-0" />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LangToggle lang={lang} setLang={setLang} label={t.nav.langLabel} />
            {/* Ink, not red: the page's one red action is "Demander une
                démo". A second red fill here would put two on screen at
                once — the test the whole system turns on. */}
            <Link
              to="/app"
              className="px-3 py-1.5 rounded-[4px] border border-ink text-ink text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-subtle transition-colors duration-(--duration-fast) ease-out whitespace-nowrap"
            >
              {t.nav.signIn}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────────
          The one place the page is allowed to be a poster. Scale and
          composition carry it; the colour budget does not move. */}
      <section className="relative border-b border-line overflow-hidden">
        <SheetBackdrop />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-20 sm:pt-28 sm:pb-32">
          <p className="rm-rise rm-label" style={{ "--rm-delay": "0ms" } as React.CSSProperties}>
            <span className="rm-figures text-faint">00</span>
            <span className="mx-2 text-line-strong">—</span>
            {t.hero.eyebrow}
          </p>

          {/* The mark in the margin. Full-bleed on the headline block rather
              than on one line: the rule marks the whole statement, the way a
              red pen brackets a passage. */}
          <div
            className="rm-rise mt-7 sm:mt-10 border-l-2 border-l-brand-600 pl-5 sm:pl-8"
            style={{ "--rm-delay": "80ms" } as React.CSSProperties}
          >
            <h1 className="text-[2.5rem] leading-[1.05] sm:text-[4rem] lg:text-[4.75rem] lg:leading-[0.98] font-semibold text-ink tracking-[-0.035em] max-w-4xl text-balance">
              {t.hero.headline}
            </h1>
          </div>

          <p
            className="rm-rise mt-8 sm:mt-10 sm:pl-8 text-lg sm:text-xl text-body leading-relaxed max-w-2xl text-pretty"
            style={{ "--rm-delay": "160ms" } as React.CSSProperties}
          >
            {t.hero.sub}
          </p>

          <div
            className="rm-rise mt-10 sm:mt-12 sm:pl-8 flex flex-col sm:flex-row gap-3 sm:items-center"
            style={{ "--rm-delay": "240ms" } as React.CSSProperties}
          >
            <a
              href={mailto}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[4px] bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:bg-brand-800 transition-colors duration-(--duration-fast) ease-out"
            >
              {t.hero.ctaPrimary}
              <ArrowRight size={16} />
            </a>
            <Link
              to="/app"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle transition-colors duration-(--duration-fast) ease-out"
            >
              {t.hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* ── 01 · MOCKUPS ─────────────────────────────────────────
            The proof, given weight: one large browser frame leading, two
            phones staggered beneath it. Staggering rather than a neat row
            so the group reads as sheets laid on a desk. */}
        <Section n="01" label={t.mockups.label} lead={t.mockups.lead} className="mt-16 sm:mt-24">
          <div className="grid gap-10 lg:gap-8 lg:grid-cols-12 items-start">
            <div className="lg:col-span-8">
              <BrowserFrame
                label={t.mockups.frames[2].label}
                caption={t.mockups.frames[2].caption}
              />
            </div>
            <div className="grid grid-cols-2 gap-6 sm:gap-8 lg:col-span-4 lg:grid-cols-1 lg:gap-10">
              {/* Offset downward on wide screens so the trio is composed
                  rather than aligned — the drawing-sheet look. */}
              <div className="lg:mt-8">
                <PhoneFrame
                  label={t.mockups.frames[0].label}
                  caption={t.mockups.frames[0].caption}
                />
              </div>
              <div className="lg:-mt-2">
                <PhoneFrame
                  label={t.mockups.frames[1].label}
                  caption={t.mockups.frames[1].caption}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* ── 02 · BENEFITS ────────────────────────────────────────
            Each card carries the leading rule at rest — the system's own
            marked-row treatment, applied to a marketing card. */}
        <Section n="02" label={t.benefits.label} lead={t.benefits.lead} className="mt-20 sm:mt-28">
          <div className="grid gap-px bg-line border border-line rounded-[4px] overflow-hidden sm:grid-cols-2">
            {t.benefits.items.map((item, i) => (
              <div
                key={item.title}
                className="group bg-surface p-7 sm:p-9 border-l-2 border-l-transparent hover:border-l-ink transition-colors duration-(--duration-base) ease-out"
              >
                <div className="flex items-center justify-between h-6">
                  <div className="flex items-center gap-2">
                    {i === 2 ? (
                      // The lifecycle, shown rather than described. Red on
                      // the two OPEN states, ink on the two closed — the
                      // same discipline the app applies.
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
                  <span className="rm-label rm-figures text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-xl sm:text-2xl font-semibold text-ink tracking-[-0.015em]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] text-body leading-relaxed max-w-sm">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </main>

      {/* ── 03 · CONTACT ───────────────────────────────────────────
          The closing moment. Ink ground rather than paper: the page has been
          a drawing sheet throughout, and inverting at the end reads as the
          back of the sheet — a deliberate stop, not another section. */}
      <section
        ref={contactRef}
        className="rm-reveal mt-20 sm:mt-28 bg-ink text-white relative overflow-hidden"
      >
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <div className="flex items-baseline gap-3">
            <span className="rm-label rm-figures text-white/35">03</span>
            <span className="rm-label text-white/60">{t.contact.label}</span>
          </div>
          <h2 className="mt-7 text-[2rem] leading-[1.08] sm:text-[3rem] font-semibold tracking-[-0.03em] max-w-2xl text-balance">
            {t.contact.headline}
          </h2>
          <p className="mt-5 text-lg text-white/70 max-w-xl leading-relaxed text-pretty">
            {t.contact.body}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
            {/* White on ink, not red: the hero already spends the page's one
                red fill, and this sits on a dark ground where the brand red
                loses contrast anyway. */}
            <a
              href={mailto}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[4px] bg-white text-ink text-sm font-semibold hover:bg-white/90 transition-colors duration-(--duration-fast) ease-out"
            >
              {t.contact.cta}
              <ArrowRight size={16} />
            </a>
            <p className="text-sm text-white/60">
              {t.contact.emailLabel}{" "}
              <a
                href={mailto}
                className="text-white font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors duration-(--duration-fast) ease-out"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-line bg-surface">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row sm:items-center gap-4">
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
