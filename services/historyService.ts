
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { HistoryItem } from '../types';

// Helper: Convert Base64 to Blob
const base64ToBlob = async (base64: string, contentType: string): Promise<Blob> => {
  const res = await fetch(`data:${contentType};base64,${base64}`);
  return await res.blob();
};

export const uploadAndSaveHistory = async (
  userId: string,
  data: {
    type: 'IMAGE' | 'MOCKUP' | 'VARIATION';
    base64OrUrl: string; // Base64 string (image)
    prompt: string;
    model: string;
    ratio: string;
    mimeType: string;
  }
): Promise<HistoryItem | null> => {
  if (!userId) return null;
  if (!isSupabaseConfigured) return null; // Avoid errors if not configured

  try {
    // 1. Prepare File
    let fileBlob: Blob;
    let fileExt = 'png';

    if (data.mimeType.startsWith('image/')) {
      fileBlob = await base64ToBlob(data.base64OrUrl, data.mimeType);
    } else {
        // Fallback for other types if needed, though mostly using png/jpeg
        fileBlob = new Blob([data.base64OrUrl], { type: data.mimeType });
    }

    // 2. Upload to Supabase Storage
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated')
      .upload(fileName, fileBlob, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 3. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('generated')
      .getPublicUrl(fileName);

    // 4. Insert into DB
    const newItem = {
      user_id: userId,
      type: data.type,
      prompt: data.prompt,
      model: data.model,
      ratio: data.ratio,
      file_url: publicUrl
    };

    const { data: insertedData, error: dbError } = await supabase
      .from('history')
      .insert([newItem])
      .select()
      .single();

    if (dbError) throw dbError;

    return insertedData as HistoryItem;

  } catch (error: any) {
    console.error("Error saving history:", error.message || error);
    return null;
  }
};

export const fetchUserHistory = async (userId: string): Promise<HistoryItem[]> => {
  if (!userId) return [];
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching history:", error.message || error);
    return [];
  }
  return data as HistoryItem[];
};
