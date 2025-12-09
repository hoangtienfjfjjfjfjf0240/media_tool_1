
import React, { useState, useRef } from 'react';
import { ThemeJob, ThemeType, ThemeIntensity } from '../types';
import { transformImageTheme, extractStyleDescription } from '../services/geminiService';
import { Upload, X, Loader2, Download, Wand2, Palette, Sparkles, Trash2, ZoomIn, CheckCircle2 } from 'lucide-react';
import { EditImageModal } from './EditImageModal';
import JSZip from 'jszip';

export const ThemeChanger: React.FC = () => {
    const [jobs, setJobs] = useState<ThemeJob[]>([]);
    const [selectedTheme, setSelectedTheme] = useState<string>('Christmas');
    const [customTheme, setCustomTheme] = useState('');
    const [themeType, setThemeType] = useState<ThemeType>('SCREENSHOT');
    const [intensity, setIntensity] = useState<ThemeIntensity>('MEDIUM');
    const [userPrompt, setUserPrompt] = useState('');
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [editJob, setEditJob] = useState<ThemeJob | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const themes = ['Christmas', 'Halloween', 'Black Friday', 'Lunar New Year', 'Valentine'];

    const processFiles = async (files: File[]) => {
        const newJobs: ThemeJob[] = [];
        for (const file of files) {
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target?.result as string);
                reader.readAsDataURL(file);
            });
            newJobs.push({
                id: Math.random().toString(36).substring(7),
                fileName: file.name,
                originalData: base64,
                generatedData: null,
                status: 'idle'
            });
        }
        setJobs(prev => [...prev, ...newJobs]);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await processFiles(Array.from(e.target.files));
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const runBatchTransformation = async () => {
        const pendingJobs = jobs.filter(j => j.status === 'idle' || j.status === 'error');
        if (pendingJobs.length === 0) return;

        setIsProcessing(true);
        const effectiveTheme = selectedTheme === 'Custom' ? customTheme : selectedTheme;

        let styleReferenceData: string | undefined = undefined;
        let explicitStyleGuide: string | undefined = undefined;
        
        const allJobs = [...jobs];
        let firstJob = allJobs[0];

        if (!firstJob) { setIsProcessing(false); return; }

        // --- STEP 1: Process First Image (Style Master) ---
        if (firstJob.status !== 'success') {
            setJobs(curr => curr.map(j => j.id === firstJob.id ? { ...j, status: 'processing' } : j));
            try {
                // Generate the first image
                const result = await transformImageTheme(firstJob.originalData, effectiveTheme, themeType, intensity, userPrompt, undefined);
                
                const updatedFirstJob = { ...firstJob, status: 'success' as const, generatedData: result };
                allJobs[0] = updatedFirstJob;
                setJobs([...allJobs]); 
                styleReferenceData = result;

                // ANALYZE STYLE: Extract criteria from the Master Image
                explicitStyleGuide = await extractStyleDescription(result);
                console.log("Extracted Style Guide:", explicitStyleGuide);

            } catch (e) {
                console.error("First image failed", e);
                setJobs(curr => curr.map(j => j.id === firstJob.id ? { ...j, status: 'error' } : j));
                setIsProcessing(false);
                return; 
            }
        } else {
            styleReferenceData = firstJob.generatedData!;
            // If reusing an existing successful master, we should technically re-extract or store the guide, 
            // but for now, we re-extract to be safe if it wasn't stored.
            explicitStyleGuide = await extractStyleDescription(firstJob.generatedData!);
        }

        // --- STEP 2: Process Remaining Images (Conditional Application) ---
        const jobsToProcess = allJobs.slice(1).filter(j => j.status !== 'success');
        setJobs(curr => curr.map(j => jobsToProcess.find(t => t.id === j.id) ? { ...j, status: 'processing' } : j));

        for (const job of jobsToProcess) {
            try {
                const result = await transformImageTheme(
                    job.originalData, 
                    effectiveTheme, 
                    themeType, 
                    intensity, 
                    userPrompt, 
                    styleReferenceData, 
                    explicitStyleGuide // Pass the analyzed criteria
                );
                setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: 'success', generatedData: result } : j));
            } catch (e) {
                console.error(`Job ${job.id} failed`, e);
                setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: 'error' } : j));
            }
        }

        setIsProcessing(false);
    };

    const handleDownload = (dataUrl: string, filename: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadAll = async () => {
        const successJobs = jobs.filter(j => j.status === 'success' && j.generatedData);
        if (successJobs.length === 0) return;
        const zip = new JSZip();
        successJobs.forEach((job, i) => {
             const data = job.generatedData!.split(',')[1];
             zip.file(`theme-${selectedTheme}-${i + 1}.png`, data, { base64: true });
        });
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `theme-${selectedTheme}-all.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 h-full overflow-y-auto">
            {/* Left Panel: Settings */}
            <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
                <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                    <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Palette className="text-pink-500" /> AI Theme Changer
                    </h2>
                    
                    <div className="space-y-6">
                        {/* Type Selector */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-3">Loại ảnh</label>
                            <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-lg">
                                <button 
                                    onClick={() => setThemeType('SCREENSHOT')}
                                    className={`py-2 text-xs font-bold rounded-md transition-all ${themeType === 'SCREENSHOT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Screenshot
                                </button>
                                <button 
                                    onClick={() => setThemeType('ICON')}
                                    className={`py-2 text-xs font-bold rounded-md transition-all ${themeType === 'ICON' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                >
                                    App Icon
                                </button>
                            </div>
                        </div>

                        {/* Theme Selector */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-3">Chủ đề lễ hội</label>
                            <div className="flex flex-wrap gap-2">
                                {themes.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setSelectedTheme(t); setCustomTheme(''); }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedTheme === t ? 'bg-pink-600 border-pink-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                                <button
                                     onClick={() => setSelectedTheme('Custom')}
                                     className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedTheme === 'Custom' ? 'bg-pink-600 border-pink-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                                >
                                    Custom
                                </button>
                            </div>
                            {selectedTheme === 'Custom' && (
                                <input 
                                    type="text" 
                                    value={customTheme} 
                                    onChange={(e) => setCustomTheme(e.target.value)}
                                    placeholder="Nhập tên chủ đề (VD: Cyberpunk)..." 
                                    className="w-full mt-3 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-pink-500 outline-none"
                                />
                            )}
                        </div>

                         {/* Intensity Selector */}
                        <div>
                             <label className="block text-sm font-medium text-slate-300 mb-3">Mức độ thay đổi</label>
                             <div className="grid grid-cols-3 gap-2 bg-slate-900 p-1 rounded-lg">
                                <button onClick={() => setIntensity('LOW')} className={`py-2 text-xs font-bold rounded-md transition-all ${intensity === 'LOW' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>Yếu</button>
                                <button onClick={() => setIntensity('MEDIUM')} className={`py-2 text-xs font-bold rounded-md transition-all ${intensity === 'MEDIUM' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Vừa</button>
                                <button onClick={() => setIntensity('HIGH')} className={`py-2 text-xs font-bold rounded-md transition-all ${intensity === 'HIGH' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}>Mạnh</button>
                             </div>
                        </div>

                        {/* User Prompt */}
                        <div>
                             <label className="block text-sm font-medium text-slate-300 mb-2">Ghi chú thêm (Tùy chọn)</label>
                             <textarea 
                                value={userPrompt}
                                onChange={(e) => setUserPrompt(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-pink-500 outline-none resize-none h-20"
                                placeholder="VD: Thêm hộp quà ở góc dưới, đổi màu nền sang đỏ..."
                             />
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-4 border-t border-slate-700 space-y-3">
                            <button 
                                onClick={runBatchTransformation}
                                disabled={isProcessing || jobs.length === 0}
                                className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Sparkles size={20}/>} 
                                Biến hình ({jobs.filter(j => j.status !== 'success').length})
                            </button>
                            
                            {jobs.some(j => j.status === 'success') && (
                                <button 
                                    onClick={handleDownloadAll}
                                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <Download size={20}/> Tải tất cả
                                </button>
                            )}

                            {jobs.length > 0 && (
                                <button 
                                    onClick={() => setJobs([])}
                                    disabled={isProcessing}
                                    className="w-full py-2 text-red-400 hover:bg-red-500/10 rounded-lg text-xs font-medium transition-colors"
                                >
                                    Xóa danh sách
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel: Workspace */}
            <div className="lg:col-span-9 space-y-6 order-1 lg:order-2 flex flex-col h-full min-h-[500px]">
                {/* Upload Area */}
                <div 
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="border-2 border-dashed border-slate-700 rounded-2xl p-8 flex flex-col items-center justify-center hover:bg-slate-800/30 hover:border-pink-500/50 transition-all cursor-pointer bg-slate-900/20 group"
                >
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="text-slate-400 group-hover:text-pink-400" size={24} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-300">Tải ảnh lên (Icon hoặc Screenshot)</h3>
                    <p className="text-sm text-slate-500 mt-2 text-center max-w-md">
                        Kéo thả hoặc click để chọn nhiều ảnh. Ảnh đầu tiên sẽ được dùng làm chuẩn phong cách (Style Reference) cho các ảnh sau.
                    </p>
                    <input 
                        type="file" 
                        multiple 
                        ref={inputRef} 
                        className="hidden" 
                        onChange={handleFileSelect} 
                        accept="image/*"
                    />
                </div>

                {/* Grid Results */}
                {jobs.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
                        {jobs.map((job, index) => (
                            <div key={job.id} className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden relative group">
                                <div className="p-3 border-b border-slate-700/50 bg-slate-900/50 flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-400 truncate max-w-[150px]">{index + 1}. {job.fileName}</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button>
                                    </div>
                                </div>
                                
                                <div className="relative aspect-square md:aspect-[4/5] bg-slate-950">
                                    {job.generatedData ? (
                                        <img src={job.generatedData} className="w-full h-full object-contain" />
                                    ) : (
                                        <img src={job.originalData} className="w-full h-full object-contain opacity-50 grayscale" />
                                    )}

                                    {/* Overlay Status/Actions */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-4">
                                        {job.status === 'processing' ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="animate-spin text-pink-500" size={32} />
                                                <span className="text-xs text-white font-medium">Đang biến hình...</span>
                                            </div>
                                        ) : job.status === 'success' ? (
                                            <>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setViewingImage(job.generatedData!)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-white" title="Xem"><ZoomIn size={20}/></button>
                                                    <button onClick={() => setEditJob(job)} className="p-2 bg-pink-600 hover:bg-pink-500 rounded-full text-white" title="Sửa"><Wand2 size={20}/></button>
                                                    <button onClick={() => handleDownload(job.generatedData!, `theme-${job.fileName}`)} className="p-2 bg-green-600 hover:bg-green-500 rounded-full text-white" title="Tải"><Download size={20}/></button>
                                                </div>
                                            </>
                                        ) : job.status === 'error' ? (
                                            <span className="text-red-400 font-bold text-sm">Lỗi xử lý</span>
                                        ) : (
                                            <span className="text-white text-xs">Chờ xử lý</span>
                                        )}
                                    </div>

                                    {/* Corner Badges */}
                                    {index === 0 && <span className="absolute top-2 left-2 px-2 py-0.5 bg-yellow-500/80 text-black text-[10px] font-bold rounded">Style Master</span>}
                                    {job.status === 'success' && <span className="absolute bottom-2 right-2 p-1 bg-green-500 rounded-full"><CheckCircle2 size={12} className="text-white"/></span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modals */}
            {viewingImage && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage} className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                    <button className="absolute top-5 right-5 text-white/70 hover:text-white"><X size={32}/></button>
                </div>
            )}

            {editJob && editJob.generatedData && (
                <EditImageModal 
                    imageUrl={editJob.generatedData} 
                    onClose={() => setEditJob(null)} 
                    onConfirm={async (prompt, guideImg) => {
                        setIsEditing(true);
                        try {
                            const { editImage } = await import('../services/geminiService');
                            const res = await editImage(editJob.generatedData!, prompt, guideImg);
                            if (res.imageBase64) {
                                const newData = `data:image/png;base64,${res.imageBase64}`;
                                setJobs(curr => curr.map(j => j.id === editJob.id ? { ...j, generatedData: newData } : j));
                            }
                            setEditJob(null);
                        } catch(e) {
                            alert("Chỉnh sửa thất bại");
                        } finally {
                            setIsEditing(false);
                        }
                    }}
                    isProcessing={isEditing} 
                    allowGuideImage={true}
                />
            )}
        </div>
    );
};
