import React, { useEffect, useState } from 'react';

interface ReplayLog {
    id: string;
    participants: string[];
    timestamp: string;
    transcript: string;
    lat?: number;
    lng?: number;
    sentimentScore?: number;
}

export default function EncounterReplay({ onClose }: { onClose: () => void }) {
    const [history, setHistory] = useState<ReplayLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/encounters/history')
            .then(res => res.json())
            .then(data => {
                setHistory(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch encounter history", err);
                setLoading(false);
            });
    }, []);

    const jumpTo = (lat?: number, lng?: number) => {
        if (!lat || !lng) return;
        window.dispatchEvent(new CustomEvent('map-jump', { detail: { lat, lng } }));
    };

    return (
        <div className="absolute inset-0 z-50 bg-[#030406] flex flex-col pointer-events-auto shadow-2xl animate-in slide-in-from-right duration-300">
             {/* Header */}
             <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-black/80 backdrop-blur-md">
                <h2 className="text-emerald-500 font-bold font-mono tracking-widest text-[11px] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    ARCHIVED REPLAYS
                </h2>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors bg-gray-900 border border-gray-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
             </div>

             {/* Content */}
             <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono scrollbar-thin scrollbar-thumb-gray-800">
                {loading ? (
                    <div className="text-gray-500 text-xs text-center mt-10">Fetching temporal logs...</div>
                ) : history.length === 0 ? (
                    <div className="text-gray-500 text-xs text-center mt-10">No encounters recorded yet.</div>
                ) : (
                    history.map(enc => (
                        <div key={enc.id} className="border border-gray-800 bg-gray-900/40 rounded flex flex-col overflow-hidden transition-colors hover:border-gray-700">
                            <div 
                                className="p-3 cursor-pointer hover:bg-gray-800/50 flex justify-between items-center"
                                onClick={() => setSelectedId(selectedId === enc.id ? null : enc.id)}
                            >
                                <div className="text-[10px] text-sky-400 font-bold bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded truncate max-w-[150px]">
                                    {enc.participants.join(' ↔ ')}
                                </div>
                                <div className="text-[9px] text-gray-500">
                                    {new Date(enc.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                            
                            {selectedId === enc.id && (
                                <div className="p-4 border-t border-gray-800 bg-black/40 animate-in fade-in duration-200">
                                    <p className="text-[11px] text-gray-300 italic whitespace-pre-wrap border-l-2 border-emerald-500/50 pl-3 leading-relaxed mb-4">
                                        "{enc.transcript}"
                                    </p>
                                    
                                    <div className="flex justify-between items-end">
                                        <div className="text-[9px] text-gray-500">
                                            Sentiment: <span className={(enc.sentimentScore || 0) > 0 ? "text-emerald-400" : "text-rose-400"}>{(enc.sentimentScore || 0).toFixed(2)}v</span>
                                        </div>
                                        {enc.lat && enc.lng && (
                                            <button 
                                                onClick={() => jumpTo(enc.lat, enc.lng)}
                                                className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-[9px] font-bold tracking-widest uppercase transition-colors"
                                            >
                                                Jump To Location
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
             </div>
        </div>
    );
}
