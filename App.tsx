
import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { Download, Play, RefreshCw, Box, Layers, Grid, Gamepad2, Palette, Check } from 'lucide-react';

import { AppPhase, ProjectManifest, GameAsset, FolderNode } from './types';
import { generateProjectPlan, generateAssetImage, editAssetImage } from './services/geminiService';
import Terminal from './components/Terminal';
import AssetCard from './components/AssetCard';
import FileTree from './components/FileTree';
import EditModal from './components/EditModal';
import AnimationModal from './components/AnimationModal';
import GamePlayground from './components/GamePlayground';

const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.IDLE);
  const [history, setHistory] = useState<{ role: 'user' | 'system', text: string }[]>([]);
  const [plan, setPlan] = useState<ProjectManifest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Edit State
  const [editingAsset, setEditingAsset] = useState<GameAsset | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditingProcessing, setIsEditingProcessing] = useState(false);

  // Animation Preview State
  const [previewAsset, setPreviewAsset] = useState<GameAsset | null>(null);
  const [isAnimModalOpen, setIsAnimModalOpen] = useState(false);

  // Game Playground State
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);

  // --- LOGIC: Handle User Input (Chat) ---
  const handleInput = async (input: string) => {
    setHistory(prev => [...prev, { role: 'user', text: input }]);
    setIsProcessing(true);

    try {
      if (phase === AppPhase.IDLE || phase === AppPhase.COMPLETE) {
        // Start Planning
        setHistory(prev => [...prev, { role: 'system', text: "ANALYZING REQUEST... GENERATING TECHNICAL MANIFEST..." }]);
        const generatedPlan = await generateProjectPlan(input);
        
        setPlan(generatedPlan);
        setPhase(AppPhase.REVIEW);
        
        setHistory(prev => [...prev, { 
          role: 'system', 
          text: `PLAN GENERATED.\nTHEME: ${generatedPlan.theme}\nASSETS: ${generatedPlan.assets.length} items identified.\n\nPlease review the asset list. We will generate the BRAND IDENTITY (Concept Art) for the Player first to ensure consistency.` 
        }]);
      } else if (phase === AppPhase.REVIEW) {
         if (input.toLowerCase().includes('confirm') || input.toLowerCase().includes('yes')) {
            startConceptPhase();
         } else {
            // User wants to refine
            setHistory(prev => [...prev, { role: 'system', text: "RECALIBRATING MANIFEST..." }]);
            const generatedPlan = await generateProjectPlan(input);
            setPlan(generatedPlan);
            setHistory(prev => [...prev, { role: 'system', text: "UPDATED PLAN GENERATED. Please confirm." }]);
         }
      }
    } catch (error) {
      setHistory(prev => [...prev, { role: 'system', text: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- LOGIC: Phase 1 - Concept Generation ---
  const startConceptPhase = async () => {
      if (!plan) return;
      setPhase(AppPhase.CONCEPT);
      setHistory(prev => [...prev, { role: 'system', text: "PHASE 1: BRANDING & IDENTITY.\nGenerating 'Master Concept' for the Player...\nThis will be the reference for all other animations." }]);

      // Find the "Idle" state of the Player or the first character asset
      const conceptAsset = plan.assets.find(a => 
          a.category === 'Characters' && 
          (a.name.toLowerCase().includes('idle') || a.name.toLowerCase().includes('stand'))
      ) || plan.assets[0];

      if (conceptAsset) {
          conceptAsset.status = 'generating';
          // Force update UI
          setPlan({ ...plan });
          
          try {
              const imageUrl = await generateAssetImage(conceptAsset, plan.paletteDescription);
              conceptAsset.imageUrl = imageUrl;
              conceptAsset.status = 'done';
              
              setPlan(prev => {
                  if(!prev) return null;
                  return { ...prev, masterStyleImage: imageUrl };
              });
              setHistory(prev => [...prev, { role: 'system', text: "CONCEPT GENERATED.\nCheck the result on the right.\nIf you like it, click 'APPROVE & GENERATE ALL'.\nIf not, click 'Regenerate' or Edit it." }]);
          } catch (e) {
              conceptAsset.status = 'error';
          }
      }
  };

  // --- LOGIC: Phase 2 - Batch Generation (Using Concept as Reference) ---
  const approveAndGenerateRest = async () => {
    if (!plan || !plan.masterStyleImage) return;
    
    setPhase(AppPhase.GENERATING);
    setHistory(prev => [...prev, { role: 'system', text: "IDENTITY CONFIRMED.\nINITIATING MASS PRODUCTION.\nUsing Master Concept as stylistic reference for all animations..." }]);

    const newAssets = [...plan.assets];
    
    for (let i = 0; i < newAssets.length; i++) {
        const asset = newAssets[i];
        
        // Skip if already done (the Concept asset)
        if (asset.status === 'done') continue;

        asset.status = 'generating';
        setPlan({ ...plan, assets: [...newAssets] });
        
        try {
            // PASS THE MASTER CONCEPT as reference if it's a character from the same group
            // Simple heuristic: If it's a character, use the reference.
            const referenceImage = asset.category === 'Characters' ? plan.masterStyleImage : undefined;

            const imageUrl = await generateAssetImage(asset, plan.paletteDescription, referenceImage);
            asset.imageUrl = imageUrl;
            asset.status = 'done';
        } catch (e) {
            asset.status = 'error';
        }
        
        setPlan({ ...plan, assets: [...newAssets] });
    }

    setPhase(AppPhase.COMPLETE);
    setHistory(prev => [...prev, { role: 'system', text: "PRODUCTION COMPLETE.\nAssets are coherent and consistent.\nReady for testing." }]);
  };

  // --- LOGIC: Individual Asset Regeneration ---
  const handleRegenerate = async (asset: GameAsset) => {
    if (!plan) return;
    
    // Update local state to show loading
    const newAssets = plan.assets.map(a => a.id === asset.id ? { ...a, status: 'generating' as const } : a);
    setPlan({ ...plan, assets: newAssets });
    
    try {
        // Use reference if available and applicable
        const referenceImage = (asset.category === 'Characters' && plan.masterStyleImage && asset.id !== plan.assets.find(a => a.imageUrl === plan.masterStyleImage)?.id) 
            ? plan.masterStyleImage 
            : undefined;

        const imageUrl = await generateAssetImage(asset, plan.paletteDescription, referenceImage);
        
        // If we regenerated the Master Concept, update the plan's master ref
        const isMaster = asset.imageUrl === plan.masterStyleImage;
        
        setPlan(currentPlan => {
            if (!currentPlan) return null;
            return {
                ...currentPlan,
                masterStyleImage: isMaster ? imageUrl : currentPlan.masterStyleImage,
                assets: currentPlan.assets.map(a => a.id === asset.id ? { ...a, status: 'done', imageUrl } : a)
            };
        });
    } catch (e) {
         setPlan(currentPlan => {
            if (!currentPlan) return null;
            return {
                ...currentPlan,
                assets: currentPlan.assets.map(a => a.id === asset.id ? { ...a, status: 'error' } : a)
            };
        });
    }
  };

  // --- LOGIC: Open Edit Modal ---
  const handleOpenEdit = (asset: GameAsset) => {
    setEditingAsset(asset);
    setIsEditModalOpen(true);
  };

  // --- LOGIC: Perform Edit (Image-to-Image AI) ---
  const handleConfirmEditAI = async (instruction: string) => {
    if (!editingAsset || !plan || !editingAsset.imageUrl) return;

    setIsEditingProcessing(true);
    
    // UI Update
    setPlan(prev => {
        if (!prev) return null;
        return {
            ...prev,
            assets: prev.assets.map(a => a.id === editingAsset.id ? { ...a, status: 'generating' } : a)
        }
    });

    try {
        const newImageUrl = await editAssetImage(editingAsset.imageUrl, instruction, editingAsset.description);
        
        // Check if we edited the Master Concept
        const isMaster = editingAsset.imageUrl === plan.masterStyleImage;

        setPlan(prev => {
            if (!prev) return null;
            return {
                ...prev,
                masterStyleImage: isMaster ? newImageUrl : prev.masterStyleImage,
                assets: prev.assets.map(a => a.id === editingAsset.id ? { 
                    ...a, 
                    status: 'done', 
                    imageUrl: newImageUrl,
                    description: `${a.description} (Edit: ${instruction})` 
                } : a)
            }
        });
        
        setHistory(prev => [...prev, { role: 'system', text: `ASSET EDITED (AI): ${editingAsset.filename} >> "${instruction}"` }]);
        setIsEditModalOpen(false);
        setEditingAsset(null);

    } catch (e) {
        console.error(e);
        setPlan(prev => {
            if (!prev) return null;
            return {
                ...prev,
                assets: prev.assets.map(a => a.id === editingAsset.id ? { ...a, status: 'error' } : a)
            }
        });
        setHistory(prev => [...prev, { role: 'system', text: `ERROR EDITING ASSET: ${editingAsset.filename}` }]);
    } finally {
        setIsEditingProcessing(false);
    }
  };

  // --- LOGIC: Save Manual Edit / Animation Update ---
  const handleSaveAsset = (assetId: string, newImageUrl: string, newFrameCount?: number) => {
      setPlan(prev => {
          if (!prev) return null;
          // Check if this was the master image
          const isMaster = prev.assets.find(a => a.id === assetId)?.imageUrl === prev.masterStyleImage;
          
          return {
              ...prev,
              masterStyleImage: isMaster ? newImageUrl : prev.masterStyleImage,
              assets: prev.assets.map(a => a.id === assetId ? {
                  ...a,
                  imageUrl: newImageUrl,
                  status: 'done', // Ensure it's marked done
                  metadata: {
                      ...a.metadata,
                      frames: newFrameCount !== undefined ? newFrameCount : a.metadata?.frames
                  }
              } : a)
          }
      });
  };


  // --- LOGIC: Combine Group to Sprite Sheet ---
  const handleExportGroupSheet = async (groupName: string, assets: GameAsset[]) => {
    const loadedImages = await Promise.all(assets.map(async (asset) => {
        if (!asset.imageUrl) return null;
        return new Promise<{ img: HTMLImageElement, name: string }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ img, name: asset.filename });
            img.onerror = reject;
            img.src = asset.imageUrl!;
        }).catch(() => null);
    }));

    const validImages = loadedImages.filter((item): item is { img: HTMLImageElement, name: string } => item !== null);
    if (validImages.length === 0) return;

    const maxWidth = Math.max(...validImages.map(i => i.img.width));
    const totalHeight = validImages.reduce((sum, i) => sum + i.img.height, 0);

    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let currentY = 0;
    validImages.forEach(({ img }) => {
        ctx.drawImage(img, 0, currentY);
        currentY += img.height;
    });

    canvas.toBlob((blob) => {
        if (blob) {
            saveAs(blob, `${groupName.replace(/\s+/g, '_')}_SpriteSheet.png`);
        }
    });
  };


  // --- LOGIC: ZIP Creation ---
  const handleDownload = async () => {
    if (!plan) return;

    const zip = new JSZip();
    const root = zip.folder(`Project_${plan.theme.replace(/\s+/g, '_')}`);
    
    if (!root) return;

    const docs = root.folder("_Documentation");
    docs?.file("Game_Design_Doc.md", plan.designDocs);
    docs?.file("Manifest.json", JSON.stringify(plan, null, 2));

    const charFolder = root.folder("Characters");
    const envFolder = root.folder("Environment");
    const uiFolder = root.folder("UI");

    for (const asset of plan.assets) {
        if (!asset.imageUrl) continue;
        
        const response = await fetch(asset.imageUrl);
        const blob = await response.blob();
        
        if (asset.category === 'Characters') {
            charFolder?.file(asset.filename, blob);
        } else if (asset.category === 'Environment') {
            envFolder?.file(asset.filename, blob);
        } else {
            uiFolder?.file(asset.filename, blob);
        }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${plan.theme.replace(/\s+/g, '_')}_Assets.zip`);
  };

  const getFolderStructure = (): FolderNode => {
    if (!plan) return { name: "Root", type: "folder", children: [] };
    
    return {
        name: `Project_${plan.theme.replace(/\s+/g, '_')}`,
        type: 'folder',
        children: [
            {
                name: "_Documentation",
                type: 'folder',
                children: [
                    { name: "Game_Design_Doc.md", type: 'file' },
                    { name: "Manifest.json", type: 'file' }
                ]
            },
            {
                name: "Characters",
                type: 'folder',
                children: plan.assets.filter(a => a.category === 'Characters').map(a => ({ name: a.filename, type: 'file' }))
            },
             {
                name: "Environment",
                type: 'folder',
                children: plan.assets.filter(a => a.category === 'Environment').map(a => ({ name: a.filename, type: 'file' }))
            },
             {
                name: "UI",
                type: 'folder',
                children: plan.assets.filter(a => a.category === 'UI').map(a => ({ name: a.filename, type: 'file' }))
            }
        ]
    };
  };

  const getGroupedAssets = () => {
    if (!plan) return {};
    const groups: Record<string, GameAsset[]> = {};
    
    plan.assets.forEach(asset => {
        const groupName = asset.group || asset.category || "Uncategorized";
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(asset);
    });
    return groups;
  };

  return (
    <div className="min-h-screen bg-retro-black p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-retro-green p-2 rounded shadow-[0_0_15px_rgba(51,255,0,0.5)]">
            <Box className="text-retro-black" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-pixel text-white tracking-tighter">O CÉREBRO</h1>
            <p className="text-xs font-mono text-retro-green uppercase tracking-widest">Technical Art Director AI</p>
          </div>
        </div>
        
        <div className="flex gap-2">
            {phase === AppPhase.COMPLETE && (
                <button
                    onClick={() => setIsPlaygroundOpen(true)}
                    className="flex items-center gap-2 bg-retro-green text-black font-bold px-4 py-2 rounded hover:bg-white transition-colors shadow-[0_0_15px_rgba(51,255,0,0.3)] border border-retro-green"
                >
                    <Gamepad2 size={18} />
                    TEST GAME
                </button>
            )}

            {phase === AppPhase.COMPLETE && (
                <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 bg-retro-amber text-black font-bold px-4 py-2 rounded hover:bg-yellow-400 transition-colors shadow-[0_0_15px_rgba(255,176,0,0.4)]"
                >
                    <Download size={18} />
                    DOWNLOAD .ZIP
                </button>
            )}
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 h-[calc(100vh-160px)]">
        
        {/* LEFT COLUMN: TERMINAL (Chat) */}
        <div className="lg:col-span-4 h-full flex flex-col">
          <Terminal 
            onSubmit={handleInput} 
            isLoading={isProcessing} 
            history={history} 
          />
        </div>

        {/* RIGHT COLUMN: WORKSPACE */}
        <div className="lg:col-span-8 h-full overflow-hidden bg-retro-gray/20 border border-white/5 rounded-lg flex flex-col">
            
            {/* Workspace Header */}
            <div className="bg-white/5 p-3 flex justify-between items-center border-b border-white/5">
                <span className="font-mono text-sm text-gray-400">PROJECT_WORKSPACE</span>
                <div className="flex gap-2">
                    {phase === AppPhase.REVIEW && (
                        <button 
                            onClick={startConceptPhase}
                            className="text-xs bg-retro-green/10 text-retro-green border border-retro-green px-3 py-1 rounded hover:bg-retro-green hover:text-black transition-colors flex items-center gap-1"
                        >
                            <Play size={12} /> GENERATE IDENTITY
                        </button>
                    )}
                    {phase === AppPhase.CONCEPT && (
                        <button 
                            onClick={approveAndGenerateRest}
                            className="text-xs bg-retro-amber/10 text-retro-amber border border-retro-amber px-3 py-1 rounded hover:bg-retro-amber hover:text-black transition-colors flex items-center gap-1 animate-pulse"
                        >
                            <Check size={12} /> APPROVE & GENERATE ALL
                        </button>
                    )}
                </div>
            </div>

            {/* Workspace Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {!plan ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 font-mono gap-4 opacity-50">
                        <Box size={48} />
                        <p>WAITING FOR MANIFEST...</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        
                        {/* 0. BRANDING ALERT (CONCEPT PHASE) */}
                        {phase === AppPhase.CONCEPT && (
                            <div className="bg-retro-amber/10 border border-retro-amber rounded p-4 flex flex-col items-center text-center gap-4">
                                <Palette className="text-retro-amber w-12 h-12" />
                                <div>
                                    <h3 className="text-retro-amber font-bold text-lg font-pixel">BRANDING PHASE</h3>
                                    <p className="text-gray-300 text-sm font-mono mt-2 max-w-md">
                                        We are defining the "Hero Style" first. 
                                        Once you approve this character, all other animations (Run, Jump, Shoot, Roll) will be generated using this image as a strict visual reference.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* 1. PROJECT META & DOCS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-black/30 p-4 rounded border border-white/10">
                                <h3 className="text-retro-green font-bold text-sm mb-2 font-mono">GAME DESIGN DOC</h3>
                                <div className="text-xs text-gray-300 font-mono whitespace-pre-wrap h-32 overflow-y-auto custom-scrollbar">
                                    {plan.designDocs}
                                </div>
                            </div>
                            <div className="bg-black/30 p-4 rounded border border-white/10">
                                <h3 className="text-retro-amber font-bold text-sm mb-2 font-mono">STRUCTURE</h3>
                                <div className="text-xs text-gray-300 font-mono h-32 overflow-y-auto custom-scrollbar">
                                    <FileTree node={getFolderStructure()} />
                                </div>
                            </div>
                        </div>

                        {/* 2. ASSET GROUPS */}
                        <div>
                            <h3 className="text-white font-bold text-sm mb-4 font-mono border-b border-white/10 pb-2">
                                ASSET MANIFEST <span className="text-gray-500 text-xs font-normal">({plan.assets.length} items)</span>
                            </h3>
                            
                            <div className="space-y-8">
                                {Object.entries(getGroupedAssets()).map(([groupName, assets]) => (
                                    <div key={groupName} className="bg-white/5 rounded-lg p-4 border border-white/5">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="text-retro-green font-mono font-bold flex items-center gap-2">
                                                <Layers size={16} />
                                                {groupName}
                                            </h4>
                                            
                                            {/* Combine Button (Only if all done) */}
                                            {assets.length > 1 && assets.every(a => a.status === 'done') && (
                                                <button 
                                                    onClick={() => handleExportGroupSheet(groupName, assets)}
                                                    className="flex items-center gap-1 text-[10px] bg-retro-gray border border-white/20 text-white px-2 py-1 rounded hover:bg-white/20 transition-colors"
                                                >
                                                    <Grid size={12} /> COMBINE SHEET
                                                </button>
                                            )}
                                        </div>
                                        
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                            {assets.map((asset) => (
                                                <AssetCard 
                                                    key={asset.id} 
                                                    asset={asset} 
                                                    onRegenerate={handleRegenerate}
                                                    onEdit={handleOpenEdit}
                                                    onPreviewAnimation={(a) => {
                                                        setPreviewAsset(a);
                                                        setIsAnimModalOpen(true);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      {editingAsset && (
        <EditModal 
            asset={editingAsset}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onConfirmAI={handleConfirmEditAI}
            onSaveManual={handleSaveAsset}
            isProcessing={isEditingProcessing}
        />
      )}

      {previewAsset && (
        <AnimationModal 
            asset={previewAsset}
            isOpen={isAnimModalOpen}
            onClose={() => setIsAnimModalOpen(false)}
            onSave={handleSaveAsset}
        />
      )}

      {plan && (
        <GamePlayground 
            plan={plan}
            isOpen={isPlaygroundOpen}
            onClose={() => setIsPlaygroundOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
