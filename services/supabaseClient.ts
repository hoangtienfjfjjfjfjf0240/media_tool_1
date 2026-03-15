
import { createClient } from '@supabase/supabase-js';

// Read from Vite env vars (VITE_ prefix required)
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_KEY || '';

// Flag for other services to check if Supabase is configured
export const isSupabaseConfigured = supabaseUrl.startsWith('http') && supabaseKey.length > 0;

if (!isSupabaseConfigured) {
  console.warn("⚠️ Supabase not configured: Auth and History disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in environment variables.");
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);
