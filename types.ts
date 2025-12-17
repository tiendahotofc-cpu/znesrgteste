
export enum AppPhase {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  REVIEW = 'REVIEW',
  CONCEPT = 'CONCEPT', // New Phase: Branding/Identity Check
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE'
}

export interface GameAsset {
  id: string;
  category: 'Characters' | 'Environment' | 'UI';
  group?: string; // e.g. "Player", "Enemy A", "Level 1"
  name: string; // Logical name e.g. "ninja_run"
  filename: string; // e.g., "spr_ninja_run_strip8.png"
  description: string; // The prompt for the image generation
  status: 'pending' | 'generating' | 'done' | 'error';
  imageUrl?: string;
  metadata?: {
    width?: number;
    height?: number;
    frames?: number;
  };
}

export interface ProjectManifest {
  theme: string;
  paletteDescription: string;
  designDocs: string; // The "Didactic" part
  assets: GameAsset[];
  masterStyleImage?: string; // The approved concept art used for consistency
}

export interface FolderNode {
  name: string;
  type: 'folder' | 'file';
  children?: FolderNode[];
  content?: string; // For text files or base64 images
  assetId?: string; // Link back to the asset if it's a generated file
}
