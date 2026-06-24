import { supabase } from "./supabase";
import { projectId as supabaseProjectId, publicAnonKey } from "/utils/supabase/info";

const BASE = `https://${supabaseProjectId}.supabase.co/functions/v1/make-server-9fe75696`;

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || publicAnonKey;
  return { Authorization: `Bearer ${token}` };
}

async function jsonReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(init.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export interface FloorPlan {
  id: string;
  project_id: string;
  name: string;
  level: string;
  storage_path: string;
  bucket: string;
  content_type: string;
  uploaded_by: string;
  created_at: string;
}

export interface FloorPlanPin {
  id: string;
  floor_plan_id: string;
  issue_id: string | null;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  label?: string;
  created_at: string;
}

export interface IssueExtras {
  issue_id: string;
  trade: string;
  severity: string;
  related_photo_ids: string[];
  floor_plan_id?: string | null;
  pin_id?: string | null;
}

export async function listFloorPlans(projectId: string): Promise<FloorPlan[]> {
  return jsonReq(`/projects/${projectId}/floor-plans`);
}

export async function uploadFloorPlan(
  projectId: string,
  file: File,
  name: string,
  level: string,
): Promise<FloorPlan> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("level", level);
  const res = await fetch(`${BASE}/projects/${projectId}/floor-plans`, {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function deleteFloorPlan(id: string): Promise<void> {
  await jsonReq(`/floor-plans/${id}`, { method: "DELETE" });
}

export async function getFloorPlanSignedUrl(
  bucket: string,
  path: string,
): Promise<string> {
  const data = await jsonReq<{ signedUrl: string }>(`/storage/signed-url`, {
    method: "POST",
    body: JSON.stringify({ bucket, path, expiresIn: 86400 }),
  });
  return data.signedUrl;
}

export async function listPins(floorPlanId: string): Promise<FloorPlanPin[]> {
  return jsonReq(`/floor-plans/${floorPlanId}/pins`);
}

export async function createPin(
  floorPlanId: string,
  x: number,
  y: number,
  issueId?: string | null,
  label?: string,
): Promise<FloorPlanPin> {
  return jsonReq(`/floor-plans/${floorPlanId}/pins`, {
    method: "POST",
    body: JSON.stringify({ x, y, issue_id: issueId || null, label: label || "" }),
  });
}

export async function updatePin(
  pinId: string,
  patch: Partial<FloorPlanPin>,
): Promise<FloorPlanPin> {
  return jsonReq(`/pins/${pinId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deletePin(pinId: string): Promise<void> {
  await jsonReq(`/pins/${pinId}`, { method: "DELETE" });
}

export async function getIssueExtras(issueId: string): Promise<IssueExtras> {
  return jsonReq(`/issues/${issueId}/extras`);
}

export async function saveIssueExtras(
  issueId: string,
  patch: Partial<IssueExtras>,
): Promise<IssueExtras> {
  return jsonReq(`/issues/${issueId}/extras`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

// ============================================
// VOICE NOTES (placeholder for future transcription)
// ============================================

export interface VoiceNote {
  id: string;
  site_visit_id: string;
  storage_path: string;
  bucket: string;
  content_type: string;
  duration_seconds: number;
  transcription: string | null;
  transcription_status: "pending" | "processing" | "done" | "error";
  created_at: string;
}

export async function listVoiceNotes(visitId: string): Promise<VoiceNote[]> {
  return jsonReq(`/site-visits/${visitId}/voice-notes`);
}

export async function uploadVoiceNote(
  visitId: string,
  file: File,
  durationSeconds: number,
): Promise<VoiceNote> {
  const form = new FormData();
  form.append("file", file);
  form.append("duration", String(durationSeconds));
  const res = await fetch(`${BASE}/site-visits/${visitId}/voice-notes`, {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  if (!res.ok) throw new Error(`Voice note upload failed: ${res.status}`);
  return res.json();
}

export async function deleteVoiceNote(id: string): Promise<void> {
  await jsonReq(`/voice-notes/${id}`, { method: "DELETE" });
}
