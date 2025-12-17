import React from 'react';
import { GameAsset } from '../types';
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Wand2, PlayCircle } from 'lucide-react';

interface AssetCardProps {
  asset: GameAsset;
  onRegenerate: (asset: GameAsset) => void;
  onEdit: (asset: GameAsset) => void;
  onPreviewAnimation: (asset: GameAsset) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, onRegenerate, onEdit, onPreviewAnimation }) => {
  const isAnimation = (asset.metadata?.frames && asset.metadata.frames > 1) || asset.filename.includes('strip');

  return (
    <div className="group relative bg-retro-gray/30 border border-white/10 rounded p-3 flex flex-col gap-2 hover:border-retro-green/50 transition-all">
      {/* Header */}
      <div className="flex justify-between items-start">
        <span className="text-xs font-mono text-gray-400 truncate max-w-[60%]">{asset.filename}</span>
        <div className="text-xs">
          {asset.status === 'pending' && <span className="text-gray-500">WAITING</span>}
          {asset.status === 'generating' && <Loader2 className="animate-spin w-4 h-4 text-retro-amber" />}
          {asset.status === 'done' && <CheckCircle2 className="w-4 h-4 text-retro-green" />}
          {asset.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Image Preview Area */}
      <div className="aspect-square bg-black/40 rounded flex items-center justify-center overflow-hidden border border-white/5 relative group/image">
        {asset.imageUrl ? (
            // Pixelated rendering style
            <img 
              src={asset.imageUrl} 
              alt={asset.name} 
              className="w-full h-full object-contain [image-rendering:pixelated]" 
            />
        ) : (
          <div className="text-white/10 text-4xl font-pixel">?</div>
        )}
        
        {/* Actions Overlay (Only if done) */}
        {asset.status === 'done' && (
          <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/image:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
              <button 
                onClick={() => onEdit(asset)}
                className="flex items-center gap-1 text-[10px] bg-retro-green text-black px-2 py-1 rounded font-bold hover:bg-white transition-colors w-full justify-center"
              >
                <Wand2 size={10} /> EDIT
              </button>
              
              {isAnimation && (
                  <button 
                    onClick={() => onPreviewAnimation(asset)}
                    className="flex items-center gap-1 text-[10px] bg-retro-amber text-black px-2 py-1 rounded font-bold hover:bg-white transition-colors w-full justify-center"
                  >
                    <PlayCircle size={10} /> PREVIEW
                  </button>
              )}

              <button 
                onClick={() => onRegenerate(asset)}
                className="flex items-center gap-1 text-[10px] bg-retro-gray border border-white/20 text-white px-2 py-1 rounded hover:bg-white/20 transition-colors w-full justify-center"
              >
                <RefreshCw size={10} /> RETRY
              </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-auto flex justify-between items-end">
        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border truncate max-w-full ${
          asset.category === 'Characters' ? 'border-blue-500/30 text-blue-400' :
          asset.category === 'Environment' ? 'border-green-500/30 text-green-400' :
          'border-yellow-500/30 text-yellow-400'
        }`}>
          {asset.group || asset.category}
        </span>
      </div>
    </div>
  );
};

export default AssetCard;