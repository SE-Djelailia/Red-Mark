/**
 * TypeScript types for RedMark Mobile App
 * These match your Supabase database schema
 */

// User from Supabase Auth
export interface User {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
  };
}

// Database Tables
export interface Project {
  id: string;
  name: string;
  address: string;
  client_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visit {
  id: string;
  project_id: string;
  date: string;
  notes: string | null;
  weather: string | null;
  temperature: string | null;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  visit_id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  visit_id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  issue_id: string | null;
  visit_id: string | null;
  author: string;
  author_id: string;
  text: string;
  date: string;
  parent_comment_id: string | null;
  mentions: string[] | null;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Projects: undefined;
  ProjectDetail: { projectId: string };
  VisitDetail: { visitId: string; projectId: string };
  Camera: { visitId: string };
  PhotoAnnotation: { photoId: string };
};

// API Response Types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// Form Data Types
export interface SignUpForm {
  email: string;
  password: string;
  name: string;
}

export interface SignInForm {
  email: string;
  password: string;
}

export interface CreateVisitForm {
  project_id: string;
  date: string;
  notes: string;
  weather: string;
  temperature: string;
}

export interface CreateIssueForm {
  visit_id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
}

// Utility Types
export type LoadingState = "idle" | "loading" | "success" | "error";

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}
