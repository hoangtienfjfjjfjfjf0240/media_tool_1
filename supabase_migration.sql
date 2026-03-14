-- Media Studio Database Migration
-- Run this in Supabase Dashboard > SQL Editor

-- 1. History table
CREATE TABLE IF NOT EXISTS public.history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'IMAGE',
  prompt TEXT NOT NULL DEFAULT '',
  model TEXT DEFAULT '',
  ratio TEXT DEFAULT '',
  file_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Saved prompts table
CREATE TABLE IF NOT EXISTS public.saved_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  rating INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for history
CREATE POLICY "Users can view own history" ON public.history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history" ON public.history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own history" ON public.history
  FOR DELETE USING (auth.uid() = user_id);

-- 5. RLS Policies for saved_prompts
CREATE POLICY "Users can view own prompts" ON public.saved_prompts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prompts" ON public.saved_prompts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prompts" ON public.saved_prompts
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Storage bucket for generated images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('generated', 'generated', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policies
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND bucket_id = 'generated');

CREATE POLICY "Public can view generated" ON storage.objects
  FOR SELECT USING (bucket_id = 'generated');

CREATE POLICY "Users can delete own files" ON storage.objects
  FOR DELETE USING (auth.role() = 'authenticated' AND bucket_id = 'generated');
