
import { createClient } from '@supabase/supabase-js';

// Read via process.env (mapped by vite.config.ts define)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

// Flag for other services to check if Supabase is configured
export const isSupabaseConfigured = supabaseUrl.startsWith('http') && supabaseKey.length > 0;

if (!isSupabaseConfigured) {
  console.warn("⚠️ Supabase not configured: Auth and History disabled. Set SUPABASE_URL and SUPABASE_KEY in environment variables.");
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);
