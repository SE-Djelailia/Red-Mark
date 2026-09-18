// THE CAPTURE SEAM — a fake PostgREST, so the REAL screens can be photographed.
//
// WHY INTERCEPT fetch AND NOT THE API MODULES
//
// The whole point of /demo-capture is that the screenshots cannot drift from
// the app, because they ARE the app. Stubbing getProjects/getLots would defeat
// that: the mapping, ordering and error handling in supabaseApi.ts is exactly
// the code a screenshot should be proving. So the fake sits at the lowest
// possible layer — the network — and everything above it runs for real.
//
// It also means adding a screen later (VisitDetail, ReportGenerator) is a
// matter of adding ROWS, not of stubbing another module.
//
// SAFETY
//
// This module is inert until installDemoFetch() is called, which happens in
// exactly one place: the /demo-capture route component. It is never imported
// by the app shell, so no ordinary screen can reach it. It also refuses to
// install unless the URL really is the capture route — belt and braces against
// a stray import putting a fake network under a real screen.

import {
  DEMO_IDS,
  DEMO_LOT_ROWS,
  DEMO_PROJECT_ROWS,
  DEMO_STAGE_ROWS,
} from "../landing/demoProject";

/** The one path allowed to run a fake network. */
export const DEMO_CAPTURE_PATH = "/demo-capture";

/**
 * Table → rows, keyed by the PostgREST path segment, so adding a screen means
 * adding an entry here rather than touching any component.
 *
 * `readonly unknown[]` because the rows are `as const` literals of differing
 * shapes; they are serialised straight to JSON and never read as types here.
 */
const TABLES: Record<string, readonly unknown[]> = {
  projects: DEMO_PROJECT_ROWS,
  project_members: [],
  lots: DEMO_LOT_ROWS,
  project_stages: DEMO_STAGE_ROWS,
  construction_stages: [],
  issues: [],
  photos: [],
  site_visits: [],
  site_visit_stages: [],
  observations: [],
  observation_photos: [],
  locations: [
    {
      id: "00000000-0000-4000-8000-000000000050",
      project_id: DEMO_IDS.project,
      level_id: "00000000-0000-4000-8000-000000000060",
      location_number: "S-01",
      name: "Sous-sol",
      type: "room",
      discipline: null,
      parent_location_id: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000051",
      project_id: DEMO_IDS.project,
      level_id: "00000000-0000-4000-8000-000000000060",
      location_number: "204",
      name: "Bureau",
      type: "room",
      discipline: null,
      parent_location_id: null,
    },
  ],
  notifications: [],
};

/**
 * The session the app's auth context sees.
 *
 * A real Supabase session object is large; only the fields the app actually
 * reads are provided. `expires_at` is a year out so the client never tries to
 * refresh it against a network that is not there.
 */
export function demoSession() {
  return {
    access_token: "demo-access-token",
    refresh_token: "demo-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user: {
      id: DEMO_IDS.user,
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
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Which table a PostgREST URL addresses, or null if it is not one. */
function tableFor(url: URL): string | null {
  const m = url.pathname.match(/\/rest\/v1\/([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

/**
 * Applies the subset of PostgREST query semantics the demo screens actually
 * use: eq / in filters, and `order`.
 *
 * Deliberately NOT a general PostgREST implementation. It handles what the
 * captured screens ask for and nothing more; anything unrecognised is ignored
 * rather than guessed at, which keeps it honest about its own scope.
 */
function applyQuery(rows: readonly unknown[], url: URL): unknown[] {
  let out = [...rows] as Record<string, unknown>[];

  // Compare as scalars only. PostgREST filters in these fixtures are always on
  // scalar columns; coercing an object would produce "[object Object]" and make
  // two unrelated rows compare equal, so a non-scalar simply never matches.
  const scalar = (v: unknown): string | null =>
    v === null || v === undefined
      ? null
      : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : null;

  for (const [key, raw] of url.searchParams.entries()) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    if (raw.startsWith("eq.")) {
      const want = raw.slice(3);
      out = out.filter((r) => scalar(r[key]) === want);
    } else if (raw.startsWith("in.")) {
      const set = raw
        .slice(3)
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((v) => v.replace(/^"|"$/g, ""));
      out = out.filter((r) => {
        const v = scalar(r[key]);
        return v !== null && set.includes(v);
      });
    }
  }

  const order = url.searchParams.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out.sort((a, b) => {
      const av = scalar(a[col]) ?? "";
      const bv = scalar(b[col]) ?? "";
      return dir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }

  return out;
}

let installed = false;

/**
 * Replaces window.fetch with one that answers Supabase from fixtures.
 *
 * Returns a restore function, so a caller could undo it; the capture route
 * never does, because the page is thrown away after the screenshot.
 */
export function installDemoFetch(): () => void {
  if (typeof window === "undefined") return () => {};

  // Refuse to fake the network anywhere but the capture route. If this module
  // is ever imported by accident, it does nothing rather than silently
  // replacing a real screen's data with fixtures.
  if (!window.location.pathname.startsWith(DEMO_CAPTURE_PATH)) {
    console.warn("[demoFetch] refusing to install outside", DEMO_CAPTURE_PATH);
    return () => {};
  }

  if (installed) return () => {};
  installed = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Anything that is not Supabase goes to the real network untouched — the
    // page still needs its own JS, CSS and fonts.
    if (!href.includes("supabase.co")) return realFetch(input, init);

    const url = new URL(href);

    // ── AUTH ─────────────────────────────────────────────────────────────
    if (url.pathname.includes("/auth/v1/")) {
      if (url.pathname.endsWith("/user")) return json(demoSession().user);
      if (url.pathname.includes("/logout")) return json({});
      return json(demoSession());
    }

    // ── STORAGE ──────────────────────────────────────────────────────────
    // A transparent 1x1 GIF, so any <img> resolves rather than showing a
    // broken-image glyph in a screenshot.
    if (url.pathname.includes("/storage/v1/")) {
      if (url.pathname.includes("/object/sign")) {
        return json({ signedURL: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
      }
      const gif = Uint8Array.from(atob("R0lGODlhAQABAAAAACw="), (c) => c.charCodeAt(0));
      return new Response(gif, { status: 200, headers: { "Content-Type": "image/gif" } });
    }

    // ── POSTGREST ────────────────────────────────────────────────────────
    const table = tableFor(url);
    if (table !== null) {
      const method = (init?.method ?? "GET").toUpperCase();

      // Writes succeed and change nothing. A capture never commits anything,
      // but a screen that optimistically writes should not show an error.
      if (method !== "GET" && method !== "HEAD") return json([], 201);

      const rows = applyQuery(TABLES[table] ?? [], url);
      const range = `0-${Math.max(rows.length - 1, 0)}/${rows.length}`;

      // `head: true` count queries read Content-Range, not the body.
      if (method === "HEAD") {
        return new Response(null, { status: 200, headers: { "Content-Range": range } });
      }

      // PostgREST answers .single() with an object, not an array. The client
      // signals that through the Accept header.
      const accept = new Headers(init?.headers).get("Accept") ?? "";
      if (accept.includes("application/vnd.pgrst.object")) {
        return rows.length > 0
          ? json(rows[0])
          : json({ code: "PGRST116", message: "No rows found" }, 406);
      }

      return json(rows, 200, { "Content-Range": range });
    }

    return realFetch(input, init);
  };

  return () => {
    window.fetch = realFetch;
    installed = false;
  };
}
