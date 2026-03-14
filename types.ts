

export enum AppMode {
  BATCH_STUDIO = 'BATCH_STUDIO',
  IMAGE_EDIT = 'IMAGE_EDIT',
  LOCALIZE_STUDIO = 'LOCALIZE_STUDIO',
  AI_THEME_CHANGER = 'AI_THEME_CHANGER',
  ASO_STUDIO = 'ASO_STUDIO',
  AI_FUSION = 'AI_FUSION'
}

export enum Sender {
  USER = 'USER',
  AI = 'AI'
}

export interface Message {
  id: string;
  sender: Sender;
  text: string;
  imageUrl?: string;
  groundingChunks?: any[];
  isError?: boolean;
  timestamp: number;
}

export type AspectRatio = 'Auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5' | '5:4';
export type BatchModel = 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image';
export type BatchSubMode = 'VARIATION' | 'MOCKUP' | 'HISTORY' | 'TEXT_TO_IMAGE';
export type MockupType = 'SCREENSHOT' | 'ICON';
export type GenderOption = 'ORIGINAL' | 'MALE' | 'FEMALE';

export interface BatchItem {
  id: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  imageUrl?: string;
  ratio?: AspectRatio; // Specific ratio for this item in multi-mode
  error?: string; // Specific error message
  targetFile?: File;
}

export interface HistoryItem {
  id: string;
  user_id: string;
  type: string;
  prompt: string;
  file_url: string;
  model: string;
  ratio: string;
  created_at: string;
}

export type ImageSize = '1K' | '2K' | '4K';

// Localize AI Types
export enum TargetLanguage {
  VIETNAMESE = 'Vietnamese',
  ENGLISH = 'English',
  JAPANESE = 'Japanese',
  KOREAN = 'Korean',
  CHINESE = 'Chinese',
  THAI = 'Thai',
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  OTHER = 'Other'
}

export interface ImageJob {
  id: string;
  fileName: string;
  originalData: string;
  generatedData: string | null;
  status: 'idle' | 'processing' | 'success' | 'error';
  spellingStatus: 'idle' | 'checking' | 'clean' | 'warning';
  spellingErrors?: string[];
  error?: string;
}

// Theme Changer Types
export type ThemeType = 'SCREENSHOT' | 'ICON';
export type ThemeIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ThemeJob {
  id: string;
  fileName: string;
  originalData: string;
  generatedData: string | null;
  status: 'idle' | 'processing' | 'success' | 'error';
  error?: string;
}

// ASO Types
export type ASOMode = 'NEW' | 'FROM_UI' | 'SYNC';
export interface ASORequest {
  mode: ASOMode;
  prompt: string;
  uiImage?: string; // Base64
  styleRefImage?: string; // Base64
}

export interface ASOStyleSpecs {
  device: string;
  ratio: string;
  style: string;
  decor: string;
}

export interface ASOJob {
  id: string;
  status: 'pending' | 'success' | 'error';
  mode: ASOMode;
  prompt: string;
  resultUrl?: string;
  timestamp: number;
  error?: string;
}

// AI Fusion Types
export interface FusionJob {
  id: string;
  status: 'pending' | 'success' | 'error';
  styleImage?: string;
  contentImage?: string;
  prompt: string;
  resultUrl?: string;
  error?: string;
  timestamp: number;
}