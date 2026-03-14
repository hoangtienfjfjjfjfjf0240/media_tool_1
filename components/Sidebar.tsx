
import React from 'react';
import { Layers, Wand2, Globe2, Palette, Layout, GitMerge } from 'lucide-react';
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
      label: 'Batch Studio',
      desc: 'Tạo & Sửa ảnh hàng loạt',
      color: 'from-indigo-500 to-blue-500',
    },
    {
      id: AppMode.AI_FUSION,
      icon: GitMerge,
      label: 'AI Fusion',
      desc: 'Hợp nhất Phong cách',
      color: 'from-violet-500 to-purple-500',
    },
    {
      id: AppMode.ASO_STUDIO,
      icon: Layout,
      label: 'ASO Architect',
      desc: 'Screenshot App Store',
      color: 'from-cyan-500 to-teal-500',
    },
    {
      id: AppMode.AI_THEME_CHANGER,
      icon: Palette,
      label: 'Theme Changer',
      desc: 'Biến hình Lễ hội',
      color: 'from-orange-500 to-amber-500',
    },
    {
      id: AppMode.LOCALIZE_STUDIO,
      icon: Globe2,
      label: 'Localize Pro',
      desc: 'Dịch thuật Hình ảnh',
      color: 'from-emerald-500 to-green-500',
    },
    {
      id: AppMode.IMAGE_EDIT,
      icon: Wand2,
      label: 'Magic Edit',
      desc: 'Sửa ảnh bằng Chat',
      color: 'from-rose-500 to-pink-500',
    }
  ];

  return (
    <div className="w-[220px] flex flex-col h-full shrink-0" style={{ background: '#0d0d14' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #f97316 100%)' }}>
          M
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black text-white tracking-tight">Media Studio</div>
          <div className="text-[9px] text-slate-500 font-medium">AI Creative Tools</div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)' }}></div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3">
        {menuItems.map((item) => {
          const isActive = currentMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setMode(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group relative ${isActive
                ? 'text-white'
                : 'text-slate-500 hover:text-slate-200'
                }`}
              style={isActive ? { background: 'rgba(99,102,241,0.12)' } : undefined}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-indigo-400 to-indigo-600"></div>
              )}

              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${isActive
                ? `bg-gradient-to-br ${item.color} shadow-lg`
                : 'bg-white/5 group-hover:bg-white/8'
                }`}>
                <item.icon size={16} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'} />
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-semibold truncate ${isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{item.label}</div>
                <div className={`text-[9px] truncate ${isActive ? 'text-indigo-300/70' : 'text-slate-600'}`}>{item.desc}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-5 py-4">
        <div className="h-px mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}></div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"></div>
          <span className="text-[10px] text-slate-500 font-medium">API Connected</span>
        </div>
      </div>
    </div>
  );
};