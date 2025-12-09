

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { EditImageModal } from './components/EditImageModal';
import { AppMode, Message, Sender, AspectRatio, BatchItem, BatchModel, BatchSubMode, HistoryItem, MockupType, TargetLanguage, ImageJob, GenderOption } from './types';
import { editImage, searchGrounding, thinkingChat, generatePromptSuggestions, generateBatchVariation, createChatSession, setGlobalApiKey, localizeImage, checkSpelling, generateDistinctPrompts } from './services/geminiService';
import { isSupabaseConfigured } from './services/supabaseClient';
import { uploadAndSaveHistory, fetchUserHistory } from './services/historyService';
import { Send, Paperclip, ImagePlus, Loader2, Sparkles, Download, Upload, Layers, X, Zap, LayoutTemplate, Users, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, History, AppWindow, Stamp, Bot, PlayCircle, StopCircle, UserSquare2, BrainCircuit, Wand2, Settings, LogOut, AlertCircle, Info, RotateCcw, User, Key, LogIn, Trash2, CheckCircle2, Globe2, Copy, Grid2X2, PenTool } from 'lucide-react';
import type { Chat } from "@google/genai";
import { ImageUploader } from './components/ImageUploader';
import { LanguageSelect } from './components/LanguageSelect';
import { KeySelectorModal } from './components/KeySelectorModal';
import { PreviewModal } from './components/PreviewModal';
import { ThemeChanger } from './components/ThemeChanger';
import { ASOGenerator } from './components/ASOGenerator';
import { AIFusion } from './components/AIFusion';
import JSZip from 'jszip';

interface SimpleUser {
    id: string; 
    name: string;
    avatarUrl: string;
}

export default function App() {
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [mode, setMode] = useState<AppMode>(AppMode.BATCH_STUDIO);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loginName, setLoginName] = useState(''); 
  
  // Chat
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatFile, setChatFile] = useState<File | null>(null); 
  const [chatPreviewUrl, setChatPreviewUrl] = useState<string | null>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  
  // Batch
  const [batchSettings, setBatchSettings] = useState({
    ratio: '9:16' as AspectRatio,
    count: 4,
    model: 'gemini-3-pro-image-preview' as BatchModel,
    subMode: 'VARIATION' as BatchSubMode,
    mockupType: 'SCREENSHOT' as MockupType
  });
  
  // Multi-Ratio State
  const [isMultiRatio, setIsMultiRatio] = useState(false);
  const [selectedRatios, setSelectedRatios] = useState<AspectRatio[]>(['9:16', '1:1']);

  // Variation State
  const [variationFile, setVariationFile] = useState<File | null>(null);
  const [variationPreview, setVariationPreview] = useState<string | null>(null);
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [variationPrompt, setVariationPrompt] = useState('');
  const [generatedPrompts, setGeneratedPrompts] = useState<BatchItem[]>([]); 
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  // Variation Modifiers
  const [genderOption, setGenderOption] = useState<GenderOption>('ORIGINAL');
  const [modifyBackground, setModifyBackground] = useState(false);

  // Mockup State
  const [mockupSourceFile, setMockupSourceFile] = useState<File | null>(null);
  const [mockupSourcePreview, setMockupSourcePreview] = useState<string | null>(null);
  const [mockupTargetFiles, setMockupTargetFiles] = useState<File[]>([]);
  const [mockupTargetPreviews, setMockupTargetPreviews] = useState<string[]>([]);
  const [mockupPrompt, setMockupPrompt] = useState('');
  const [mockupResults, setMockupResults] = useState<BatchItem[]>([]); 

  // Localize
  const [localizeQueue, setLocalizeQueue] = useState<ImageJob[]>([]);
  const [targetLang, setTargetLang] = useState<TargetLanguage>(TargetLanguage.VIETNAMESE);
  const [customLanguage, setCustomLanguage] = useState<string>(''); 
  const [localizePrompt, setLocalizePrompt] = useState('');
  const [deepLocalize, setDeepLocalize] = useState(false);
  const [localizeProcessing, setLocalizeProcessing] = useState(false);
  const [localizeEditJob, setLocalizeEditJob] = useState<ImageJob | null>(null);
  const [isLocalizeEditing, setIsLocalizeEditing] = useState(false);

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewingImage, setViewingImage] = useState<{url: string, id?: string} | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const faceInputRef = useRef<HTMLInputElement>(null);
  const mockupSourceInputRef = useRef<HTMLInputElement>(null);
  const mockupTargetInputRef = useRef<HTMLInputElement>(null);
  const localizeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('simple_user_data');
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedUser) {
        try { setUser(JSON.parse(storedUser)); } catch (e) { localStorage.removeItem('simple_user_data'); }
    }
    if (storedKey) { setApiKey(storedKey); setGlobalApiKey(storedKey); }
  }, []);

  useEffect(() => {
    if (batchSettings.subMode === 'HISTORY' && user) {
      setLoadingHistory(true);
      fetchUserHistory(user.id).then(data => { setHistoryItems(data); setLoadingHistory(false); });
    } else if (batchSettings.subMode === 'HISTORY' && !user) { setHistoryItems([]); }
  }, [batchSettings.subMode, user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleLoginUser = (name: string) => {
      let userId = localStorage.getItem('simple_user_uuid');
      if (!userId) { userId = crypto.randomUUID(); localStorage.setItem('simple_user_uuid', userId); }
      const newUser: SimpleUser = { id: userId, name: name, avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random` };
      localStorage.setItem('simple_user_data', JSON.stringify(newUser));
      setUser(newUser); setLoginName('');
  };

  const handleLogout = () => { localStorage.removeItem('simple_user_data'); setUser(null); };
  const handleSaveSettings = () => { if (apiKey.trim()) { localStorage.setItem('gemini_api_key', apiKey); setGlobalApiKey(apiKey); } setShowSettings(false); };
  const handleReloadUI = () => window.location.reload();
  
  const handleDownload = (dataUrl: string, filename: string) => {
      const a = document.createElement('a'); a.href = dataUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleBatchDownload = async () => {
      const list = (batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') ? generatedPrompts : mockupResults;
      const completed = list.filter(p => p.status === 'completed' && p.imageUrl);
      if (completed.length === 0) { alert("Chưa có ảnh nào!"); return; }
      for (let i = 0; i < completed.length; i++) { handleDownload(completed[i].imageUrl!, `result_${i+1}.png`); await new Promise(r => setTimeout(r, 400)); }
  };

  useEffect(() => {
    // Only auto-fill if we are NOT in multi-ratio processing mode (prevent override during generation expansion)
    if (!isMultiRatio || generatedPrompts.every(p => !p.ratio)) {
        setGeneratedPrompts(prev => {
            if (prev.length === batchSettings.count) return prev;
            const next = [...prev];
            while (next.length < batchSettings.count) next.push({ id: Math.random().toString(36).substring(7), prompt: '', status: 'pending' });
            if (next.length > batchSettings.count) next.length = batchSettings.count;
            return next;
        });
    }
  }, [batchSettings.count, isMultiRatio]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const resolveRatio = async (ratio: AspectRatio, file?: File | null): Promise<AspectRatio> => {
    if (ratio !== 'Auto') return ratio;
    if (!file) return '1:1'; // Default if no file
    
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
             const r = img.width / img.height;
             const targets: {k: AspectRatio, v: number}[] = [
                 {k: '1:1', v: 1}, {k: '16:9', v: 16/9}, {k: '9:16', v: 9/16},
                 {k: '4:3', v: 4/3}, {k: '3:4', v: 3/4}, {k: '4:5', v: 0.8}, {k: '5:4', v: 1.25}
             ];
             const closest = targets.reduce((prev, curr) => Math.abs(curr.v - r) < Math.abs(prev.v - r) ? curr : prev);
             console.log(`Auto Ratio Detected: ${img.width}x${img.height} (${r.toFixed(2)}) -> Closest: ${closest.k}`);
             resolve(closest.k);
        };
        img.onerror = () => resolve('1:1');
        img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: string) => {
    if (e.target.files) {
        if (target === 'localize') handleLocalizeFiles(Array.from(e.target.files));
        else if (target === 'mockup-target') handleMockupTargetFiles(Array.from(e.target.files));
        else if (e.target.files[0]) processFile(e.target.files[0], target);
    }
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (mode !== AppMode.LOCALIZE_STUDIO) return;
    const items = e.clipboardData.items; const files: File[] = [];
    for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const file = items[i].getAsFile(); if (file) files.push(file); } }
    if (files.length > 0) { e.preventDefault(); await handleLocalizeFiles(files); }
  }, [mode]);

  const processFile = (file: File, target: string) => {
      const reader = new FileReader();
      reader.onloadend = () => {
          const res = reader.result as string;
          if (target === 'variation') { setVariationFile(file); setVariationPreview(res); }
          if (target === 'face') { setFaceFile(file); setFacePreview(res); }
          if (target === 'mockup-source') { setMockupSourceFile(file); setMockupSourcePreview(res); }
          if (target === 'chat') { setChatFile(file); setChatPreviewUrl(res); }
      };
      reader.readAsDataURL(file);
  };

  const handleMockupTargetFiles = (files: File[]) => {
      setMockupTargetFiles(prev => [...prev, ...files]);
      files.forEach(file => {
          const reader = new FileReader();
          reader.onload = (e) => setMockupTargetPreviews(prev => [...prev, e.target?.result as string]);
          reader.readAsDataURL(file);
      });
  };

  // Drag and Drop Logic
  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent, target: string) => {
      e.preventDefault();
      e.stopPropagation();

      let files: File[] = [];

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          files = Array.from(e.dataTransfer.files);
      } else {
          // Handle dropped URLs
          const imageUrl = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          if (imageUrl) {
              try {
                  const response = await fetch(imageUrl);
                  const blob = await response.blob();
                  const fileName = `dropped-image-${Date.now()}.png`;
                  const file = new File([blob], fileName, { type: blob.type });
                  files.push(file);
              } catch (err) {
                  console.error("Failed to process dropped URL", err);
              }
          }
      }

      if (files.length > 0) {
          if (target === 'localize') {
              handleLocalizeFiles(files);
          } else if (target === 'mockup-target') {
              handleMockupTargetFiles(files);
          } else {
              processFile(files[0], target);
          }
      }
  };

  const handleCancel = () => { if (abortControllerRef.current) { setIsCancelling(true); abortControllerRef.current.abort(); setTimeout(() => setIsCancelling(false), 500); } };

  const handleLocalizeFiles = async (files: File[]) => {
    const newJobs: ImageJob[] = [];
    for (const file of files) {
      const base64 = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target?.result as string); reader.readAsDataURL(file); });
      newJobs.push({ id: Math.random().toString(36).substring(7), fileName: file.name, originalData: base64, generatedData: null, status: 'idle', spellingStatus: 'idle' });
    }
    setLocalizeQueue(prev => [...newJobs, ...prev]);
  };

  const processLocalizeJob = async (job: ImageJob, correctionNotes?: string) => {
    let currentGeneratedData: string | null = null;
    try {
       setLocalizeQueue(curr => curr.map(j => j.id === job.id ? { ...j, status: 'processing', spellingStatus: 'idle' } : j));
       const effectiveLang = targetLang === TargetLanguage.OTHER ? (customLanguage as unknown as TargetLanguage) : targetLang;
       const resultImage = await localizeImage(job.originalData, effectiveLang, correctionNotes, localizePrompt, deepLocalize);
       currentGeneratedData = resultImage;
       setLocalizeQueue(curr => curr.map(j => j.id === job.id ? { ...j, status: 'success', generatedData: resultImage, spellingStatus: 'checking' } : j));
    } catch (err) {
       console.error(`Error processing ${job.fileName}`, err);
       setLocalizeQueue(curr => curr.map(j => j.id === job.id ? { ...j, status: 'error' } : j));
       return; 
    }
    if (currentGeneratedData) {
      try {
        const effectiveLang = targetLang === TargetLanguage.OTHER ? (customLanguage as unknown as TargetLanguage) : targetLang;
        const spellingResult = await checkSpelling(currentGeneratedData, effectiveLang);
        setLocalizeQueue(curr => curr.map(j => j.id === job.id ? { ...j, spellingStatus: spellingResult.hasErrors ? 'warning' : 'clean', spellingErrors: spellingResult.errors } : j));
      } catch (err) { setLocalizeQueue(curr => curr.map(j => j.id === job.id ? { ...j, spellingStatus: 'idle' } : j)); }
    }
  };

  const handleLocalizeAll = async () => {
    if (localizeQueue.length === 0) return;
    setLocalizeProcessing(true);
    const jobsToProcess = localizeQueue.filter(j => j.status !== 'success');
    const targetJobs = jobsToProcess.length > 0 ? jobsToProcess : localizeQueue;
    setLocalizeQueue(curr => curr.map(j => targetJobs.find(t => t.id === j.id) ? { ...j, status: 'processing' } : j));
    await Promise.all(targetJobs.map(job => processLocalizeJob(job)));
    setLocalizeProcessing(false);
  };

  const handleDownloadAllLocalize = async () => {
    const successfulJobs = localizeQueue.filter(j => j.status === 'success' && j.generatedData);
    if (successfulJobs.length === 0) return;

    const zip = new JSZip();
    
    successfulJobs.forEach(job => {
      if (job.generatedData) {
        // Remove data URL prefix for JSZip
        const base64Data = job.generatedData.split(',')[1];
        zip.file(`localized-${targetLang}-${job.fileName}`, base64Data, { base64: true });
      }
    });

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `localized-images-${targetLang}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Error zipping files", e);
      alert("Failed to create zip file.");
    }
  };

  const handleEditConfirm = async (prompt: string) => {
    if (!localizeEditJob || !localizeEditJob.generatedData) return;
    setIsLocalizeEditing(true);
    try {
       setLocalizeQueue(curr => curr.map(j => j.id === localizeEditJob.id ? { ...j, status: 'processing', spellingStatus: 'idle' } : j));
       const newImage = await editImage(localizeEditJob.generatedData, prompt); 
       const newDataUrl = newImage.imageBase64 ? `data:image/png;base64,${newImage.imageBase64}` : localizeEditJob.generatedData;
       setLocalizeQueue(curr => curr.map(j => j.id === localizeEditJob.id ? { ...j, status: 'success', generatedData: newDataUrl, spellingStatus: 'checking' } : j));
       setLocalizeEditJob(null); setIsLocalizeEditing(false);
       if (newImage.imageBase64) {
           const effectiveLang = targetLang === TargetLanguage.OTHER ? (customLanguage as unknown as TargetLanguage) : targetLang;
           const spellingResult = await checkSpelling(newDataUrl, effectiveLang);
           setLocalizeQueue(curr => curr.map(j => j.id === localizeEditJob.id ? { ...j, spellingStatus: spellingResult.hasErrors ? 'warning' : 'clean', spellingErrors: spellingResult.errors } : j));
       }
    } catch (e) { console.error("Edit failed", e); setIsLocalizeEditing(false); alert("Chỉnh sửa thất bại."); }
  };

  const toggleSelectedRatio = (r: AspectRatio) => {
      setSelectedRatios(prev => {
          if (prev.includes(r)) {
              const next = prev.filter(item => item !== r);
              // Ensure at least one is selected
              return next.length > 0 ? next : [r];
          }
          return [...prev, r];
      });
  };

  const handleRunBatch = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController(); 
    const signal = abortControllerRef.current.signal;
    
    // Mockup Mode Logic
    if (batchSettings.subMode === 'MOCKUP') {
        if (!mockupSourceFile || mockupTargetFiles.length === 0) { alert("Thiếu file nguồn hoặc file thiết bị"); return; }
        
        // Prepare Queue
        const newMockups = mockupTargetFiles.map((file, i) => ({
            id: Math.random().toString(36).substring(7),
            prompt: `Mockup ${i + 1}`,
            status: 'generating' as const,
            targetFile: file
        }));
        setMockupResults(newMockups);

        try {
            const sourceB64 = await fileToBase64(mockupSourceFile);

            await Promise.all(newMockups.map(async (item) => {
                 try {
                     const targetB64 = await fileToBase64(item.targetFile);
                     const ratioToUse = await resolveRatio(batchSettings.ratio, item.targetFile);
                     
                     const res = await generateBatchVariation(
                         mockupPrompt, 
                         ratioToUse, 
                         batchSettings.model, 
                         'MOCKUP', 
                         sourceB64, 
                         mockupSourceFile.type, 
                         targetB64, 
                         item.targetFile.type, 
                         batchSettings.mockupType, 
                         undefined, 
                         undefined, 
                         signal
                     );
                     
                     if (!signal.aborted) {
                        const fullDataUrl = `data:image/png;base64,${res}`;
                        setMockupResults(prev => prev.map(p => p.id === item.id ? { ...p, status: 'completed', imageUrl: fullDataUrl } : p));
                        if (user && isSupabaseConfigured) await uploadAndSaveHistory(user.id, { type: 'MOCKUP', base64OrUrl: res, prompt: `Mockup (${batchSettings.mockupType})`, model: batchSettings.model, ratio: ratioToUse, mimeType: 'image/png' });
                     }
                 } catch (err: any) {
                     const errorMsg = err.message || "Lỗi không xác định";
                     setMockupResults(prev => prev.map(p => p.id === item.id ? { ...p, status: 'error', error: errorMsg } : p));
                 }
            }));
        } catch (err: any) { console.error("Batch Mockup Error", err); }
        return;
    }

    // Variation/Batch/Text-To-Image Mode Logic
    let itemsToProcess = [...generatedPrompts];
    
    // --- STEP 1: Smart Prompt Expansion from Idea ---
    if (variationPrompt.trim()) {
        if (batchSettings.subMode === 'TEXT_TO_IMAGE') {
            // DIRECT MODE: SKIP AI EXPANSION
            // Just replicate the raw user prompt for the number of requested images.
            itemsToProcess = Array(batchSettings.count).fill(null).map(() => ({
                id: Math.random().toString(36).substring(7),
                prompt: variationPrompt,
                status: 'pending' as const
            }));
            setGeneratedPrompts(itemsToProcess);
        } else {
            // VARIATION MODE: USE AI EXPANSION (generateDistinctPrompts)
            try {
                // Temporarily set status to loading to indicate prompt generation
                setGeneratedPrompts(prev => prev.map(p => ({ ...p, status: 'generating' as const })));
                
                const distinctPrompts = await generateDistinctPrompts(variationPrompt, batchSettings.count, genderOption, signal);
                
                if (signal.aborted) return;

                // Map the distinct prompts to the batch items
                itemsToProcess = distinctPrompts.map((p, i) => ({
                    id: Math.random().toString(36).substring(7),
                    prompt: p,
                    status: 'pending' as const
                }));
                
                // Update UI with the detailed prompts
                setGeneratedPrompts(itemsToProcess);
            } catch (e) {
                console.error("Failed to generate distinct prompts", e);
                // Handle error during prompt expansion
                const errorMsg = (e as any).message || "Lỗi tạo prompt";
                setGeneratedPrompts(prev => prev.map(p => ({ ...p, status: 'error', error: errorMsg })));
                return;
            }
        }
    }

    if (itemsToProcess.length === 0) return;

    // --- STEP 2: Prepare Multi-Ratio Expansion ---
    if (isMultiRatio && selectedRatios.length > 0) {
        const expandedItems: BatchItem[] = [];
        itemsToProcess.forEach(item => {
             selectedRatios.forEach(r => {
                 expandedItems.push({
                     ...item,
                     id: Math.random().toString(36).substring(7),
                     ratio: r,
                     status: 'generating'
                 });
             });
        });
        itemsToProcess = expandedItems;
        setGeneratedPrompts(expandedItems);
    } else {
        itemsToProcess = itemsToProcess.map(p => ({ ...p, status: 'generating' as const }));
        setGeneratedPrompts(itemsToProcess);
    }

    let refBase64 = (variationFile && (batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE')) ? await fileToBase64(variationFile) : undefined;
    let faceBase64 = (faceFile && batchSettings.subMode === 'VARIATION') ? await fileToBase64(faceFile) : undefined;
    
    const promises = itemsToProcess.map(async (item) => {
        if (signal.aborted) return { id: item.id, status: 'error', prompt: 'Cancelled', error: 'Cancelled' };
        
        // Resolve Auto Ratio if needed
        let ratioToUse = item.ratio || batchSettings.ratio;
        ratioToUse = await resolveRatio(ratioToUse, variationFile); // variationFile might be null in TEXT_TO_IMAGE mode, resolving to 1:1

        try {
            const imageBase64 = await generateBatchVariation(
                item.prompt, 
                ratioToUse, 
                batchSettings.model, 
                batchSettings.subMode === 'TEXT_TO_IMAGE' ? 'TEXT_TO_IMAGE' : 'VARIATION', 
                refBase64, 
                variationFile?.type, 
                undefined, 
                undefined, 
                undefined, 
                faceBase64, 
                faceFile?.type, 
                signal,
                genderOption, // Pass Gender
                modifyBackground // Pass BG Modify
            );
            if (!signal.aborted) {
                if (user && isSupabaseConfigured) uploadAndSaveHistory(user.id, { type: 'IMAGE', base64OrUrl: imageBase64, prompt: item.prompt, model: batchSettings.model, ratio: ratioToUse, mimeType: 'image/png' });
            }
            return { id: item.id, status: 'completed', imageUrl: `data:image/png;base64,${imageBase64}` };
        } catch (err: any) { 
             const errorMsg = signal.aborted ? 'Cancelled' : (err.message || 'Error');
             return { id: item.id, status: 'error', prompt: item.prompt, error: errorMsg };
        }
    });

    const results = await Promise.all(promises);
    if (!signal.aborted) setGeneratedPrompts(prev => prev.map(item => { const res = results.find(r => r.id === item.id); return res ? { ...item, ...res } as BatchItem : item; }));
  };

  const handleSuggestPrompts = async () => {
      if (!variationPrompt.trim() && !variationFile) return;
      setIsSuggesting(true);
      try {
          const b64 = (variationFile && batchSettings.subMode === 'VARIATION') ? await fileToBase64(variationFile) : undefined;
          const suggestions = await generatePromptSuggestions(variationPrompt, batchSettings.count, b64, variationFile?.type);
          const newItems = suggestions.map((p, idx) => ({ id: Math.random().toString(), prompt: p, status: 'pending' as const }));
          while (newItems.length < batchSettings.count) newItems.push({ id: Math.random().toString(), prompt: variationPrompt, status: 'pending' });
          setGeneratedPrompts(newItems);
      } catch (e) { console.error(e); } finally { setIsSuggesting(false); }
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !chatFile) || isLoading) return;
    const msg: Message = { id: Math.random().toString(), sender: Sender.USER, text: input, imageUrl: chatPreviewUrl || undefined, timestamp: Date.now() };
    setMessages(p => [...p, msg]);
    setIsLoading(true); setInput(''); setChatFile(null); setChatPreviewUrl(null);
    try {
        if (mode === AppMode.CHAT_BOT) {
            if (!chatSessionRef.current) chatSessionRef.current = createChatSession();
            const res = await chatSessionRef.current.sendMessage({ message: msg.text });
            setMessages(p => [...p, { id: Math.random().toString(), sender: Sender.AI, text: res.text, timestamp: Date.now() }]);
        } else if (mode === AppMode.IMAGE_EDIT && chatFile && msg.imageUrl) {
            const res = await editImage(msg.imageUrl, msg.text);
            setMessages(p => [...p, { id: Math.random().toString(), sender: Sender.AI, text: res.text, imageUrl: res.imageBase64 ? `data:image/png;base64,${res.imageBase64}` : undefined, timestamp: Date.now() }]);
        } else if (mode === AppMode.SEARCH_GROUNDING) {
             const res = await searchGrounding(msg.text);
             setMessages(p => [...p, { id: Math.random().toString(), sender: Sender.AI, text: res.text, groundingChunks: res.groundingChunks, timestamp: Date.now() }]);
        } else if (mode === AppMode.THINKING) {
             const text = await thinkingChat(msg.text);
             setMessages(p => [...p, { id: Math.random().toString(), sender: Sender.AI, text: text, timestamp: Date.now() }]);
        }
    } catch(e: any) { setMessages(p => [...p, { id: 'err', sender: Sender.AI, text: "Lỗi: " + e.message, isError: true, timestamp: Date.now() }]); }
    finally { setIsLoading(false); }
  };

  const renderLocalizeStudio = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 h-full overflow-y-auto">
        {/* ... (Existing Localize UI) ... */}
        <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2"><Zap className="w-5 h-5 text-indigo-400" /> Cấu hình</h2>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Ngôn ngữ đích</label>
                        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value as TargetLanguage)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500" disabled={localizeProcessing}>
                            {Object.values(TargetLanguage).map(lang => ( <option key={lang} value={lang}>{lang}</option> ))}
                            <option value={TargetLanguage.OTHER}>Khác (Nhập tay)</option>
                        </select>
                        {targetLang === TargetLanguage.OTHER && ( <input type="text" value={customLanguage} onChange={(e) => setCustomLanguage(e.target.value)} placeholder="Nhập ngôn ngữ (VD: Arabic)..." className="w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500" disabled={localizeProcessing} /> )}
                    </div>
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                        <div className="flex items-start gap-3">
                            <input id="deepLocalize" type="checkbox" checked={deepLocalize} onChange={(e) => setDeepLocalize(e.target.checked)} disabled={localizeProcessing} className="mt-1 w-4 h-4 text-indigo-600 bg-slate-800 border-slate-600 rounded" />
                            <label htmlFor="deepLocalize" className="flex flex-col cursor-pointer select-none"><span className="text-sm font-medium text-slate-200">Deep Localize</span><span className="text-xs text-slate-500 mt-0.5">Chuyển đổi cả người và bối cảnh cho phù hợp văn hóa.</span></label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Prompt Tùy chỉnh (Optional)</label>
                            <textarea value={localizePrompt} onChange={(e) => setLocalizePrompt(e.target.value)} disabled={localizeProcessing} placeholder="VD: Văn phong hài hước..." rows={3} className="w-full rounded-lg bg-slate-900 border-slate-700 text-white p-3 text-sm resize-none focus:border-indigo-500" />
                        </div>
                    </div>
                    <div className="pt-4 border-t border-slate-700 space-y-3">
                        <button onClick={handleLocalizeAll} disabled={localizeQueue.length === 0 || localizeProcessing} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                            {localizeProcessing ? <Loader2 className="animate-spin" size={18}/> : <Globe2 size={18}/>} Localize All
                        </button>
                        {localizeQueue.some(j => j.status === 'success' && j.generatedData) && (
                            <button 
                                onClick={handleDownloadAllLocalize}
                                disabled={localizeProcessing}
                                className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Download size={18} /> Download All
                            </button>
                        )}
                        {localizeQueue.length > 0 && ( <button onClick={() => setLocalizeQueue([])} disabled={localizeProcessing} className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">Xóa tất cả</button> )}
                    </div>
                </div>
            </div>
        </div>
        <div className="lg:col-span-9 space-y-6 order-1 lg:order-2">
            <div 
                className="bg-slate-800/30 rounded-2xl p-1 border border-slate-700/50 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" 
                tabIndex={0} 
                onPaste={handlePaste}
                onDrop={(e) => handleDrop(e, 'localize')}
                onDragOver={handleDragOver}
            >
               <div className="bg-slate-900 rounded-xl p-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-indigo-500/50 transition-colors cursor-pointer" onClick={() => localizeInputRef.current?.click()}>
                  <Upload className="w-10 h-10 text-slate-500 mb-3" />
                  <h3 className="text-sm font-medium text-slate-400">Tải ảnh lên hoặc Paste (Ctrl+V)</h3>
                  <span className="text-xs text-slate-600 mt-1">Max 10MB per file</span>
                  <input ref={localizeInputRef} type="file" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'localize')} accept="image/*" />
               </div>
            </div>
            {localizeQueue.length > 0 && (
              <div className="space-y-4">
                 <h3 className="text-sm font-medium text-slate-300">Danh sách ({localizeQueue.length})</h3>
                 <div className="grid grid-cols-1 gap-6">
                    {localizeQueue.map(job => (
                      <div key={job.id} className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/50">
                           <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-white truncate max-w-[200px]">{job.fileName}</span>
                              {job.status === 'processing' && <span className="text-xs text-indigo-400 animate-pulse">Đang xử lý...</span>}
                              {job.status === 'success' && <span className="text-xs text-green-400">Hoàn thành</span>}
                              {job.status === 'error' && <span className="text-xs text-red-400">Thất bại</span>}
                           </div>
                           <button onClick={() => setLocalizeQueue(prev => prev.filter(j => j.id !== job.id))} className="text-slate-500 hover:text-red-400"><Trash2 size={18} /></button>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="relative aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
                              <img src={job.originalData} className="w-full h-full object-contain" />
                              <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">Gốc</span>
                           </div>
                           <div className="relative aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                              {job.generatedData ? (
                                <>
                                  <img src={job.generatedData} className="w-full h-full object-contain" />
                                  <span className="absolute top-2 left-2 bg-indigo-600/90 text-white text-[10px] px-2 py-0.5 rounded">Đã dịch ({targetLang === TargetLanguage.OTHER ? customLanguage : targetLang})</span>
                                  <div className="absolute top-2 right-2 flex gap-2">
                                    {job.spellingStatus === 'checking' && <div className="bg-black/60 text-xs px-2 py-1 rounded text-slate-300 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Check lỗi...</div>}
                                    {job.spellingStatus === 'clean' && <div className="bg-green-500/90 text-xs px-2 py-1 rounded text-white flex items-center gap-1"><CheckCircle2 size={12}/> Sạch lỗi</div>}
                                    {job.spellingStatus === 'warning' && ( <div className="group relative"><div className="bg-yellow-500/90 text-xs px-2 py-1 rounded text-white flex items-center gap-1 cursor-help"><AlertCircle size={12}/> Lỗi CT</div><div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded shadow-xl border border-slate-700 hidden group-hover:block z-10"><ul className="list-disc list-inside max-h-48 overflow-y-auto">{job.spellingErrors?.map((e, i) => <li key={i}>{e}</li>)}</ul><button onClick={() => processLocalizeJob(job, job.spellingErrors?.join(", "))} className="w-full mt-2 bg-indigo-600 p-1.5 rounded text-white">Sửa lỗi & Tạo lại</button></div></div> )}
                                  </div>
                                  <div className="absolute bottom-2 right-2 flex gap-2">
                                     <button onClick={() => setViewingImage({url: job.generatedData!})} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"><ZoomIn size={16}/></button>
                                     <button onClick={() => setLocalizeEditJob(job)} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"><Wand2 size={16}/></button>
                                     <button onClick={() => handleDownload(job.generatedData!, `loc-${job.fileName}`)} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"><Download size={16}/></button>
                                  </div>
                                </>
                              ) : ( <div className="text-slate-600 text-xs">{job.status === 'processing' ? 'Đang tạo...' : 'Chờ xử lý'}</div> )}
                           </div>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}
        </div>
    </div>
  );

  const renderChatInterface = () => (
    <div className="flex flex-col h-full relative" onDrop={(e) => handleDrop(e, 'chat')} onDragOver={handleDragOver}>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
             {messages.length === 0 && ( <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50"><Bot size={64} className="mb-4 text-slate-600"/><p>Bắt đầu cuộc trò chuyện...</p></div> )}
             {messages.map(msg => ( <ChatMessage key={msg.id} message={msg} /> ))}
             {isLoading && ( <div className="flex justify-start w-full mb-6"><div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none"><Loader2 className="animate-spin text-purple-500" size={16} /><span className="text-slate-400 text-sm">Đang suy nghĩ...</span></div></div> )}
             <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-slate-900/80 border-t border-white/5 backdrop-blur-md">
            {chatPreviewUrl && ( <div className="mb-2 relative inline-block"><img src={chatPreviewUrl} className="h-20 rounded-lg border border-white/10" /><button onClick={() => { setChatFile(null); setChatPreviewUrl(null); }} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1 border border-white/20"><X size={12}/></button></div> )}
            <form onSubmit={handleChatSubmit} className="relative flex gap-2 items-end">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-purple-400 hover:bg-slate-700 transition-colors"><Paperclip size={20} /></button>
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileSelect(e, 'chat')} accept="image/*" />
                <div className="flex-1 bg-slate-800 rounded-xl border border-white/5 focus-within:border-purple-500/50 transition-colors flex items-center"><input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Nhập tin nhắn..." className="w-full bg-transparent border-none focus:ring-0 text-slate-200 placeholder-slate-500 px-4 py-3"/></div>
                <button type="submit" disabled={isLoading || (!input.trim() && !chatFile)} className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-900/20"><Send size={20} /></button>
            </form>
        </div>
    </div>
  );

  const getAvailableRatios = (): AspectRatio[] => {
      const base: AspectRatio[] = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4'];
      if (batchSettings.model === 'gemini-3-pro-image-preview') {
          return [...base, '4:5', '5:4'];
      }
      return base;
  };

  const renderBatchStudio = () => {
    const isProcessing = ((batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && generatedPrompts.some(p => p.status === 'generating')) || (batchSettings.subMode === 'MOCKUP' && mockupResults.some(p => p.status === 'generating'));
    return (
    <div className="flex flex-col h-full overflow-hidden relative">
        <div className="bg-slate-900/80 border-b border-white/5 flex justify-center backdrop-blur-sm">
            {[{ id: 'VARIATION', icon: Layers, label: 'Biến thể' }, { id: 'TEXT_TO_IMAGE', icon: Sparkles, label: 'Tạo từ Prompt' }, { id: 'MOCKUP', icon: LayoutTemplate, label: 'Mockup' }, { id: 'HISTORY', icon: History, label: 'Lịch sử' }].map(tab => (
                 <button key={tab.id} onClick={() => setBatchSettings(s => ({...s, subMode: tab.id as BatchSubMode}))} className={`px-6 py-3 text-sm font-medium border-b-2 transition-all relative ${batchSettings.subMode === tab.id ? 'border-purple-500 text-purple-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><tab.icon size={16} className="inline mr-2" /> {tab.label}</button>
            ))}
        </div>
        {batchSettings.subMode !== 'HISTORY' && (
            <div className="bg-slate-900/60 border-b border-white/5 backdrop-blur-xl z-20 p-4 shadow-xl">
                 {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                     <div className="space-y-4">
                        <div className="flex gap-4 h-32">
                            {/* Allow upload for BOTH Variation and Text-to-Image (as optional Ref) */}
                            {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                                <div 
                                    onClick={() => document.getElementById('var-upload')?.click()} 
                                    className="w-28 h-full border border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-white/5 overflow-hidden relative"
                                    onDrop={(e) => handleDrop(e, 'variation')}
                                    onDragOver={handleDragOver}
                                >
                                    {variationPreview ? (
                                        <>
                                            <img src={variationPreview} className="w-full h-full object-cover"/>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setVariationFile(null); setVariationPreview(null); }}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-red-500"
                                            >
                                                <X size={10} />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center px-1">
                                            <ImagePlus size={24} className="mx-auto text-slate-500 mb-2"/>
                                            <span className="text-[10px] text-slate-500 font-medium block">
                                                {batchSettings.subMode === 'VARIATION' ? "Kiểu mẫu" : "Ảnh gốc (Tùy chọn)"}
                                            </span>
                                        </div>
                                    )}
                                    <input id="var-upload" type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'variation')} accept="image/*" />
                                </div>
                            )}

                            {batchSettings.subMode === 'VARIATION' && (
                                    <div 
                                        onClick={() => faceInputRef.current?.click()} 
                                        className="w-28 h-full border border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-white/5 overflow-hidden"
                                        onDrop={(e) => handleDrop(e, 'face')}
                                        onDragOver={handleDragOver}
                                    >
                                        {facePreview ? <img src={facePreview} className="w-full h-full object-cover"/> : <div className="text-center"><UserSquare2 size={24} className="mx-auto text-slate-500 mb-2"/><span className="text-xs text-slate-500 font-medium">Mặt (Tùy chọn)</span></div>}
                                        <input ref={faceInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'face')} accept="image/*" />
                                    </div>
                            )}

                            <div className="flex-1 flex flex-col gap-2 relative">
                                <textarea value={variationPrompt} onChange={e => setVariationPrompt(e.target.value)} placeholder={batchSettings.subMode === 'VARIATION' ? "Mô tả biến thể... (ví dụ: 'mặc vest đỏ trong thành phố cyberpunk')" : "Mô tả hình ảnh muốn tạo... (ví dụ: 'Một phi hành gia đứng trên sao hỏa')"} className="w-full h-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"/>
                                {/* Prompt Suggestion Button directly below/inside textarea area */}
                                <div className="absolute bottom-2 left-2 right-2 flex justify-start">
                                     <button 
                                        onClick={handleSuggestPrompts} 
                                        disabled={isSuggesting || (!variationPrompt && !variationFile && batchSettings.subMode !== 'TEXT_TO_IMAGE')} 
                                        className="text-[10px] flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/50 text-indigo-200 border border-indigo-500/30 rounded-full hover:bg-indigo-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Tự động tạo ra các prompt chi tiết dựa trên ý tưởng của bạn"
                                     >
                                         {isSuggesting ? <Loader2 size={10} className="animate-spin"/> : <Sparkles size={10}/>} 
                                         Gợi ý Prompt Chi tiết
                                     </button>
                                </div>
                            </div>
                        </div>
                        
                        {/* Variation Modifiers Section - Only show for VARIATION */}
                        {batchSettings.subMode === 'VARIATION' && (
                            <div className="flex items-center gap-6 pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-400 font-medium">Giới tính:</span>
                                    <div className="flex bg-slate-950 p-1 rounded-lg">
                                        {(['ORIGINAL', 'MALE', 'FEMALE'] as GenderOption[]).map(opt => (
                                            <button 
                                                key={opt}
                                                onClick={() => setGenderOption(opt)}
                                                className={`px-3 py-1 text-[10px] rounded transition-all ${genderOption === opt ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        id="mod-bg"
                                        checked={modifyBackground}
                                        onChange={e => setModifyBackground(e.target.checked)}
                                        className="rounded bg-slate-800 border-slate-600 text-indigo-600"
                                    />
                                    <label htmlFor="mod-bg" className="text-xs text-slate-300 cursor-pointer select-none">Thay đổi bối cảnh</label>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                             <div className="flex gap-2 items-center">
                                 <select value={batchSettings.model} onChange={(e) => setBatchSettings({...batchSettings, model: e.target.value as BatchModel})} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"><option value="gemini-3-pro-image-preview">Gemini 3.0 Pro (High Quality)</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash (Fast)</option></select>
                                 
                                 <div className="flex items-center bg-slate-950 border border-slate-700 rounded overflow-hidden">
                                     <button 
                                        onClick={() => setIsMultiRatio(!isMultiRatio)} 
                                        className={`p-1.5 hover:bg-slate-800 transition-colors ${isMultiRatio ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-slate-400'}`} 
                                        title="Chọn nhiều tỉ lệ"
                                     >
                                         <Grid2X2 size={14}/>
                                     </button>
                                     <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
                                     
                                     {isMultiRatio ? (
                                        <div className="flex gap-1 px-1">
                                            {getAvailableRatios().map(r => (
                                                <button 
                                                    key={r}
                                                    onClick={() => toggleSelectedRatio(r)}
                                                    className={`px-1.5 py-0.5 text-[10px] rounded ${selectedRatios.includes(r) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                                >
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                     ) : (
                                        <select value={batchSettings.ratio} onChange={e => setBatchSettings(s => ({...s, ratio: e.target.value as AspectRatio}))} className="bg-transparent border-none py-1 pl-2 pr-6 text-xs text-white focus:ring-0 cursor-pointer">
                                            {getAvailableRatios().map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                                        </select>
                                     )}
                                 </div>

                                  <select value={batchSettings.count} onChange={e => setBatchSettings(s => ({...s, count: Number(e.target.value)}))} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs">{Array.from({ length: 10 }, (_, i) => i + 1).map(num => ( <option key={num} value={num}>{num} Ảnh</option> ))}</select>
                             </div>
                             <div className="flex gap-2">
                                <button onClick={handleBatchDownload} disabled={isProcessing || !generatedPrompts.some(p => p.imageUrl)} className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg font-bold text-sm hover:bg-slate-600 disabled:opacity-50 flex items-center gap-2"><Download size={16}/> Tải tất cả</button>
                                <button onClick={handleRunBatch} disabled={isProcessing} className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold text-sm shadow-lg hover:from-purple-500 disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? 'Đang xử lý...' : batchSettings.subMode === 'TEXT_TO_IMAGE' ? 'Tạo Ảnh' : 'Chạy Batch'}</button>
                                {isProcessing && ( <button onClick={handleCancel} className="px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/50 rounded-lg font-bold text-sm hover:bg-red-500/30"><StopCircle size={16}/></button> )}
                           </div>
                        </div>
                     </div>
                 )}
                 {batchSettings.subMode === 'MOCKUP' && (
                      <div className="space-y-4">
                        <div className="flex gap-4">
                             <div 
                                onClick={() => mockupSourceInputRef.current?.click()} 
                                className="w-32 h-32 border border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-white/5 overflow-hidden"
                                onDrop={(e) => handleDrop(e, 'mockup-source')}
                                onDragOver={handleDragOver}
                             >
                                {mockupSourcePreview ? <img src={mockupSourcePreview} className="w-full h-full object-cover"/> : <div className="text-center"><ImagePlus size={24} className="mx-auto text-slate-500 mb-2"/><span className="text-xs text-slate-500">Thiết kế</span></div>}<input ref={mockupSourceInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'mockup-source')} accept="image/*" />
                             </div>
                            
                            {/* Multi-Mockup Target Upload */}
                            <div 
                                onClick={() => mockupTargetInputRef.current?.click()} 
                                className="w-32 h-32 border border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-white/5 overflow-hidden relative"
                                onDrop={(e) => handleDrop(e, 'mockup-target')}
                                onDragOver={handleDragOver}
                            >
                                {mockupTargetPreviews.length > 0 ? (
                                    <div className="w-full h-full grid grid-cols-2 gap-1 p-1">
                                        {mockupTargetPreviews.slice(0, 4).map((p, i) => <img key={i} src={p} className="w-full h-full object-cover rounded-sm"/>)}
                                    </div>
                                ) : (
                                    <div className="text-center"><LayoutTemplate size={24} className="mx-auto text-slate-500 mb-2"/><span className="text-xs text-slate-500">Bối cảnh</span></div>
                                )}
                                {mockupTargetFiles.length > 1 && (
                                    <span className="absolute top-1 right-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">+{mockupTargetFiles.length}</span>
                                )}
                                <input ref={mockupTargetInputRef} type="file" className="hidden" multiple onChange={(e) => handleFileSelect(e, 'mockup-target')} accept="image/*" />
                            </div>

                            <div className="flex-1">
                                <label className="text-xs text-slate-400 block mb-2">Loại Mockup</label>
                                <div className="flex gap-4 mb-4"><label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="radio" name="mocktype" checked={batchSettings.mockupType === 'SCREENSHOT'} onChange={() => setBatchSettings(s => ({...s, mockupType: 'SCREENSHOT'}))} /> Chèn Màn hình</label><label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"><input type="radio" name="mocktype" checked={batchSettings.mockupType === 'ICON'} onChange={() => setBatchSettings(s => ({...s, mockupType: 'ICON'}))} /> Thay thế Icon</label></div>
                                <input type="text" value={mockupPrompt} onChange={e => setMockupPrompt(e.target.value)} placeholder="Hướng dẫn cụ thể? (Tùy chọn)" className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm"/>
                            </div>
                        </div>
                        <div className="flex justify-end"><button onClick={handleRunBatch} disabled={isProcessing} className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold text-sm shadow-lg disabled:opacity-50">{isProcessing ? 'Đang xử lý...' : `Ghép Mockup (${mockupTargetFiles.length})`}</button>{isProcessing && ( <button onClick={handleCancel} className="ml-2 px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/50 rounded-lg font-bold text-sm hover:bg-red-500/30"><StopCircle size={16}/></button> )}</div>
                      </div>
                 )}
            </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-transparent relative">
            {batchSettings.subMode === 'HISTORY' && (
                <div className="flex-1 overflow-y-auto p-6">
                    {!user ? ( <div className="text-center py-20 text-slate-500"><History size={48} className="mx-auto mb-4 opacity-50"/><p>Vui lòng đăng nhập (trong Cài đặt) để xem lịch sử.</p></div> ) : loadingHistory ? ( <div className="text-center mt-10"><Loader2 className="animate-spin mx-auto text-purple-500"/></div> ) : ( <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{historyItems.map(h => ( <div key={h.id} onClick={() => setViewingImage({url: h.file_url, id: h.id})} className="cursor-pointer border border-slate-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-colors aspect-square"><img src={h.file_url} className="w-full h-full object-cover" /></div> ))}{historyItems.length === 0 && ( <div className="col-span-full text-center text-slate-500 py-10">Chưa có lịch sử nào.</div> )}</div> )}
                </div>
            )}
            
            {/* Mockup Results Grid */}
            {batchSettings.subMode === 'MOCKUP' && (
                 <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                     {mockupResults.length > 0 ? (
                         mockupResults.map(item => (
                             <div key={item.id} onClick={() => { if(item.imageUrl) setViewingImage({url: item.imageUrl, id: item.id}) }} className={`aspect-square bg-slate-900 rounded-xl border relative overflow-hidden cursor-pointer group border-slate-800 hover:border-slate-600`}>
                                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-slate-500 flex-col gap-2">
                                    {item.status === 'generating' ? <Loader2 className="animate-spin"/> : item.status === 'error' ? <AlertCircle size={20} className="text-red-500"/> : <LayoutTemplate size={20}/>}
                                    <span className={`px-2 text-center truncate w-full ${item.status === 'error' ? 'text-red-400 font-bold' : ''}`}>{item.error || item.prompt}</span>
                                </div>}
                                {item.imageUrl && ( <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"><button onClick={(e) => { e.stopPropagation(); setViewingImage({url: item.imageUrl!, id: item.id}); }} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white"><ZoomIn size={20}/></button></div> )}
                            </div>
                         ))
                     ) : (
                         <div className="col-span-full flex items-center justify-center h-96 flex-col gap-4">
                             <LayoutTemplate size={64} className="text-slate-700"/>
                             <p className="text-slate-500">Chọn thiết kế và (nhiều) bối cảnh để tạo mockup.</p>
                         </div>
                     )}
                 </div>
            )}

            {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                 <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4 pb-48">
                    {generatedPrompts.map(item => (
                        <div key={item.id} onClick={() => { if(item.imageUrl) setViewingImage({url: item.imageUrl, id: item.id}) }} className={`aspect-square bg-slate-900 rounded-xl border relative overflow-hidden cursor-pointer group border-slate-800 hover:border-slate-600`}>
                            {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-slate-500 flex-col gap-2">
                                {item.status === 'generating' ? <Loader2 className="animate-spin"/> : item.status === 'error' ? <AlertCircle size={20} className="text-red-500"/> : <div className="w-8 h-8 rounded-full bg-slate-800"></div>}
                                {item.status === 'generating' ? 'Đang tạo...' : item.status === 'pending' ? 'Chờ...' : <span className="text-red-400 font-bold text-center px-2">{item.error || item.status}</span>}
                            </div>}
                            {item.imageUrl && ( <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"><button onClick={(e) => { e.stopPropagation(); setViewingImage({url: item.imageUrl!, id: item.id}); }} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white"><ZoomIn size={20}/></button></div> )}
                            {/* Display Ratio Badge */}
                            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white/80">{item.ratio || batchSettings.ratio}</div>
                        </div>
                    ))}
                 </div>
            )}
            {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                 <div className="absolute bottom-0 left-0 right-0 h-40 bg-slate-900 border-t border-white/5 p-4 grid grid-cols-2 md:grid-cols-5 gap-3 overflow-y-auto backdrop-blur-md">
                     {generatedPrompts.map((p, i) => ( <div key={p.id} className="relative"><textarea value={p.prompt} onChange={e => { const n = [...generatedPrompts]; n[i].prompt = e.target.value; setGeneratedPrompts(n); }} className="w-full h-full bg-slate-950/50 border border-slate-700 rounded p-2 text-[10px] resize-none text-slate-300 focus:border-purple-500 focus:outline-none"/><span className="absolute bottom-2 right-2 text-[10px] text-slate-600 flex items-center gap-1">{p.ratio && <span className="bg-slate-800 px-1 rounded text-[8px]">{p.ratio}</span>} #{i+1}</span></div> ))}
                 </div>
            )}
        </div>
    </div>
  )};

  return (
    <div className="flex h-screen bg-transparent text-slate-100">
      <Sidebar currentMode={mode} setMode={setMode} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-slate-900/50 border-b border-white/5 flex items-center justify-between px-6 backdrop-blur-md">
          <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {mode === AppMode.LOCALIZE_STUDIO ? 'LocalizeAI Pro' : 
             mode === AppMode.AI_THEME_CHANGER ? 'AI Theme Changer' : 
             mode === AppMode.ASO_STUDIO ? 'ASO Architect' : 
             mode === AppMode.AI_FUSION ? 'AI Fusion' :
             'Batch Studio'}
          </span></div>
          <div className="flex items-center gap-2">
              <button onClick={handleReloadUI} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5" title="Tải lại"><RotateCcw size={18} /></button>
              <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5" title="Cài đặt"><Settings size={18} /></button>
          </div>
        </header>
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          {mode === AppMode.BATCH_STUDIO ? renderBatchStudio() : 
           mode === AppMode.LOCALIZE_STUDIO ? renderLocalizeStudio() : 
           mode === AppMode.AI_THEME_CHANGER ? <ThemeChanger /> : 
           mode === AppMode.ASO_STUDIO ? <ASOGenerator /> : 
           mode === AppMode.AI_FUSION ? <AIFusion /> :
           renderChatInterface()}
        </main>
      </div>
      {showSettings && (
         <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
             <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
                 <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
                 <h2 className="text-xl font-bold text-white mb-6">Cài đặt</h2>
                 <div className="mb-6 pb-6 border-b border-slate-800">
                     <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><User size={14}/> Tài khoản</h3>
                     {user ? (
                         <div className="bg-slate-800/50 rounded-xl p-3 flex items-center justify-between">
                             <div className="flex items-center gap-3"><img src={user.avatarUrl} className="w-10 h-10 rounded-full border border-slate-600"/><div><div className="font-bold text-sm text-white">{user.name}</div><div className="text-[10px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> Online</div></div></div>
                             <button onClick={handleLogout} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Đăng xuất"><LogOut size={18}/></button>
                         </div>
                     ) : (
                         <div className="space-y-3">
                             <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="Nhập tên hiển thị..." className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-purple-500 outline-none"/>
                             <button onClick={() => { if(loginName.trim()) handleLoginUser(loginName) }} disabled={!loginName.trim()} className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"><LogIn size={16}/> Đăng nhập</button>
                             <p className="text-[10px] text-slate-500 text-center">Đăng nhập để lưu và đồng bộ lịch sử.</p>
                         </div>
                     )}
                 </div>
                 <div className="mb-6">
                     <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><Key size={14}/> Cấu hình AI</h3>
                     <label className="block text-xs text-slate-400 mb-1">Gemini API Key</label>
                     <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Nhập khóa API..." className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-purple-500 outline-none"/>
                     <p className="text-[10px] text-slate-600 mt-2">Khóa API được lưu trữ cục bộ trên trình duyệt của bạn.</p>
                 </div>
                 <button onClick={handleSaveSettings} className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-bold shadow-lg hover:opacity-90 transition-all">Lưu thay đổi</button>
             </div>
         </div>
      )}
      {viewingImage && (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setViewingImage(null)}>
              <img src={viewingImage.url} className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
              <button className="absolute top-5 right-5 text-white" onClick={() => setViewingImage(null)}><X size={32}/></button>
               {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'MOCKUP' || batchSettings.subMode === 'TEXT_TO_IMAGE') && ( <button onClick={() => handleDownload(viewingImage.url, 'result_image.png')} className="absolute bottom-10 bg-white text-black px-6 py-2 rounded-full font-bold">Tải về</button> )}
          </div>
      )}
      {localizeEditJob && localizeEditJob.generatedData && ( <EditImageModal imageUrl={localizeEditJob.generatedData} onClose={() => setLocalizeEditJob(null)} onConfirm={handleEditConfirm} isProcessing={isLocalizeEditing} /> )}
    </div>
  );
}