import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import type { Profile, AppRole } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  tenantId: string | null;
  isCustomer: boolean;
  customerProfile: any | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isCustomer, setIsCustomer] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Defer profile fetch to avoid blocking
          setTimeout(() => fetchUserProfile(currentSession.user.id), 0);
        } else {
          setProfile(null);
          setRole(null);
          setTenantId(null);
          setIsLoading(false);
        }
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      
      if (existingSession?.user) {
        fetchUserProfile(existingSession.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      // 1. Detect if it's a customer first
      const customerData = unwrap(await supabase
        .from('customer_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle());

      if (customerData) {
        setIsCustomer(true);
        setCustomerProfile(customerData);
        setTenantId(customerData.tenant_id);
        setProfile(null);
        setRole(null);
        setIsLoading(false);
        return;
      }

      // 2. Staff profile
      const profileData = unwrap(await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle());

      if (!profileData) {
        // Usuário recém-criado via OTP (SAC) ainda sem perfil persistido.
        // NÃO faz signOut — evita race condition que derrubava o cliente
        // logo após cadastro. A tela de cadastro do SAC vai inserir o
        // customer_profile e chamar refreshProfile().
        setProfile(null);
        setRole(null);
        setIsCustomer(false);
        setCustomerProfile(null);
        setIsLoading(false);
        return;
      }

      setProfile(profileData as Profile);
      setTenantId(profileData.tenant_id);
      setIsCustomer(false);
      setCustomerProfile(null);

      const roleData = unwrap(await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle());

      if (roleData) setRole(roleData.role as AppRole);
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    const { user } = unwrap(await supabase.auth.getUser());
    if (user) await fetchUserProfile(user.id);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding/empresa`,
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error as Error };
      // Sem sessão = e-mail de confirmação pendente
      const needsEmailConfirmation = !data.session;
      return { error: null, needsEmailConfirmation };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setTenantId(null);
    setIsCustomer(false);
    setCustomerProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        tenantId,
        isCustomer,
        customerProfile,
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
