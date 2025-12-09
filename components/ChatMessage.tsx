import React from 'react';
import { Message, Sender } from '../types';
import { User, Bot, AlertCircle, Link2 } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === Sender.USER;
  const isError = message.isError;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser 
            ? 'bg-slate-800 text-slate-400' 
            : isError 
                ? 'bg-red-500/10 text-red-500' 
                : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
        }`}>
          {isUser ? <User size={16} /> : isError ? <AlertCircle size={16} /> : <Bot size={16} />}
        </div>

        <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
            <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-md ${
              isUser 
                ? 'bg-slate-800 text-slate-100 rounded-tr-none border border-slate-700' 
                : isError 
                  ? 'bg-red-500/10 border border-red-500/20 text-red-200 rounded-tl-none' 
                  : 'bg-slate-900/80 border border-white/10 text-slate-300 rounded-tl-none backdrop-blur-sm'
            }`}>
              {message.imageUrl && (
                <div className="mb-3 rounded-lg overflow-hidden border border-white/10">
                   <img src={message.imageUrl} alt="Uploaded" className="max-w-full max-h-[300px] object-contain" />
                </div>
              )}
              {message.text}
            </div>

            {/* Google Search Grounding Chips */}
            {message.groundingChunks && message.groundingChunks.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1 max-w-full">
                    {message.groundingChunks.map((chunk, idx) => {
                         if (chunk.web?.uri) {
                             return (
                                 <a 
                                     key={idx} 
                                     href={chunk.web.uri} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-purple-500/50 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-purple-400 transition-all truncate max-w-[200px]"
                                 >
                                     <Link2 size={12} />
                                     <span className="truncate">{chunk.web.title || chunk.web.uri}</span>
                                 </a>
                             );
                         }
                         return null;
                    })}
                </div>
            )}
            
            <span className="text-[10px] text-slate-600 px-1">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
      </div>
    </div>
  );
};