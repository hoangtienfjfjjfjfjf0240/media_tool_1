

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';

import { EditImageModal } from './components/EditImageModal';
import { AppMode, AspectRatio, BatchItem, BatchModel, BatchSubMode, HistoryItem, MockupType, TargetLanguage, ImageJob, GenderOption, Message, Sender } from './types';
import { editImage, generatePromptSuggestions, generateBatchVariation, setGlobalApiKey, localizeImage, checkSpelling, generateDistinctPrompts, magicEditChat, ChatTurn } from './services/geminiService';
import { isSupabaseConfigured, supabase } from './services/supabaseClient';
import { signInWithEmail, signUpWithEmail, signOut } from './services/authService';
import { uploadAndSaveHistory, fetchUserHistory } from './services/historyService';
import { ImagePlus, Loader2, Sparkles, Download, Upload, Layers, X, Zap, LayoutTemplate, ZoomIn, History, UserSquare2, Wand2, Settings, LogOut, AlertCircle, RotateCcw, User, Key, LogIn, Trash2, CheckCircle2, Globe2, Copy, Grid2X2, StopCircle, Mail, Lock } from 'lucide-react';
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

    const [loginName, setLoginName] = useState('');
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
    const [authError, setAuthError] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // General
    const [isLoading, setIsLoading] = useState(false);

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
    const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
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

    // Magic Edit (Chat-based Image Editing)
    const [editMessages, setEditMessages] = useState<Message[]>([]);
    const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
    const [editPrompt, setEditPrompt] = useState('');
    const [editProcessing, setEditProcessing] = useState(false);
    const [editChatHistory, setEditChatHistory] = useState<ChatTurn[]>([]);
    const [editPendingImage, setEditPendingImage] = useState<string | null>(null);
    const editFileRef = useRef<HTMLInputElement>(null);

    const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [viewingImage, setViewingImage] = useState<{ url: string, id?: string } | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const faceInputRef = useRef<HTMLInputElement>(null);
    const mockupSourceInputRef = useRef<HTMLInputElement>(null);
    const mockupTargetInputRef = useRef<HTMLInputElement>(null);
    const localizeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Supabase auth listener
        if (isSupabaseConfigured) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session?.user) {
                    setUser({
                        id: session.user.id,
                        name: session.user.user_metadata?.full_name || session.user.email || 'User',
                        avatarUrl: session.user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=U&background=random`
                    });
                }
            });
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                if (session?.user) {
                    setUser({
                        id: session.user.id,
                        name: session.user.user_metadata?.full_name || session.user.email || 'User',
                        avatarUrl: session.user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=U&background=random`
                    });
                } else {
                    setUser(null);
                }
            });
            return () => subscription.unsubscribe();
        } else {
            // Fallback: simple local login
            const storedUser = localStorage.getItem('simple_user_data');
            if (storedUser) {
                try { setUser(JSON.parse(storedUser)); } catch (e) { localStorage.removeItem('simple_user_data'); }
            }
        }
    }, []);

    useEffect(() => {
        if (batchSettings.subMode === 'HISTORY' && user) {
            setLoadingHistory(true);
            fetchUserHistory(user.id).then(data => { setHistoryItems(data); setLoadingHistory(false); });
        } else if (batchSettings.subMode === 'HISTORY' && !user) { setHistoryItems([]); }
    }, [batchSettings.subMode, user]);



    const handleSupabaseAuth = async () => {
        if (!authEmail || !authPassword) { setAuthError('Vui lòng nhập email và mật khẩu'); return; }
        setAuthLoading(true);
        setAuthError('');
        try {
            if (authMode === 'register') {
                const { error } = await signUpWithEmail(authEmail, authPassword);
                if (error) throw error;
                setAuthError('');
                alert('Đăng ký thành công! Kiểm tra email để xác nhận (hoặc đăng nhập ngay nếu không cần xác nhận).');
            } else {
                const { error } = await signInWithEmail(authEmail, authPassword);
                if (error) throw error;
                setShowSettings(false);
            }
        } catch (e: any) {
            setAuthError(e.message || 'Đăng nhập thất bại');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLoginUser = (name: string) => {
        let userId = localStorage.getItem('simple_user_uuid');
        if (!userId) { userId = crypto.randomUUID(); localStorage.setItem('simple_user_uuid', userId); }
        const newUser: SimpleUser = { id: userId, name: name, avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random` };
        localStorage.setItem('simple_user_data', JSON.stringify(newUser));
        setUser(newUser); setLoginName('');
    };

    const handleLogout = async () => {
        if (isSupabaseConfigured) await signOut();
        localStorage.removeItem('simple_user_data');
        setUser(null);
    };
    const handleSaveSettings = () => { setShowSettings(false); };
    const handleReloadUI = () => window.location.reload();

    const handleDownload = (dataUrl: string, filename: string) => {
        const a = document.createElement('a'); a.href = dataUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const handleBatchDownload = async () => {
        const list = (batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') ? generatedPrompts : mockupResults;
        const completed = list.filter(p => p.status === 'completed' && p.imageUrl);
        if (completed.length === 0) { alert("Chưa có ảnh nào!"); return; }
        for (let i = 0; i < completed.length; i++) { handleDownload(completed[i].imageUrl!, `result_${i + 1}.png`); await new Promise(r => setTimeout(r, 400)); }
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
                const targets: { k: AspectRatio, v: number }[] = [
                    { k: '1:1', v: 1 }, { k: '16:9', v: 16 / 9 }, { k: '9:16', v: 9 / 16 },
                    { k: '4:3', v: 4 / 3 }, { k: '3:4', v: 3 / 4 }, { k: '4:5', v: 0.8 }, { k: '5:4', v: 1.25 }
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
        const items = e.clipboardData.items; const files: File[] = [];
        for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const file = items[i].getAsFile(); if (file) files.push(file); } }
        if (files.length === 0) return;
        e.preventDefault();
        if (mode === AppMode.LOCALIZE_STUDIO) { await handleLocalizeFiles(files); }
        else if (mode === AppMode.BATCH_STUDIO) { processFile(files[0], 'variation'); }
    }, [mode]);

    const processFile = (file: File, target: string) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const res = reader.result as string;
            if (target === 'variation') { setVariationFile(file); setVariationPreview(res); }
            if (target === 'face') { setFaceFile(file); setFacePreview(res); }
            if (target === 'mockup-source') { setMockupSourceFile(file); setMockupSourcePreview(res); }
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
                // Check if AI-suggested prompts already exist (from handleSuggestPrompts)
                const hasSuggestedPrompts = generatedPrompts.length > 0 && generatedPrompts.some(p => p.status === 'pending' && p.prompt !== variationPrompt);
                if (hasSuggestedPrompts) {
                    // USE EXISTING AI-SUGGESTED PROMPTS — don't overwrite them!
                    itemsToProcess = [...generatedPrompts];
                } else {
                    // No AI suggestions — use raw user prompt for all images
                    itemsToProcess = Array(batchSettings.count).fill(null).map(() => ({
                        id: Math.random().toString(36).substring(7),
                        prompt: variationPrompt,
                        status: 'pending' as const
                    }));
                    setGeneratedPrompts(itemsToProcess);
                }
            } else {
                // VARIATION MODE: USE AI EXPANSION (generateDistinctPrompts)
                try {
                    // Temporarily set status to loading to indicate prompt generation
                    setGeneratedPrompts(prev => prev.map(p => ({ ...p, status: 'generating' as const })));

                    // Pass ref image so AI can analyze it and create context-aware variations
                    const refB64ForPrompts = variationFile ? await fileToBase64(variationFile) : undefined;
                    const distinctPrompts = await generateDistinctPrompts(
                        variationPrompt, batchSettings.count, genderOption, signal,
                        refB64ForPrompts, variationFile?.type
                    );

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
                                {Object.values(TargetLanguage).map(lang => (<option key={lang} value={lang}>{lang}</option>))}
                                <option value={TargetLanguage.OTHER}>Khác (Nhập tay)</option>
                            </select>
                            {targetLang === TargetLanguage.OTHER && (<input type="text" value={customLanguage} onChange={(e) => setCustomLanguage(e.target.value)} placeholder="Nhập ngôn ngữ (VD: Arabic)..." className="w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-indigo-500" disabled={localizeProcessing} />)}
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
                                {localizeProcessing ? <Loader2 className="animate-spin" size={18} /> : <Globe2 size={18} />} Localize All
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
                            {localizeQueue.length > 0 && (<button onClick={() => setLocalizeQueue([])} disabled={localizeProcessing} className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">Xóa tất cả</button>)}
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
                                                        {job.spellingStatus === 'checking' && <div className="bg-black/60 text-xs px-2 py-1 rounded text-slate-300 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Check lỗi...</div>}
                                                        {job.spellingStatus === 'clean' && <div className="bg-green-500/90 text-xs px-2 py-1 rounded text-white flex items-center gap-1"><CheckCircle2 size={12} /> Sạch lỗi</div>}
                                                        {job.spellingStatus === 'warning' && (<div className="group relative"><div className="bg-yellow-500/90 text-xs px-2 py-1 rounded text-white flex items-center gap-1 cursor-help"><AlertCircle size={12} /> Lỗi CT</div><div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-800 text-xs text-slate-200 rounded shadow-xl border border-slate-700 hidden group-hover:block z-10"><ul className="list-disc list-inside max-h-48 overflow-y-auto">{job.spellingErrors?.map((e, i) => <li key={i}>{e}</li>)}</ul><button onClick={() => processLocalizeJob(job, job.spellingErrors?.join(", "))} className="w-full mt-2 bg-indigo-600 p-1.5 rounded text-white">Sửa lỗi & Tạo lại</button></div></div>)}
                                                    </div>
                                                    <div className="absolute bottom-2 right-2 flex gap-2">
                                                        <button onClick={() => setViewingImage({ url: job.generatedData! })} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"><ZoomIn size={16} /></button>
                                                        <button onClick={() => setLocalizeEditJob(job)} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"><Wand2 size={16} /></button>
                                                        <button onClick={() => handleDownload(job.generatedData!, `loc-${job.fileName}`)} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"><Download size={16} /></button>
                                                    </div>
                                                </>
                                            ) : (<div className="text-slate-600 text-xs">{job.status === 'processing' ? 'Đang tạo...' : 'Chờ xử lý'}</div>)}
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



    const getAvailableRatios = (): AspectRatio[] => {
        const base: AspectRatio[] = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4'];
        if (batchSettings.model === 'gemini-3-pro-image-preview') {
            return [...base, '4:5', '5:4'];
        }
        return base;
    };

    const renderBatchStudio = () => {
        const isProcessing = ((batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && generatedPrompts.some(p => p.status === 'generating')) || (batchSettings.subMode === 'MOCKUP' && mockupResults.some(p => p.status === 'generating'));

        const presets = [
            {
                emoji: '🧓', label: 'Tuổi tác',
                subOptions: [
                    { tag: 'Trẻ em → Già', prompt: 'Create age progression: child (8yo), teenager (16yo), young adult (25yo), middle-aged (45yo), elderly (70yo). Keep the SAME person identity, outfit, pose, and background. Only change apparent age, skin texture, and hair.' },
                    { tag: 'Chỉ già đi', prompt: 'Age the subject by 30 years — show natural aging with wrinkles, grey hair, age spots. Keep identity, outfit, pose, background exactly the same.' },
                    { tag: 'Chỉ trẻ lại', prompt: 'Make the subject look 20 years younger — smooth skin, youthful features. Keep identity, outfit, pose, background exactly the same.' },
                ],
            },
            {
                emoji: '🎨', label: 'Phong cách',
                subOptions: [
                    { tag: 'Art Styles', prompt: 'Apply EACH of these distinct art styles as separate variations: watercolor painting, oil painting on canvas, Japanese anime/manga, cyberpunk digital art, vintage retro poster. Keep the SAME subject and composition. One style per image.' },
                    { tag: 'Photography', prompt: 'Apply EACH of these photography styles: studio portrait (rembrandt lighting), street photography (cinematic), fashion editorial (high-key), film noir (black & white dramatic shadows), golden hour outdoor. Keep the SAME subject.' },
                    { tag: '3D/CGI', prompt: 'Render in EACH of these 3D styles: Pixar/Disney 3D animation, realistic CGI render (Unreal Engine 5), clay/claymation style, low-poly geometric, voxel art. Keep the SAME subject and pose.' },
                ],
            },
            {
                emoji: '👗', label: 'Trang phục',
                subOptions: [
                    { tag: 'Thời trang', prompt: 'Change outfit to EACH of these: casual streetwear, formal business suit, traditional Vietnamese ao dai, sporty athletic wear, luxury evening gown/tuxedo. Keep SAME person, pose, background. One outfit per variation.' },
                    { tag: 'Đồng phục', prompt: 'Change outfit to EACH of these uniforms: doctor/medical, military/army, school uniform, chef, pilot uniform. Keep SAME person, pose, background.' },
                    { tag: 'Cosplay', prompt: 'Change outfit to EACH costume: superhero spandex suit, medieval knight armor, sci-fi space suit, samurai warrior, steampunk adventurer. Keep SAME person identity.' },
                ],
            },
            {
                emoji: '🌍', label: 'Bối cảnh',
                subOptions: [
                    { tag: 'Du lịch', prompt: 'Place the subject in EACH of these locations: Paris (Eiffel Tower background), Tokyo (neon streets), Santorini (white buildings, blue sea), New York (Times Square), Bali (tropical beach). Keep SAME person, outfit, pose.' },
                    { tag: 'Thiên nhiên', prompt: 'Change background to EACH of these: deep forest with sunlight rays, snowy mountain peak, cherry blossom garden, underwater coral reef, golden wheat field at sunset. Keep SAME subject.' },
                    { tag: 'Studio', prompt: 'Change background to EACH: clean white studio, gradient purple-blue studio, neon-lit dark studio, bokeh lights background, solid bold red background. Keep SAME subject and pose.' },
                ],
            },
            {
                emoji: '😊', label: 'Biểu cảm',
                subOptions: [
                    { tag: 'Cảm xúc', prompt: 'Create expression variations with EACH emotion: genuine happy smile, serious/intense look, surprised/shocked, confident/powerful, dreamy/thoughtful. Keep EVERYTHING else identical — same person, outfit, pose, background.' },
                    { tag: 'Hành động', prompt: 'Create action variations: laughing out loud, crying with tears, winking playfully, angry/frustrated, peaceful/zen meditation pose. Keep SAME person, outfit, background.' },
                ],
            },
        ];

        return (
            <div className="flex flex-col h-full overflow-hidden relative">
                {/* Tabs */}
                <div className="border-b flex justify-center shrink-0" style={{ background: '#0d0d14', borderColor: 'rgba(99,102,241,0.1)' }}>
                    {[{ id: 'VARIATION', icon: Layers, label: 'Biến thể' }, { id: 'TEXT_TO_IMAGE', icon: Sparkles, label: 'Tạo từ Prompt' }, { id: 'MOCKUP', icon: LayoutTemplate, label: 'Mockup' }, { id: 'HISTORY', icon: History, label: 'Lịch sử' }].map(tab => (
                        <button key={tab.id} onClick={() => setBatchSettings(s => ({ ...s, subMode: tab.id as BatchSubMode }))} className={`px-6 py-3 text-sm font-medium border-b-2 transition-all relative ${batchSettings.subMode === tab.id ? 'border-indigo-400 text-indigo-300 font-bold' : 'border-transparent text-slate-500 hover:text-slate-200'}`}><tab.icon size={16} className="inline mr-2" /> {tab.label}</button>
                    ))}
                </div>

                {/* HISTORY MODE */}
                {batchSettings.subMode === 'HISTORY' && (
                    <div className="flex-1 overflow-y-auto p-6">
                        {!user ? (<div className="text-center py-20 text-slate-500"><History size={48} className="mx-auto mb-4 opacity-50" /><p>Vui lòng đăng nhập để xem lịch sử.</p></div>) : loadingHistory ? (<div className="text-center mt-10"><Loader2 className="animate-spin mx-auto text-purple-500" /></div>) : (<div className="grid grid-cols-2 md:grid-cols-5 gap-4">{historyItems.map(h => (<div key={h.id} onClick={() => setViewingImage({ url: h.file_url, id: h.id })} className="cursor-pointer border border-slate-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-colors aspect-square"><img src={h.file_url} className="w-full h-full object-cover" /></div>))}{historyItems.length === 0 && (<div className="col-span-full text-center text-slate-500 py-10">Chưa có lịch sử nào.</div>)}</div>)}
                    </div>
                )}

                {/* VARIATION / TEXT_TO_IMAGE / MOCKUP — SPLIT PANEL */}
                {batchSettings.subMode !== 'HISTORY' && (
                    <div className="flex-1 flex min-h-0 overflow-hidden">
                        {/* LEFT PANEL — CONTROLS (35%) */}
                        <div className="w-[380px] shrink-0 border-r flex flex-col overflow-y-auto" style={{ background: '#0d0d16', borderColor: 'rgba(99,102,241,0.08)' }}>
                            <div className="p-5 space-y-5 flex-1">
                                {/* Upload Area */}
                                {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                                    <div className="space-y-4">
                                        {/* Reference Image Upload */}
                                        <div
                                            onClick={() => document.getElementById('var-upload')?.click()}
                                            tabIndex={0}
                                            className="w-full h-44 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer overflow-hidden relative transition-all group focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none"
                                            style={{ borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.03)' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.25)'; (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.03)'; }}
                                            onDrop={(e) => handleDrop(e, 'variation')}
                                            onDragOver={handleDragOver}
                                            onPaste={(e) => { const items = e.clipboardData.items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const file = items[i].getAsFile(); if (file) { e.preventDefault(); processFile(file, 'variation'); break; } } } }}
                                        >
                                            {variationPreview ? (
                                                <>
                                                    <img src={variationPreview} className="w-full h-full object-cover" />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setVariationFile(null); setVariationPreview(null); }}
                                                        className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 hover:bg-red-500 transition-colors"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="text-center">
                                                    <Upload size={28} className="mx-auto text-slate-500 mb-3 group-hover:text-purple-400 transition-colors" />
                                                    <p className="text-sm text-slate-400 font-medium">
                                                        {batchSettings.subMode === 'VARIATION' ? "Kéo thả ảnh mẫu" : "Ảnh gốc (Tùy chọn)"}
                                                    </p>
                                                    <p className="text-[10px] text-slate-600 mt-1">Click, drag & drop, or Ctrl+V to paste</p>
                                                </div>
                                            )}
                                            <input id="var-upload" type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'variation')} accept="image/*" />
                                        </div>

                                        {/* Face Upload (compact) */}
                                        {batchSettings.subMode === 'VARIATION' && (
                                            <div
                                                onClick={() => faceInputRef.current?.click()}
                                                tabIndex={0}
                                                className="w-full h-16 border border-dashed border-slate-700 rounded-lg flex items-center gap-3 px-4 cursor-pointer hover:border-purple-500 hover:bg-white/5 overflow-hidden transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none"
                                                onDrop={(e) => handleDrop(e, 'face')}
                                                onDragOver={handleDragOver}
                                                onPaste={(e) => { const items = e.clipboardData.items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const file = items[i].getAsFile(); if (file) { e.preventDefault(); processFile(file, 'face'); break; } } } }}
                                            >
                                                {facePreview ? (
                                                    <><img src={facePreview} className="w-10 h-10 rounded-lg object-cover" /><span className="text-xs text-slate-400">Face swap đã upload</span></>
                                                ) : (
                                                    <><UserSquare2 size={20} className="text-slate-500" /><span className="text-xs text-slate-500">Face swap (Tùy chọn)</span></>
                                                )}
                                                <input ref={faceInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'face')} accept="image/*" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Mockup Upload */}
                                {batchSettings.subMode === 'MOCKUP' && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div
                                                onClick={() => mockupSourceInputRef.current?.click()}
                                                tabIndex={0}
                                                className="h-28 border border-dashed border-slate-600 rounded-xl flex items-center justify-center cursor-pointer hover:border-purple-500 overflow-hidden focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none"
                                                onDrop={(e) => handleDrop(e, 'mockup-source')} onDragOver={handleDragOver}
                                                onPaste={(e) => { const items = e.clipboardData.items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const file = items[i].getAsFile(); if (file) { e.preventDefault(); processFile(file, 'mockup-source'); break; } } } }}
                                            >
                                                {mockupSourcePreview ? <img src={mockupSourcePreview} className="w-full h-full object-cover" /> : <div className="text-center"><ImagePlus size={20} className="mx-auto text-slate-500 mb-1" /><span className="text-[10px] text-slate-500">Thiết kế</span></div>}
                                                <input ref={mockupSourceInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'mockup-source')} accept="image/*" />
                                            </div>
                                            <div
                                                onClick={() => mockupTargetInputRef.current?.click()}
                                                tabIndex={0}
                                                className="h-28 border border-dashed border-slate-600 rounded-xl flex items-center justify-center cursor-pointer hover:border-purple-500 overflow-hidden relative focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none"
                                                onDrop={(e) => handleDrop(e, 'mockup-target')} onDragOver={handleDragOver}
                                                onPaste={(e) => { const items = e.clipboardData.items; const files: File[] = []; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const file = items[i].getAsFile(); if (file) files.push(file); } } if (files.length > 0) { e.preventDefault(); handleMockupTargetFiles(files); } }}
                                            >
                                                {mockupTargetPreviews.length > 0 ? (
                                                    <div className="w-full h-full grid grid-cols-2 gap-1 p-1">{mockupTargetPreviews.slice(0, 4).map((p, i) => <img key={i} src={p} className="w-full h-full object-cover rounded-sm" />)}</div>
                                                ) : (<div className="text-center"><LayoutTemplate size={20} className="mx-auto text-slate-500 mb-1" /><span className="text-[10px] text-slate-500">Bối cảnh</span></div>)}
                                                {mockupTargetFiles.length > 1 && (<span className="absolute top-1 right-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">+{mockupTargetFiles.length}</span>)}
                                                <input ref={mockupTargetInputRef} type="file" className="hidden" multiple onChange={(e) => handleFileSelect(e, 'mockup-target')} accept="image/*" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="radio" name="mocktype" checked={batchSettings.mockupType === 'SCREENSHOT'} onChange={() => setBatchSettings(s => ({ ...s, mockupType: 'SCREENSHOT' }))} /> Chèn Màn hình</label>
                                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"><input type="radio" name="mocktype" checked={batchSettings.mockupType === 'ICON'} onChange={() => setBatchSettings(s => ({ ...s, mockupType: 'ICON' }))} /> Thay thế Icon</label>
                                        </div>
                                        <input type="text" value={mockupPrompt} onChange={e => setMockupPrompt(e.target.value)} placeholder="Hướng dẫn cụ thể? (Tùy chọn)" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm" />
                                    </div>
                                )}

                                {/* Prompt Area (VARIATION / TEXT_TO_IMAGE) */}
                                {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                                    <div className="space-y-3">
                                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mô tả biến thể</label>
                                        <div className="relative">
                                            <textarea
                                                value={variationPrompt}
                                                onChange={e => setVariationPrompt(e.target.value)}
                                                placeholder={batchSettings.subMode === 'VARIATION' ? "VD: 'tạo phiên bản già và trẻ'" : "VD: 'Phi hành gia trên sao Hỏa'"}
                                                className="w-full h-28 bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                                            />
                                            <button
                                                onClick={handleSuggestPrompts}
                                                disabled={isSuggesting || (!variationPrompt && !variationFile)}
                                                className="absolute bottom-2 right-2 text-[10px] flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/50 text-indigo-200 border border-indigo-500/30 rounded-full hover:bg-indigo-800 transition-colors disabled:opacity-30"
                                            >
                                                {isSuggesting ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                                AI Gợi ý
                                            </button>
                                        </div>

                                        {/* MODIFICATION PRESETS */}
                                        {batchSettings.subMode === 'VARIATION' && (
                                            <div>
                                                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-2">Preset biến thể AI</label>
                                                <div className="space-y-1">
                                                    {presets.map(p => (
                                                        <div key={p.label} className="rounded-lg overflow-hidden">
                                                            {/* Category Header */}
                                                            <button
                                                                onClick={() => setExpandedPreset(expandedPreset === p.label ? null : p.label)}
                                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all ${expandedPreset === p.label ? 'bg-purple-900/30 text-purple-300 border border-purple-500/30 rounded-t-lg' : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg border border-transparent'}`}
                                                            >
                                                                <span className="text-sm">{p.emoji}</span>
                                                                <span className="text-[11px] font-medium flex-1">{p.label}</span>
                                                                <span className="text-[9px] text-slate-500">{p.subOptions.length} lựa chọn</span>
                                                                <span className={`text-[10px] transition-transform ${expandedPreset === p.label ? 'rotate-180' : ''}`}>▾</span>
                                                            </button>
                                                            {/* Sub-options */}
                                                            {expandedPreset === p.label && (
                                                                <div className="bg-slate-950/50 border border-t-0 border-purple-500/20 rounded-b-lg p-2 space-y-1">
                                                                    {p.subOptions.map(sub => (
                                                                        <button
                                                                            key={sub.tag}
                                                                            onClick={() => {
                                                                                setVariationPrompt(sub.prompt);
                                                                                setExpandedPreset(null);
                                                                            }}
                                                                            className="w-full text-left px-3 py-2 rounded-lg text-[11px] text-slate-400 hover:bg-purple-500/10 hover:text-purple-300 transition-all group"
                                                                        >
                                                                            <div className="font-medium text-slate-300 group-hover:text-purple-300">⚡ {sub.tag}</div>
                                                                            <div className="text-[9px] text-slate-600 mt-0.5 line-clamp-2 group-hover:text-slate-400">{sub.prompt.substring(0, 80)}...</div>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Gender & Background Modifiers */}
                                        {batchSettings.subMode === 'VARIATION' && (
                                            <div className="space-y-3 pt-2 border-t border-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] text-slate-500 font-medium w-16 shrink-0">Giới tính</span>
                                                    <div className="flex bg-slate-950 p-0.5 rounded-lg flex-1">
                                                        {(['ORIGINAL', 'MALE', 'FEMALE'] as GenderOption[]).map(opt => (
                                                            <button key={opt} onClick={() => setGenderOption(opt)} className={`flex-1 px-2 py-1 text-[10px] rounded transition-all ${genderOption === opt ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>{opt}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input type="checkbox" id="mod-bg" checked={modifyBackground} onChange={e => setModifyBackground(e.target.checked)} className="rounded bg-slate-800 border-slate-600 text-indigo-600" />
                                                    <label htmlFor="mod-bg" className="text-xs text-slate-400 cursor-pointer select-none">Thay đổi bối cảnh</label>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Settings Row */}
                                <div className="space-y-3 pt-3 border-t border-slate-800">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[10px] text-slate-500 block mb-1">Model</label>
                                            <select value={batchSettings.model} onChange={(e) => setBatchSettings({ ...batchSettings, model: e.target.value as BatchModel })} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-300">
                                                <option value="gemini-3-pro-image-preview">Pro (HQ)</option>
                                                <option value="gemini-2.5-flash-image">Flash (Fast)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 block mb-1">Tỷ lệ</label>
                                            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                                                <button onClick={() => setIsMultiRatio(!isMultiRatio)} className={`p-2 hover:bg-slate-800 transition-colors ${isMultiRatio ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Multi-ratio"><Grid2X2 size={12} /></button>
                                                {!isMultiRatio && (
                                                    <select value={batchSettings.ratio} onChange={e => setBatchSettings(s => ({ ...s, ratio: e.target.value as AspectRatio }))} className="bg-transparent border-none py-1 pl-1 pr-4 text-[11px] text-white focus:ring-0 cursor-pointer flex-1">{getAvailableRatios().map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}</select>
                                                )}
                                            </div>
                                            {isMultiRatio && (
                                                <div className="flex flex-wrap gap-1 mt-1">{getAvailableRatios().map(r => (<button key={r} onClick={() => toggleSelectedRatio(r)} className={`px-1.5 py-0.5 text-[9px] rounded ${selectedRatios.includes(r) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>{r}</button>))}</div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 block mb-1">Số ảnh</label>
                                            <select value={batchSettings.count} onChange={e => setBatchSettings(s => ({ ...s, count: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-[11px]">{Array.from({ length: 10 }, (_, i) => i + 1).map(num => (<option key={num} value={num}>{num}</option>))}</select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Generate Button — fixed bottom */}
                            <div className="p-4 border-t border-white/5 bg-slate-900/80 space-y-2">
                                <button onClick={handleRunBatch} disabled={isProcessing} className="w-full py-3.5 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)' }}>
                                    {isProcessing ? (<><Loader2 size={16} className="animate-spin" /> Đang xử lý...</>) : (<><Sparkles size={16} /> {batchSettings.subMode === 'MOCKUP' ? `Ghép Mockup (${mockupTargetFiles.length})` : 'Tạo Ảnh'}</>)}
                                </button>
                                {isProcessing && (<button onClick={handleCancel} className="w-full py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium hover:bg-red-500/20 flex items-center justify-center gap-2"><StopCircle size={14} /> Hủy</button>)}
                                {!isProcessing && generatedPrompts.some(p => p.imageUrl) && (<button onClick={handleBatchDownload} className="w-full py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-700 flex items-center justify-center gap-2"><Download size={14} /> Tải tất cả</button>)}
                            </div>
                        </div>

                        {/* RIGHT PANEL — RESULTS (65%) */}
                        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                            {/* Results Grid */}
                            {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (
                                <div className="flex-1 overflow-y-auto p-5">
                                    {generatedPrompts.length > 0 ? (
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                            {generatedPrompts.map(item => (
                                                <div key={item.id} onClick={() => { if (item.imageUrl) setViewingImage({ url: item.imageUrl, id: item.id }) }} className="aspect-square bg-slate-900/50 rounded-xl border border-slate-800 relative overflow-hidden cursor-pointer group hover:border-purple-500/50 transition-all">
                                                    {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-slate-500 flex-col gap-2">
                                                        {item.status === 'generating' ? <Loader2 size={24} className="animate-spin text-purple-500" /> : item.status === 'error' ? <AlertCircle size={24} className="text-red-500" /> : <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse"></div>}
                                                        <span className={`px-3 text-center ${item.status === 'error' ? 'text-red-400 font-bold' : ''}`}>{item.status === 'generating' ? 'Đang tạo...' : item.status === 'pending' ? 'Chờ...' : item.error || ''}</span>
                                                    </div>}
                                                    {item.imageUrl && (<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"><button onClick={(e) => { e.stopPropagation(); setViewingImage({ url: item.imageUrl!, id: item.id }); }} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 text-white backdrop-blur-sm"><ZoomIn size={20} /></button></div>)}
                                                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white/80">{item.ratio || batchSettings.ratio}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full flex-col gap-4">
                                            <div className="w-24 h-24 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(249,115,22,0.1) 100%)' }}><Layers size={40} className="text-indigo-400/50" /></div>
                                            <p className="text-slate-500 text-sm text-center max-w-[280px]">Upload ảnh mẫu + nhập mô tả → Nhấn <span className="text-orange-400 font-medium">"Tạo Ảnh"</span></p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Mockup Results */}
                            {batchSettings.subMode === 'MOCKUP' && (
                                <div className="flex-1 overflow-y-auto p-5">
                                    {mockupResults.length > 0 ? (
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                            {mockupResults.map(item => (
                                                <div key={item.id} onClick={() => { if (item.imageUrl) setViewingImage({ url: item.imageUrl, id: item.id }) }} className="aspect-square bg-slate-900 rounded-xl border border-slate-800 relative overflow-hidden cursor-pointer group hover:border-slate-600">
                                                    {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-slate-500 flex-col gap-2">
                                                        {item.status === 'generating' ? <Loader2 className="animate-spin" /> : item.status === 'error' ? <AlertCircle size={20} className="text-red-500" /> : <LayoutTemplate size={20} />}
                                                        <span className={`px-2 text-center truncate w-full ${item.status === 'error' ? 'text-red-400 font-bold' : ''}`}>{item.error || item.prompt}</span>
                                                    </div>}
                                                    {item.imageUrl && (<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"><button onClick={(e) => { e.stopPropagation(); setViewingImage({ url: item.imageUrl!, id: item.id }); }} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white"><ZoomIn size={20} /></button></div>)}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full flex-col gap-4 opacity-40">
                                            <LayoutTemplate size={64} className="text-slate-600" />
                                            <p className="text-slate-500 text-sm">Chọn thiết kế và bối cảnh để tạo mockup.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Prompt Details Panel (bottom) */}
                            {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'TEXT_TO_IMAGE') && generatedPrompts.length > 0 && (
                                <div className="h-32 shrink-0 bg-slate-900/80 border-t border-white/5 p-3 grid grid-cols-2 md:grid-cols-4 gap-2 overflow-y-auto backdrop-blur-md">
                                    {generatedPrompts.map((p, i) => (<div key={p.id} className="relative"><textarea value={p.prompt} onChange={e => { const n = [...generatedPrompts]; n[i].prompt = e.target.value; setGeneratedPrompts(n); }} className="w-full h-full bg-slate-950/50 border border-slate-700 rounded-lg p-2 text-[10px] resize-none text-slate-300 focus:border-purple-500 focus:outline-none" /><span className="absolute bottom-1 right-2 text-[9px] text-slate-600">#{i + 1}</span></div>))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )
    };

    // Magic Edit — Send Message (Multi-turn Gemini-style)
    const handleEditSend = async () => {
        if ((!editPrompt.trim() && !editPendingImage) || editProcessing) return;
        const currentPrompt = editPrompt.trim() || (editPendingImage ? 'Edit this image' : '');
        const currentImage = editPendingImage;

        // Build user message with optional image
        const userMsg: Message = {
            id: Date.now().toString(), sender: Sender.USER, text: currentPrompt,
            imageUrl: currentImage || undefined, timestamp: Date.now()
        };
        setEditMessages(prev => [...prev, userMsg]);
        setEditPrompt('');
        setEditPendingImage(null);
        setEditProcessing(true);

        try {
            // Include pending image in history before calling API
            const historyWithImage = currentImage
                ? [...editChatHistory, { role: 'user' as const, text: '', imageDataUrl: currentImage }]
                : editChatHistory;

            const result = await magicEditChat(historyWithImage, currentPrompt);

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: Sender.AI,
                text: result.text || (result.imageBase64 ? '✨ Here you go!' : 'Done.'),
                imageUrl: result.imageBase64 ? `data:image/png;base64,${result.imageBase64}` : undefined,
                timestamp: Date.now()
            };
            setEditMessages(prev => [...prev, aiMsg]);

            // Update chat history
            const newHistory = [...editChatHistory];
            if (currentImage) {
                newHistory.push({ role: 'user' as const, text: currentPrompt, imageDataUrl: currentImage });
            } else {
                newHistory.push({ role: 'user' as const, text: currentPrompt });
            }
            newHistory.push({ role: 'model' as const, text: result.text || '', imageDataUrl: aiMsg.imageUrl });
            setEditChatHistory(newHistory);
        } catch (err: any) {
            setEditMessages(prev => [...prev, {
                id: Date.now().toString(), sender: Sender.AI,
                text: `Error: ${err.message || 'Unknown error'}`, isError: true, timestamp: Date.now()
            }]);
        }
        setEditProcessing(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    const handleEditUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditPendingImage(reader.result as string);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleEditPaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setEditPendingImage(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                    break;
                }
            }
        }
    };

    const handleNewEditChat = () => {
        setEditMessages([]);
        setEditChatHistory([]);
        setEditImageUrl(null);
        setEditPrompt('');
        setEditProcessing(false);
        setEditPendingImage(null);
    };
    const [editDragOver, setEditDragOver] = useState(false);

    const handleEditDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditDragOver(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setEditPendingImage(reader.result as string);
                };
                reader.readAsDataURL(file);
                return;
            }
        }
        // Handle dragged image URLs (e.g. from other chat)
        const html = e.dataTransfer.getData('text/html');
        const match = html?.match(/src="([^"]+)"/);
        if (match && match[1]?.startsWith('data:image')) {
            setEditPendingImage(match[1]);
        }
    };

    const renderMagicEdit = () => (
        <div
            className="flex flex-col h-full relative"
            tabIndex={0}
            onPaste={handleEditPaste}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setEditDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); setEditDragOver(false); }}
            onDrop={handleEditDrop}
        >
            {/* Drop Overlay */}
            {editDragOver && (
                <div className="absolute inset-0 z-50 bg-rose-500/10 border-2 border-dashed border-rose-500/50 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <div className="text-center">
                        <Upload size={48} className="text-rose-400 mx-auto mb-3" />
                        <p className="text-white font-semibold text-lg">Drop image here</p>
                        <p className="text-slate-400 text-sm">Release to add to chat</p>
                    </div>
                </div>
            )}
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-6">
                    {editMessages.length === 0 ? (
                        /* Welcome Screen */
                        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                            <div className="w-24 h-24 bg-gradient-to-br from-rose-500 to-pink-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-rose-500/30">
                                <Wand2 size={42} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Magic Edit</h2>
                            <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">
                                Upload an image and describe what you want to change.<br />
                                Or just type to generate images from text.
                            </p>
                            <div className="flex gap-3 mb-4">
                                <button
                                    onClick={() => editFileRef.current?.click()}
                                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-2xl font-semibold hover:opacity-90 transition-all shadow-lg hover:shadow-rose-500/30 hover:scale-[1.02]"
                                >
                                    <Upload size={18} /> Upload Image
                                </button>
                            </div>
                            <p className="text-slate-500 text-xs">
                                <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-mono text-[10px]">Ctrl+V</kbd> to paste • Drag & drop supported
                            </p>
                            <input ref={editFileRef} type="file" className="hidden" accept="image/*" onChange={handleEditUpload} />

                            {/* Quick prompts */}
                            <div className="grid grid-cols-2 gap-2 mt-8 max-w-md w-full">
                                {['🎨 Change style to anime', '🌅 Make it sunset', '✨ Enhance quality', '🏠 Change background'].map(q => (
                                    <button key={q} onClick={() => { setEditPrompt(q.slice(2).trim()); }} className="text-left px-4 py-3 bg-slate-800/50 hover:bg-slate-700/60 border border-white/5 rounded-xl text-sm text-slate-400 hover:text-white transition-all">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Chat Messages */
                        <div className="space-y-6">
                            {editMessages.map(msg => (
                                <div key={msg.id} className={`flex gap-3 ${msg.sender === Sender.USER ? 'justify-end' : 'justify-start'}`}>
                                    {/* AI Avatar */}
                                    {msg.sender === Sender.AI && (
                                        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center mt-1">
                                            <Sparkles size={14} className="text-white" />
                                        </div>
                                    )}

                                    <div className={`flex flex-col gap-2 ${msg.sender === Sender.USER ? 'items-end max-w-[70%]' : 'items-start max-w-[85%]'}`}>
                                        {/* Image */}
                                        {msg.imageUrl && (
                                            <div
                                                className="rounded-2xl overflow-hidden border border-white/10 cursor-pointer hover:border-rose-500/40 transition-all group relative"
                                                onClick={() => setViewingImage({ url: msg.imageUrl! })}
                                            >
                                                <img src={msg.imageUrl} alt="" className="max-w-lg max-h-[400px] object-contain" />
                                                {msg.sender === Sender.AI && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownload(msg.imageUrl!, `magic-edit-${Date.now()}.png`); }}
                                                        className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Download"
                                                    >
                                                        <Download size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Text Bubble */}
                                        {msg.text && (
                                            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.sender === Sender.USER
                                                ? 'bg-blue-600/80 text-white'
                                                : msg.isError
                                                    ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                                                    : 'bg-slate-800/80 text-slate-200'
                                                }`}>
                                                {msg.text}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Typing Indicator */}
                            {editProcessing && (
                                <div className="flex gap-3 items-start">
                                    <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                                        <Sparkles size={14} className="text-white" />
                                    </div>
                                    <div className="px-4 py-3 bg-slate-800/80 rounded-2xl">
                                        <div className="flex gap-1.5">
                                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            </div>

            {/* Input Bar — Always Visible */}
            <div className="shrink-0 border-t border-white/5" style={{ background: 'rgba(10,10,18,0.95)' }}>
                <div className="max-w-3xl mx-auto px-4 py-3">
                    {/* Pending Image Preview */}
                    {editPendingImage && (
                        <div className="mb-2 flex items-start gap-2">
                            <div className="relative group">
                                <img
                                    src={editPendingImage}
                                    alt="Preview"
                                    className="h-20 rounded-xl border border-white/10 object-cover cursor-pointer"
                                    onClick={() => setViewingImage({ url: editPendingImage })}
                                />
                                <button
                                    onClick={() => setEditPendingImage(null)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center text-xs shadow-lg"
                                >
                                    ×
                                </button>
                            </div>
                            <span className="text-xs text-slate-500 mt-1">Image attached • Type a prompt and send</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {editMessages.length > 0 && (
                            <button
                                onClick={handleNewEditChat}
                                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all shrink-0"
                                title="New chat"
                            >
                                <RotateCcw size={16} />
                            </button>
                        )}
                        <button
                            onClick={() => editFileRef.current?.click()}
                            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all shrink-0"
                            title="Upload image"
                        >
                            <ImagePlus size={16} />
                        </button>
                        <input ref={editFileRef} type="file" className="hidden" accept="image/*" onChange={handleEditUpload} />
                        <input
                            type="text"
                            value={editPrompt}
                            onChange={e => setEditPrompt(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleEditSend()}
                            placeholder={editPendingImage ? "Describe what to do with this image..." : "Type or drop image here..."}
                            className="flex-1 bg-slate-800/60 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 outline-none"
                            disabled={editProcessing}
                            onPaste={handleEditPaste}
                            autoFocus
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={handleEditDrop}
                        />
                        <button
                            onClick={handleEditSend}
                            disabled={editProcessing || (!editPrompt.trim() && !editPendingImage)}
                            className="p-2.5 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-30 shrink-0"
                        >
                            {editProcessing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // LOGIN GATE — Show login screen if not authenticated
    if (!user) {
        return (
            <div className="h-screen w-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #050508 0%, #0a0a12 30%, #0d0a18 60%, #08080f 100%)' }}>
                {/* Animated background elements */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] animate-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-900/5 rounded-full blur-[150px]" />
                </div>

                {/* Login Card */}
                <div className="relative z-10 w-full max-w-sm mx-4">
                    {/* Logo / Brand */}
                    <div className="text-center mb-8">
                        <img src="/logo.png" alt="iKame" className="w-16 h-16 rounded-2xl shadow-lg shadow-orange-500/30 object-cover mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-white tracking-tight">Media Studio</h1>
                        <p className="text-sm text-slate-400 mt-1">AI-powered creative tools</p>
                    </div>

                    {/* Card */}
                    <div className="backdrop-blur-xl border rounded-2xl p-6 shadow-2xl shadow-black/50" style={{ background: 'rgba(13,13,20,0.9)', borderColor: 'rgba(99,102,241,0.15)' }}>
                        {/* Tabs */}
                        <div className="flex bg-slate-950/80 p-1 rounded-xl mb-5">
                            <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${authMode === 'login' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}>Sign In</button>
                            <button onClick={() => { setAuthMode('register'); setAuthError(''); }} className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${authMode === 'register' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}>Sign Up</button>
                        </div>

                        {/* Form */}
                        <div className="space-y-3">
                            <div className="relative">
                                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email" className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 outline-none transition-all" />
                            </div>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password (min 6 characters)" onKeyDown={e => e.key === 'Enter' && handleSupabaseAuth()} className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 outline-none transition-all" />
                            </div>

                            {authError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{authError}</p>}

                            <button onClick={handleSupabaseAuth} disabled={authLoading || !authEmail || !authPassword} className="w-full flex items-center justify-center gap-2 py-3 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 disabled:opacity-50 disabled:shadow-none transition-all" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)' }}>
                                {authLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                                {authMode === 'register' ? 'Create Account' : 'Sign In'}
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 my-5">
                            <div className="flex-1 h-px bg-white/10"></div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">or</span>
                            <div className="flex-1 h-px bg-white/10"></div>
                        </div>

                        {/* Quick Login */}
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="Display name..." className="flex-1 bg-slate-950/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-purple-500/50 outline-none" />
                                <button onClick={() => { if (loginName.trim()) handleLoginUser(loginName) }} disabled={!loginName.trim()} className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 disabled:opacity-30 transition-all shrink-0">
                                    Quick Login
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-600 text-center">Quick login — data stored locally, no cloud sync.</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-[10px] text-slate-600 mt-6">© 2026 Media Studio · Powered by Supabase + Gemini AI</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen text-slate-100" style={{ background: '#0a0a0f' }}>
            <Sidebar currentMode={mode} setMode={setMode} />
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-14 flex items-center justify-between px-6 relative" style={{ background: '#0d0d14', borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                    <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), rgba(249,115,22,0.2), transparent)' }}></div>
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                        {mode === AppMode.LOCALIZE_STUDIO ? 'LocalizeAI Pro' :
                            mode === AppMode.AI_THEME_CHANGER ? 'AI Theme Changer' :
                                mode === AppMode.ASO_STUDIO ? 'ASO Architect' :
                                    mode === AppMode.AI_FUSION ? 'AI Fusion' :
                                        mode === AppMode.IMAGE_EDIT ? 'Magic Edit' :
                                            'Batch Studio'}
                    </span></div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleReloadUI} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5" title="Reload"><RotateCcw size={18} /></button>
                        <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5" title="Settings"><Settings size={18} /></button>
                    </div>
                </header>
                <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
                    {mode === AppMode.BATCH_STUDIO ? renderBatchStudio() :
                        mode === AppMode.LOCALIZE_STUDIO ? renderLocalizeStudio() :
                            mode === AppMode.AI_THEME_CHANGER ? <ThemeChanger /> :
                                mode === AppMode.ASO_STUDIO ? <ASOGenerator /> :
                                    mode === AppMode.AI_FUSION ? <AIFusion /> :
                                        mode === AppMode.IMAGE_EDIT ? renderMagicEdit() :
                                            <div className="flex items-center justify-center h-full text-slate-500"><Wand2 size={48} className="opacity-30" /></div>}
                </main>
            </div>
            {showSettings && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20} /></button>
                        <h2 className="text-xl font-bold text-white mb-6">Settings</h2>
                        <div className="mb-6 pb-6 border-b border-slate-800">
                            <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><User size={14} /> Account</h3>
                            {user ? (
                                <div className="bg-slate-800/50 rounded-xl p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3"><img src={user.avatarUrl} className="w-10 h-10 rounded-full border border-slate-600" /><div><div className="font-bold text-sm text-white">{user.name}</div><div className="text-[10px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> Online</div></div></div>
                                    <button onClick={handleLogout} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Sign Out"><LogOut size={18} /></button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {isSupabaseConfigured ? (
                                        <>
                                            <div className="flex bg-slate-950 p-0.5 rounded-lg mb-1">
                                                <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className={`flex-1 py-1.5 text-xs rounded transition-all ${authMode === 'login' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>Sign In</button>
                                                <button onClick={() => { setAuthMode('register'); setAuthError(''); }} className={`flex-1 py-1.5 text-xs rounded transition-all ${authMode === 'register' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>Sign Up</button>
                                            </div>
                                            <div className="relative">
                                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email" className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none" />
                                            </div>
                                            <div className="relative">
                                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password (min 6 characters)" onKeyDown={e => e.key === 'Enter' && handleSupabaseAuth()} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none" />
                                            </div>
                                            {authError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{authError}</p>}
                                            <button onClick={handleSupabaseAuth} disabled={authLoading || !authEmail || !authPassword} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-bold hover:from-purple-500 disabled:opacity-50 transition-all">
                                                {authLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                                                {authMode === 'register' ? 'Create Account' : 'Sign In'}
                                            </button>
                                            <p className="text-[10px] text-slate-500 text-center">Sign in to sync history to cloud.</p>
                                        </>
                                    ) : (
                                        <>
                                            <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="Enter display name..." className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-purple-500 outline-none" />
                                            <button onClick={() => { if (loginName.trim()) handleLoginUser(loginName) }} disabled={!loginName.trim()} className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"><LogIn size={16} /> Quick Login</button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <button onClick={handleSaveSettings} className="w-full py-2.5 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>Save Changes</button>
                    </div>
                </div>
            )}
            {viewingImage && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage.url} className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
                    <button className="absolute top-5 right-5 text-white" onClick={() => setViewingImage(null)}><X size={32} /></button>
                    {(batchSettings.subMode === 'VARIATION' || batchSettings.subMode === 'MOCKUP' || batchSettings.subMode === 'TEXT_TO_IMAGE') && (<button onClick={() => handleDownload(viewingImage.url, 'result_image.png')} className="absolute bottom-10 bg-white text-black px-6 py-2 rounded-full font-bold">Tải về</button>)}
                </div>
            )}
            {localizeEditJob && localizeEditJob.generatedData && (<EditImageModal imageUrl={localizeEditJob.generatedData} onClose={() => setLocalizeEditJob(null)} onConfirm={handleEditConfirm} isProcessing={isLocalizeEditing} />)}
        </div>
    );
}