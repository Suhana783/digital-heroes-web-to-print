import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setConfigurationError('Supabase Auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.');
      setLoading(false);
      return undefined;
    }
    const supabase = getSupabaseClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setConfigurationError('Unable to restore your session. Please sign in again.');
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setConfigurationError('Unable to restore your session. Please sign in again.');
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    loading,
    configurationError,
    supabaseConfigured: isSupabaseConfigured(),
    signOut: async () => {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    },
  }), [session, loading, configurationError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
