// Client-side API for voice notes attached to a site visit. Runs through
// the legacy Edge Function (make-server-9fe75696), unlike the rest of the
// app's Postgres/RLS-backed APIs — voice notes were never migrated off it.
// Split out of the old floorPlansApi.ts (which also had a floor-plan pin
// system, since removed as dead code superseded by the Plans & Locations
// system) since this part is still live, used by VoiceNotesSection.tsx.
import { supabase } from "./supabase";
import { projectId as supabaseProjectId, publicAnonKey } from "../../utils/supabase/info";

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

export async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const data = await jsonReq<{ signedUrl: string }>(`/storage/signed-url`, {
    method: "POST",
    body: JSON.stringify({ bucket, path, expiresIn: 86400 }),
  });
  return data.signedUrl;
}

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
