import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import type { Database } from "./database.types";

// Supabase URL et clé publique
const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseAnonKey = publicAnonKey;

// Créer le client Supabase (singleton)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Types TypeScript pour la base de données
export interface Profile {
  id: string;
  email: string;
  name?: string;
  firm?: string;
  role?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  address?: string;
  client_name?: string;
  status: "planning" | "in-progress" | "on-hold" | "completed" | "active" | "archived";
  start_date?: string;
  created_at: string;
  updated_at: string;
  file_number?: string;
  contractor_name?: string;
  contractor_contact?: string;
  contractor_address?: string;
  contractor_phone?: string;
  contractor_email?: string;
}

export interface SiteVisit {
  id: string;
  user_id: string;
  project_id: string;
  visit_date: string;
  phase?: string;
  weather?: string;
  temperature?: string;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  user_id: string;
  visit_id: string;
  project_id: string;
  file_url: string;
  storage_path: string;
  tags: string[];
  location?: {
    floor?: string;
    room?: string;
  };
  description?: string;
  location_id?: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  user_id: string;
  project_id: string;
  visit_id?: string;
  photo_id?: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved";
  discipline?: string;
  due_date?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  location?: {
    floor?: string;
    room?: string;
  };
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

export interface Comment {
  id: string;
  user_id: string;
  photo_id?: string;
  issue_id?: string;
  visit_id?: string;
  parent_comment_id?: string;
  content: string;
  created_at: string;
}

export interface CommentMention {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  data?: any;
  read: boolean;
  created_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  invited_by?: string;
  created_at: string;
}
