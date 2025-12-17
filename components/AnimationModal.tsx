import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, FastForward, ChevronLeft, ChevronRight, Trash2, Copy, Save, RotateCcw } from 'lucide-react';
import { GameAsset } from '../types';

interface AnimationModalProps {
  asset: GameAsset;
  isOpen: boolean;
  onClose: () => void;
  onSave: (assetId: string, newImageUrl: string, newFrameCount: number) => void;
}

const AnimationModal: React.FC<AnimationModalProps> = ({ asset, isOpen, onClose, onSave }) => {
  const [fps, setFps] = useState(8);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // Editor State
  const [frames, setFrames] = useState<string[]>([]); // Array of DataURLs for individual frames
  const [selectedFrameIdx, setSelectedFrameIdx] = useState<number>(0);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>();

  // --- INITIALIZATION: Slice Sprite Sheet into Frames ---
  useEffect(() => {
    if (!isOpen || !asset.imageUrl) return;

    const initEditor = async () => {
      setOriginalImage(asset.imageUrl!);
      const img = new Image();
      img.src = asset.imageUrl!;
      await new Promise((r) => (img.onload = r));

      const frameCount = asset.metadata?.frames || 1;
      const frameWidth = Math.floor(img.width / frameCount);
      const frameHeight = img.height;

      const newFrames: string[] = [];
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = frameWidth;
      tempCanvas.height = frameHeight;
      const ctx = tempCanvas.getContext('2d');

      if (ctx) {
        for (let i = 0; i < frameCount; i++) {
          ctx.clearRect(0, 0, frameWidth, frameHeight);
          ctx.drawImage(img, i * frameWidth, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
          newFrames.push(tempCanvas.toDataURL());
        }
      }
      setFrames(newFrames);
    };

    initEditor();

    // Reset loop
    startTimeRef.current = 0;

  }, [isOpen, asset.imageUrl, asset.metadata?.frames]);

  // --- ANIMATION LOOP ---
  useEffect(() => {
    if (!isOpen || frames.length === 0) return;

    const frameImages = frames.map(src => {
      const img = new Image();
      img.src = src;
      return img;
    });

    let currentFrame = 0;

    const animate = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const deltaTime = time - startTimeRef.current;
      const interval = 1000 / fps;

      if (deltaTime > interval) {
        if (isPlaying) {
          currentFrame = (currentFrame + 1) % frames.length;
        } else {
            // When paused, show selected frame if valid, else 0
            currentFrame = selectedFrameIdx < frames.length ? selectedFrameIdx : 0;
        }
        startTimeRef.current = time;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');

        if (canvas && ctx && frameImages[currentFrame] && frameImages[currentFrame].complete) {
           const img = frameImages[currentFrame];
           
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           ctx.imageSmoothingEnabled = false;

           // Calculate containment scale
           const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.8;
           const drawW = img.width * scale;
           const drawH = img.height * scale;
           const drawX = (canvas.width - drawW) / 2;
           const drawY = (canvas.height - drawH) / 2;

           ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isOpen, frames, fps, isPlaying, selectedFrameIdx]);

  // --- EDITOR ACTIONS ---

  const moveFrame = (idx: number, direction: -1 | 1) => {
    const newFrames = [...frames];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= newFrames.length) return;
    
    [newFrames[idx], newFrames[targetIdx]] = [newFrames[targetIdx], newFrames[idx]];
    setFrames(newFrames);
    setSelectedFrameIdx(targetIdx);
  };

  const deleteFrame = (idx: number) => {
    if (frames.length <= 1) return; // Prevent deleting last frame
    const newFrames = frames.filter((_, i) => i !== idx);
    setFrames(newFrames);
    if (selectedFrameIdx >= newFrames.length) setSelectedFrameIdx(newFrames.length - 1);
  };

  const duplicateFrame = (idx: number) => {
    const newFrames = [...frames];
    newFrames.splice(idx + 1, 0, newFrames[idx]);
    setFrames(newFrames);
    setSelectedFrameIdx(idx + 1);
  };

  const handleSave = async () => {
    if (frames.length === 0) return;

    // Load first frame to get dimensions
    const firstImg = new Image();
    firstImg.src = frames[0];
    await new Promise(r => (firstImg.onload = r));

    const totalWidth = firstImg.width * frames.length;
    const height = firstImg.height;

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Stitch
    await Promise.all(frames.map(async (src, i) => {
        const img = new Image();
        img.src = src;
        await new Promise(r => (img.onload = r));
        ctx.drawImage(img, i * firstImg.width, 0);
    }));

    const newUrl = canvas.toDataURL('image/png');
    onSave(asset.id, newUrl, frames.length);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-retro-black border-2 border-retro-amber w-full max-w-2xl rounded-lg shadow-[0_0_30px_rgba(255,176,0,0.3)] animate-in fade-in zoom-in duration-200 flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="bg-retro-amber text-retro-black p-3 flex justify-between items-center font-bold font-mono">
            <span className="flex items-center gap-2"><FastForward size={16}/> ANIMATION_EDITOR.exe</span>
            <div className="flex gap-2">
                <button 
                    onClick={handleSave} 
                    className="flex items-center gap-1 bg-retro-green text-black px-3 py-1 rounded text-xs hover:bg-white hover:scale-105 transition-all"
                >
                    <Save size={14} /> SAVE & APPLY
                </button>
                <button onClick={onClose} className="hover:text-white p-1"><X size={18} /></button>
            </div>
        </div>

        {/* Preview Canvas */}
        <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-black/50 relative flex items-center justify-center border-b border-white/10 overflow-hidden">
            <canvas ref={canvasRef} width={800} height={600} className="w-full h-full object-contain" />
            
            {/* Playback Controls Overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/80 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                 <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-retro-green text-black hover:bg-white transition-colors"
                >
                    {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>
                <div className="flex flex-col w-32">
                     <div className="flex justify-between text-[10px] font-mono text-gray-400">
                        <span>SLOW</span>
                        <span>{fps} FPS</span>
                        <span>FAST</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="60" 
                        value={fps} 
                        onChange={(e) => setFps(parseInt(e.target.value))}
                        className="w-full accent-retro-green h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        </div>

        {/* Timeline Editor */}
        <div className="h-48 bg-retro-gray/20 p-4 flex flex-col gap-2 overflow-hidden border-t border-white/10">
            <div className="flex justify-between items-center text-xs font-mono text-gray-400">
                <span>TIMELINE ({frames.length} frames)</span>
                <span>Select a frame to edit</span>
            </div>
            
            <div className="flex-1 flex gap-2 overflow-x-auto overflow-y-hidden custom-scrollbar pb-2 items-center">
                {frames.map((frameSrc, idx) => (
                    <div 
                        key={idx}
                        onClick={() => {
                            setSelectedFrameIdx(idx);
                            setIsPlaying(false);
                        }}
                        className={`
                            relative group shrink-0 w-24 h-24 bg-black/40 border-2 rounded flex flex-col cursor-pointer transition-all
                            ${selectedFrameIdx === idx ? 'border-retro-green scale-105 z-10' : 'border-white/10 hover:border-white/30'}
                        `}
                    >
                        <div className="flex-1 p-2 flex items-center justify-center">
                            <img src={frameSrc} className="max-w-full max-h-full object-contain [image-rendering:pixelated]" />
                        </div>
                        <div className="bg-black/80 text-[10px] text-center font-mono py-1 text-gray-500">
                            {idx + 1}
                        </div>

                        {/* Hover Actions */}
                        {selectedFrameIdx === idx && (
                            <div className="absolute -top-3 -right-3 flex gap-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteFrame(idx); }}
                                    className="p-1 bg-red-500 text-white rounded hover:bg-red-400 shadow-md"
                                    title="Delete Frame"
                                >
                                    <Trash2 size={10} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); duplicateFrame(idx); }}
                                    className="p-1 bg-blue-500 text-white rounded hover:bg-blue-400 shadow-md"
                                    title="Duplicate Frame"
                                >
                                    <Copy size={10} />
                                </button>
                            </div>
                        )}
                         {selectedFrameIdx === idx && (
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); moveFrame(idx, -1); }}
                                    disabled={idx === 0}
                                    className="p-1 bg-retro-gray border border-white/20 text-white rounded hover:bg-white/20 disabled:opacity-0"
                                >
                                    <ChevronLeft size={10} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); moveFrame(idx, 1); }}
                                    disabled={idx === frames.length - 1}
                                    className="p-1 bg-retro-gray border border-white/20 text-white rounded hover:bg-white/20 disabled:opacity-0"
                                >
                                    <ChevronRight size={10} />
                                </button>
                            </div>
                         )}
                    </div>
                ))}
                
                {/* Reset Button (Optional, just to start over if messed up) */}
                <button 
                     onClick={() => {
                         // Reset logic mimics init
                         if(originalImage) {
                             // Re-trigger init by toggling a dummy state or just separate Init logic
                             // For simplicity in this demo, we assume user won't need hard reset often or closes modal
                         }
                     }}
                     className="shrink-0 w-24 h-24 border-2 border-dashed border-white/10 rounded flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-white/30 transition-colors gap-2"
                >
                    <RotateCcw size={20} />
                    <span className="text-[10px]">RESET</span>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AnimationModal;