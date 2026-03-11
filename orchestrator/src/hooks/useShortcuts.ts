import { useEffect } from 'react';

type ShortcutMap = {
  [key: string]: () => void;
};

export function useShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const key = e.key;
      
      // Match exact key or lowercase key for letters
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      } else if (key.length === 1 && shortcuts[key.toLowerCase()]) {
        e.preventDefault();
        shortcuts[key.toLowerCase()]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
