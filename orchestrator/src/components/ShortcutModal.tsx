import React from 'react';

interface ShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutModal({ isOpen, onClose }: ShortcutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0f] border border-gray-700 rounded-lg p-6 shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
          <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest flex items-center gap-2">
            <span className="text-indigo-500">⚡</span> Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="space-y-4 font-mono text-xs text-gray-400">
          <div className="flex justify-between items-center">
            <span>Pan Map / Explore</span>
            <div className="flex gap-1">
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">↑</kbd>
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">↓</kbd>
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">←</kbd>
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">→</kbd>
              <span className="mx-1">or WASD</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span>Zoom In / Out</span>
            <div className="flex gap-1">
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">+</kbd>
              <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">-</kbd>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span>Deselect Agent</span>
            <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">Esc</kbd>
          </div>

          <div className="flex justify-between items-center">
            <span>Pause / Resume Sim</span>
            <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">Space</kbd>
          </div>

          <div className="flex justify-between items-center text-sky-400 font-bold">
            <span>Toggle Explore Mode</span>
            <kbd className="px-2 py-1 bg-sky-900/50 border border-sky-700 rounded text-sky-300 shadow">E</kbd>
          </div>

          <div className="flex justify-between items-center text-indigo-400 font-bold">
            <span>Toggle Social Graph</span>
            <kbd className="px-2 py-1 bg-indigo-900/50 border border-indigo-700 rounded text-indigo-300 shadow">G</kbd>
          </div>

          <div className="flex justify-between items-center">
            <span>Toggle Fullscreen</span>
            <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 shadow">F</kbd>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-gray-800 text-center">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest">Project Metropolis • Sprint 6.4</p>
        </div>
      </div>
    </div>
  );
}
