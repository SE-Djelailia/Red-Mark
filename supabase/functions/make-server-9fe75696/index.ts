import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const app = new Hono();

// Create Supabase admin client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

console.log("=== SERVER STARTUP ===");
console.log("SUPABASE_URL:", Deno.env.get("SUPABASE_URL") ? "SET" : "MISSING");
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ? "SET (length: " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.length + ")"
    : "MISSING",
);
console.log("SUPABASE_ANON_KEY:", Deno.env.get("SUPABASE_ANON_KEY") ? "SET" : "MISSING");
console.log("======================");

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    // PATCH is used by the firm-admin promote/demote route. Without it here
    // the browser's preflight is rejected and the request never arrives.
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Middleware to verify authentication.
//
// Authentication is supabase.auth.getUser(token) and nothing else.
//
// This previously carried two "BYPASS MODE" fallbacks — one in the error
// branch, one in the catch — which, whenever verification failed, decoded
// the JWT payload by hand and trusted `sub` with NO signature check. Any
// self-signed token therefore authenticated as any user, and since the
// service-role client below ignores RLS, that was full read/write on every
// project's data. An unverifiable token is now a 401, always.
//
// The token is also no longer logged: the old handler printed the first 50
// characters of every bearer token into the function logs.
async function requireAuth(c: any, next: any) {
  const token = c.req.header("Authorization")?.split(" ")[1];

  if (!token) {
    console.error("requireAuth: no bearer token");
    return c.json({ error: "Unauthorized: No token provided" }, 401);
  }

  let user: { id: string; email?: string } | null = null;

  // Scoped to the verification call alone. next() used to run INSIDE this
  // try, so a throw from any downstream route handler landed in the catch
  // and — via the bypass — could re-enter that same handler a second time.
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      console.error("requireAuth: token rejected:", error.message);
      return c.json({ error: "Unauthorized: Invalid token" }, 401);
    }
    user = data.user;
  } catch (error: any) {
    console.error("requireAuth: verification threw:", error?.message);
    return c.json({ error: "Unauthorized: Token validation error" }, 401);
  }

  if (!user) {
    console.error("requireAuth: no user for token");
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  c.set("userId", user.id);
  c.set("userEmail", user.email);
  await next();
}

// ---------------------------------------------------------------------------
// LEGACY kv_store ROUTES — disabled
//
// 25 routes in this file read and write `kv_store_9fe75696`, a parallel store
// left over from an earlier architecture. The app does not use them: the only
// client caller of this function is src/lib/voiceNotesApi.ts, which touches
// exactly five routes (voice-note create/list/delete, transcribe, and
// storage/signed-url). Everything else is dead.
//
// They are disabled rather than firm-scoped because they CANNOT be
// firm-scoped: kv entries carry no organization_id, and their ids do not
// correspond to rows in `projects`, so there is nothing to check a firm
// against. Leaving them reachable would mean any authenticated user could
// read and write that store by guessing ids — with no RLS backstop, since
// every route here runs on the service role.
//
// Two of them were worse: /debug/users/:id and /debug/test-auth carry NO
// requireAuth at all. /debug/users/:id returned a kv user profile to anyone
// who asked, unauthenticated.
//
// Flip this constant to re-enable if something undocumented turns out to
// depend on them. Deleting the routes outright is the better end state.
// ---------------------------------------------------------------------------
const LEGACY_KV_ROUTES_DISABLED = true;

function legacyGone(c: any) {
  return c.json(
    { error: "This endpoint has been retired.", code: "legacy_route_disabled" },
    410,
  );
}

// Health check endpoint
app.get("/make-server-9fe75696/health", (c) => {
  return c.json({ status: "ok" });
});

// Test endpoint without auth
app.get("/make-server-9fe75696/test", (c) => {
  return c.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Sign up new user — DISABLED.
//
// This route was UNAUTHENTICATED and called admin.createUser with
// `email_confirm: true`, which handed any anonymous caller an account whose
// email address was marked confirmed without ever proving control of the
// mailbox.
//
// That defeats the firm-invitation handshake outright. /organizations/claim
// grants firm membership on a verified-email match, and refuses when
// email_confirmed_at is NULL — the one check the whole isolation model rests
// on. With this route live, an attacker could create an account under a
// colleague's address, get it auto-confirmed for free, and claim that
// colleague's pending invitation, landing inside the firm.
//
// It has no client caller: the app signs up through supabase.auth.signUp()
// in SupabaseAuthContext.tsx (which does NOT auto-confirm), and the only
// client of this edge function is src/lib/voiceNotesApi.ts, which touches
// five unrelated routes. Provisioning an account on someone's behalf is now
// /organizations/members/provision, which requires a firm admin.
app.post("/make-server-9fe75696/auth/signup", async (c) => {
  return c.json(
    {
      error: "Cette route a été retirée. Les comptes sont créés par invitation.",
      code: "signup_route_disabled",
    },
    410,
  );
});


// Get user profile
app.get("/make-server-9fe75696/users/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.req.param("id");
    console.log("Get user profile: userId from URL:", userId);
    console.log("Get user profile: userId from auth:", c.get("userId"));

    const user = await kv.get(`user:${userId}`);

    if (!user) {
      console.error("Get user profile: User not found in KV store for key:", `user:${userId}`);
      return c.json({ error: "User not found" }, 404);
    }

    console.log("Get user profile: User found:", user);
    return c.json(user);
  } catch (error: any) {
    console.error("Get user error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DEBUG: Get user profile without auth (REMOVE IN PRODUCTION)
app.get("/make-server-9fe75696/debug/users/:id", async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.req.param("id");
    console.log("DEBUG: Fetching user without auth check:", userId);

    const user = await kv.get(`user:${userId}`);

    if (!user) {
      console.log("DEBUG: User not found in KV store");
      return c.json({ error: "User not found in KV store" }, 404);
    }

    console.log("DEBUG: User found:", user);
    return c.json({ success: true, user, message: "User exists in KV store" });
  } catch (error: any) {
    console.error("DEBUG: Error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DEBUG: Test auth token
app.get("/make-server-9fe75696/debug/test-auth", async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.split(" ")[1];

    console.log("DEBUG: Testing token");
    console.log("DEBUG: Header present:", !!authHeader);
    console.log("DEBUG: Token present:", !!token);
    console.log("DEBUG: Token length:", token?.length);
    console.log("DEBUG: Token first 30 chars:", token?.substring(0, 30));

    if (!token) {
      return c.json({ error: "No token provided", authHeader });
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      console.error("DEBUG: Token validation error:", error);
      return c.json(
        {
          error: "Token validation failed",
          details: error.message,
          errorCode: error.status,
        },
        401,
      );
    }

    if (!user) {
      console.error("DEBUG: No user found for token");
      return c.json({ error: "No user found for token" }, 401);
    }

    console.log("DEBUG: Token is valid for user:", user.id, user.email);
    return c.json({
      success: true,
      userId: user.id,
      email: user.email,
      message: "Token is valid",
    });
  } catch (error: any) {
    console.error("DEBUG: Unexpected error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PROJECT ROUTES
// ============================================

// Create project
app.post("/make-server-9fe75696/projects", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.get("userId");
    const data = await c.req.json();

    const projectId = crypto.randomUUID();
    const project = {
      id: projectId,
      name: data.name,
      address: data.address,
      client: data.client || "",
      contractor: data.contractor || "",
      startDate: data.startDate || new Date().toISOString().split("T")[0],
      status: data.status || "planning",
      owner_id: userId,
      visitCount: 0,
      photoCount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`project:${projectId}`, project);
    await kv.set(`user_projects:${userId}:${projectId}`, { role: "owner" });

    return c.json(project, 201);
  } catch (error: any) {
    console.error("Create project error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get user's projects
app.get("/make-server-9fe75696/projects", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.get("userId");
    console.log("loadProjects: Getting projects for userId:", userId);

    // Get all projects where user is a member
    const userProjects = await kv.getByPrefix(`user_projects:${userId}:`);
    console.log("loadProjects: Found user_projects entries:", userProjects.length);

    // If no projects, return empty array (this is normal for new users!)
    if (userProjects.length === 0) {
      console.log("loadProjects: No projects found for new user - returning empty array");
      return c.json([]);
    }

    const projectIds = userProjects.map(({ key }) => key.split(":")[2]);
    console.log("loadProjects: Fetching projects with IDs:", projectIds);

    const projects = await kv.mget(projectIds.map((id) => `project:${id}`));
    console.log("loadProjects: Retrieved projects:", projects.length);

    return c.json(projects.filter(Boolean));
  } catch (error: any) {
    console.error("loadProjects: ERROR during project fetch:", error.message);
    console.error("loadProjects: Full error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get single project
app.get("/make-server-9fe75696/projects/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const projectId = c.req.param("id");
    const project = await kv.get(`project:${projectId}`);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json(project);
  } catch (error: any) {
    console.error("Get project error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Update project
app.put("/make-server-9fe75696/projects/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const projectId = c.req.param("id");
    const data = await c.req.json();

    const existing = await kv.get(`project:${projectId}`);
    if (!existing) {
      return c.json({ error: "Project not found" }, 404);
    }

    const updated = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
    };

    await kv.set(`project:${projectId}`, updated);
    return c.json(updated);
  } catch (error: any) {
    console.error("Update project error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete project
app.delete("/make-server-9fe75696/projects/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const projectId = c.req.param("id");
    await kv.del(`project:${projectId}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Delete project error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// SITE VISIT ROUTES
// ============================================

// Create site visit
app.post("/make-server-9fe75696/site-visits", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.get("userId");
    const data = await c.req.json();

    const visitId = crypto.randomUUID();
    const visit = {
      id: visitId,
      project_id: data.project_id,
      visit_date: data.visit_date,
      phase: data.phase,
      weather: data.weather,
      temperature: data.temperature,
      attendees: data.attendees || [],
      notes: data.notes || "",
      created_by: userId,
      created_at: new Date().toISOString(),
    };

    await kv.set(`site_visit:${visitId}`, visit);
    await kv.set(`project_visits:${data.project_id}:${visitId}`, true);

    return c.json(visit, 201);
  } catch (error: any) {
    console.error("Create site visit error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get site visits for a project
app.get("/make-server-9fe75696/projects/:projectId/site-visits", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const projectId = c.req.param("projectId");

    const visitKeys = await kv.getByPrefix(`project_visits:${projectId}:`);
    const visitIds = visitKeys.map(({ key }) => key.split(":")[2]);

    const visits = await kv.mget(visitIds.map((id) => `site_visit:${id}`));

    return c.json(visits.filter(Boolean));
  } catch (error: any) {
    console.error("Get site visits error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get single site visit
app.get("/make-server-9fe75696/site-visits/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const visitId = c.req.param("id");
    const visit = await kv.get(`site_visit:${visitId}`);

    if (!visit) {
      return c.json({ error: "Site visit not found" }, 404);
    }

    return c.json(visit);
  } catch (error: any) {
    console.error("Get site visit error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PHOTO ROUTES
// ============================================

// Create photo record (after upload to Supabase Storage)
app.post("/make-server-9fe75696/photos", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.get("userId");
    const data = await c.req.json();

    const photoId = crypto.randomUUID();
    const photo = {
      id: photoId,
      site_visit_id: data.site_visit_id,
      project_id: data.project_id,
      file_url: data.file_url,
      thumbnail_url: data.thumbnail_url,
      caption: data.caption || "",
      tags: data.tags || [],
      location: data.location || "",
      taken_at: data.taken_at || new Date().toISOString(),
      uploaded_by: userId,
      created_at: new Date().toISOString(),
    };

    await kv.set(`photo:${photoId}`, photo);
    await kv.set(`visit_photos:${data.site_visit_id}:${photoId}`, true);
    await kv.set(`project_photos:${data.project_id}:${photoId}`, true);

    return c.json(photo, 201);
  } catch (error: any) {
    console.error("Create photo error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get photos for a site visit
app.get("/make-server-9fe75696/site-visits/:visitId/photos", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const visitId = c.req.param("visitId");

    const photoKeys = await kv.getByPrefix(`visit_photos:${visitId}:`);
    const photoIds = photoKeys.map(({ key }) => key.split(":")[2]);

    const photos = await kv.mget(photoIds.map((id) => `photo:${id}`));

    return c.json(photos.filter(Boolean));
  } catch (error: any) {
    console.error("Get photos error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Update photo
app.put("/make-server-9fe75696/photos/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const photoId = c.req.param("id");
    const data = await c.req.json();

    const existing = await kv.get(`photo:${photoId}`);
    if (!existing) {
      return c.json({ error: "Photo not found" }, 404);
    }

    const updated = {
      ...existing,
      ...data,
    };

    await kv.set(`photo:${photoId}`, updated);
    return c.json(updated);
  } catch (error: any) {
    console.error("Update photo error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete photo
app.delete("/make-server-9fe75696/photos/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const photoId = c.req.param("id");
    await kv.del(`photo:${photoId}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Delete photo error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// TAG ROUTES
// ============================================

// Create tag
app.post("/make-server-9fe75696/tags", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const data = await c.req.json();

    const tagId = crypto.randomUUID();
    const tag = {
      id: tagId,
      name: data.name,
      category: data.category || "general",
      color: data.color || "#E10600",
      created_at: new Date().toISOString(),
    };

    await kv.set(`tag:${tagId}`, tag);

    return c.json(tag, 201);
  } catch (error: any) {
    console.error("Create tag error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all tags
app.get("/make-server-9fe75696/tags", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const tagKeys = await kv.getByPrefix("tag:");
    const tags = tagKeys.map(({ value }) => value);

    return c.json(tags);
  } catch (error: any) {
    console.error("Get tags error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// TEAM COLLABORATION ROUTES
// ============================================

// Add team member to project
app.post("/make-server-9fe75696/projects/:projectId/members", requireAuth, async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const denied = await denyIfCannotManageAccess(c, projectId);
    if (denied) return denied;

    const { user_id, role } = await c.req.json();

    await kv.set(`user_projects:${user_id}:${projectId}`, { role: role || "commenter" });

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Add team member error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get project members
app.get("/make-server-9fe75696/projects/:projectId/members", requireAuth, async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const denied = await denyIfNotProjectMember(c, projectId);
    if (denied) return denied;


    // This would need a more sophisticated query in production
    // For now, return empty array as this requires scanning all user_projects keys
    return c.json([]);
  } catch (error: any) {
    console.error("Get team members error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// FLOOR PLAN ROUTES
// ============================================

const FLOORPLAN_BUCKET = "redmark-floorplans";
const VOICENOTE_BUCKET = "redmark-voicenotes";

// Browsers' MediaRecorder often reports a codec-qualified mime type (e.g.
// iOS Safari's "audio/mp4;codecs=mp4a.40.2", Chrome/Firefox's
// "audio/webm;codecs=opus") — this is the real, correct type of what was
// recorded, and the client is right to keep using the full string for
// MediaRecorder itself. But this bucket's allowedMimeTypes are bare strings
// ("audio/mp4", "audio/webm", ...) with no codec parameters, and Storage's
// allowlist check does exact string matching — it does not strip
// parameters. Left as-is, EVERY codec-qualified recording gets rejected
// with 415, on every platform, not just iOS (confirmed: "audio/webm;
// codecs=opus is not supported" was the actual prod error). Normalizing
// here, at the one place that actually enforces the allowlist, fixes every
// current and future client/codec combination without having to chase
// specific codec strings in the bucket config.
function normalizeAudioMimeType(mime: string): string {
  return mime.split(";")[0].trim() || "audio/webm";
}

// ---------------------------------------------------------------------------
// Project-membership authorization
//
// Every route in this file runs on the SERVICE-ROLE client, which bypasses
// RLS entirely — so the row-level policies that protect the rest of the app
// do nothing here and each route has to authorize for itself. The voice-note
// routes never did, which meant any authenticated user could list, play,
// upload to or delete the voice notes of any visit whose UUID they had.
//
// NOTE: these deliberately re-implement is_project_member() / is_org_admin()
// rather than calling them over RPC. Those SQL functions resolve the caller
// via auth.uid(), which is NULL on a service-role connection — an RPC call
// would return false for everyone and lock the whole feature out. The logic
// below is the same, with the user id passed explicitly.
//
// FIRM (ORGANIZATION) AWARENESS — added with the organization migration.
// Two things changed and both matter:
//
//  1. The old admin fallback read `profiles.org_role === "admin"`. That is a
//     GLOBAL flag: it made an admin a member of every project in EVERY firm.
//     Behind a service-role client with no RLS backstop, that was a
//     cross-firm hole. Firm-admin status now comes from
//     organization_members.org_role and is always scoped to one firm.
//
//  2. A firm admin is deliberately NOT treated as a project member. Per the
//     approved model an admin manages ACCESS without automatically seeing
//     project CONTENTS, and these helpers must match the RLS policies
//     exactly or the edge function becomes the weaker of the two doors.
// ---------------------------------------------------------------------------

/** The caller's firm, or null if they belong to none. */
async function getUserOrgId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.organization_id ?? null;
}

/** The firm that owns a project, or null if the project does not exist. */
async function getProjectOrgId(projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data?.organization_id ?? null;
}

/** Firm-admin test, always scoped to a specific firm. */
async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  if (!orgId) return false;
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.org_role === "admin";
}

/**
 * Project membership, with the firm boundary enforced explicitly.
 *
 * The composite FKs make a cross-firm project_members row impossible, so the
 * firm comparison is belt-and-braces — but this code runs with NO RLS
 * backstop, so it does not rely on that alone.
 */
async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  const projectOrgId = await getProjectOrgId(projectId);
  if (!projectOrgId) return false; // unknown project → fail closed

  const userOrgId = await getUserOrgId(userId);
  if (!userOrgId || userOrgId !== projectOrgId) return false; // cross-firm → denied

  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * May this user change WHO has access to this project?
 * Firm admin of the project's firm, or the project's own owner. Mirrors the
 * Stage 4 project_members INSERT/UPDATE/DELETE policies.
 */
async function canManageProjectAccess(projectId: string, userId: string): Promise<boolean> {
  const projectOrgId = await getProjectOrgId(projectId);
  if (!projectOrgId) return false;

  const userOrgId = await getUserOrgId(userId);
  if (!userOrgId || userOrgId !== projectOrgId) return false;

  if (await isOrgAdmin(userId, projectOrgId)) return true;

  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === "owner";
}

/**
 * Gate for any route acting on a project. Returns a Response to send when
 * access is refused, or null to continue. Fails CLOSED on every error path.
 */
async function denyIfNotProjectMember(c: any, projectId: string): Promise<Response | null> {
  const userId = c.get("userId");
  if (!projectId || !userId) return c.json({ error: "Forbidden" }, 403);
  try {
    if (!(await isProjectMember(projectId, userId))) {
      console.warn("Forbidden: user", userId, "is not a member of project", projectId);
      return c.json({ error: "Forbidden: not a member of this project" }, 403);
    }
    return null;
  } catch (error: any) {
    console.error("Membership check failed:", error?.message);
    return c.json({ error: "Forbidden" }, 403);
  }
}

/** Gate for routes that change project access (invite, add/remove members). */
async function denyIfCannotManageAccess(c: any, projectId: string): Promise<Response | null> {
  const userId = c.get("userId");
  if (!projectId || !userId) return c.json({ error: "Forbidden" }, 403);
  try {
    if (!(await canManageProjectAccess(projectId, userId))) {
      console.warn("Forbidden: user", userId, "cannot manage access for project", projectId);
      return c.json({ error: "Forbidden: cannot manage members of this project" }, 403);
    }
    return null;
  } catch (error: any) {
    console.error("Access-management check failed:", error?.message);
    return c.json({ error: "Forbidden" }, 403);
  }
}

// ---------------------------------------------------------------------------
// FIRM ADMINISTRATION
//
// Everything below manages who is IN a firm. It is the entry point to the
// whole isolation model, so two rules are absolute:
//
//   1. `organization_id` is ALWAYS derived from the CALLER's own membership.
//      It is never read from the request body, never from a path parameter,
//      never from a lookup keyed on anything the caller supplied. An admin of
//      firm A therefore has no way to address firm B at all — not "is denied
//      access to", but has no way to name it.
//
//   2. Nothing here writes through the caller's identity. These routes run on
//      the service role with no RLS backstop, and organization_members has no
//      INSERT/UPDATE/DELETE policy for `authenticated` precisely so that these
//      routes are the only path in. Which means every one of them has to
//      authorize for itself.
// ---------------------------------------------------------------------------

/** How long a firm invitation stays claimable. */
const INVITATION_TTL_DAYS = 14;

/** Conservative address check; the DB CHECK constraint is the real authority. */
function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeOrgRole(raw: unknown): "admin" | "member" | null {
  if (raw === undefined || raw === null || raw === "") return "member";
  return raw === "admin" || raw === "member" ? raw : null;
}

/** Unguessable invitation token. Never the sole basis for a claim. */
function newInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Gate for every firm-administration route.
 *
 * Returns the CALLER's own organization id, or a Response to send. That
 * return value is the only source of `organization_id` anywhere below — which
 * is what makes "an admin of firm A cannot invite into firm B" structural
 * rather than a check someone has to remember to write.
 */
async function requireOrgAdmin(c: any): Promise<{ orgId: string } | Response> {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "Forbidden" }, 403);
  try {
    const orgId = await getUserOrgId(userId);
    if (!orgId) {
      return c.json(
        { error: "Vous n'appartenez à aucune firme.", code: "not_in_organization" },
        403,
      );
    }
    if (!(await isOrgAdmin(userId, orgId))) {
      return c.json(
        { error: "Réservé aux administrateurs de la firme.", code: "not_org_admin" },
        403,
      );
    }
    return { orgId };
  } catch (error: any) {
    console.error("Org-admin check failed:", error?.message);
    return c.json({ error: "Forbidden" }, 403);
  }
}

/** How many admins does this firm have? Used to refuse removing the last one. */
async function countOrgAdmins(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("org_role", "admin");
  if (error) throw error;
  return count ?? 0;
}

/** The target's membership row, but ONLY if they are in the caller's firm. */
async function getFirmMember(
  orgId: string,
  userId: string,
): Promise<{ user_id: string; org_role: string } | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, org_role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ---------------------------------------------------------------------------
// POST /organizations/invitations — create a firm invitation
// ---------------------------------------------------------------------------
app.post("/make-server-9fe75696/organizations/invitations", requireAuth, async (c) => {
  try {
    const gate = await requireOrgAdmin(c);
    if (gate instanceof Response) return gate;
    const { orgId } = gate;
    const inviterId = c.get("userId") as string;

    const body = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const orgRole = normalizeOrgRole(body?.orgRole);
    if (!email) return c.json({ error: "Adresse courriel invalide." }, 400);
    if (!orgRole) return c.json({ error: "Rôle de firme invalide." }, 400);

    // Is this person already in the CALLER'S OWN firm? Scoped to the caller's
    // firm on purpose: an admin may legitimately learn who is in their own
    // firm, but this route must not become an oracle for membership in other
    // firms. If they belong to some OTHER firm we say nothing and let the
    // invitation be created — the claim will refuse it later, which leaks
    // nothing to the inviter.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      const already = await getFirmMember(orgId, existingProfile.id);
      if (already) {
        return c.json(
          { error: "Cette personne fait déjà partie de votre firme.", code: "already_member" },
          409,
        );
      }
    }

    const token = newInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString();

    // Bare insert, deliberately: no .select() chained on. See the note on the
    // members/provision route below for why RETURNING is avoided throughout
    // this section. The token is generated here, so nothing needs reading back.
    const { error: insertError } = await supabase.from("organization_invitations").insert({
      organization_id: orgId, // ← the caller's firm. Never body.organizationId.
      email,
      org_role: orgRole,
      invited_by: inviterId,
      token,
      expires_at: expiresAt,
    });

    if (insertError) {
      // idx_organization_invitations_pending_unique: one pending invitation
      // per (firm, email).
      if ((insertError as any).code === "23505") {
        return c.json(
          {
            error: "Une invitation est déjà en attente pour cette adresse.",
            code: "invitation_pending",
          },
          409,
        );
      }
      throw insertError;
    }

    // Deliver the link. inviteUserByEmail fails when the address already has
    // an account — that is fine and not an error worth surfacing: an existing
    // user simply logs in, and the claim runs for them on login.
    let emailed = false;
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { organization_id: orgId, invitation_token: token },
    });
    if (inviteError) {
      console.warn("inviteUserByEmail did not send (likely existing account):", inviteError.message);
    } else {
      emailed = true;
    }

    return c.json({ success: true, email, orgRole, emailed, expiresAt });
  } catch (error: any) {
    console.error("Create invitation error:", error);
    return c.json({ error: `Erreur lors de l'invitation: ${error.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /organizations/invitations/:id — revoke
// ---------------------------------------------------------------------------
app.delete("/make-server-9fe75696/organizations/invitations/:id", requireAuth, async (c) => {
  try {
    const gate = await requireOrgAdmin(c);
    if (gate instanceof Response) return gate;
    const { orgId } = gate;

    // The `.eq("organization_id", orgId)` is the whole security of this route:
    // a firm-A admin passing a firm-B invitation id matches zero rows. There
    // is no separate "is it yours?" check to forget.
    const { data, error } = await supabase
      .from("organization_invitations")
      .delete()
      .eq("id", c.req.param("id"))
      .eq("organization_id", orgId)
      .is("accepted_at", null)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      return c.json({ error: "Invitation introuvable." }, 404);
    }
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Revoke invitation error:", error);
    return c.json({ error: `Erreur: ${error.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/claim — THE HANDSHAKE
//
// This is how a person ENTERS a firm, and therefore the single most
// security-sensitive route in the application.
//
// The email is taken from the admin API, keyed on the id in the VERIFIED JWT.
// It is never read from the request body — a body-supplied address would let
// anyone claim any invitation. The token, when present, only DISAMBIGUATES
// between multiple pending invitations for that same verified address; it can
// never substitute for the email match.
//
// The unverified-email refusal below is the load-bearing check. Supabase
// self-signup lets anyone create an account claiming a colleague's address;
// without this, doing so would hand them that colleague's invitation. The
// SQL function re-checks it independently, reading auth.users itself.
// ---------------------------------------------------------------------------
app.post("/make-server-9fe75696/organizations/claim", requireAuth, async (c) => {
  try {
    const userId = c.get("userId") as string;

    const body = await c.req.json().catch(() => ({}));
    const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
    const token = rawToken.length > 0 && rawToken.length <= 128 ? rawToken : null;

    // Identity from the admin API, not from the request.
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      console.error("claim: could not load user", userError?.message);
      return c.json({ error: "Utilisateur introuvable." }, 404);
    }

    if (!userData.user.email_confirmed_at) {
      return c.json(
        {
          error:
            "Confirmez d'abord votre adresse courriel. Le lien de confirmation vous a été envoyé.",
          code: "email_unverified",
        },
        403,
      );
    }

    // One transaction, in the database. See stage6-claim-invitation.sql.
    const { data, error } = await supabase.rpc("claim_organization_invitation", {
      p_user_id: userId,
      p_token: token,
    });

    if (error) {
      // The function RAISEs rather than returning a status when the
      // membership insert races another one, so that the invitation stamp
      // rolls back with it and the invitation stays claimable.
      if ((error.message || "").includes("ALREADY_IN_FIRM")) {
        return c.json(
          {
            error: "Cette personne appartient déjà à une autre firme.",
            code: "already_in_firm",
          },
          409,
        );
      }
      throw error;
    }

    const status = (data as any)?.status as string;

    switch (status) {
      case "claimed":
        return c.json({
          status,
          organizationId: (data as any).organization_id,
          orgRole: (data as any).org_role,
        });
      case "already_member":
        return c.json({ status, organizationId: (data as any).organization_id });
      case "none":
        return c.json(
          { status, error: "Aucune invitation en attente pour votre adresse." },
          404,
        );
      case "expired":
        return c.json(
          { status, error: "Votre invitation a expiré. Demandez-en une nouvelle." },
          410,
        );
      case "already_accepted":
        return c.json({ status, error: "Cette invitation a déjà été utilisée." }, 409);
      case "ambiguous":
        return c.json(
          {
            status,
            error:
              "Plusieurs invitations correspondent à votre adresse. Utilisez le lien reçu par courriel.",
          },
          409,
        );
      case "email_unverified":
        return c.json(
          { status, error: "Confirmez d'abord votre adresse courriel." },
          403,
        );
      default:
        console.error("claim: unexpected status", status);
        return c.json({ error: "Impossible de rejoindre la firme." }, 500);
    }
  } catch (error: any) {
    console.error("Claim invitation error:", error);
    return c.json({ error: `Erreur lors de l'adhésion: ${error.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/members/provision — admin creates the account directly
//
// The no-email-round-trip path. Covers both "no account yet" and "has an
// account but no firm". The admin never sees or sets a password: the account
// is created without one and a recovery link is generated so the person sets
// their own.
// ---------------------------------------------------------------------------
app.post("/make-server-9fe75696/organizations/members/provision", requireAuth, async (c) => {
  try {
    const gate = await requireOrgAdmin(c);
    if (gate instanceof Response) return gate;
    const { orgId } = gate;
    const inviterId = c.get("userId") as string;

    const body = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const orgRole = normalizeOrgRole(body?.orgRole);
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!email) return c.json({ error: "Adresse courriel invalide." }, 400);
    if (!orgRole) return c.json({ error: "Rôle de firme invalide." }, 400);

    // Create the account. email_confirm: true is correct HERE and nowhere
    // else — the address is being vouched for by a firm admin who is
    // provisioning it, not asserted by whoever is holding the keyboard.
    let targetUserId: string | null = null;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name },
    });

    if (created?.user) {
      targetUserId = created.user.id;
    } else if (createError) {
      // Already registered — the "has an account but no firm" case. Resolve
      // the id through profiles (written by the handle_new_user trigger).
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!existing?.id) {
        console.error("provision: createUser failed and no profile found:", createError.message);
        return c.json({ error: `Impossible de créer le compte: ${createError.message}` }, 400);
      }
      targetUserId = existing.id;
    }

    if (!targetUserId) return c.json({ error: "Impossible de créer le compte." }, 500);

    // Bare insert. No .select() chained: a firm admin cannot necessarily read
    // back every row they are entitled to write, and an INSERT ... RETURNING
    // that trips a SELECT policy fails AFTER the write — verified in the
    // sandbox, where the row was written but the read-back returned nothing.
    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: orgId, // ← caller's firm, always
      user_id: targetUserId,
      org_role: orgRole,
      invited_by: inviterId,
    });

    if (memberError) {
      // UNIQUE(user_id) — one firm per user.
      if ((memberError as any).code === "23505") {
        return c.json(
          { error: "Cette personne appartient déjà à une autre firme.", code: "already_in_firm" },
          409,
        );
      }
      throw memberError;
    }

    // Let them set their own password. The admin never handles a credential.
    let actionLink: string | null = null;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkError) {
      console.warn("provision: could not generate recovery link:", linkError.message);
    } else {
      actionLink = linkData?.properties?.action_link ?? null;
    }

    return c.json({ success: true, userId: targetUserId, email, orgRole, actionLink });
  } catch (error: any) {
    console.error("Provision member error:", error);
    return c.json({ error: `Erreur lors de la création: ${error.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/members/:userId/recovery-link — re-issue the set-password
// link for an account that was provisioned but never activated.
//
// WHY THIS IS RESTRICTED TO NEVER-SIGNED-IN ACCOUNTS
//
// A password-recovery link is a full account takeover primitive: whoever holds
// it sets the password. Handing firm admins the ability to mint one for ANY
// colleague would mean an admin could silently take over any account in the
// firm — including another admin's — which is a much larger power than
// "manages who has access".
//
// The problem this actually solves is narrower: an account created through
// /members/provision has no password and no email was sent, so if the admin
// loses the link the account is unreachable. That state is exactly
// `last_sign_in_at IS NULL`. Once someone has signed in they have working
// credentials, and the correct route for a forgotten password is the
// self-service reset on the login screen — which needs no admin at all and
// puts the link only in the mailbox owner's hands.
//
// So: null last_sign_in_at → re-issue. Otherwise → refuse and point at the
// self-service flow.
// ---------------------------------------------------------------------------
app.post(
  "/make-server-9fe75696/organizations/members/:userId/recovery-link",
  requireAuth,
  async (c) => {
    try {
      const gate = await requireOrgAdmin(c);
      if (gate instanceof Response) return gate;
      const { orgId } = gate;
      const targetId = c.req.param("userId");

      // Scoped to the caller's firm, so a target elsewhere reads as not found.
      const target = await getFirmMember(orgId, targetId);
      if (!target) return c.json({ error: "Membre introuvable dans votre firme." }, 404);

      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(targetId);
      if (userError || !userData?.user?.email) {
        console.error("recovery-link: could not load user", userError?.message);
        return c.json({ error: "Compte introuvable." }, 404);
      }

      if (userData.user.last_sign_in_at) {
        return c.json(
          {
            error:
              "Cette personne s'est déjà connectée. Elle peut utiliser « Mot de passe oublié ? » à l'écran de connexion.",
            code: "already_activated",
          },
          409,
        );
      }

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: userData.user.email,
      });
      if (linkError) throw linkError;

      const actionLink = linkData?.properties?.action_link ?? null;
      if (!actionLink) return c.json({ error: "Impossible de générer le lien." }, 500);

      console.log(
        `recovery-link re-issued for ${targetId} in org ${orgId} by ${c.get("userId")}`,
      );

      return c.json({ success: true, email: userData.user.email, actionLink });
    } catch (error: any) {
      console.error("Recovery link error:", error);
      return c.json({ error: `Erreur: ${error.message}` }, 500);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /organizations/members/:userId — promote / demote
// ---------------------------------------------------------------------------
app.patch("/make-server-9fe75696/organizations/members/:userId", requireAuth, async (c) => {
  try {
    const gate = await requireOrgAdmin(c);
    if (gate instanceof Response) return gate;
    const { orgId } = gate;

    const targetId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({}));
    const orgRole = normalizeOrgRole(body?.orgRole);
    if (!orgRole) return c.json({ error: "Rôle de firme invalide." }, 400);

    // Looked up WITHIN the caller's firm, so a target in another firm reads
    // as "not found" — same response as a nonexistent user, no cross-firm
    // membership oracle.
    const target = await getFirmMember(orgId, targetId);
    if (!target) return c.json({ error: "Membre introuvable dans votre firme." }, 404);

    // A firm with no admin cannot be administered again — nobody could
    // promote anyone, because promotion requires an admin. Refuse rather
    // than let someone strand their own firm.
    if (target.org_role === "admin" && orgRole === "member") {
      if ((await countOrgAdmins(orgId)) <= 1) {
        return c.json(
          {
            error: "Votre firme doit conserver au moins un administrateur.",
            code: "last_admin",
          },
          409,
        );
      }
    }

    const { error } = await supabase
      .from("organization_members")
      .update({ org_role: orgRole })
      .eq("organization_id", orgId)
      .eq("user_id", targetId);
    if (error) throw error;

    return c.json({ success: true, userId: targetId, orgRole });
  } catch (error: any) {
    console.error("Update member role error:", error);
    return c.json({ error: `Erreur: ${error.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /organizations/members/:userId[?cascade=1] — remove from the firm
//
// TWO BEHAVIOURS, and the destructive one must be asked for by name.
//
//   without ?cascade  — refuses if the person holds project rows, and NAMES
//                       the projects. The safe default: a caller who has not
//                       considered their project access gets told about it
//                       rather than silently destroying it.
//   with ?cascade=1   — revokes project access and firm membership together,
//                       in one transaction (stage7-remove-member.sql).
//
// project_members_user_org_fkey is ON DELETE RESTRICT, which is what makes
// both behaviours possible: the membership CANNOT be deleted while project
// rows exist, so there is no path that half-removes someone by accident.
//
// The auth account is deliberately NOT deleted. The person keeps a login that
// belongs to no firm and can reach nothing — deleting the identity is a
// separate decision, not a side effect of revoking access.
// ---------------------------------------------------------------------------
app.delete("/make-server-9fe75696/organizations/members/:userId", requireAuth, async (c) => {
  try {
    const gate = await requireOrgAdmin(c);
    if (gate instanceof Response) return gate;
    const { orgId } = gate;
    const callerId = c.get("userId") as string;
    const targetId = c.req.param("userId");

    if (targetId === callerId) {
      return c.json(
        { error: "Vous ne pouvez pas vous retirer vous-même de la firme.", code: "self_removal" },
        409,
      );
    }

    const target = await getFirmMember(orgId, targetId);
    if (!target) return c.json({ error: "Membre introuvable dans votre firme." }, 404);

    if (target.org_role === "admin" && (await countOrgAdmins(orgId)) <= 1) {
      return c.json(
        { error: "Votre firme doit conserver au moins un administrateur.", code: "last_admin" },
        409,
      );
    }

    // Check BEFORE attempting the delete, so the message can name the
    // projects. The FK is still the real guarantee — this is for the wording.
    //
    // Two queries rather than `.select("project_id, projects(name)")`:
    // project_members now has TWO foreign keys to projects — project_id_fkey
    // and the composite project_org_fkey — so PostgREST cannot decide which
    // relationship an embed means and fails with PGRST201.
    const { data: assignments, error: assignError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("organization_id", orgId)
      .eq("user_id", targetId);
    if (assignError) throw assignError;

    // `?cascade=1` revokes project access as part of the removal. Without it
    // the route still refuses and lists — the destructive behaviour is opt-in
    // at the API layer too, not only behind a dialog in one client. A caller
    // that has not thought about the project rows gets the safe answer.
    const cascade = ["1", "true", "yes"].includes(
      (c.req.query("cascade") || "").toLowerCase(),
    );

    if (assignments && assignments.length > 0 && !cascade) {
      const projectIds = assignments.map((a: any) => a.project_id).slice(0, 10);
      const { data: projectRows } = await supabase
        .from("projects")
        .select("name")
        .in("id", projectIds);
      const names = (projectRows || []).map((p: any) => p.name).filter(Boolean);
      return c.json(
        {
          error: `Retirez d'abord cette personne de ses ${assignments.length} projet(s).`,
          code: "has_project_memberships",
          count: assignments.length,
          projects: names,
        },
        409,
      );
    }

    // One transaction, in the database — see stage7-remove-member.sql. The
    // project rows MUST go before the membership (project_members_user_org_fkey
    // is RESTRICT), and a crash between the two would strip someone's project
    // access while leaving them in the firm. Doing it as two calls from here
    // could not rule that out.
    const { data: result, error } = await supabase.rpc("remove_organization_member", {
      p_org_id: orgId, // ← caller's firm, always
      p_user_id: targetId,
      p_actor_id: callerId,
    });
    if (error) throw error;

    const status = (result as any)?.status as string;

    switch (status) {
      case "removed":
        console.log(
          `member ${targetId} removed from org ${orgId} by ${callerId}; ` +
            `${(result as any).projects_removed} project row(s) revoked`,
        );
        return c.json({
          success: true,
          userId: targetId,
          projectsRemoved: (result as any).projects_removed ?? 0,
        });
      case "self_removal":
        return c.json(
          { error: "Vous ne pouvez pas vous retirer vous-même de la firme.", code: "self_removal" },
          409,
        );
      case "last_admin":
        return c.json(
          { error: "Votre firme doit conserver au moins un administrateur.", code: "last_admin" },
          409,
        );
      case "not_found":
        return c.json({ error: "Membre introuvable dans votre firme." }, 404);
      case "not_admin":
        // Reachable when the caller's own admin rights were revoked between
        // the gate above and the transaction.
        return c.json(
          { error: "Réservé aux administrateurs de la firme.", code: "not_org_admin" },
          403,
        );
      default:
        console.error("remove member: unexpected status", status);
        return c.json({ error: "Impossible de retirer ce membre." }, 500);
    }
  } catch (error: any) {
    console.error("Remove member error:", error);
    return c.json({ error: `Erreur: ${error.message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /organizations/me — the caller's own firm and role.
//
// Read-only convenience for the client's post-login gate. Everything here is
// already readable directly under RLS; this exists so the client can ask one
// question instead of three.
// ---------------------------------------------------------------------------
app.get("/make-server-9fe75696/organizations/me", requireAuth, async (c) => {
  try {
    const userId = c.get("userId") as string;
    const orgId = await getUserOrgId(userId);
    if (!orgId) return c.json({ organization: null, orgRole: null });

    const { data: org, error } = await supabase
      .from("organizations")
      .select("id, name, slug, report_firm_name")
      .eq("id", orgId)
      .maybeSingle();
    if (error) throw error;

    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_role")
      .eq("user_id", userId)
      .maybeSingle();

    return c.json({ organization: org, orgRole: membership?.org_role ?? null });
  } catch (error: any) {
    console.error("Get organization error:", error);
    return c.json({ error: `Erreur: ${error.message}` }, 500);
  }
});

// Resolves the visit's project and checks membership. Returns a Response to
// send when access is refused, or null to continue. Fails CLOSED: an
// unknown visit, a lookup error, or a non-member all stop the request.
async function denyIfNotVisitMember(c: any, visitId: string): Promise<Response | null> {
  const userId = c.get("userId");
  if (!visitId || !userId) return c.json({ error: "Forbidden" }, 403);

  try {
    const { data: visit, error } = await supabase
      .from("site_visits")
      .select("project_id")
      .eq("id", visitId)
      .maybeSingle();
    if (error) throw error;
    if (!visit) return c.json({ error: "Visite introuvable" }, 404);

    if (!(await isProjectMember(visit.project_id, userId))) {
      console.warn("Forbidden: user", userId, "is not a member of project", visit.project_id);
      return c.json({ error: "Forbidden: not a member of this project" }, 403);
    }
    return null;
  } catch (error: any) {
    console.error("Membership check failed:", error?.message);
    return c.json({ error: "Forbidden" }, 403);
  }
}

// Voice-note storage paths are written by this server as
// `{visitId}/{noteId}.{ext}`. Validating the shape before using the prefix
// as a visit id keeps a caller from smuggling a traversal or another
// bucket's key through the signed-url route.
const VOICENOTE_PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

// Signed URL for a stored voice note.
//
// This used to sign ANY {bucket, path} the caller asked for, with no check
// at all — a member of one project could mint a URL for another project's
// photos or floor plans just by naming the key. VoiceNotesSection is the
// only caller (grep: getSignedUrl), so it is now scoped to the voice-note
// bucket and gated on membership of the visit that owns the file.
app.post("/make-server-9fe75696/storage/signed-url", requireAuth, async (c) => {
  try {
    const { bucket, path, expiresIn } = await c.req.json();
    if (!bucket || !path) return c.json({ error: "bucket and path required" }, 400);

    if (bucket !== VOICENOTE_BUCKET) {
      return c.json({ error: "Forbidden: unsupported bucket" }, 403);
    }
    const match = VOICENOTE_PATH.exec(path);
    if (!match) return c.json({ error: "Forbidden: invalid path" }, 403);

    const denied = await denyIfNotVisitMember(c, match[1]);
    if (denied) return denied;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn || 86400);
    if (error) throw error;
    return c.json({ signedUrl: data.signedUrl });
  } catch (error: any) {
    console.error("Signed URL error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Upload a floor plan file (multipart) and create its record
app.post("/make-server-9fe75696/projects/:projectId/floor-plans", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const projectId = c.req.param("projectId");
    const denied = await denyIfNotProjectMember(c, projectId);
    if (denied) return denied;

    const form = await c.req.formData();
    const file = form.get("file") as File | null;
    const name = (form.get("name") as string) || (file?.name ?? "Plan");
    const level = (form.get("level") as string) || "";
    if (!file) return c.json({ error: "file is required" }, 400);

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const floorPlanId = crypto.randomUUID();
    const storagePath = `${projectId}/${floorPlanId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(FLOORPLAN_BUCKET)
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType: file.type || "image/png",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const floorPlan = {
      id: floorPlanId,
      project_id: projectId,
      name,
      level,
      storage_path: storagePath,
      bucket: FLOORPLAN_BUCKET,
      content_type: file.type || "image/png",
      uploaded_by: userId,
      created_at: new Date().toISOString(),
    };
    await kv.set(`floor_plan:${floorPlanId}`, floorPlan);
    await kv.set(`project_floor_plans:${projectId}:${floorPlanId}`, true);

    return c.json(floorPlan, 201);
  } catch (error: any) {
    console.error("Create floor plan error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// List floor plans for a project
app.get("/make-server-9fe75696/projects/:projectId/floor-plans", requireAuth, async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const denied = await denyIfNotProjectMember(c, projectId);
    if (denied) return denied;

    const keys = await kv.getByPrefix(`project_floor_plans:${projectId}:`);
    const ids = keys.map(({ key }) => key.split(":")[2]);
    if (ids.length === 0) return c.json([]);
    const plans = await kv.mget(ids.map((id) => `floor_plan:${id}`));
    return c.json(plans.filter(Boolean));
  } catch (error: any) {
    console.error("List floor plans error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get a single floor plan
app.get("/make-server-9fe75696/floor-plans/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const id = c.req.param("id");
    const plan = await kv.get(`floor_plan:${id}`);
    if (!plan) return c.json({ error: "Floor plan not found" }, 404);
    return c.json(plan);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete floor plan (and its pins)
app.delete("/make-server-9fe75696/floor-plans/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const id = c.req.param("id");
    const plan: any = await kv.get(`floor_plan:${id}`);
    if (plan?.storage_path) {
      await supabase.storage
        .from(FLOORPLAN_BUCKET)
        .remove([plan.storage_path])
        .catch(() => {});
    }
    // Remove pins linked to this floor plan
    const pinKeys = await kv.getByPrefix(`floor_plan_pins:${id}:`);
    for (const { key } of pinKeys) {
      const pinId = key.split(":")[2];
      await kv.del(`pin:${pinId}`);
      await kv.del(key);
    }
    await kv.del(`floor_plan:${id}`);
    if (plan?.project_id) {
      await kv.del(`project_floor_plans:${plan.project_id}:${id}`);
    }
    return c.json({ success: true });
  } catch (error: any) {
    console.error("Delete floor plan error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// FLOOR PLAN PIN ROUTES
// ============================================

// Create pin on a floor plan (normalized x/y in [0,1])
app.post("/make-server-9fe75696/floor-plans/:id/pins", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const userId = c.get("userId");
    const floorPlanId = c.req.param("id");
    const data = await c.req.json();
    const pinId = crypto.randomUUID();
    const pin = {
      id: pinId,
      floor_plan_id: floorPlanId,
      issue_id: data.issue_id || null,
      x: typeof data.x === "number" ? data.x : 0,
      y: typeof data.y === "number" ? data.y : 0,
      label: data.label || "",
      created_by: userId,
      created_at: new Date().toISOString(),
    };
    await kv.set(`pin:${pinId}`, pin);
    await kv.set(`floor_plan_pins:${floorPlanId}:${pinId}`, true);
    if (data.issue_id) {
      await kv.set(`issue_pin:${data.issue_id}`, pinId);
    }
    return c.json(pin, 201);
  } catch (error: any) {
    console.error("Create pin error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// List pins for a floor plan
app.get("/make-server-9fe75696/floor-plans/:id/pins", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const floorPlanId = c.req.param("id");
    const keys = await kv.getByPrefix(`floor_plan_pins:${floorPlanId}:`);
    const ids = keys.map(({ key }) => key.split(":")[2]);
    if (ids.length === 0) return c.json([]);
    const pins = await kv.mget(ids.map((id) => `pin:${id}`));
    return c.json(pins.filter(Boolean));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update pin (move it, or relink to another issue)
app.put("/make-server-9fe75696/pins/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const pinId = c.req.param("id");
    const existing: any = await kv.get(`pin:${pinId}`);
    if (!existing) return c.json({ error: "Pin not found" }, 404);
    const data = await c.req.json();
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
    await kv.set(`pin:${pinId}`, updated);
    if (data.issue_id && data.issue_id !== existing.issue_id) {
      await kv.set(`issue_pin:${data.issue_id}`, pinId);
    }
    return c.json(updated);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete pin
app.delete("/make-server-9fe75696/pins/:id", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const pinId = c.req.param("id");
    const pin: any = await kv.get(`pin:${pinId}`);
    if (pin) {
      await kv.del(`floor_plan_pins:${pin.floor_plan_id}:${pinId}`);
      if (pin.issue_id) await kv.del(`issue_pin:${pin.issue_id}`);
    }
    await kv.del(`pin:${pinId}`);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// ISSUE EXTRAS (trade/discipline, severity, related photos)
// Stored alongside the existing issues table so we don't touch DB schema
// ============================================

app.get("/make-server-9fe75696/issues/:id/extras", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const id = c.req.param("id");
    const extras = await kv.get(`issue_extras:${id}`);
    return c.json(extras || { issue_id: id, trade: "", severity: "", related_photo_ids: [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.put("/make-server-9fe75696/issues/:id/extras", requireAuth, async (c) => {
  try {
    if (LEGACY_KV_ROUTES_DISABLED) return legacyGone(c);
    const id = c.req.param("id");
    const data = await c.req.json();
    const existing: any = (await kv.get(`issue_extras:${id}`)) || {};
    const updated = {
      issue_id: id,
      trade: data.trade ?? existing.trade ?? "",
      severity: data.severity ?? existing.severity ?? "",
      related_photo_ids: data.related_photo_ids ?? existing.related_photo_ids ?? [],
      floor_plan_id: data.floor_plan_id ?? existing.floor_plan_id ?? null,
      pin_id: data.pin_id ?? existing.pin_id ?? null,
      updated_at: new Date().toISOString(),
    };
    await kv.set(`issue_extras:${id}`, updated);
    return c.json(updated);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// VOICE NOTES (placeholder for future transcription)
// ============================================

// Upload voice note (audio file) for a site visit
app.post("/make-server-9fe75696/site-visits/:visitId/voice-notes", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const visitId = c.req.param("visitId");

    const denied = await denyIfNotVisitMember(c, visitId);
    if (denied) return denied;

    const form = await c.req.formData();
    const file = form.get("file") as File | null;
    const duration = parseFloat((form.get("duration") as string) || "0");
    if (!file) return c.json({ error: "file is required" }, 400);

    const ext = (file.name.split(".").pop() || "webm").toLowerCase();
    const noteId = crypto.randomUUID();
    const storagePath = `${visitId}/${noteId}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const contentType = normalizeAudioMimeType(file.type || "audio/webm");
    const { error: uploadError } = await supabase.storage
      .from(VOICENOTE_BUCKET)
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const note = {
      id: noteId,
      site_visit_id: visitId,
      storage_path: storagePath,
      bucket: VOICENOTE_BUCKET,
      content_type: contentType,
      duration_seconds: duration,
      transcription: null,
      // "none", not "pending": transcription is per-note opt-in. Site audio
      // can carry client and contractor conversation, so the person who
      // knows what is on a given recording decides whether it leaves for a
      // third party. Nothing moves off "none" without an explicit request.
      transcription_status: "none",
      created_by: userId,
      created_at: new Date().toISOString(),
    };
    await kv.set(`voice_note:${noteId}`, note);
    await kv.set(`visit_voice_notes:${visitId}:${noteId}`, true);

    return c.json(note, 201);
  } catch (error: any) {
    console.error("Create voice note error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// List voice notes for a site visit
app.get("/make-server-9fe75696/site-visits/:visitId/voice-notes", requireAuth, async (c) => {
  try {
    const visitId = c.req.param("visitId");

    const denied = await denyIfNotVisitMember(c, visitId);
    if (denied) return denied;

    const keys = await kv.getByPrefix(`visit_voice_notes:${visitId}:`);
    const ids = keys.map(({ key }) => key.split(":")[2]);
    if (ids.length === 0) return c.json([]);
    const notes = await kv.mget(ids.map((id) => `voice_note:${id}`));
    return c.json(notes.filter(Boolean));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Transcription (OpenAI Whisper) — explicitly requested, one note at a time.
// ---------------------------------------------------------------------------

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

// Biases Whisper toward the vocabulary of a Québec construction site. Without
// it "gypse" and "solin" come back as approximate French words.
const TRANSCRIPTION_PROMPT =
  "gypse, solin, colombage, déficience, entrepreneur, coupe-feu, allège, " +
  "coffrage, parement, membrane, scellant, dalle, fenestration, garde-corps";

// A "processing" note older than this is assumed to belong to a request that
// died (cold start, deploy, client hang-up) and may be retried.
const TRANSCRIPTION_STALE_MS = 5 * 60 * 1000;

// Everything the user might see. Kept short and in French: these land in a
// note row on a phone, not in a log.
function describeTranscriptionFailure(status: number, body: string): string {
  if (status === 401 || status === 403) return "Transcription indisponible (clé API).";
  if (status === 429 || /insufficient_quota|billing/i.test(body))
    return "Quota de transcription épuisé.";
  if (status === 413) return "Note trop longue pour la transcription.";
  if (status === 400) return "Format audio non pris en charge.";
  if (status >= 500) return "Service de transcription indisponible.";
  return "Transcription échouée.";
}

app.post("/make-server-9fe75696/voice-notes/:id/transcribe", requireAuth, async (c) => {
  const id = c.req.param("id");
  const note: any = await kv.get(`voice_note:${id}`);
  if (!note) return c.json({ error: "Note introuvable" }, 404);
  if (!note.site_visit_id) return c.json({ error: "Forbidden" }, 403);

  const denied = await denyIfNotVisitMember(c, note.site_visit_id);
  if (denied) return denied;

  // Idempotent: an already-transcribed note is returned untouched, and a
  // request that is genuinely still running is not started a second time.
  if (note.transcription_status === "done") return c.json(note);
  if (note.transcription_status === "processing") {
    const startedAt = Date.parse(note.transcription_started_at || "");
    const fresh = Number.isFinite(startedAt) && Date.now() - startedAt < TRANSCRIPTION_STALE_MS;
    if (fresh) return c.json(note);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    // Config fault, not a note fault — don't burn the note's status on it.
    console.error("transcribe: OPENAI_API_KEY is not set");
    return c.json({ error: "Transcription non configurée." }, 503);
  }

  const processing = {
    ...note,
    transcription_status: "processing",
    transcription_started_at: new Date().toISOString(),
    transcription_error: null,
  };
  await kv.set(`voice_note:${id}`, processing);

  try {
    const { data: audio, error: downloadError } = await supabase.storage
      .from(note.bucket || VOICENOTE_BUCKET)
      .download(note.storage_path);
    if (downloadError || !audio) throw new Error(downloadError?.message || "download failed");

    // Whisper sniffs the container from the filename extension, so the
    // stored path's extension is carried through rather than invented.
    const ext = (note.storage_path.split(".").pop() || "webm").toLowerCase();
    const form = new FormData();
    form.append("file", audio, `note.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "fr");
    form.append("prompt", TRANSCRIPTION_PROMPT);
    form.append("response_format", "json");

    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("transcribe: OpenAI returned", res.status, body.slice(0, 500));
      const failed = {
        ...processing,
        transcription_status: "error",
        transcription_error: describeTranscriptionFailure(res.status, body),
      };
      // The audio is the evidence; the transcript is a convenience. A failed
      // transcription never touches the recording.
      await kv.set(`voice_note:${id}`, failed);
      return c.json(failed);
    }

    const payload = await res.json();
    const done = {
      ...processing,
      transcription: (payload.text || "").trim(),
      transcription_status: "done",
      transcribed_at: new Date().toISOString(),
      transcription_error: null,
    };
    await kv.set(`voice_note:${id}`, done);
    return c.json(done);
  } catch (error: any) {
    console.error("transcribe: failed", error?.message);
    const failed = {
      ...processing,
      transcription_status: "error",
      transcription_error: "Service de transcription indisponible.",
    };
    await kv.set(`voice_note:${id}`, failed);
    return c.json(failed);
  }
});

// Delete voice note
app.delete("/make-server-9fe75696/voice-notes/:id", requireAuth, async (c) => {
  try {
    const id = c.req.param("id");
    const note: any = await kv.get(`voice_note:${id}`);

    // Resolve the note first so the visit — and therefore the project — is
    // known before anything is removed. A note with no visit is not
    // authorizable, so it is refused rather than deleted blind.
    if (!note) return c.json({ error: "Note introuvable" }, 404);
    if (!note.site_visit_id) return c.json({ error: "Forbidden" }, 403);

    const denied = await denyIfNotVisitMember(c, note.site_visit_id);
    if (denied) return denied;

    if (note?.storage_path) {
      await supabase.storage
        .from(VOICENOTE_BUCKET)
        .remove([note.storage_path])
        .catch(() => {});
    }
    if (note?.site_visit_id) {
      await kv.del(`visit_voice_notes:${note.site_visit_id}:${id}`);
    }
    await kv.del(`voice_note:${id}`);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STORAGE INITIALIZATION
// ============================================

// Initialize Supabase Storage buckets on startup
async function initializeStorage() {
  const buckets = [
    {
      name: "redmark-photos",
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/heic", "image/webp"],
    },
    {
      name: FLOORPLAN_BUCKET,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    },
    {
      name: VOICENOTE_BUCKET,
      fileSizeLimit: 26214400,
      allowedMimeTypes: ["audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"],
    },
  ];
  try {
    const { data: existing } = await supabase.storage.listBuckets();
    for (const b of buckets) {
      const exists = existing?.some((x) => x.name === b.name);
      if (!exists) {
        await supabase.storage.createBucket(b.name, {
          public: false,
          fileSizeLimit: b.fileSizeLimit,
          allowedMimeTypes: b.allowedMimeTypes,
        });
        console.log("✅ Created Supabase Storage bucket:", b.name);
      } else {
        console.log("✅ Storage bucket already exists:", b.name);
      }
    }
  } catch (error) {
    console.error("❌ Storage initialization error:", error);
  }
}

// Initialize default tags on startup
async function initializeDefaultTags() {
  try {
    const existingTags = await kv.getByPrefix("tag:");

    if (existingTags.length === 0) {
      const defaultTags = [
        { name: "Problème structurel", color: "#E10600", category: "issue" },
        { name: "Déficience électrique", color: "#FF6B00", category: "issue" },
        { name: "Plomberie", color: "#0066CC", category: "issue" },
        { name: "Fissure", color: "#DC2626", category: "issue" },
        { name: "Humidité", color: "#2563EB", category: "issue" },
        { name: "Finitions", color: "#00AA44", category: "progress" },
        { name: "Conforme", color: "#16A34A", category: "progress" },
        { name: "Qualité excellente", color: "#059669", category: "progress" },
        { name: "À vérifier", color: "#FFAA00", category: "inspection" },
        { name: "Urgent", color: "#DC2626", category: "inspection" },
        { name: "À corriger", color: "#EA580C", category: "inspection" },
        { name: "Sécurité", color: "#991B1B", category: "safety" },
      ];

      for (const tagData of defaultTags) {
        const tagId = crypto.randomUUID();
        const tag = {
          id: tagId,
          name: tagData.name,
          color: tagData.color,
          category: tagData.category,
          created_at: new Date().toISOString(),
        };
        await kv.set(`tag:${tagId}`, tag);
      }

      console.log("✅ Initialized", defaultTags.length, "default tags");
    } else {
      console.log("✅ Tags already initialized, count:", existingTags.length);
    }
  } catch (error) {
    console.error("❌ Tag initialization error:", error);
  }
}

// Initialize on startup
initializeStorage();
initializeDefaultTags();

// ============================================
// INVITE MEMBER BY EMAIL
// ============================================
app.post("/make-server-9fe75696/projects/:projectId/invite", requireAuth, async (c) => {
  try {
    // BUG FIX: this read `(c as any).userId`, but requireAuth stores the id
    // with c.set("userId", ...). It was therefore always undefined — the
    // invited_by column was written empty and the inviter-name lookup below
    // always missed, so every invitation notification said "Un collègue".
    const inviterId = c.get("userId") as string;
    const projectId = c.req.param("projectId");
    const { email, role, projectName } = await c.req.json();

    if (!email || !projectId) {
      return c.json({ error: "email and projectId required" }, 400);
    }

    // Only a firm admin or the project's owner may grant access.
    const denied = await denyIfCannotManageAccess(c, projectId);
    if (denied) return denied;

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The project's firm — the invitee must already belong to it. Resolved
    // from the project rather than from the caller so the two cannot drift.
    const projectOrgId = await getProjectOrgId(projectId);
    if (!projectOrgId) return c.json({ error: "Projet introuvable" }, 404);

    // Look the invitee up, then confirm they are in the project's firm.
    //
    // This was previously a global lookup by email across all profiles, which
    // made the route an email oracle: anyone could probe whether a given
    // address had a RedMark account in any firm, and the response even
    // returned that person's name.
    //
    // Two queries rather than an embedded join: profiles and
    // organization_members both reference auth.users(id) and have no foreign
    // key BETWEEN them, so PostgREST cannot infer the relationship and
    // `organization_members!inner(...)` would fail at runtime.
    const { data: candidate } = await adminSupabase
      .from("profiles")
      .select("id, name, email")
      .eq("email", email)
      .maybeSingle();

    let existingProfile: { id: string; name: string | null; email: string } | null = null;
    if (candidate?.id) {
      const { data: sameFirm } = await adminSupabase
        .from("organization_members")
        .select("user_id")
        .eq("user_id", candidate.id)
        .eq("organization_id", projectOrgId)
        .maybeSingle();
      // Outside the firm is reported exactly like "no account at all", so the
      // response cannot be used to probe for accounts in other firms.
      if (sameFirm) existingProfile = candidate;
    }

    // Add to project_members with Supabase user_id if known, else store email pending
    if (existingProfile?.id) {
      // User exists: add directly to project_members
      const { error: memberError } = await adminSupabase.from("project_members").upsert(
        {
          project_id: projectId,
          user_id: existingProfile.id,
          role: role || "commenter",
          invited_by: inviterId,
        },
        { onConflict: "project_id,user_id" },
      );

      if (memberError) throw memberError;

      // Create in-app notification for the invited user
      const inviterProfile = await adminSupabase
        .from("profiles")
        .select("name, email")
        .eq("id", inviterId)
        .maybeSingle();

      const inviterName = inviterProfile.data?.name || inviterProfile.data?.email || "Un collègue";

      await adminSupabase.from("notifications").insert({
        user_id: existingProfile.id,
        type: "project_invitation",
        title: "Invitation à un projet",
        message: `${inviterName} vous a invité à collaborer sur le projet "${projectName || "RedMark"}"`,
        data: { project_id: projectId, role, invited_by: inviterId },
        read: false,
      });

      // Also send invite email so they have a link
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: { project_id: projectId, role },
      });

      return c.json({ success: true, existing: true, name: existingProfile.name });
    } else {
      // The invitee is not in this project's firm (or has no account at all).
      //
      // This branch used to send a Supabase Auth invite carrying project_id
      // in the metadata. Under the organization model that path cannot
      // complete: the new account would belong to NO firm, and the
      // project_members insert would be rejected by
      // project_members_user_org_fkey. Sending the email anyway would give
      // the recipient a link that silently leads nowhere.
      //
      // Bringing someone new INTO the firm is the organization_invitations
      // flow, which is scoped as separate work. Until then this fails
      // explicitly rather than pretending to succeed.
      return c.json(
        {
          error:
            "Cette personne ne fait pas partie de votre firme. Ajoutez-la d'abord à la firme, puis invitez-la au projet.",
          code: "not_in_organization",
        },
        409,
      );
    }
  } catch (error: any) {
    console.error("Invite member error:", error);
    return c.json({ error: `Erreur lors de l'invitation: ${error.message}` }, 500);
  }
});

// Get project members from Supabase (with profile info)
app.get("/make-server-9fe75696/projects/:projectId/members-list", requireAuth, async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const denied = await denyIfNotProjectMember(c, projectId);
    if (denied) return denied;


    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await adminSupabase
      .from("project_members")
      .select("id, role, invited_by, created_at, user_id, profiles(name, email)")
      .eq("project_id", projectId);

    if (error) throw error;

    const members = (data || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      invited_by: m.invited_by,
      created_at: m.created_at,
      name: m.profiles?.name || m.profiles?.email || "Membre",
      email: m.profiles?.email || "",
      status: "active",
    }));

    return c.json(members);
  } catch (error: any) {
    console.error("Get members error:", error);
    return c.json({ error: `Erreur: ${error.message}` }, 500);
  }
});

Deno.serve(app.fetch);
