'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: ToastType) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove after 5s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider
      value={{
        toast: {
          success: (msg) => addToast(msg, 'success'),
          error: (msg) => addToast(msg, 'error'),
          info: (msg) => addToast(msg, 'info'),
        },
      }}
    >
      {children}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between min-w-[300px] p-4 rounded-lg shadow-2xl border text-sm font-mono animate-in slide-in-from-right-8 fade-in duration-300 ${
              t.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
                : t.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : 'bg-indigo-950/90 border-indigo-500/50 text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">
                {t.type === 'error' ? '⚠️' : t.type === 'success' ? '✅' : 'ℹ️'}
              </span>
              <span>{t.message}</span>
            </div>
            {t.type === 'error' && (
              <button
                onClick={() => removeToast(t.id)}
                className="ml-4 px-2 py-1 bg-rose-500/20 hover:bg-rose-500/40 rounded text-xs transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context.toast;
}
