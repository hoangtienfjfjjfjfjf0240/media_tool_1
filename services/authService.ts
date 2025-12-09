
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const signInWithGoogle = async () => {
  if (!isSupabaseConfigured) {
    alert("Chưa cấu hình Supabase! Không thể đăng nhập Google.");
    return { data: null, error: new Error("Missing configuration") };
  }

  try {
    // Sử dụng window.location.origin để tự động lấy domain hiện tại (localhost hoặc vercel app)
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
