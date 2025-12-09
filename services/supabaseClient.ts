
import { createClient } from '@supabase/supabase-js';

// Kiểm tra biến môi trường. Ưu tiên biến môi trường chuẩn, sau đó đến biến NEXT_PUBLIC (cho Vercel)
// Nếu không có, dùng placeholder để tránh crash app ngay lập tức (nhưng Auth sẽ không chạy)
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Biến cờ để các service khác biết Supabase đã được cấu hình hay chưa
export const isSupabaseConfigured = supabaseUrl.startsWith('http') && supabaseKey.length > 0;

if (!isSupabaseConfigured) {
  console.warn("⚠️ CHƯA CẤU HÌNH SUPABASE: Auth và History sẽ không hoạt động. Vui lòng thêm NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY vào biến môi trường.");
}

// Khởi tạo client. Nếu thiếu key, truyền chuỗi rỗng để không bị throw error runtime, 
// nhưng các gọi hàm auth/db sẽ trả về lỗi network (được xử lý ở service).
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);
