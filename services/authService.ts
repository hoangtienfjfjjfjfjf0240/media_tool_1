
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const signUpWithEmail = async (email: string, password: string) => {
  if (!isSupabaseConfigured) {
    alert("Chưa cấu hình Supabase!");
    return { data: null, error: new Error("Missing configuration") };
  }
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("Sign Up Error:", error);
    return { data: null, error };
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!isSupabaseConfigured) {
    alert("Chưa cấu hình Supabase!");
    return { data: null, error: new Error("Missing configuration") };
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("Sign In Error:", error);
    return { data: null, error };
  }
};

export const signInWithGoogle = async () => {
  if (!isSupabaseConfigured) {
    alert("Chưa cấu hình Supabase! Không thể đăng nhập Google.");
    return { data: null, error: new Error("Missing configuration") };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Google Login Error:", error);
    throw error;
  }
};

export const signOut = async () => {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("Sign Out Error:", error);
  }
};
