
import React, { useState, useRef, useCallback } from 'react';
import { ASOMode, ASOStyleSpecs, ASOJob } from '../types';
import { generateASOScreenshot, editImage } from '../services/geminiService';
import { Upload, Sparkles, Loader2, Download, ZoomIn, Info, Smartphone, FileImage, Copy, X, Edit3, Check, RotateCcw, Wand2, Trash2, Clock, AlertCircle } from 'lucide-react';
import { EditImageModal } from './EditImageModal';

const DEFAULT_SPECS: ASOStyleSpecs = {
    device: "iPhone 17 Pro Max (Titanium)",
    ratio: "9:16 (Portrait)",
    style: "Modern, Clean, 2.5D Pop-out",
    decor: "Minimalist (UI Focus, Glow, Zoom)"
};

export const ASOGenerator: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ASOMode>('NEW');
    const [prompt, setPrompt] = useState('');
    const [uiFile, setUiFile] = useState<File | null>(null);
    const [uiPreview, setUiPreview] = useState<string | null>(null);
    const [styleRefFile, setStyleRefFile] = useState<File | null>(null);
    const [styleRefPreview, setStyleRefPreview] = useState<string | null>(null);
    
    // Style Specs State
    const [specs, setSpecs] = useState<ASOStyleSpecs>(DEFAULT_SPECS);
    const [isEditingSpecs, setIsEditingSpecs] = useState(false);

    // Job Queue State (Replaces simple isProcessing)
    const [jobs, setJobs] = useState<ASOJob[]>([]);
    const [viewingImage, setViewingImage] = useState<string | null>(null);

    // Editing State
    const [editJob, setEditJob] = useState<ASOJob | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const uiInputRef = useRef<HTMLInputElement>(null);
    const styleRefInputRef = useRef<HTMLInputElement>(null);

    const processFile = (file: File, type: 'UI' | 'STYLE') => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (type === 'UI') {
                setUiFile(file);
                setUiPreview(ev.target?.result as string);
            } else {
                setStyleRefFile(file);
                setStyleRefPreview(ev.target?.result as string);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'UI' | 'STYLE') => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0], type);
        }
    };

    const handleDrop = (e: React.DragEvent, type: 'UI' | 'STYLE') => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0], type);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    // Smart routing based on active tab
                    if (activeTab === 'FROM_UI') {
                        processFile(file, 'UI');
                    } else if (activeTab === 'SYNC') {
                        // If no style ref yet, prioritize style ref, else UI
                        if (!styleRefFile) {
                             processFile(file, 'STYLE');
                        } else {
                             processFile(file, 'UI');
                        }
                    }
                }
                break;
            }
        }
    }, [activeTab, styleRefFile]);

    const clearFile = (e: React.MouseEvent, type: 'UI' | 'STYLE') => {
        e.stopPropagation();
        if (type === 'UI') {
            setUiFile(null);
            setUiPreview(null);
            if(uiInputRef.current) uiInputRef.current.value = '';
        } else {
            setStyleRefFile(null);
            setStyleRefPreview(null);
            if(styleRefInputRef.current) styleRefInputRef.current.value = '';
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim() && activeTab === 'NEW') {
             alert("Vui lòng nhập mô tả ý tưởng.");
             return;
        }
        if (!uiFile && activeTab === 'FROM_UI') {
            alert("Vui lòng upload ảnh UI.");
            return;
        }
        if (!styleRefFile && activeTab === 'SYNC') {
            alert("Vui lòng upload ảnh mẫu (Style Reference) để đồng bộ.");
            return;
        }

        // 1. Create Pending Job
        const newJob: ASOJob = {
            id: Math.random().toString(36).substring(7),
            status: 'pending',
            mode: activeTab,
            prompt: prompt || 'Auto Generated',
            timestamp: Date.now()
        };

        // Add to queue immediately
        setJobs(prev => [newJob, ...prev]);

        // 2. Start Async Process
        // Don't await here to avoid blocking UI
        const process = async () => {
            try {
                const uiB64 = uiFile ? await fileToBase64(uiFile) : undefined;
                const styleB64 = styleRefFile ? await fileToBase64(styleRefFile) : undefined;
                const currentSpecs = { ...specs }; // Capture specs at moment of generation

                const imageUrl = await generateASOScreenshot(activeTab, prompt, uiB64, styleB64, currentSpecs);
                
                setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'success', resultUrl: imageUrl } : j));
            } catch (error: any) {
                console.error(error);
                const errorMsg = error.message || "Lỗi xử lý";
                setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'error', error: errorMsg } : j));
            }
        };

        process();
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });
    };

    const handleDownload = (url: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = `aso-screenshot-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopyImage = async (url: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
            alert("Đã copy ảnh vào clipboard!");
        } catch (err) {
            console.error("Failed to copy", err);
            alert("Không thể copy ảnh.");
        }
    };

    const handleResetSpecs = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSpecs(DEFAULT_SPECS);
    };

    const handleEditConfirm = async (editPrompt: string, guideImage?: string) => {
        if (!editJob || !editJob.resultUrl) return;
        setIsEditing(true);
        try {
            const result = await editImage(editJob.resultUrl, editPrompt, guideImage);
            if (result.imageBase64) {
                const newUrl = `data:image/png;base64,${result.imageBase64}`;
                setJobs(prev => prev.map(item => 
                    item.id === editJob.id 
                    ? { ...item, resultUrl: newUrl } 
                    : item
                ));
            }
            setEditJob(null);
        } catch (error) {
            console.error(error);
            alert("Chỉnh sửa thất bại.");
        } finally {
            setIsEditing(false);
        }
    };

    const removeJob = (id: string) => {
        setJobs(prev => prev.filter(j => j.id !== id));
    };

    return (
        <div 
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 h-full overflow-y-auto"
            onPaste={handlePaste} // Global paste handler
            tabIndex={0} // Make focusable for paste
        >
            {/* Left Panel */}
            <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
                <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                    <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                        <Smartphone className="text-blue-500" /> ASO Architect
                    </h2>
                    <p className="text-xs text-slate-400 mb-6">Thiết kế Screenshot chuyên nghiệp (2K Res).</p>

                    {/* Mode Tabs */}
                    <div className="flex bg-slate-900 p-1 rounded-xl mb-6">
                        <button onClick={() => setActiveTab('NEW')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'NEW' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Tạo Mới</button>
                        <button onClick={() => setActiveTab('FROM_UI')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'FROM_UI' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Từ UI</button>
                        <button onClick={() => setActiveTab('SYNC')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'SYNC' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Đồng Bộ</button>
                    </div>

                    <div className="space-y-4">
                        {/* Prompt Input */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Mô tả tính năng / Ý tưởng</label>
                            <textarea 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none resize-none h-24"
                                placeholder={
                                    activeTab === 'NEW' ? "VD: App học tiếng Anh, giao diện hiện đại, tính năng dịch camera..." :
                                    activeTab === 'FROM_UI' ? "VD: Tính năng Dashboard thống kê, làm nổi bật biểu đồ..." :
                                    "VD: Đồng bộ style này cho tính năng Chat AI..."
                                }
                            />
                        </div>

                        {/* Upload Inputs based on Mode */}
                        {activeTab === 'FROM_UI' && (
                            <div 
                                className="border border-dashed border-slate-600 rounded-lg p-4 bg-slate-900/30 text-center hover:bg-slate-800 transition-colors cursor-pointer relative group" 
                                onClick={() => uiInputRef.current?.click()}
                                onDrop={(e) => handleDrop(e, 'UI')}
                                onDragOver={handleDragOver}
                            >
                                {uiPreview ? (
                                    <>
                                        <div className="relative h-32 flex items-center justify-center"><img src={uiPreview} className="h-full object-contain rounded"/></div>
                                        <button onClick={(e) => clearFile(e, 'UI')} className="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full p-1 border border-slate-500 hover:bg-red-500"><X size={12}/></button>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center py-2 text-slate-400"><Upload size={24} className="mb-2"/><span className="text-xs">Upload Ảnh UI (Drag/Paste)</span></div>
                                )}
                                <input ref={uiInputRef} type="file" className="hidden" onChange={(e) => handleFileChange(e, 'UI')} accept="image/*"/>
                            </div>
                        )}

                        {activeTab === 'SYNC' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div 
                                    className="border border-dashed border-yellow-600/50 rounded-lg p-4 bg-slate-900/30 text-center hover:bg-slate-800 transition-colors cursor-pointer relative"
                                    onClick={() => styleRefInputRef.current?.click()}
                                    onDrop={(e) => handleDrop(e, 'STYLE')}
                                    onDragOver={handleDragOver}
                                >
                                    {styleRefPreview ? (
                                        <>
                                            <div className="relative h-24 flex items-center justify-center"><img src={styleRefPreview} className="h-full object-contain rounded"/><span className="absolute bottom-0 bg-yellow-600 text-[8px] px-1 text-white">Style Master</span></div>
                                            <button onClick={(e) => clearFile(e, 'STYLE')} className="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full p-1 border border-slate-500 hover:bg-red-500"><X size={12}/></button>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center py-2 text-slate-400"><FileImage size={20} className="mb-2 text-yellow-500"/><span className="text-[10px]">Ảnh Gốc (Paste/Drag)</span></div>
                                    )}
                                    <input ref={styleRefInputRef} type="file" className="hidden" onChange={(e) => handleFileChange(e, 'STYLE')} accept="image/*"/>
                                </div>

                                <div 
                                    className="border border-dashed border-slate-600 rounded-lg p-4 bg-slate-900/30 text-center hover:bg-slate-800 transition-colors cursor-pointer relative"
                                    onClick={() => uiInputRef.current?.click()}
                                    onDrop={(e) => handleDrop(e, 'UI')}
                                    onDragOver={handleDragOver}
                                >
                                    {uiPreview ? (
                                        <>
                                            <div className="relative h-24 flex items-center justify-center"><img src={uiPreview} className="h-full object-contain rounded"/><span className="absolute bottom-0 bg-blue-600 text-[8px] px-1 text-white">New UI</span></div>
                                            <button onClick={(e) => clearFile(e, 'UI')} className="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full p-1 border border-slate-500 hover:bg-red-500"><X size={12}/></button>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center py-2 text-slate-400"><Upload size={20} className="mb-2"/><span className="text-[10px]">UI Mới (Optional)</span></div>
                                    )}
                                    <input ref={uiInputRef} type="file" className="hidden" onChange={(e) => handleFileChange(e, 'UI')} accept="image/*"/>
                                </div>
                            </div>
                        )}

                        {/* Generate Button */}
                        <button 
                            onClick={handleGenerate} 
                            // Only disable if we are spamming too hard, or maybe let them queue as much as they want? 
                            // Let's keep it enabled always unless there are no inputs
                            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:from-blue-500 mt-4 active:scale-95 transition-transform"
                        >
                            <Sparkles size={20}/> Tạo vào Hàng chờ
                        </button>
                    </div>
                </div>
                
                {/* Editable Style Specs */}
                <div 
                    className={`bg-slate-800/30 rounded-xl p-4 border transition-all cursor-pointer ${isEditingSpecs ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-slate-700/50 hover:bg-slate-800/50'}`}
                    onClick={() => !isEditingSpecs && setIsEditingSpecs(true)}
                    title="Click to edit style specifications"
                >
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Info size={12}/> Default Style Specs</h3>
                        <div className="flex items-center gap-2">
                             {isEditingSpecs && (
                                 <button onClick={handleResetSpecs} className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300 hover:bg-slate-600 flex items-center gap-1"><RotateCcw size={10}/> Reset</button>
                             )}
                             {isEditingSpecs ? (
                                <button onClick={(e) => { e.stopPropagation(); setIsEditingSpecs(false); }} className="text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white hover:bg-blue-500 flex items-center gap-1"><Check size={10}/> Done</button>
                            ) : (
                                <span className="text-[10px] text-slate-600 flex items-center gap-1 opacity-50"><Edit3 size={8}/> Click to edit</span>
                            )}
                        </div>
                    </div>
                    
                    {isEditingSpecs ? (
                        <div className="space-y-3 pt-1" onClick={e => e.stopPropagation()}>
                            <div>
                                <label className="block text-[10px] text-blue-300 mb-0.5 font-medium">Device</label>
                                <input value={specs.device} onChange={e => setSpecs({...specs, device: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-[10px] text-blue-300 mb-0.5 font-medium">Ratio</label>
                                <input value={specs.ratio} onChange={e => setSpecs({...specs, ratio: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-[10px] text-blue-300 mb-0.5 font-medium">Style</label>
                                <input value={specs.style} onChange={e => setSpecs({...specs, style: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-[10px] text-blue-300 mb-0.5 font-medium">Decor</label>
                                <input value={specs.decor} onChange={e => setSpecs({...specs, decor: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"/>
                            </div>
                        </div>
                    ) : (
                        <ul className="text-[10px] text-slate-500 space-y-1 list-disc list-inside">
                            <li>Device: <span className="text-slate-400">{specs.device}</span></li>
                            <li>Ratio: <span className="text-slate-400">{specs.ratio}</span></li>
                            <li>Style: <span className="text-slate-400">{specs.style}</span></li>
                            <li>Decor: <span className="text-slate-400">{specs.decor}</span></li>
                        </ul>
                    )}
                </div>
            </div>

            {/* Right Panel: Job Queue & Results */}
            <div className="lg:col-span-8 order-1 lg:order-2 flex flex-col h-full min-h-[500px]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Kết quả thiết kế
                        <span className="bg-slate-800 text-xs px-2 py-1 rounded text-slate-400">{jobs.length} items</span>
                    </h3>
                    {jobs.length > 0 && (
                         <button onClick={() => setJobs([])} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={12}/> Clear All</button>
                    )}
                </div>

                {jobs.length === 0 ? (
                    <div className="flex-1 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-600">
                        <Smartphone size={48} className="mb-4 opacity-20"/>
                        <p>Chưa có ảnh nào. Nhấn "Tạo" để thêm vào hàng chờ.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-20">
                        {jobs.map((job) => (
                            <div key={job.id} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 group relative">
                                <div className="aspect-[9/16] relative bg-black flex items-center justify-center">
                                    {job.status === 'success' && job.resultUrl ? (
                                        <>
                                            <img src={job.resultUrl} className="w-full h-full object-cover"/>
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                                                <div className="flex gap-2">
                                                    <button onClick={() => setViewingImage(job.resultUrl!)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white backdrop-blur" title="Zoom"><ZoomIn size={18}/></button>
                                                    <button onClick={() => setEditJob(job)} className="p-2 bg-purple-600 rounded-full hover:bg-purple-500 text-white shadow-lg" title="Edit"><Wand2 size={18}/></button>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleCopyImage(job.resultUrl!)} className="p-2 bg-slate-600 rounded-full hover:bg-slate-500 text-white shadow-lg" title="Copy"><Copy size={18}/></button>
                                                    <button onClick={() => handleDownload(job.resultUrl!)} className="p-2 bg-blue-600 rounded-full hover:bg-blue-500 text-white shadow-lg" title="Download"><Download size={18}/></button>
                                                </div>
                                            </div>
                                        </>
                                    ) : job.status === 'pending' ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="animate-spin text-blue-500" size={32}/>
                                            <span className="text-xs text-blue-400 font-medium animate-pulse">Đang tạo (2K)...</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-red-400 p-4 text-center">
                                            <AlertCircle size={24}/>
                                            <span className="text-xs font-bold line-clamp-3">{job.error || "Lỗi xử lý"}</span>
                                        </div>
                                    )}

                                    {/* Badges */}
                                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                                        <span className="bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur border border-white/10">
                                            {job.mode === 'NEW' ? 'New' : job.mode === 'FROM_UI' ? 'UI' : 'Sync'}
                                        </span>
                                    </div>
                                    <button onClick={() => removeJob(job.id)} className="absolute top-2 right-2 p-1 bg-black/50 text-white/50 hover:text-red-400 rounded hover:bg-black/80 transition-colors"><X size={12}/></button>
                                </div>
                                <div className="p-3 border-t border-slate-800">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] text-slate-500 flex items-center gap-1"><Clock size={9}/> {new Date(job.timestamp).toLocaleTimeString()}</span>
                                        <span className={`text-[9px] px-1.5 rounded ${job.status === 'success' ? 'bg-green-500/10 text-green-400' : job.status === 'pending' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>{job.status}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 line-clamp-2" title={job.prompt}>{job.prompt}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

             {viewingImage && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage} className="max-h-[90vh] rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                    <button className="absolute top-5 right-5 text-white/70 hover:text-white"><div className="bg-white/10 p-2 rounded-full">Close</div></button>
                </div>
            )}
            
            {editJob && editJob.resultUrl && (
                <EditImageModal 
                    imageUrl={editJob.resultUrl}
                    onClose={() => setEditJob(null)}
                    onConfirm={handleEditConfirm}
                    isProcessing={isEditing}
                    allowGuideImage={true}
                />
            )}
        </div>
    );
};
