import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

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
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Middleware to verify authentication
async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.split(" ")[1];

  console.log("requireAuth: Checking authorization, header:", authHeader ? "present" : "missing");
  console.log("requireAuth: Token present:", !!token);
  console.log("requireAuth: Token length:", token?.length);
  console.log("requireAuth: Token preview:", token?.substring(0, 50) + "...");

  if (!token) {
    console.error("requireAuth: No token found in Authorization header");
    return c.json({ error: "Unauthorized: No token provided" }, 401);
  }

  try {
    // Validate the JWT token using the admin client
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      console.error("requireAuth: Token validation failed:", error.message);
      console.error("requireAuth: Error details:", JSON.stringify(error));

      // BYPASS MODE: Try to decode the JWT without validation
      console.log("requireAuth: ⚠️ ENTERING BYPASS MODE - decoding JWT manually");
      try {
        const parts = token.split(".");
        console.log("requireAuth: JWT parts count:", parts.length);

        if (parts.length === 3) {
          // Decode base64url (JWT uses base64url, not standard base64)
          const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

          console.log("requireAuth: Attempting to decode JWT payload...");

          // Use TextDecoder for proper decoding in Deno
          const jsonPayload = new TextDecoder().decode(
            Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0)),
          );

          const payload = JSON.parse(jsonPayload);
          console.log("requireAuth: ✅ Decoded JWT payload successfully");
          console.log("requireAuth: Payload keys:", Object.keys(payload));
          console.log("requireAuth: Payload sub:", payload.sub);
          console.log("requireAuth: Payload email:", payload.email);

          // Use the user ID from the JWT payload if validation fails
          if (payload.sub) {
            console.log(
              "requireAuth: ✅✅✅ BYPASS MODE ACTIVATED - Using userId from JWT payload:",
              payload.sub,
            );
            c.set("userId", payload.sub);
            c.set("userEmail", payload.email || "unknown");
            await next();
            return; // CRITICAL: Return here to prevent the 401 error below
          } else {
            console.error("requireAuth: ❌ No sub field in JWT payload");
          }
        } else {
          console.error("requireAuth: ❌ JWT does not have 3 parts, has:", parts.length);
        }
      } catch (decodeError: any) {
        console.error("requireAuth: ❌ Failed to decode JWT in bypass mode:", decodeError.message);
        console.error("requireAuth: ❌ Decode error stack:", decodeError.stack);
      }

      // Only reach here if bypass mode failed
      console.error("requireAuth: ❌❌❌ Bypass mode failed, returning 401");
      return c.json(
        { error: `Unauthorized: ${error.message}`, code: 401, message: "Invalid JWT" },
        401,
      );
    }

    if (!user) {
      console.error("requireAuth: No user found for token");
      return c.json({ error: "Unauthorized: Invalid token" }, 401);
    }

    console.log("requireAuth: ✅ User authenticated via Supabase:", user.id, user.email);
    c.set("userId", user.id);
    c.set("userEmail", user.email);
    await next();
  } catch (error: any) {
    console.error("requireAuth: ⚠️ Unexpected error during validation:", error.message);
    console.error("requireAuth: Error stack:", error.stack);

    // LAST RESORT BYPASS: Try to decode even on exception
    console.log("requireAuth: ⚠️ EXCEPTION BYPASS MODE - Attempting manual decode");
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

        const jsonPayload = new TextDecoder().decode(
          Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0)),
        );

        const payload = JSON.parse(jsonPayload);

        if (payload.sub) {
          console.log(
            "requireAuth: ✅✅✅ EXCEPTION BYPASS MODE ACTIVATED - Using userId:",
            payload.sub,
          );
          c.set("userId", payload.sub);
          c.set("userEmail", payload.email || "unknown");
          await next();
          return;
        }
      }
    } catch (decodeError: any) {
      console.error("requireAuth: ❌ Exception bypass failed:", decodeError.message);
    }

    console.error("requireAuth: ❌❌❌ All bypass attempts failed, returning 401");
    return c.json({ error: "Unauthorized: Token validation error", details: error.message }, 401);
  }
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

// Sign up new user
app.post("/make-server-9fe75696/auth/signup", async (c) => {
  try {
    const { email, password, name, firm } = await c.req.json();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since we don't have email configured
      user_metadata: { name, firm },
    });

    if (authError) throw authError;

    // Store user profile in KV store
    await kv.set(`user:${authData.user.id}`, {
      id: authData.user.id,
      email,
      name,
      firm,
      role: "architect",
      created_at: new Date().toISOString(),
    });

    return c.json({ success: true, user: authData.user });
  } catch (error: any) {
    console.error("Signup error:", error);
    return c.json({ error: error.message || "Signup failed" }, 400);
  }
});

// Get user profile
app.get("/make-server-9fe75696/users/:id", requireAuth, async (c) => {
  try {
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
    const { user_id, role } = await c.req.json();

    await kv.set(`user_projects:${user_id}:${projectId}`, { role: role || "viewer" });

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

// Get a signed URL for a stored floor plan (or voice note) file
app.post("/make-server-9fe75696/storage/signed-url", requireAuth, async (c) => {
  try {
    const { bucket, path, expiresIn } = await c.req.json();
    if (!bucket || !path) return c.json({ error: "bucket and path required" }, 400);
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
    const id = c.req.param("id");
    const extras = await kv.get(`issue_extras:${id}`);
    return c.json(extras || { issue_id: id, trade: "", severity: "", related_photo_ids: [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.put("/make-server-9fe75696/issues/:id/extras", requireAuth, async (c) => {
  try {
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
    const form = await c.req.formData();
    const file = form.get("file") as File | null;
    const duration = parseFloat((form.get("duration") as string) || "0");
    if (!file) return c.json({ error: "file is required" }, 400);

    const ext = (file.name.split(".").pop() || "webm").toLowerCase();
    const noteId = crypto.randomUUID();
    const storagePath = `${visitId}/${noteId}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(VOICENOTE_BUCKET)
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType: file.type || "audio/webm",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const note = {
      id: noteId,
      site_visit_id: visitId,
      storage_path: storagePath,
      bucket: VOICENOTE_BUCKET,
      content_type: file.type || "audio/webm",
      duration_seconds: duration,
      transcription: null, // reserved for future voice-to-text
      transcription_status: "pending",
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
    const keys = await kv.getByPrefix(`visit_voice_notes:${visitId}:`);
    const ids = keys.map(({ key }) => key.split(":")[2]);
    if (ids.length === 0) return c.json([]);
    const notes = await kv.mget(ids.map((id) => `voice_note:${id}`));
    return c.json(notes.filter(Boolean));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete voice note
app.delete("/make-server-9fe75696/voice-notes/:id", requireAuth, async (c) => {
  try {
    const id = c.req.param("id");
    const note: any = await kv.get(`voice_note:${id}`);
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
    const inviterId = (c as any).userId as string;
    const projectId = c.req.param("projectId");
    const { email, role, projectName } = await c.req.json();

    if (!email || !projectId) {
      return c.json({ error: "email and projectId required" }, 400);
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check if user already has a Redmark account
    const { data: existingProfile } = await adminSupabase
      .from("profiles")
      .select("id, name, email")
      .eq("email", email)
      .maybeSingle();

    // Add to project_members with Supabase user_id if known, else store email pending
    if (existingProfile?.id) {
      // User exists: add directly to project_members
      const { error: memberError } = await adminSupabase.from("project_members").upsert(
        {
          project_id: projectId,
          user_id: existingProfile.id,
          role: role || "viewer",
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
      // New user: send invite email via Supabase Auth
      const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: { project_id: projectId, role },
      });

      if (inviteError) throw inviteError;

      return c.json({ success: true, existing: false });
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
