import React, { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    metadata: { name: string; firm: string },
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: { name?: string; firm?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier la session au chargement
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Écouter les changements d'authentification
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    metadata: { name: string; firm: string },
  ) => {
    try {
      // Créer le compte avec Supabase Auth
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: metadata.name,
            firm: metadata.firm,
            role: "architect",
          },
        },
      });

      if (error) {
        console.error("❌ Signup error:", error);
        throw error;
      }

      // Le profil sera créé automatiquement par le trigger SQL
      // Pas besoin de créer manuellement dans la table profiles

      toast.success("Compte créé avec succès!");
    } catch (error: any) {
      console.error("❌ Signup error:", error);
      const errorMessage = error.message || "Erreur lors de la création du compte";
      toast.error(errorMessage);
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Login error:", error);
        throw error;
      }

      toast.success("Connexion réussie!");
    } catch (error: any) {
      console.error("❌ Login error:", error);
      const errorMessage =
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect"
          : error.message || "Erreur de connexion";
      toast.error(errorMessage);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("❌ Logout error:", error);
        throw error;
      }

      toast.success("Déconnexion réussie");
    } catch (error: any) {
      console.error("❌ Logout error:", error);
      toast.error("Erreur lors de la déconnexion");
      throw error;
    }
  };

  const updateProfile = async (data: { name?: string; firm?: string }) => {
    try {
      if (!user) {
        throw new Error("Utilisateur non connecté");
      }

      // Mettre à jour les métadonnées utilisateur
      const { error: authError } = await supabase.auth.updateUser({
        data,
      });

      if (authError) throw authError;

      // Mettre à jour le profil dans la table profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          name: data.name,
          firm: data.firm,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      toast.success("Profil mis à jour!");
    } catch (error: any) {
      console.error("❌ Update profile error:", error);
      toast.error("Erreur lors de la mise à jour du profil");
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useSupabaseAuth must be used within a SupabaseAuthProvider");
  }
  return context;
}
