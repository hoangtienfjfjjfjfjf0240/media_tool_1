
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { HistoryItem } from '../types';

// Helper: Convert Base64 to Blob
const base64ToBlob = async (base64: string, contentType: string): Promise<Blob> => {
  const res = await fetch(`data:${contentType};base64,${base64}`);
  return await res.blob();
};

// Helper: Check if user has a real Supabase auth session
const hasSupabaseSession = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  } catch { return false; }
};

// --- LOCAL HISTORY (for "Vào nhanh" users) ---
const LOCAL_HISTORY_KEY = 'media_studio_local_history';
const MAX_LOCAL_HISTORY = 10;

// Compress image to tiny thumbnail for localStorage (150x150, JPEG 50%)
const createThumbnail = (base64: string, mimeType: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 150;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      // Center-crop
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.5)); // ~5-15KB each
    };
    img.onerror = () => resolve(''); // Skip if error
    img.src = `data:${mimeType};base64,${base64}`;
  });
};

const saveLocalHistory = (item: HistoryItem): HistoryItem => {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]') as HistoryItem[];
    existing.unshift(item);
    const trimmed = existing.slice(0, MAX_LOCAL_HISTORY);
    try {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // If still too large, keep only 10
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(trimmed.slice(0, 10)));
    }
  } catch (e) { console.warn('Local history save error:', e); }
  return item;
};

const getLocalHistory = (userId: string): HistoryItem[] => {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]') as HistoryItem[];
    return all.filter(h => h.user_id === userId);
  } catch { return []; }
};

// --- MAIN FUNCTIONS ---

export const uploadAndSaveHistory = async (
  userId: string,
  data: {
    type: 'IMAGE' | 'MOCKUP' | 'VARIATION';
    base64OrUrl: string;
    prompt: string;
    model: string;
    ratio: string;
    mimeType: string;
  }
): Promise<HistoryItem | null> => {
  if (!userId) return null;

  // Try Supabase first (for authenticated users)
  const hasSession = await hasSupabaseSession();

  if (isSupabaseConfigured && hasSession) {
    try {
      let fileBlob: Blob;
      if (data.mimeType.startsWith('image/')) {
        fileBlob = await base64ToBlob(data.base64OrUrl, data.mimeType);
      } else {
        fileBlob = new Blob([data.base64OrUrl], { type: data.mimeType });
      }

      const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
      const { error: uploadError } = await supabase.storage
        .from('generated')
        .upload(fileName, fileBlob, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('generated')
        .getPublicUrl(fileName);

      const { data: insertedData, error: dbError } = await supabase
        .from('history')
        .insert([{
          user_id: userId,
          type: data.type,
          prompt: data.prompt,
          model: data.model,
          ratio: data.ratio,
          file_url: publicUrl
        }])
        .select()
        .single();

      if (dbError) throw dbError;
      return insertedData as HistoryItem;
    } catch (error: any) {
      console.warn("Supabase history save failed, falling back to local:", error.message);
    }
  }

  // Fallback: Save to localStorage with thumbnail (for "Vào nhanh" users)
  const thumb = await createThumbnail(data.base64OrUrl, data.mimeType);
  const localItem: HistoryItem = {
    id: crypto.randomUUID(),
    user_id: userId,
    type: data.type,
    prompt: data.prompt,
    model: data.model,
    ratio: data.ratio,
    file_url: thumb || `data:${data.mimeType};base64,${data.base64OrUrl.substring(0, 100)}`,
    created_at: new Date().toISOString()
  };
  return saveLocalHistory(localItem);
};

export const fetchUserHistory = async (userId: string): Promise<HistoryItem[]> => {
  if (!userId) return [];

  // Try Supabase first
  const hasSession = await hasSupabaseSession();

  if (isSupabaseConfigured && hasSession) {
    const { data, error } = await supabase
      .from('history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      // Auto-delete if more than 10 items
      if (data.length > 10) {
        const toKeep = data.slice(0, 10);
        const toDelete = data.slice(10);

        // Delete old storage files and DB rows
        for (const item of toDelete) {
          try {
            // Extract file path from URL for storage deletion
            if (item.file_url) {
              const urlParts = item.file_url.split('/generated/');
              if (urlParts[1]) {
                await supabase.storage.from('generated').remove([urlParts[1]]);
              }
            }
            await supabase.from('history').delete().eq('id', item.id);
          } catch (e) { console.warn('Auto-delete failed for item:', item.id, e); }
        }

        return toKeep as HistoryItem[];
      }
      return data as HistoryItem[];
    }
  }

  // Fallback: Read from localStorage
  return getLocalHistory(userId);
};
