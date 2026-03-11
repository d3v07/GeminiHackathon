import { useState, useRef, useEffect } from 'react';

interface TTSOptions {
  volume?: number;
}

export function useAudioTTS(options?: TTSOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);
  const audioQueue = useRef<{ text: string; agentId: string; voiceId: string }[]>([]);
  const audioInstance = useRef<HTMLAudioElement | null>(null);
  
  // Create a ref to hold latest volume so we don't trigger re-renders inside playNext closure
  const volumeRef = useRef(options?.volume ?? 1.0);

  useEffect(() => {
    volumeRef.current = options?.volume ?? 1.0;
    if (audioInstance.current) {
        audioInstance.current.volume = volumeRef.current;
    }
  }, [options?.volume]);

  // Use a ref for isPlaying to avoid dependency cycle in playNext
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
      isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const playNext = async () => {
    if (isPlayingRef.current || audioQueue.current.length === 0) return;

    setIsPlaying(true);
    isPlayingRef.current = true;
    
    const { text, agentId, voiceId } = audioQueue.current.shift()!;
    setCurrentSpeakerId(agentId);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId })
      });

      if (!res.ok) {
        console.warn(`TTS fetch failed for voice ${voiceId}`);
        throw new Error('TTS fetch failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      audio.volume = volumeRef.current;
      audioInstance.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentSpeakerId(null);
        playNext();
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentSpeakerId(null);
        playNext();
      };

      await audio.play();
    } catch (e) {
      console.error("TTS Audio engine error", e);
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentSpeakerId(null);
      playNext();
    }
  };

  const speak = (text: string, agentId: string, voiceId = "alloy") => {
    // Prevent duplicate spamming in queue
    if (audioQueue.current.some(q => q.text === text && q.agentId === agentId)) return;
    
    audioQueue.current.push({ text, agentId, voiceId });
    if (!isPlayingRef.current) {
      playNext();
    }
  };

  const stopAll = () => {
    if (audioInstance.current) {
        audioInstance.current.pause();
        audioInstance.current.currentTime = 0;
    }
    audioQueue.current = [];
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentSpeakerId(null);
  };

  return { speak, stopAll, isPlaying, currentSpeakerId };
}
