import React, { useState, useRef, useEffect } from 'react';
import { X, Wand2, Paintbrush, Eraser, PaintBucket, Pipette, Save, Undo } from 'lucide-react';
import { GameAsset } from '../types';

interface EditModalProps {
  asset: GameAsset;
  isOpen: boolean;
  onClose: () => void;
  onConfirmAI: (instruction: string) => void;
  onSaveManual: (assetId: string, imageUrl: string) => void;
  isProcessing: boolean;
}

type Tool = 'brush' | 'eraser' | 'bucket' | 'picker';

const EditModal: React.FC<EditModalProps> = ({ asset, isOpen, onClose, onConfirmAI, onSaveManual, isProcessing }) => {
  const [mode, setMode] = useState<'AI' | 'MANUAL'>('AI');
  const [instruction, setInstruction] = useState('');
  
  // Manual Editor State
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#ffffff');
  const [palette, setPalette] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (isOpen && mode === 'MANUAL' && asset.imageUrl) {
      const img = new Image();
      img.src = asset.imageUrl;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(img, 0, 0);
             extractPalette(ctx, img.width, img.height);
          }
        }
      };
      // Determine good zoom level based on image size
      if (asset.metadata?.width && asset.metadata.width < 64) {
          setZoom(4);
      } else {
          setZoom(2);
      }
    }
  }, [isOpen, mode, asset.imageUrl]);

  const extractPalette = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const data = ctx.getImageData(0, 0, width, height).data;
      const colorSet = new Set<string>();
      
      for(let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];
          if (a > 0) {
              const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
              colorSet.add(hex);
          }
      }
      
      // Limit to 20 colors
      setPalette(Array.from(colorSet).slice(0, 20));
  };

  const getPointerPos = (e: React.MouseEvent) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      return {
          x: Math.floor((e.clientX - rect.left) * scaleX),
          y: Math.floor((e.clientY - rect.top) * scaleY)
      };
  };

  const floodFill = (x: number, y: number, fillColor: string) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // Hex to RGBA
      const r = parseInt(fillColor.slice(1, 3), 16);
      const g = parseInt(fillColor.slice(3, 5), 16);
      const b = parseInt(fillColor.slice(5, 7), 16);
      const a = 255;

      const getPixel = (px: number, py: number) => {
          if (px < 0 || py < 0 || px >= width || py >= height) return -1;
          return (py * width + px) * 4;
      };

      const startIdx = getPixel(x, y);
      const startR = data[startIdx];
      const startG = data[startIdx + 1];
      const startB = data[startIdx + 2];
      const startA = data[startIdx + 3];

      if (startR === r && startG === g && startB === b && startA === a) return;

      const stack = [[x, y]];

      while (stack.length) {
          const [cx, cy] = stack.pop()!;
          const idx = getPixel(cx, cy);

          if (idx !== -1 && data[idx] === startR && data[idx+1] === startG && data[idx+2] === startB && data[idx+3] === startA) {
              data[idx] = r;
              data[idx+1] = g;
              data[idx+2] = b;
              data[idx+3] = a;

              stack.push([cx + 1, cy]);
              stack.push([cx - 1, cy]);
              stack.push([cx, cy + 1]);
              stack.push([cx, cy - 1]);
          }
      }
      ctx.putImageData(imgData, 0, 0);
  };

  const drawPixel = (x: number, y: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      if (tool === 'picker') {
          const data = ctx.getImageData(x, y, 1, 1).data;
          const hex = `#${((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2]).toString(16).slice(1)}`;
          setColor(hex);
          setTool('brush'); // Switch back to brush after picking
          return;
      }

      if (tool === 'bucket') {
          floodFill(x, y, color);
          return;
      }

      if (tool === 'eraser') {
          ctx.clearRect(x, y, 1, 1);
      } else {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      setIsDrawing(true);
      const { x, y } = getPointerPos(e);
      drawPixel(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDrawing) return;
      if (tool === 'bucket' || tool === 'picker') return; // Click only tools
      const { x, y } = getPointerPos(e);
      drawPixel(x, y);
  };

  const handleManualSave = () => {
      if (canvasRef.current) {
          const url = canvasRef.current.toDataURL('image/png');
          onSaveManual(asset.id, url);
          onClose();
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-retro-black border-2 border-retro-green w-full max-w-4xl h-[80vh] rounded-lg shadow-[0_0_30px_rgba(51,255,0,0.3)] animate-in fade-in zoom-in duration-200 flex flex-col overflow-hidden">
        
        {/* Header with Tabs */}
        <div className="flex justify-between items-center bg-retro-black border-b border-white/10">
            <div className="flex">
                <button 
                    onClick={() => setMode('AI')}
                    className={`px-6 py-3 font-mono text-xs font-bold flex items-center gap-2 ${mode === 'AI' ? 'bg-retro-green text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Wand2 size={14} /> AI GENERATION
                </button>
                <button 
                    onClick={() => setMode('MANUAL')}
                    className={`px-6 py-3 font-mono text-xs font-bold flex items-center gap-2 ${mode === 'MANUAL' ? 'bg-retro-green text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Paintbrush size={14} /> PIXEL EDITOR
                </button>
            </div>
            <div className="flex items-center gap-4 pr-4">
                 <span className="text-gray-500 font-mono text-xs hidden sm:block">EDITING: {asset.filename}</span>
                 <button onClick={onClose} disabled={isProcessing} className="hover:text-white text-gray-400"><X size={20} /></button>
            </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-hidden relative">
            
            {/* --- AI MODE --- */}
            {mode === 'AI' && (
                <div className="h-full p-8 flex flex-col md:flex-row gap-8 items-center justify-center">
                    <div className="w-64 h-64 bg-black/50 border border-white/20 rounded flex items-center justify-center overflow-hidden shrink-0">
                        {asset.imageUrl && <img src={asset.imageUrl} className="w-full h-full object-contain [image-rendering:pixelated]" />}
                    </div>
                    
                    <div className="flex-1 max-w-md w-full space-y-4">
                        <div>
                            <p className="text-gray-400 text-xs font-mono mb-2">INSTRUCTION:</p>
                            <textarea 
                                value={instruction}
                                onChange={(e) => setInstruction(e.target.value)}
                                disabled={isProcessing}
                                placeholder="e.g., 'Make the cloak red', 'Add a shield', 'Make it darker'"
                                className="w-full bg-black/50 border border-white/20 rounded p-4 text-white font-mono text-sm focus:border-retro-green outline-none min-h-[120px]"
                            />
                        </div>
                        <button 
                            onClick={() => onConfirmAI(instruction)}
                            disabled={!instruction.trim() || isProcessing}
                            className="w-full bg-retro-green text-black px-4 py-3 rounded text-sm font-bold font-mono hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isProcessing ? 'PROCESSING...' : 'GENERATE CHANGES'}
                        </button>
                    </div>
                </div>
            )}

            {/* --- MANUAL MODE --- */}
            {mode === 'MANUAL' && (
                <div className="h-full flex">
                    {/* Toolbar */}
                    <div className="w-16 bg-retro-gray/30 border-r border-white/10 flex flex-col items-center py-4 gap-4 z-10">
                        <ToolBtn icon={Paintbrush} active={tool === 'brush'} onClick={() => setTool('brush')} label="Brush" />
                        <ToolBtn icon={Eraser} active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Eraser" />
                        <ToolBtn icon={PaintBucket} active={tool === 'bucket'} onClick={() => setTool('bucket')} label="Fill" />
                        <ToolBtn icon={Pipette} active={tool === 'picker'} onClick={() => setTool('picker')} label="Pick" />
                        
                        <div className="h-px w-8 bg-white/10 my-2" />
                        
                        {/* Current Color */}
                        <div className="w-8 h-8 rounded border border-white/30" style={{ backgroundColor: tool === 'eraser' ? 'transparent' : color }} />
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-0 opacity-0 absolute" id="color-input" />
                        <label htmlFor="color-input" className="text-[10px] text-gray-400 cursor-pointer hover:text-white">CHANGE</label>
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-black/80 flex items-center justify-center overflow-auto relative">
                        <canvas 
                            ref={canvasRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={() => setIsDrawing(false)}
                            onMouseLeave={() => setIsDrawing(false)}
                            className="bg-[url('https://www.transparenttextures.com/patterns/checkerboard-cross-dark.png')] shadow-2xl border border-white/10 cursor-crosshair [image-rendering:pixelated]"
                            style={{ 
                                width: canvasRef.current ? canvasRef.current.width * zoom : 'auto', 
                                height: canvasRef.current ? canvasRef.current.height * zoom : 'auto' 
                            }}
                        />
                        
                        {/* Zoom Controls */}
                        <div className="absolute bottom-4 right-4 bg-black/80 rounded border border-white/10 p-2 flex gap-2">
                            <button onClick={() => setZoom(Math.max(1, zoom - 1))} className="text-white px-2 hover:text-retro-green">-</button>
                            <span className="font-mono text-xs text-gray-400 pt-1">{zoom}x</span>
                            <button onClick={() => setZoom(Math.min(16, zoom + 1))} className="text-white px-2 hover:text-retro-green">+</button>
                        </div>
                    </div>

                    {/* Palette Sidebar */}
                    <div className="w-48 bg-retro-gray/30 border-l border-white/10 p-4 flex flex-col">
                        <h4 className="font-mono text-xs text-gray-400 mb-3 font-bold">DETECTED PALETTE</h4>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            {palette.map((c, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => setColor(c)}
                                    className="w-8 h-8 rounded border border-white/10 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                        </div>

                        <div className="mt-auto">
                            <button 
                                onClick={handleManualSave}
                                className="w-full bg-retro-green text-black py-3 rounded font-bold font-mono text-xs hover:bg-white flex items-center justify-center gap-2"
                            >
                                <Save size={14} /> SAVE IMAGE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const ToolBtn: React.FC<{ icon: any, active: boolean, onClick: () => void, label: string }> = ({ icon: Icon, active, onClick, label }) => (
    <button 
        onClick={onClick}
        className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${active ? 'bg-retro-green text-black' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
        title={label}
    >
        <Icon size={18} />
    </button>
);

export default EditModal;