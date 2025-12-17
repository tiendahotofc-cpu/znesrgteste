
import { GoogleGenAI, Type } from "@google/genai";
import { ProjectManifest, GameAsset } from "../types";

// Initialize Gemini Client
// IMPORTANT: The API key is injected via process.env.API_KEY
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * PHASE 1: THE INTERVIEW & PLANNING
 * Generates the JSON manifest and the Educational Game Design Doc.
 */
export const generateProjectPlan = async (userPrompt: string): Promise<ProjectManifest> => {
  const ai = getClient();
  
  const systemPrompt = `
    You are "O Cérebro do Sistema" (The System Brain), a Technical Art Director for retro SNES-style games.
    Your goal is to break down a user's game idea into a strict list of assets (Sprites, Tilesets, UI) and a Game Design Document.

    Rules:
    1. Organize assets into logical categories: 'Characters', 'Environment', 'UI'.
    2. Group related assets into 'entities' or 'groups'. For example, 'Player' group MUST contain:
       - Idle (The base concept)
       - Run (Movement)
       - Jump (Air action)
       - Crouch (Stealth/Dodge)
       - Roll (Dodge mechanic)
       - Attack/Shoot (Combat)
    3. Use strict naming conventions for filenames: [type]_[group]_[action]_strip[frames].png 
       Examples: 
       - spr_player_run_strip8.png (8 frames)
       - spr_player_shoot_strip4.png
       - tile_dungeon_floor.png (Static)
    4. Define a consistent color palette description (e.g., "Cyberpunk Neon: distinct magentas and cyans on dark/black backgrounds").
    5. Provide a "designDocs" section that explains *why* these assets are needed and how they fit together (educational tone).
    6. Limit the scope to a prototype: 1 Player (Full Moveset), 1 Enemy (Basic), 2-3 Tiles, 2 UI elements.
    7. Ensure 'description' for each asset is a high-quality image generation prompt for a pixel art model. 
       Use keywords like: "16-bit pixel art", "snes style", "white background", "sprite sheet", "horizontal strip".

    Output pure JSON structure matching the schema.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING },
          paletteDescription: { type: Type.STRING },
          designDocs: { type: Type.STRING },
          assets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                category: { type: Type.STRING, enum: ['Characters', 'Environment', 'UI'] },
                group: { type: Type.STRING, description: "The entity this belongs to, e.g., 'Player', 'Goblin'" },
                name: { type: Type.STRING },
                filename: { type: Type.STRING },
                description: { type: Type.STRING },
                metadata: {
                  type: Type.OBJECT,
                  properties: {
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER },
                    frames: { type: Type.NUMBER }
                  }
                }
              },
              required: ['id', 'category', 'name', 'filename', 'description']
            }
          }
        },
        required: ['theme', 'paletteDescription', 'designDocs', 'assets']
      }
    }
  });

  if (!response.text) {
    throw new Error("Failed to generate project plan.");
  }

  const data = JSON.parse(response.text);
  
  // Post-process to extract frame counts if Gemini didn't fill metadata perfectly
  const assetsWithStatus = data.assets.map((a: any) => {
    let frames = a.metadata?.frames || 1;
    
    // Try to extract frames from filename like "_strip8"
    const stripMatch = a.filename.match(/strip(\d+)/i);
    if (stripMatch && stripMatch[1]) {
        frames = parseInt(stripMatch[1], 10);
    }

    return {
        ...a,
        status: 'pending',
        metadata: {
            ...a.metadata,
            frames: frames
        }
    };
  });

  return {
    ...data,
    assets: assetsWithStatus
  };
};

/**
 * PHASE 2: THE FACTORY
 * Generates the actual pixel art images using Nano Banana models.
 * NOW SUPPORTS REFERENCE IMAGES FOR CONSISTENCY.
 */
export const generateAssetImage = async (asset: GameAsset, palette: string, referenceImageUrl?: string): Promise<string> => {
  const ai = getClient();
  
  // Enforce style consistency via prompt injection
  const fullPrompt = `
    Generate a pixel art image.
    Style: SNES 16-bit, retro game asset.
    Palette: ${palette}.
    Subject: ${asset.description}.
    ${referenceImageUrl ? "IMPORTANT: Use the attached image as the visual reference. Keep the exact same character design, colors, and proportions. Only change the pose/action." : ""}
    Constraint: White background (hex #FFFFFF) or Transparent. 
    Format: ${asset.metadata?.frames && asset.metadata.frames > 1 ? `Sprite sheet strip with ${asset.metadata.frames} frames arranged horizontally.` : 'Single sprite.'}
    Ensure crisp pixels, no anti-aliasing (nearest neighbor style).
  `;

  const contents: any = {};
  const parts: any[] = [];

  // If we have a reference image (e.g., the Master Concept), attach it
  if (referenceImageUrl) {
      const base64Data = referenceImageUrl.split(',')[1];
      const mimeType = referenceImageUrl.substring(referenceImageUrl.indexOf(':') + 1, referenceImageUrl.indexOf(';'));
      parts.push({
          inlineData: {
              mimeType: mimeType,
              data: base64Data
          }
      });
  }

  parts.push({ text: fullPrompt });
  contents.parts = parts;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Supports Multimodal inputs
      contents: contents,
    });

    // Extract image from response
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Asset generation error:", error);
    // Return a placeholder if generation fails to keep the flow going
    return `https://picsum.photos/64/64?grayscale&blur=2`; 
  }
};

/**
 * PHASE 3: THE REFINERY (EDITING)
 * Edits an existing asset based on a user prompt using Gemini 2.5 Flash Image.
 */
export const editAssetImage = async (currentImageUrl: string, userInstruction: string, originalDescription: string): Promise<string> => {
    const ai = getClient();

    // Clean base64 string
    const base64Data = currentImageUrl.split(',')[1];
    const mimeType = currentImageUrl.substring(currentImageUrl.indexOf(':') + 1, currentImageUrl.indexOf(';'));

    const fullPrompt = `
      Edit this pixel art image.
      Original Context: ${originalDescription}
      User Instruction: ${userInstruction}
      Style Constraints: Maintain SNES 16-bit pixel art style, crisp pixels, no anti-aliasing.
      Keep the background white/transparent if possible.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    },
                    { text: fullPrompt }
                ]
            }
        });

        if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("No image data found in response");
    } catch (error) {
        console.error("Asset edit error:", error);
        throw error;
    }
}
