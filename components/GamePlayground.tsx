import React, { useEffect, useRef, useState } from 'react';
import { X, Gamepad2, ArrowRight, ArrowUp, ArrowLeft, Loader2 } from 'lucide-react';
import { ProjectManifest, GameAsset } from '../types';

interface GamePlaygroundProps {
  plan: ProjectManifest;
  isOpen: boolean;
  onClose: () => void;
}

// Simple Input State
const keys = {
  left: false,
  right: false,
  up: false,
  down: false,
  space: false
};

const GamePlayground: React.FC<GamePlaygroundProps> = ({ plan, isOpen, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestRef = useRef<number>();
  
  // Game State Refs (using refs to avoid closure staleness in game loop)
  const gameState = useRef({
    player: {
      x: 100,
      y: 0,
      vx: 0,
      vy: 0,
      width: 32,
      height: 32,
      state: 'idle' as 'idle' | 'run' | 'jump',
      facingRight: true,
      grounded: false,
      frameIndex: 0,
      frameTimer: 0
    },
    camera: { x: 0 },
    assets: {
      idle: null as HTMLImageElement | null,
      run: null as HTMLImageElement | null,
      jump: null as HTMLImageElement | null,
      tile: null as HTMLImageElement | null,
      bg: null as HTMLImageElement | null,
      enemy: null as HTMLImageElement | null,
    },
    meta: {
      idleFrames: 1,
      runFrames: 1,
      jumpFrames: 1,
    }
  });

  // --- 1. ASSET LOADING & HEURISTICS ---
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);

    const loadGameAssets = async () => {
      const state = gameState.current;
      const { assets } = plan;

      // Reset Position
      state.player.x = 100;
      state.player.y = 200;
      state.player.vx = 0;
      state.player.vy = 0;

      // Helper to load image
      const loadImg = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.src = url;
          img.onload = () => resolve(img);
          img.onerror = reject;
        });
      };

      // Heuristic Matcher: Find best assets based on filename/group
      const findAsset = (category: string, keyword: string) => {
        return assets.find(a => 
          a.category === category && 
          (a.name.toLowerCase().includes(keyword) || a.filename.toLowerCase().includes(keyword))
        );
      };

      try {
        // Player Assets
        const idleAsset = findAsset('Characters', 'idle') || assets.find(a => a.category === 'Characters');
        const runAsset = findAsset('Characters', 'run');
        const jumpAsset = findAsset('Characters', 'jump');
        
        // Environment Assets
        const tileAsset = findAsset('Environment', 'tile') || findAsset('Environment', 'floor');
        const bgAsset = findAsset('Environment', 'bg') || findAsset('Environment', 'background');
        
        // Enemy (Optional)
        const enemyAsset = assets.find(a => a.category === 'Characters' && !a.name.toLowerCase().includes('player') && !a.group?.toLowerCase().includes('player'));

        // Load into State
        if (idleAsset?.imageUrl) {
            state.assets.idle = await loadImg(idleAsset.imageUrl);
            state.meta.idleFrames = idleAsset.metadata?.frames || 1;
        }
        if (runAsset?.imageUrl) {
            state.assets.run = await loadImg(runAsset.imageUrl);
            state.meta.runFrames = runAsset.metadata?.frames || 1;
        }
        if (jumpAsset?.imageUrl) {
            state.assets.jump = await loadImg(jumpAsset.imageUrl);
            state.meta.jumpFrames = jumpAsset.metadata?.frames || 1;
        }
        if (tileAsset?.imageUrl) state.assets.tile = await loadImg(tileAsset.imageUrl);
        if (bgAsset?.imageUrl) state.assets.bg = await loadImg(bgAsset.imageUrl);
        if (enemyAsset?.imageUrl) state.assets.enemy = await loadImg(enemyAsset.imageUrl);

        // Fallbacks if run/jump missing
        if (!state.assets.run) { state.assets.run = state.assets.idle; state.meta.runFrames = state.meta.idleFrames; }
        if (!state.assets.jump) { state.assets.jump = state.assets.idle; state.meta.jumpFrames = state.meta.idleFrames; }

      } catch (e) {
        console.error("Failed to load game assets", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadGameAssets();

    // Event Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if(e.code === 'ArrowLeft' || e.key === 'a') keys.left = true;
      if(e.code === 'ArrowRight' || e.key === 'd') keys.right = true;
      if(e.code === 'ArrowUp' || e.code === 'Space' || e.key === 'w') keys.space = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if(e.code === 'ArrowLeft' || e.key === 'a') keys.left = false;
      if(e.code === 'ArrowRight' || e.key === 'd') keys.right = false;
      if(e.code === 'ArrowUp' || e.code === 'Space' || e.key === 'w') keys.space = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, plan]);

  // --- 2. GAME LOOP ---
  useEffect(() => {
    if (!isOpen || isLoading) return;

    const loop = (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const state = gameState.current;

      if (canvas && ctx) {
        // --- PHYSICS ---
        const friction = 0.8;
        const gravity = 0.8;
        const speed = 5;
        const jumpForce = -15;

        if (keys.right) {
            state.player.vx += 1;
            state.player.facingRight = true;
        }
        if (keys.left) {
            state.player.vx -= 1;
            state.player.facingRight = false;
        }

        // Apply Physics
        state.player.vx *= friction;
        state.player.vy += gravity;
        state.player.x += state.player.vx;
        state.player.y += state.player.vy;

        // Floor Collision (Simple flat plane at bottom)
        const floorY = canvas.height - 64;
        if (state.player.y + state.player.height > floorY) {
            state.player.y = floorY - state.player.height;
            state.player.vy = 0;
            state.player.grounded = true;
        } else {
            state.player.grounded = false;
        }

        // Jump
        if (keys.space && state.player.grounded) {
            state.player.vy = jumpForce;
            state.player.grounded = false;
        }

        // State Machine
        if (!state.player.grounded) {
            state.player.state = 'jump';
        } else if (Math.abs(state.player.vx) > 0.5) {
            state.player.state = 'run';
        } else {
            state.player.state = 'idle';
        }

        // --- RENDER ---
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false; // Pixel Art Look

        // 1. Background (Parallax placeholder: static for now)
        if (state.assets.bg) {
            ctx.drawImage(state.assets.bg, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1a1a2a'; // Default sky
            ctx.fillRect(0,0, canvas.width, canvas.height);
        }

        // 2. Tiles (Floor)
        if (state.assets.tile) {
            const tileW = 32;
            const tileH = 32;
            const cols = Math.ceil(canvas.width / tileW);
            // Draw floor row
            for (let i = 0; i < cols; i++) {
                ctx.drawImage(state.assets.tile, i * tileW, floorY, tileW, tileH);
                // Draw sub-floor to bottom
                ctx.drawImage(state.assets.tile, i * tileW, floorY + tileH, tileW, tileH);
            }
            
            // Draw a platform
            ctx.drawImage(state.assets.tile, 300, floorY - 100, tileW, tileH);
            ctx.drawImage(state.assets.tile, 332, floorY - 100, tileW, tileH);
            ctx.drawImage(state.assets.tile, 364, floorY - 100, tileW, tileH);
            
            // Platform collision (Simple AABB check)
            if (state.player.x + 32 > 300 && state.player.x < 396 &&
                state.player.y + 32 > floorY - 100 && state.player.y + 32 < floorY - 90 && state.player.vy > 0) {
                 state.player.y = floorY - 100 - 32;
                 state.player.vy = 0;
                 state.player.grounded = true;
            }
        } else {
             ctx.fillStyle = '#333';
             ctx.fillRect(0, floorY, canvas.width, 64);
        }

        // 3. Enemy (Patrol)
        if (state.assets.enemy) {
            const enemyX = 400 + Math.sin(time / 1000) * 100;
            ctx.drawImage(state.assets.enemy, 0, 0, 32, 32, enemyX, floorY - 32, 32, 32);
        }

        // 4. Player
        let currentImg = state.assets.idle;
        let totalFrames = state.meta.idleFrames;

        if (state.player.state === 'run') {
            currentImg = state.assets.run;
            totalFrames = state.meta.runFrames;
        } else if (state.player.state === 'jump') {
            currentImg = state.assets.jump;
            totalFrames = state.meta.jumpFrames;
        }

        if (currentImg) {
            // Update Animation Frame
            state.player.frameTimer++;
            if (state.player.frameTimer > 8) { // Animation Speed
                state.player.frameIndex = (state.player.frameIndex + 1) % totalFrames;
                state.player.frameTimer = 0;
            }

            const frameW = currentImg.width / totalFrames;
            const frameH = currentImg.height;

            ctx.save();
            ctx.translate(state.player.x + state.player.width/2, state.player.y + state.player.height/2);
            if (!state.player.facingRight) {
                ctx.scale(-1, 1);
            }
            // Draw Sprite
            ctx.drawImage(
                currentImg, 
                state.player.frameIndex * frameW, 0, frameW, frameH, // Source
                -state.player.width/2, -state.player.height/2, 64, 64 // Dest (Scaled up 2x for visibility)
            );
            ctx.restore();
        } else {
            // Fallback Box
            ctx.fillStyle = 'red';
            ctx.fillRect(state.player.x, state.player.y, 32, 32);
        }
        
        // UI Text
        ctx.font = '10px monospace';
        ctx.fillStyle = 'white';
        ctx.fillText(`STATE: ${state.player.state.toUpperCase()}`, 10, 20);
        ctx.fillText(`VELOCITY: ${state.player.vx.toFixed(1)}, ${state.player.vy.toFixed(1)}`, 10, 35);
        ctx.fillText(`ARROWS to Move, SPACE to Jump`, 10, canvas.height - 10);
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isOpen, isLoading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
      <div className="relative w-full max-w-5xl aspect-video bg-retro-black border-4 border-retro-green rounded-lg shadow-[0_0_50px_rgba(51,255,0,0.2)] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-retro-green text-retro-black p-2 flex justify-between items-center font-bold font-pixel text-xs sm:text-sm z-10">
          <div className="flex items-center gap-2">
            <Gamepad2 className="animate-pulse" />
            PROTOTYPE_PLAYGROUND_V0.1
          </div>
          <div className="flex gap-4 items-center">
            <div className="hidden sm:flex gap-2 text-[10px] font-mono opacity-80">
              <span className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded"><ArrowLeft size={10}/> <ArrowRight size={10}/> MOVE</span>
              <span className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded"><ArrowUp size={10}/> JUMP</span>
            </div>
            <button onClick={onClose} className="hover:text-white transition-colors"><X size={20} /></button>
          </div>
        </div>

        {/* Game Canvas */}
        <div className="flex-1 relative bg-[#1a1a2a]">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-retro-green gap-4">
               <Loader2 className="animate-spin w-12 h-12" />
               <span className="font-mono text-sm">LOADING ASSETS INTO MEMORY...</span>
            </div>
          ) : (
            <canvas ref={canvasRef} width={800} height={450} className="w-full h-full object-contain" />
          )}
        </div>

        {/* Footer Overlay */}
        <div className="absolute bottom-4 left-4 pointer-events-none font-mono text-xs text-retro-green/50">
           RENDER_ENGINE: CANVAS_2D // PHYSICS: SIMPLE_AABB
        </div>
      </div>
    </div>
  );
};

export default GamePlayground;