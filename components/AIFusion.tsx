import React, { useState, useRef } from 'react';
import { FusionJob, AspectRatio } from '../types';
import { generateFusionImage, editImage } from '../services/geminiService';
import { Upload, X, Loader2, Download, Wand2, GitMerge, Plus, Trash2, ZoomIn, AlertCircle, Copy, Check } from 'lucide-react';
import { EditImageModal } from './EditImageModal';

const RATIOS: AspectRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16', '4:5'];

export const AIFusion: React.FC = () => {
    // Inputs
    const [styleFile, setStyleFile] = useState<File | null>(null);
    const [stylePreview, setStylePreview] = useState<string | null>(null);
    const [contentFile, setContentFile] = useState<File | null>(null);
    const [contentPreview, setContentPreview] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [ratio, setRatio] = useState<AspectRatio>('1:1');
    const [count, setCount] = useState(1);

    // Jobs
    const [jobs, setJobs] = useState<FusionJob[]>([]);
    const [viewingImage, setViewingImage] = useState<string | null>(null);

    // Edit
    const [editJob, setEditJob] = useState<FusionJob | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const styleInputRef = useRef<HTMLInputElement>(null);
    const contentInputRef = useRef<HTMLInputElement>(null);

    // Helpers
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
        });
    };

    const handleFile = (file: File, type: 'STYLE' | 'CONTENT') => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (type === 'STYLE') {
                setStyleFile(file);
                setStylePreview(e.target?.result as string);
            } else {
                setContentFile(file);
                setContentPreview(e.target?.result as string);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent, type: 'STYLE' | 'CONTENT') => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0], type);
    };

    const clearFile = (e: React.MouseEvent, type: 'STYLE' | 'CONTENT') => {
        e.stopPropagation();
        if (type === 'STYLE') {
            setStyleFile(null);
            setStylePreview(null);
            if (styleInputRef.current) styleInputRef.current.value = '';
        } else {
            setContentFile(null);
            setContentPreview(null);
            if (contentInputRef.current) contentInputRef.current.value = '';
        }
    };

    const handleGenerate = async () => {
        if (!styleFile || !contentFile) {
            alert("Vui lòng chọn cả Ảnh Phong cách (Style) và Ảnh Nội dung (Content).");
            return;
        }

        const newJobs: FusionJob[] = Array(count).fill(null).map(() => ({
            id: Math.random().toString(36).substring(7),
            status: 'pending',
            prompt: prompt || 'Fusion Auto',
            timestamp: Date.now()
        }));

        setJobs(prev => [...newJobs, ...prev]);

        // Process Parallel Requests
        // Note: We create base64 strings once to reuse
        const styleB64Raw = await fileToBase64(styleFile);
        const contentB64Raw = await fileToBase64(contentFile);

        // Map jobs to promises
        newJobs.forEach(job => {
            generateFusionImage(styleB64Raw, contentB64Raw, prompt, ratio)
                .then(url => {
                    setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: 'success', resultUrl: url } : j));
                })
                .catch(err => {
                    console.error("Fusion Error", err);
                    setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: 'error', error: err.message || "Failed" } : j));
                });
        });
    };

    const handleEditConfirm = async (editPrompt: string, guideImage?: string) => {
        if (!editJob || !editJob.resultUrl) return;
        setIsEditing(true);
        try {
            const result = await editImage(editJob.resultUrl, editPrompt, guideImage);
            if (result.imageBase64) {
                const newUrl = `data:image/png;base64,${result.imageBase64}`;
                setJobs(prev => prev.map(item => item.id === editJob.id ? { ...item, resultUrl: newUrl } : item));
            }
            setEditJob(null);
        } catch (err) {
            alert("Edit failed");
        } finally {
            setIsEditing(false);
        }
    };

    const handleDownload = (url: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `fusion-art-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="flex flex-col h-full lg:flex-row overflow-hidden bg-slate-950">
            {/* LEFT: Controls */}
            <div className="w-full lg:w-96 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 p-6 overflow-y-auto space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                        <GitMerge className="text-purple-500" /> AI Fusion
                    </h2>
                    <p className="text-xs text-slate-400">Kết hợp nghệ thuật từ ảnh A và nội dung từ ảnh B.</p>
                </div>

                {/* Upload Zone A: Style */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Ảnh Phong cách (Style)</label>
                    <div 
                        className={`relative aspect-video border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all overflow-hidden group ${stylePreview ? 'border-purple-500/50 bg-slate-900' : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800 hover:border-slate-500'}`}
                        onClick={() => styleInputRef.current?.click()}
                        onDrop={(e) => handleDrop(e, 'STYLE')}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {stylePreview ? (
                            <>
                                <img src={stylePreview} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-xs text-white font-medium">Thay đổi ảnh</span>
                                </div>
                                <button onClick={(e) => clearFile(e, 'STYLE')} className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full hover:bg-red-500 z-10"><X size={12}/></button>
                                <div className="absolute bottom-2 left-2 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">STYLE SOURCE</div>
                            </>
                        ) : (
                            <div className="text-center text-slate-500">
                                <Upload size={24} className="mx-auto mb-2 opacity-50"/>
                                <span className="text-xs">Upload Style Image</span>
                            </div>
                        )}
                        <input ref={styleInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], 'STYLE')} />
                    </div>
                </div>

                {/* Separator */}
                <div className="flex justify-center relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700/50"></div></div>
                    <div className="relative bg-slate-900 px-2 text-slate-500"><Plus size={16}/></div>
                </div>

                {/* Upload Zone B: Content */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. Ảnh Nội dung (Content)</label>
                    <div 
                        className={`relative aspect-video border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all overflow-hidden group ${contentPreview ? 'border-blue-500/50 bg-slate-900' : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800 hover:border-slate-500'}`}
                        onClick={() => contentInputRef.current?.click()}
                        onDrop={(e) => handleDrop(e, 'CONTENT')}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {contentPreview ? (
                            <>
                                <img src={contentPreview} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-xs text-white font-medium">Thay đổi ảnh</span>
                                </div>
                                <button onClick={(e) => clearFile(e, 'CONTENT')} className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full hover:bg-red-500 z-10"><X size={12}/></button>
                                <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">CONTENT SOURCE</div>
                            </>
                        ) : (
                            <div className="text-center text-slate-500">
                                <Upload size={24} className="mx-auto mb-2 opacity-50"/>
                                <span className="text-xs">Upload Content Image</span>
                            </div>
                        )}
                        <input ref={contentInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], 'CONTENT')} />
                    </div>
                </div>

                {/* Settings */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Text Override (Optional)</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Thêm chi tiết sáng tạo (VD: make it cyberpunk, add rain)..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white resize-none h-20 focus:border-purple-500 outline-none"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tỉ lệ</label>
                            <select value={ratio} onChange={(e) => setRatio(e.target.value as AspectRatio)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white">
                                {RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Số lượng</label>
                            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white">
                                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Ảnh</option>)}
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerate}
                        disabled={!styleFile || !contentFile || jobs.some(j => j.status === 'pending')}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {jobs.some(j => j.status === 'pending') ? <Loader2 className="animate-spin" size={20}/> : <GitMerge size={20} />}
                        Fusion Magic
                    </button>
                </div>
            </div>

            {/* RIGHT: Results Grid */}
            <div className="flex-1 bg-slate-950 p-6 overflow-y-auto relative">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-bold text-white">Kết quả</h3>
                     {jobs.length > 0 && <button onClick={() => setJobs([])} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1"><Trash2 size={12}/> Clear All</button>}
                 </div>

                 {jobs.length === 0 ? (
                     <div className="h-64 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-600">
                         <GitMerge size={48} className="mb-4 opacity-20"/>
                         <p>Kết quả Fusion sẽ hiện ở đây.</p>
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
                         {jobs.map(job => (
                             <div key={job.id} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 group relative">
                                 <div className="aspect-square relative flex items-center justify-center bg-black">
                                     {job.status === 'success' && job.resultUrl ? (
                                         <>
                                            <img src={job.resultUrl} className="w-full h-full object-contain" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                                <div className="flex gap-2">
                                                    <button onClick={() => setViewingImage(job.resultUrl!)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white backdrop-blur"><ZoomIn size={18}/></button>
                                                    <button onClick={() => setEditJob(job)} className="p-2 bg-purple-600 rounded-full hover:bg-purple-500 text-white shadow-lg"><Wand2 size={18}/></button>
                                                    <button onClick={() => handleDownload(job.resultUrl!)} className="p-2 bg-green-600 rounded-full hover:bg-green-500 text-white shadow-lg"><Download size={18}/></button>
                                                </div>
                                            </div>
                                         </>
                                     ) : job.status === 'error' ? (
                                         <div className="text-center p-4 text-red-400">
                                             <AlertCircle size={24} className="mx-auto mb-2"/>
                                             <span className="text-xs">{job.error || 'Failed'}</span>
                                         </div>
                                     ) : (
                                         <div className="flex flex-col items-center gap-3">
                                             <Loader2 className="animate-spin text-purple-500" size={32}/>
                                             <span className="text-xs text-purple-400 animate-pulse">Fusing...</span>
                                         </div>
                                     )}
                                     <button onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))} className="absolute top-2 right-2 p-1 bg-black/50 text-white/50 hover:text-red-400 rounded hover:bg-black/80"><X size={12}/></button>
                                 </div>
                                 <div className="p-2 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-500">
                                     <span>{new Date(job.timestamp).toLocaleTimeString()}</span>
                                     <span className={job.status === 'success' ? 'text-green-400' : 'text-slate-500'}>{job.status}</span>
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
            </div>

            {/* Lightbox */}
            {viewingImage && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage} className="max-h-[90vh] rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                    <button className="absolute top-5 right-5 text-white/70 hover:text-white"><div className="bg-white/10 p-2 rounded-full">Close</div></button>
                </div>
            )}

            {/* Edit Modal */}
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