// CAPTURE SCREENSHOTS OF THE REAL APP — for sales decks, not the website.
//
//   pnpm demo:capture
//
// Builds nothing and starts nothing by itself: it expects a server already
// serving the app, and drives a headless Chromium over /demo-capture. Each
// screen is photographed at both iPad orientations into demo-captures/.
//
// THE OUTPUT IS NOT SHIPPED
//
// demo-captures/ is gitignored and sits OUTSIDE public/. The landing page
// does not show app screenshots — the HistoryDiagram is its visual — and the
// real screens are kept for sales calls. An earlier version wrote into
// public/demo/, which meant one careless `git add` would have published them;
// the directory moved precisely so that cannot happen.
//
// WHY ON DEMAND AND NOT IN CI
//
// Nothing consumes these files automatically. Run it when a deck needs fresh
// pictures, take what you need, and the rest can be deleted.
//
// ADDING A SCREEN: add it to SCREENS in DemoCapture.tsx, then to SCREENS here.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "demo-captures");
const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:4173";

/** The iPad viewports — the app's primary device, both orientations. */
const VIEWPORTS = [
  { name: "landscape", width: 1024, height: 768 },
  { name: "portrait", width: 768, height: 1024 },
];

/**
 * Screen key → output basename, and optionally how to dress the screen before
 * the shutter.
 *
 * `prepare` drives the REAL form with real interactions rather than seeding
 * component state, so what is photographed is a form a person could have filled
 * in. An empty form is an honest screenshot but a poor slide: a deck needs
 * to show the product holding content.
 */
const SCREENS = [
  { key: "projectlist", file: "projects" },
  {
    key: "issueform",
    file: "deficience",
    async prepare(page) {
      const type = async (selector, value) => {
        const el = page.locator(selector).first();
        if ((await el.count()) === 0) return;
        await el.fill(value);
      };
      await type(
        'input[placeholder*="Fissure"]',
        "Fissure au mur de fondation, coin nord-est",
      );
      await type(
        'textarea[placeholder*="Détails"]',
        "Fissure verticale d'environ 1,2 m observée au mur de fondation, coin nord-est. À faire évaluer par l'ingénieur en structure avant la pose de l'isolant.",
      );
      // The lot and étape selects are the point of stakeholder request #6 —
      // a déficience says WHO is responsible and WHEN in the build.
      for (const [label, value] of [
        ["Lot", "Lot 5 — Enveloppe"],
        ["Étape", "Fondation"],
      ]) {
        const sel = page.locator(`select`).filter({ hasText: value }).first();
        if ((await sel.count()) > 0) await sel.selectOption({ label: value });
        else void label;
      }
      // The due date is left EMPTY on purpose.
      //
      // Headless Chromium renders <input type="date"> in US order
      // (09/26/2026) no matter what — verified against navigator.language =
      // "fr-CA", the context `locale`, and --lang=fr-CA, all four
      // combinations. It is a headless rendering artifact, not an app bug: a
      // real iPad in fr-CA shows 2026-09-26. Since these screenshots are
      // marketing, shipping a US-formatted date would misrepresent the
      // product, so the field is hidden for the shot instead (below) rather
      // than photographed wrong.
      await page.addStyleTag({
        content: `
          input[type="date"] { color: transparent !important; }
          input[type="date"]::-webkit-calendar-picker-indicator { opacity: .45; }
        `,
      });

      // Blur, so no field carries a focus ring into the still.
      await page.locator("body").click({ position: { x: 2, y: 2 } });
    },
  },
];

/**
 * The Supabase project ref, observed from the RUNNING app.
 *
 * Deliberately not parsed from source. utils/supabase/info.tsx reads
 * VITE_SUPABASE_PROJECT_ID with a hardcoded fallback, so the literal in the
 * file is NOT necessarily the ref the built app uses — and seeding the session
 * under the wrong key fails silently, producing a screenshot of the logged-out
 * state rather than an error. (That is exactly what happened on the first run
 * of this script.)
 *
 * So: boot the app once with getItem instrumented, and take the key the auth
 * client actually asks for. It cannot be wrong, because it is the real one.
 */
async function supabaseRef(browser) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const real = Storage.prototype.getItem;
    window.__authKeys = [];
    Storage.prototype.getItem = function (k) {
      window.__authKeys.push(k);
      return real.call(this, k);
    };
  });
  await page.goto(`${BASE}${"/demo-capture"}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const keys = await page.evaluate(() => window.__authKeys ?? []);
  await page.close();

  const key = keys.find((k) => /^sb-[a-z0-9]+-auth-token$/.test(k));
  if (!key) {
    throw new Error(
      `Could not observe a Supabase auth storage key. Saw: ${JSON.stringify(keys)}`,
    );
  }
  return key.replace(/^sb-/, "").replace(/-auth-token$/, "");
}

/**
 * A session object shaped like Supabase's, written to localStorage before the
 * app boots.
 *
 * getSession() reads from storage, NOT from the network, so intercepting fetch
 * is not enough on its own — without this the auth provider resolves to "no
 * user" and every gated screen redirects. The app's IndexedDB storage adapter
 * migrates a localStorage value in on first read, which is the hook used here.
 */
function seedSession(ref) {
  const year = 60 * 60 * 24 * 365;
  return {
    key: `sb-${ref}-auth-token`,
    value: JSON.stringify({
      access_token: "demo-access-token",
      refresh_token: "demo-refresh-token",
      token_type: "bearer",
      expires_in: year,
      expires_at: Math.floor(Date.now() / 1000) + year,
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        aud: "authenticated",
        role: "authenticated",
        email: "demo@redmark.app",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { name: "Architecte", firm: "Atelier démonstration" },
        identities: [],
      },
    }),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  // --lang sets Chromium's own UI language. It does NOT fix the native
  // <input type="date"> rendering, which stays US-ordered in headless
  // regardless (see the issueform prepare step); it is kept because it makes
  // the rest of the browser chrome and any Intl fallback French.
  const browser = await chromium.launch({ args: ["--lang=fr-CA"] });
  const ref = await supabaseRef(browser);
  const seed = seedSession(ref);
  console.log(`Supabase ref observed from the app: ${ref}`);
  let failures = 0;

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      // 2x so the PNGs stay sharp when placed on a retina slide.
      deviceScaleFactor: 2,
      // fr-CA drives the app's own formatting (Intl, toLocaleDateString) and
      // navigator.language. It does NOT reach the native date widget — that
      // is handled in the issueform prepare step.
      locale: "fr-CA",
      timezoneId: "America/Toronto",
      reducedMotion: "reduce", // no half-played transitions in a still
    });

    // Runs before any page script, so the session is present when the auth
    // provider first asks for it.
    await context.addInitScript(
      ([k, v]) => {
        try {
          window.localStorage.setItem(k, v);
        } catch {
          /* private mode — the capture will show the logged-out state */
        }
      },
      [seed.key, seed.value],
    );

    for (const screen of SCREENS) {
      const page = await context.newPage();
      const problems = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console: ${m.text()}`);
      });

      const url = `${BASE}/demo-capture?screen=${screen.key}`;
      await page.goto(url, { waitUntil: "networkidle" });

      // Wait for React to mount rather than a fixed sleep.
      await page.waitForSelector('[data-demo-ready="true"]', { timeout: 15000 });
      // Then let the screens' own data effects settle.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      // A redirect means the seeded session did not take — photographing that
      // would silently ship a picture of the login screen.
      if (!page.url().includes("/demo-capture")) {
        console.error(`  ✗ ${screen.key} @ ${vp.name}: redirected to ${page.url()}`);
        failures++;
        await page.close();
        continue;
      }

      // Not every screen REDIRECTS when logged out — ProjectList renders
      // "Veuillez vous connecter" in place, which the redirect check above
      // sails straight past. This caught a genuinely broken capture that had
      // already been written to disk, so it stays: a logged-out screenshot must
      // fail the run, never ship.
      const loggedOut = await page
        .locator("text=/Veuillez vous connecter|Aller à la connexion/i")
        .count();
      if (loggedOut > 0) {
        console.error(
          `  ✗ ${screen.key} @ ${vp.name}: rendered the logged-out state ` +
            `(session seed did not take — check the storage key)`,
        );
        failures++;
        await page.close();
        continue;
      }

      if (screen.prepare) {
        await screen.prepare(page);
        await page.waitForTimeout(250);
      }

      // Fit the screen to the device, if it overflows.
      //
      // IssueForm is 866px tall at a 768px iPad height, so a viewport shot
      // would cut off the Annuler/Créer row — the one part that says "this is
      // a form you complete". Rather than crop it away or photograph a taller
      // image and let the frame crop (which was tried, and produced a 1.18
      // ratio the 4:3 frame could not show whole), the page is zoomed down by
      // exactly the overflow ratio.
      //
      // The layout is UNCHANGED by this: zoom scales the rendered result, so
      // every breakpoint decision was already made at the true 1024px width.
      // What is photographed is the real iPad layout, shown slightly smaller —
      // not a different layout. Capped at 0.8 so a very long screen is left to
      // crop rather than shrunk into illegibility.
      const fit = await page.evaluate(() => {
        const el = document.querySelector("[data-demo-screen]");
        const h = el ? el.getBoundingClientRect().height : 0;
        return h > window.innerHeight ? window.innerHeight / h : 1;
      });
      if (fit < 1) {
        const zoom = Math.max(fit, 0.8);
        await page.evaluate((z) => {
          document.documentElement.style.zoom = String(z);
        }, zoom);
        await page.waitForTimeout(300);
        console.log(`      (zoomed to ${zoom.toFixed(2)} so the screen fits the device)`);
      }

      const out = join(OUT, `${screen.file}-${vp.name}.png`);

      // Photograph the VIEWPORT, exactly the device's own frame.
      //
      // This is deliberate and was got wrong twice. Shooting the element
      // instead lets the height run to the content, which produces an image
      // whose aspect is NOT the device's — IssueForm came out 1.18 where the
      // iPad is 1.33 — and the landing frame then has to crop it, cutting off
      // the Annuler/Créer row. Shooting the viewport guarantees every capture
      // is exactly 4:3 (or 3:4), so the frame displays it whole with no crop
      // and no letterbox.
      //
      // The cost is that content taller than the device is below the fold, as
      // it is on the real device. That is the honest picture: a screenshot
      // should show what the iPad shows.
      await page.screenshot({ path: out });
      const note = problems.length ? `  (${problems.length} console error(s))` : "";
      console.log(`  ✓ ${screen.file}-${vp.name}.png${note}`);
      if (problems.length) problems.slice(0, 3).forEach((p) => console.log(`      ${p}`));
      await page.close();
    }

    await context.close();
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures} capture(s) failed.`);
    process.exit(1);
  }
  console.log(`\nWrote ${VIEWPORTS.length * SCREENS.length} screenshots to demo-captures/ (gitignored, not shipped)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
