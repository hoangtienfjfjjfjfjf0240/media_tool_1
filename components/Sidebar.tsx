

import React from 'react';
import { Layers, Wand2, Search, BrainCircuit, Bot, Globe2, Palette, Layout, GitMerge } from 'lucide-react';
import { AppMode } from '../types';

interface SidebarProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentMode, setMode }) => {
  const menuItems = [
    {
      id: AppMode.BATCH_STUDIO,
      icon: Layers,
      label: 'Xưởng Tạo Ảnh',
      desc: 'Tạo & Sửa ảnh hàng loạt'
    },
    {
      id: AppMode.AI_FUSION,
      icon: GitMerge,
      label: 'AI Fusion',
      desc: 'Hợp nhất Phong cách & Nội dung'
    },
    {
      id: AppMode.ASO_STUDIO,
      icon: Layout,
      label: 'ASO Architect',
      desc: 'Thiết kế Screenshot App Store'
    },
    {
      id: AppMode.AI_THEME_CHANGER,
      icon: Palette,
      label: 'AI Theme Changer',
      desc: 'Biến hình lễ hội/sự kiện'
    },
    {
      id: AppMode.LOCALIZE_STUDIO,
      icon: Globe2,
      label: 'LocalizeAI Pro',
      desc: 'Dịch thuật & Hóa giải hình ảnh'
    },
    {
      id: AppMode.IMAGE_EDIT,
      icon: Wand2,
      label: 'Chỉnh Sửa Magic',
      desc: 'Sửa ảnh bằng Chat'
    },
    {
      id: AppMode.SEARCH_GROUNDING,
      icon: Search,
      label: 'Tìm kiếm & Chat',
      desc: 'Thông tin thực tế'
    },
    {
      id: AppMode.THINKING,
      icon: BrainCircuit,
      label: 'Suy Luận Sâu',
      desc: 'Gemini 3.0 Tư duy'
    },
    {
      id: AppMode.CHAT_BOT,
      icon: Bot,
      label: 'AI Chat Bot',
      desc: 'Trò chuyện thông minh'
    }
  ];

  return (
    <div className="w-64 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-purple-500/20">M</div>
        <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Media Studio</span>
      </div>

      <nav className="flex-1 px-3 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all group border ${
              currentMode === item.id 
                ? 'bg-white/5 border-purple-500/30 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 hover:border-white/10 border-transparent'
            }`}
          >
            <item.icon size={20} className={`transition-colors ${currentMode === item.id ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <div>
              <div className={`font-medium text-sm ${currentMode === item.id ? 'text-white' : 'text-slate-300'}`}>
                {item.label}
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5 group-hover:text-slate-400">
                {item.desc}
              </div>
            </div>
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-white/5 text-center">
        <span className="text-[10px] text-slate-600">Powered by Gemini API</span>
      </div>
    </div>
  );
};