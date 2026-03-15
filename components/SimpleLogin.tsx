import React, { useState } from 'react';
import { Layers, Key, User, ArrowRight, Shield, Zap, Sparkles } from 'lucide-react';

interface SimpleLoginProps {
  onLogin: (name: string, apiKey: string) => void;
}

export const SimpleLogin: React.FC<SimpleLoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && key.trim()) {
      onLogin(name, key);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center overflow-hidden relative" style={{ background: '#07070f' }}>
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      <div className="relative z-10 w-full max-w-[420px] mx-4">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="iKame" className="w-20 h-20 rounded-3xl shadow-2xl shadow-orange-500/25 object-cover" />
          <h1 className="text-4xl font-bold mb-2 tracking-tight" style={{ background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Media Studio
          </h1>
          <p className="text-slate-500 text-sm">AI-powered creative tools for professionals</p>
        </div>

        {/* Login Card */}
        <div className="p-8 rounded-3xl border border-white/[0.06] backdrop-blur-xl relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(15,15,30,0.9) 0%, rgba(10,10,25,0.95) 100%)' }}>
          {/* Card inner glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 ml-1 uppercase tracking-wider">Display Name</label>
              <div className={`relative rounded-2xl transition-all duration-300 ${focused === 'name' ? 'ring-2 ring-purple-500/50 shadow-lg shadow-purple-500/10' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={16} className={`transition-colors ${focused === 'name' ? 'text-purple-400' : 'text-slate-600'}`} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  placeholder="Enter your name"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl py-3.5 pl-11 pr-4 focus:border-purple-500/50 outline-none transition-all text-white placeholder-slate-600 text-sm"
                  required
                />
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 ml-1 uppercase tracking-wider">Gemini API Key</label>
              <div className={`relative rounded-2xl transition-all duration-300 ${focused === 'key' ? 'ring-2 ring-purple-500/50 shadow-lg shadow-purple-500/10' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key size={16} className={`transition-colors ${focused === 'key' ? 'text-purple-400' : 'text-slate-600'}`} />
                </div>
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onFocus={() => setFocused('key')}
                  onBlur={() => setFocused(null)}
                  placeholder="Paste your API key"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl py-3.5 pl-11 pr-4 focus:border-purple-500/50 outline-none transition-all text-white placeholder-slate-600 text-sm"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-600 mt-2 ml-1 flex items-center gap-1">
                <Shield size={10} /> Stored locally in your browser — never sent to any server.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!name.trim() || !key.trim()}
              className="w-full flex items-center justify-center gap-2.5 text-white font-semibold py-4 px-4 rounded-2xl transition-all shadow-xl group mt-2 disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)' }}
            >
              <span className="relative z-10 flex items-center gap-2">
                Get Started <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </form>
        </div>

        {/* Footer features */}
        <div className="mt-6 flex items-center justify-center gap-6 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5"><Zap size={12} className="text-amber-500/60" /> AI Image Gen</span>
          <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-purple-500/60" /> Batch Processing</span>
          <span className="flex items-center gap-1.5"><Shield size={12} className="text-emerald-500/60" /> Secure</span>
        </div>
      </div>
    </div>
  );
};