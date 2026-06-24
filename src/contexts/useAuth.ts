/**
 * Unified useAuth hook
 * Wrapper qui utilise Supabase Auth mais avec la même interface que SimpleAuth
 */
import { useMemo } from 'react';
import { useSupabaseAuth } from './SupabaseAuthContext';

export function useAuth() {
  const supabaseAuth = useSupabaseAuth();
  
  // Mémoriser l'objet user pour éviter les re-renders inutiles
  const user = useMemo(() => {
    if (!supabaseAuth.user) return null;
    
    return {
      id: supabaseAuth.user.id,
      email: supabaseAuth.user.email || '',
      user_metadata: supabaseAuth.user.user_metadata || {},
    };
  }, [supabaseAuth.user?.id, supabaseAuth.user?.email, supabaseAuth.user?.user_metadata]);
  
  return {
    user,
    session: supabaseAuth.session,
    loading: supabaseAuth.loading,
    signUp: supabaseAuth.signUp,
    signIn: supabaseAuth.signIn,
    signOut: supabaseAuth.signOut,
  };
}