import React from 'react';
import { signInWithGoogle } from '../services/authService';
import { Layers, Code2 } from 'lucide-react';

interface LoginScreenProps {
  onGuestLogin?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onGuestLogin }) => {
  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Please try again.");
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white">
      <div className="max-w-md w-full p-8 bg-slate-900/50 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Layers size={32} className="text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Media Studio</h1>
        <p className="text-slate-400 mb-8">Sign in to save history and access AI tools.</p>

        <div className="space-y-3">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {onGuestLogin && (
            <button
              onClick={onGuestLogin}
              className="w-full flex items-center justify-center gap-3 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white font-medium py-3 px-4 rounded-xl transition-all border border-white/5"
            >
              <Code2 size={18} />
              Continue as Guest (Dev Mode)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};