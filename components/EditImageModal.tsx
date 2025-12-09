
import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, X, Wand2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', isLoading, className = '', ...props }) => {
  const baseClass = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20",
    secondary: "bg-slate-700 hover:bg-slate-600 text-slate-200",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50"
  };

  return (
    <button className={`${baseClass} ${variants[variant]} ${className}`} {...props}>
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

interface EditImageModalProps {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (prompt: string, guideImage?: string) => Promise<void>;
  isProcessing: boolean;
  allowGuideImage?: boolean;
}

export const EditImageModal: React.FC<EditImageModalProps> = ({ imageUrl, onClose, onConfirm, isProcessing, allowGuideImage = false }) => {
  const [prompt, setPrompt] = useState('');
  const [guideImage, setGuideImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (prompt.trim()) {
      onConfirm(prompt, guideImage || undefined);
    }
  };

  const handleGuideUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = (ev) => setGuideImage(ev.target?.result as string);
          reader.readAsDataURL(e.target.files[0]);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Chỉnh sửa ảnh (Magic Edit)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" disabled={isProcessing}>
            <X size={24}/>
          </button>
        </div>
        
        <div className="relative aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
           <img src={imageUrl} alt="Editing Target" className="max-h-[35vh] object-contain" />
        </div>

        <div>
           <label className="block text-sm font-medium text-slate-300 mb-2">Yêu cầu chỉnh sửa</label>
           <textarea 
             className="w-full rounded-lg bg-slate-800 border-slate-700 text-white p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-500 resize-none"
             rows={2}
             placeholder="Ví dụ: Đổi màu chữ tiêu đề thành màu đỏ, xóa người ở góc trái..."
             value={prompt}
             onChange={e => setPrompt(e.target.value)}
             disabled={isProcessing}
           />
        </div>

        {allowGuideImage && (
            <div className="border-t border-slate-800 pt-3">
                 <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center justify-between">
                     <span>Ảnh hướng dẫn (Guide Image/Mask) <span className="text-slate-500 font-normal">- Optional</span></span>
                     {guideImage && <button onClick={() => setGuideImage(null)} className="text-xs text-red-400 hover:underline">Xóa ảnh</button>}
                 </label>
                 
                 {!guideImage ? (
                     <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-slate-700 rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                     >
                         <Upload size={16}/> <span className="text-sm">Upload ảnh tham khảo để AI sửa chuẩn hơn</span>
                         <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleGuideUpload}/>
                     </div>
                 ) : (
                     <div className="flex items-center gap-3 bg-slate-800 p-2 rounded-lg border border-slate-700">
                         <img src={guideImage} className="w-10 h-10 object-cover rounded"/>
                         <span className="text-sm text-slate-300">Đã chọn ảnh hướng dẫn</span>
                     </div>
                 )}
            </div>
        )}

        <div className="flex justify-end gap-3 mt-2">
           <Button variant="secondary" onClick={onClose} disabled={isProcessing}>Hủy</Button>
           <Button onClick={handleSubmit} isLoading={isProcessing} disabled={!prompt.trim()}>
             <Wand2 size={16} className="mr-2" />
             Tạo lại ảnh
           </Button>
        </div>
      </div>
    </div>
  );
};
