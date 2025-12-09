import React, { useState } from 'react';
import { Layers, Key, User, ArrowRight } from 'lucide-react';

interface SimpleLoginProps {
  onLogin: (name: string, apiKey: string) => void;
}

export const SimpleLogin: React.FC<SimpleLoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && key.trim()) {
      onLogin(name, key);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white">
      <div className="max-w-md w-full p-8 bg-slate-900/50 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl">
        <div className="mb-6 flex justify-center">
             <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                 <Layers size={32} className="text-white" />
             </div>
        </div>
        <h1 className="text-3xl font-bold mb-2 text-center bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Media Studio</h1>
        <p className="text-slate-400 mb-8 text-center">Nhập thông tin để bắt đầu sáng tạo.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Tên hiển thị</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={18} className="text-slate-500"/>
                    </div>
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nhập tên của bạn"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-white"
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Gemini API Key</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Key size={18} className="text-slate-500"/>
                    </div>
                    <input 
                        type="password" 
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="AI Studio API Key"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-white"
                        required
                    />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 ml-1">Key được lưu cục bộ trên trình duyệt của bạn.</p>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3.5 px-4 rounded-xl hover:opacity-90 transition-all shadow-lg group mt-6"
            >
              Bắt đầu ngay <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>
            </button>
        </form>
      </div>
    </div>
  );
};