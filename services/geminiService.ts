import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { TargetLanguage, ThemeType, ThemeIntensity, GenderOption, ASOMode, ASOStyleSpecs, AspectRatio } from "../types";

let globalApiKey = '';

export const setGlobalApiKey = (key: string) => {
    globalApiKey = key;
};

const getAI = (specificKey?: string) => {
    let key = specificKey || globalApiKey;
    
    if (!key) {
        try {
            if (typeof process !== 'undefined' && process.env) {
                key = process.env.API_KEY || '';
            }
        } catch (e) {
            console.warn("Error accessing process.env", e);
        }
    }

    if (!key) {
        throw new Error("API Key not found. Please enter it in Settings or ensure process.env.API_KEY is set.");
    }
    return new GoogleGenAI({ apiKey: key });
};

// --- IMAGE OPTIMIZATION UTILS ---

// Helper to remove data:image/png;base64, prefix
const cleanBase64 = (dataUrl: string): string => {
  if (!dataUrl.includes(',')) return dataUrl;
  return dataUrl.split(',')[1];
};

const getMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  if (match && match.length > 1) {
    return match[1];
  }
  return 'image/png'; // Default
};

/**
 * CRITICAL FIX: Automatically resize and compress large images before sending to API.
 * This prevents "400 Invalid Input" and "400 Payload Too Large" errors.
 * It also standardizes file encoding to avoid issues with weird characters in filenames or headers.
 */
const processImageForGemini = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1568; // Gemini Vision optimal limit to avoid payload errors

            // Calculate new dimensions
            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = Math.round((height * MAX_SIZE) / width);
                    width = MAX_SIZE;
                } else {
                    width = Math.round((width * MAX_SIZE) / height);
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                resolve(dataUrl); // Fallback if context fails
                return;
            }

            // Draw and export as JPEG (more compatible/smaller than PNG for AI input)
            // Use white background for transparent PNGs converted to JPEG to avoid artifacts
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            // 0.9 quality is good balance
            const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            resolve(optimizedDataUrl);
        };
        
        img.onerror = () => {
            console.warn("Failed to optimize image, sending original.");
            resolve(dataUrl);
        };
        
        img.src = dataUrl;
    });
};

// Helper to determine the closest aspect ratio string from dimensions
const getClosestAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    const targets = [
        { id: '1:1', val: 1.0 },
        { id: '4:3', val: 4/3 },
        { id: '3:4', val: 3/4 },
        { id: '16:9', val: 16/9 },
        { id: '9:16', val: 9/16 },
        { id: '4:5', val: 0.8 },
        { id: '5:4', val: 1.25 }
    ];
    
    // Find the closest supported ratio
    const closest = targets.reduce((prev, curr) => 
        Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
    );
    
    return closest.id;
};

// Helper to race promise with abort signal
const waitFor = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
        const abortHandler = () => reject(new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', abortHandler);
        promise.then(
            res => {
                signal?.removeEventListener('abort', abortHandler);
                resolve(res);
            },
            err => {
                signal?.removeEventListener('abort', abortHandler);
                reject(err);
            }
        );
    });
};

const handleApiError = (error: any) => {
    // Try to extract a meaningful message from various error structures
    let msg = error.message || '';
    const details = JSON.stringify(error);

    // Deep check for 429 inside nested error objects which typical Google APIs return
    if (!msg && error.error) {
        msg = error.error.message || '';
    }
    
    // Check status code or message content
    if (
        msg.includes("429") || 
        details.includes('"code":429') || 
        error.status === 429 ||
        error?.error?.code === 429 ||
        details.includes('RESOURCE_EXHAUSTED')
    ) {
        return new Error("Hết Quota (429): Quá giới hạn request.");
    }
    
    if (msg.includes("403") || details.includes('"code":403')) return new Error("Lỗi Quyền (403): Kiểm tra API Key hoặc Billing.");
    if (msg.includes("400") || details.includes('"code":400')) return new Error("Lỗi Request (400): Ảnh quá lớn hoặc lỗi định dạng. Hệ thống đã tự động fix, vui lòng thử lại.");
    
    return new Error(msg || "Lỗi xử lý API không xác định.");
};

// --- CHAT BOT (Gemini 3.0 Pro) ---
export const createChatSession = () => {
    const ai = getAI();
    return ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: {
            systemInstruction: "You are a helpful and intelligent AI assistant powered by Gemini 3.0 Pro. Provide clear, concise, and helpful answers.",
        }
    });
};

// --- IMAGE EDITING (Gemini 3.0 Pro Image Preview) ---
export const editImage = async (
    base64OrDataUrl: string, 
    prompt: string, 
    guideImageBase64OrDataUrl?: string
) => {
    const ai = getAI();
    
    // Optimize inputs
    const optimizedMain = await processImageForGemini(base64OrDataUrl);
    let base64Data = cleanBase64(optimizedMain);
    let mimeType = getMimeType(optimizedMain);
    
    const parts: any[] = [
        { inlineData: { data: base64Data, mimeType: mimeType } }
    ];

    let finalPrompt = prompt;

    if (guideImageBase64OrDataUrl) {
        const optimizedGuide = await processImageForGemini(guideImageBase64OrDataUrl);
        const guideB64 = cleanBase64(optimizedGuide);
        const guideMime = getMimeType(optimizedGuide);
        parts.push({ inlineData: { data: guideB64, mimeType: guideMime } });
        finalPrompt = `${prompt}. Use the second image as a visual guide/reference for this edit.`;
    }

    parts.push({ text: finalPrompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview', // Force 3.0 Pro for editing
            contents: { parts },
            config: {
                imageConfig: { imageSize: "1K" }
            }
        });

        let resultText = "";
        let resultImageBase64 = undefined;

        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.text) {
                    resultText += part.text;
                } else if (part.inlineData) {
                    resultImageBase64 = part.inlineData.data;
                }
            }
        }
        
        return { text: resultText, imageBase64: resultImageBase64 };
    } catch (error: any) {
        console.error("Edit Image Error:", error.message || error);
        throw handleApiError(error);
    }
};

// --- SEARCH GROUNDING (Gemini 2.5 Flash) ---
export const searchGrounding = async (query: string) => {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: query,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        return {
            text: response.text,
            groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
        };
    } catch (error: any) {
        console.error("Search Error:", error.message || error);
        throw handleApiError(error);
    }
};

// --- THINKING CHAT ---
export const thinkingChat = async (prompt: string) => {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 1024 }
            }
        });
        return response.text;
    } catch (error: any) {
        console.error("Thinking Error:", error.message || error);
        throw handleApiError(error);
    }
};

// --- PROMPT SUGGESTIONS / BREAKDOWN (Gemini 2.5 Flash) ---
export const generatePromptSuggestions = async (
    basePrompt: string, 
    count: number, 
    mediaB64?: string, 
    mimeType?: string,
    signal?: AbortSignal
) => {
    const ai = getAI();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
        const parts: any[] = [];
        let systemPrompt = "";

        if (mediaB64 && mimeType) {
            // --- IMAGE + TEXT LOGIC ---
            // If image is present, the prompt must analyze the image style/content 
            // AND apply the text modifications (gender, scene, etc.)
            
            // Optimize image just in case
            const rawUrl = `data:${mimeType};base64,${mediaB64}`;
            const optimized = await processImageForGemini(rawUrl);
            parts.push({ inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } });

            systemPrompt = `
            You are a World-Class AI Creative Director.
            
            INPUT CONTEXT:
            1. REFERENCE IMAGE (Uploaded): Source of Art Style, Lighting, Composition, and General Vibe.
            2. USER REQUEST: "${basePrompt}" (Instructions for modification).

            YOUR TASK:
            Generate ${count} distinct, HIGH-FIDELITY image prompts that:
            1. **INHERIT THE VISUAL STYLE**: Strictly keep the lighting, brushwork, camera angle, and "feel" of the Reference Image.
            2. **APPLY USER CHANGES**: Modify the subject (gender, age), outfit, or background EXACTLY as requested in the User Request.
            
            CRITICAL LOGIC:
            - If the user says "female version", describe a subject with the SAME pose/style as the image, but FEMALE.
            - If the user says "in a forest", keep the subject style but describe a FOREST background.
            - If the user request is empty, just describe variations of the image itself.

            OUTPUT FORMAT:
            Return ONLY a JSON array of strings. Each string is a full, detailed prompt.
            `;
            
            parts.push({ text: `Generate ${count} variations based on this image and this instruction: "${basePrompt}"` });

        } else {
            // --- TEXT ONLY LOGIC ---
            systemPrompt = `
            You are a World-Class AI Art Director & Prompt Engineer.
            Your task: Transform the user's simple idea into ${count} HIGH-FIDELITY, PHOTOREALISTIC visual descriptions.

            INPUT IDEA: "${basePrompt}"

            FOR EACH VARIATION, YOU MUST DEFINE:
            1. **SUBJECT**: Detailed appearance (age, clothes, expression, pose).
            2. **ENVIRONMENT**: Specific location, background details, depth of field.
            3. **LIGHTING**: Cinematic lighting (e.g., "Rembrandt lighting", "soft window light", "neon rim light", "volumetric fog").
            4. **CAMERA**: Lens type (e.g., "85mm portrait lens", "wide angle"), f-stop (e.g., "f/1.8").
            5. **QUALITY**: Keywords like "8k resolution", "highly detailed texture", "masterpiece".

            Return ONLY a JSON array of these detailed prompt strings.
            `;
            parts.push({ text: basePrompt ? `Base idea: ${basePrompt}` : "Generate creative variations." });
        }

        const requestPromise = ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        const response = await waitFor(requestPromise, signal) as GenerateContentResponse;

        const text = response.text;
        if (!text) return [];
        return JSON.parse(text) as string[];
    } catch (error: any) {
        console.error("Suggestion Error:", error.message || error);
        throw handleApiError(error);
    }
};

export const generateDistinctPrompts = async (
    baseIdea: string,
    count: number,
    gender: GenderOption,
    signal?: AbortSignal
): Promise<string[]> => {
    const ai = getAI();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const genderInstruction = gender === 'MALE' 
        ? "CONSTRAINT: ALL subjects must be MALE."
        : gender === 'FEMALE' 
            ? "CONSTRAINT: ALL subjects must be FEMALE."
            : "If the idea implies diversity, include a mix of genders/ages as requested.";

    const systemPrompt = `
        You are a Visual Prompt Engineer specializing in image generation.
        Your task: Transform the user's idea into ${count} DISTINCT, DETAILED, and HIGH-QUALITY visual prompts.
        
        USER IDEA: "${baseIdea}"
        
        REQUIREMENTS:
        1. **DIVERSITY**: Each prompt MUST describe a DIFFERENT subject/character if the user implies plurality (e.g. "doctors", "people"). Vary Age, Ethnicity, Hair Style, and Expression. 
           - Do not repeat the same person ${count} times.
        2. **DETAIL**: Do not use short phrases. Expand with visual descriptors:
           - Lighting (e.g. "cinematic", "soft morning light")
           - Atmosphere (e.g. "sterile", "cozy", "futuristic")
           - Camera (e.g. "portrait shot", "wide angle")
        3. **GENDER CONSTRAINT**: ${genderInstruction}
        
        Example Input: "old doctors" (Count: 2)
        Example Output: 
        [
          "A close-up portrait of a wise elderly Asian male doctor with silver hair, wearing a stethoscope, warm smile, soft hospital lighting, bokeh background, highly detailed.",
          "A serious senior female doctor with glasses examining a chart, standing in a busy emergency room, cool blue cinematic lighting, sharp focus, 8k resolution."
        ]
        
        Return ONLY a JSON array of strings.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `Idea: "${baseIdea}"` }] },
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });
        
        const text = response.text;
        if (!text) return Array(count).fill(baseIdea);
        const parsed = JSON.parse(text) as string[];
        
        // Fill if not enough
        while (parsed.length < count) {
            parsed.push(parsed[0] || baseIdea);
        }
        return parsed.slice(0, count);

    } catch (error) {
        console.error("Distinct Prompt Gen Error:", error);
        if (handleApiError(error).message.includes("Quota")) throw handleApiError(error);
        return Array(count).fill(baseIdea);
    }
};

// --- BATCH GENERATION ---
export const generateBatchVariation = async (
    prompt: string,
    aspectRatio: string,
    model: string,
    mode: 'VARIATION' | 'MOCKUP' | 'TEXT_TO_IMAGE',
    refImageB64?: string,
    refMimeType?: string,
    targetImageB64?: string,
    targetMimeType?: string,
    mockupType?: string,
    faceImageB64?: string,
    faceMimeType?: string,
    signal?: AbortSignal,
    gender?: GenderOption,
    modifyBackground?: boolean
) => {
    const ai = getAI();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
        const parts: any[] = [];
        
        let styleRefIndex = 0;
        let faceRefIndex = 0;
        let mockupSourceIndex = 0;
        let mockupTargetIndex = 0;
        let currentIndex = 1;

        if (mode === 'VARIATION' || mode === 'TEXT_TO_IMAGE') {
            if (refImageB64 && refMimeType) {
                // IMPORTANT: Since we receive raw b64 from App.tsx, we must optimize it here if it's too big
                // For simplicity, we assume the inputs passed here are raw and need optimization.
                // However, optimization is async.
                // Let's optimize BEFORE adding to parts
                // Reconstruct data url to optimize
                const rawDataUrl = `data:${refMimeType};base64,${refImageB64}`;
                const optimizedRef = await processImageForGemini(rawDataUrl);
                
                parts.push({ inlineData: { data: cleanBase64(optimizedRef), mimeType: getMimeType(optimizedRef) } });
                styleRefIndex = currentIndex++;
            }
            if (faceImageB64 && faceMimeType) {
                const rawDataUrl = `data:${faceMimeType};base64,${faceImageB64}`;
                const optimizedFace = await processImageForGemini(rawDataUrl);
                parts.push({ inlineData: { data: cleanBase64(optimizedFace), mimeType: getMimeType(optimizedFace) } });
                faceRefIndex = currentIndex++;
            }
        } else if (mode === 'MOCKUP') {
             if (refImageB64 && refMimeType) {
                 const rawDataUrl = `data:${refMimeType};base64,${refImageB64}`;
                 const optimizedRef = await processImageForGemini(rawDataUrl);
                 parts.push({ inlineData: { data: cleanBase64(optimizedRef), mimeType: getMimeType(optimizedRef) } });
                 mockupSourceIndex = currentIndex++;
             }
             if (targetImageB64 && targetMimeType) {
                 const rawDataUrl = `data:${targetMimeType};base64,${targetImageB64}`;
                 const optimizedTarget = await processImageForGemini(rawDataUrl);
                 parts.push({ inlineData: { data: cleanBase64(optimizedTarget), mimeType: getMimeType(optimizedTarget) } });
                 mockupTargetIndex = currentIndex++;
             }
        }

        let finalPrompt = prompt;

        if (mode === 'TEXT_TO_IMAGE') {
            // DIRECT GENERATION LOGIC: Use raw prompt, no wrapper
            if (styleRefIndex > 0) {
                 // IMAGE-TO-IMAGE / EDIT BY PROMPT logic
                 finalPrompt = `TRANSFORM THIS IMAGE: ${prompt}. \n\nINSTRUCTION: Keep the composition but change the style/content according to the prompt strictly.`;
            } else {
                 finalPrompt = prompt;
            }
        } else if (mode === 'VARIATION') {
            let modifiers = [];
            
            if (gender && gender !== 'ORIGINAL') {
                modifiers.push(`CONSTRAINT: Subject MUST be ${gender}.`);
            }
            if (modifyBackground) {
                modifiers.push(`CHANGE BACKGROUND: Adapt background to fit the new subject context (but keep lighting consistent).`);
            } else {
                modifiers.push(`LOCK BACKGROUND: Keep the exact background/environment of the Reference Image. Do not change the scene.`);
            }

            // STRICT ANATOMY & STRUCTURE PROMPT
            const qualityControl = "FINAL CHECK: Ensure hands, fingers, and limbs are anatomically correct. No extra limbs. No distorted faces.";
            
            if (styleRefIndex > 0) {
                // LOCK & SWAP LOGIC (Strict)
                finalPrompt = `
                ROLE: Expert Image Editor & Compositor.
                
                INPUTS:
                1. REFERENCE IMAGE (Image ${styleRefIndex}): This is the "Visual Template".
                2. USER INSTRUCTION: "${prompt}". This is the "New Subject".
                
                TASK: "LOCK & SWAP"
                1. **LOCK (DO NOT CHANGE)**: 
                   - Camera Angle & Composition (Subject placement must match).
                   - Lighting Direction & Quality (Shadows, highlights).
                   - Color Palette & Grading.
                   - Background Details (Furniture, walls, scenery).
                2. **SWAP (CHANGE ONLY THIS)**:
                   - Replace the person/subject in the Reference with: "${prompt}".
                   - Keep the pose similar if possible, but adapt to the new subject's physiology.
                   
                ${modifiers.join('\n')}
                
                ${qualityControl}
                `;
            }
        }
        
        parts.push({ text: finalPrompt });

        const imageConfig: any = { aspectRatio: aspectRatio };
        if (model === 'gemini-3-pro-image-preview') imageConfig.imageSize = "1K"; 

        const requestPromise = ai.models.generateContent({
            model: model,
            contents: { parts },
            config: { imageConfig }
        });

        const response = await waitFor(requestPromise, signal) as GenerateContentResponse;

        let imageBase64 = null;
        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    imageBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (!imageBase64) throw new Error("No image generated");
        return imageBase64;

    } catch (error: any) {
        console.error("Batch Gen Error (Clean):", error.message);
        throw handleApiError(error);
    }
};

// --- LOCALIZE AI SERVICES ---

export const localizeImage = async (
  imageDataUrl: string, 
  targetLanguage: TargetLanguage,
  correctionNotes?: string,
  customPrompt?: string,
  deepLocalize?: boolean
): Promise<string> => {
  const ai = getAI();
  
  // FIX: Optimize image before processing to avoid 400 error
  // Optimization logic might resize the image, changing dimensions.
  // We need to calculate aspect ratio from the INPUT image (or the optimized one, ratio should remain similar).
  
  // Get Input Image Dimensions for Aspect Ratio
  const tempImg = new Image();
  tempImg.src = imageDataUrl;
  await new Promise((resolve) => { tempImg.onload = resolve; });
  const detectedRatio = getClosestAspectRatio(tempImg.width, tempImg.height);
  
  const optimizedImage = await processImageForGemini(imageDataUrl);
  const base64Data = cleanBase64(optimizedImage);
  const mimeType = getMimeType(optimizedImage);

  let prompt = deepLocalize 
    ? `Localize deeply for ${targetLanguage} market. Translate text and ADAPT visuals (people, culture, currency) to match ${targetLanguage} demographics.`
    : `Localize image. Translate all visible text to ${targetLanguage}. Maintain original font, color, background. Only replace text content.`;

  if (customPrompt && customPrompt.trim()) prompt += `\n\nUSER INSTRUCTIONS: ${customPrompt}`;
  if (correctionNotes) prompt += `\n\nCORRECTION: Previous errors: ${correctionNotes}. Fix these.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType } },
          { text: prompt },
        ],
      },
      // Pass the detected aspect ratio to ensure output matches input shape
      config: { 
          imageConfig: { 
              imageSize: "2K",
              aspectRatio: detectedRatio 
          } 
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data found");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw handleApiError(error);
  }
};

export const checkSpelling = async (
  imageDataUrl: string,
  targetLanguage: TargetLanguage
): Promise<{ hasErrors: boolean; errors: string[] }> => {
  const ai = getAI();
  
  // Optimization here too for spelling check
  const optimizedImage = await processImageForGemini(imageDataUrl);
  const base64Data = cleanBase64(optimizedImage);
  const mimeType = getMimeType(optimizedImage);

  const prompt = `Analyze text in this image (${targetLanguage}). Identify spelling/grammar errors. Ignore brand names. Return JSON { "hasErrors": boolean, "errors": string[] }. Describe errors in VIETNAMESE.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasErrors: { type: Type.BOOLEAN },
            errors: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    return JSON.parse(response.text || '{"hasErrors": false, "errors": []}');
  } catch (error) {
    console.warn("Spelling check failed:", error);
    return { hasErrors: false, errors: [] };
  }
};

// --- THEME CHANGER SERVICE ---

export const extractStyleDescription = async (
    imageDataUrl: string
): Promise<string> => {
    const ai = getAI();
    // Optimize for Vision analysis
    const optimizedImage = await processImageForGemini(imageDataUrl);
    const base64Data = cleanBase64(optimizedImage);
    const mimeType = getMimeType(optimizedImage);

    const prompt = `
    Analyze this 'Master Design' image for an App Store Screenshot or Icon.
    Extract the following visual style elements to create a consistent design language:
    1. PHONE MOCKUP (if present): Describe the frame style, bezel color, shadows, 3D angle.
    2. BACKGROUND: Describe the texture, color gradient, pattern, or environment.
    3. DECORATIONS: Describe any 3D floating icons, seasonal elements (e.g. snow, ribbons), or lighting effects.
    4. TEXT BOXES/TAGS: Describe the shape, color, and transparency of text containers.
    
    Output a concise paragraph describing these "Style Rules".
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Use Flash for fast vision analysis
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: mimeType } },
                    { text: prompt }
                ]
            }
        });
        return response.text || "Modern vibrant style";
    } catch (error) {
        console.warn("Style extraction failed, using default.");
        return "Consistent theme style";
    }
};

export const transformImageTheme = async (
    originalImageData: string,
    theme: string,
    type: ThemeType,
    intensity: ThemeIntensity = 'MEDIUM',
    userPrompt?: string,
    styleReferenceImageData?: string,
    explicitStyleDescription?: string
): Promise<string> => {
    const ai = getAI();
    
    // Optimize Input
    const optimizedMain = await processImageForGemini(originalImageData);
    const base64Data = cleanBase64(optimizedMain);
    const mimeType = getMimeType(optimizedMain);
    
    const parts: any[] = [
        { inlineData: { data: base64Data, mimeType: mimeType } }
    ];

    let intensityInstruction = "";
    switch (intensity) {
        case 'LOW':
            intensityInstruction = "INTENSITY: LOW. Make very subtle changes. Strictly preserve the original structure. Only adjust colors/decorations.";
            break;
        case 'HIGH':
            intensityInstruction = "INTENSITY: HIGH. Creative freedom allowed for decorations and background, but MUST preserve main UI content.";
            break;
        default: // MEDIUM
            intensityInstruction = "INTENSITY: MEDIUM. Balance creativity with structure.";
            break;
    }

    let prompt = "";

    if (styleReferenceImageData && explicitStyleDescription) {
        // Advanced Mode: Explicit Style Guide Logic
        const optimizedRef = await processImageForGemini(styleReferenceImageData);
        const refB64 = cleanBase64(optimizedRef);
        const refMime = getMimeType(optimizedRef);
        parts.push({ inlineData: { data: refB64, mimeType: refMime } });

        prompt = `
        TASK: APPLY STYLE CONSISTENCY.
        You have an INPUT IMAGE (Image 1) and a MASTER STYLE REFERENCE (Image 2).
        
        MASTER STYLE GUIDE:
        ${explicitStyleDescription}

        INSTRUCTIONS:
        1. ANALYZE INPUT IMAGE (Image 1): Check for specific elements (Phone Mockup, Text Boxes, Background).
        2. CONDITIONAL APPLICATION:
           - IF Input has a Phone Mockup: You MUST apply the 'Phone Mockup' style described in the Guide (border, angle, shadow).
           - IF Input has Text Boxes: Apply the 'Text Box' style from the Guide.
           - IF Input has NO Phone: Apply the 'Background' and 'Decorations' from the Guide.
           - IF elements don't match exactly: Adapt the 'Decorations' and 'Color Palette' to fit the input's layout.
        
        Theme: ${theme}.
        ${intensityInstruction}
        `;

    } else if (styleReferenceImageData) {
        // Fallback or Basic Mode
        const optimizedRef = await processImageForGemini(styleReferenceImageData);
        const refB64 = cleanBase64(optimizedRef);
        const refMime = getMimeType(optimizedRef);
        parts.push({ inlineData: { data: refB64, mimeType: refMime } });
        
        prompt = `You have an input image (Image 1) and a Style Reference (Image 2).
        Task: Redesign Image 1 to match the visual style, color palette, and atmosphere of Image 2.
        Theme: ${theme}.
        ${intensityInstruction}
        `;
    } else {
        // First Image Generation
        prompt = `Task: Redesign this image for the '${theme}' theme/holiday.
        ${intensityInstruction}
        `;
    }

    if (userPrompt && userPrompt.trim()) {
        prompt += `\nADDITIONAL USER REQUIREMENTS: ${userPrompt}\n`;
    }

    if (type === 'SCREENSHOT') {
        prompt += `
        CRITICAL UI RULES:
        1. PRESERVE LAYOUT: Keep buttons, text fields, and lists in their EXACT positions.
        2. DECORATION: Add theme elements (e.g. snow, pumpkins) in empty spaces or background.
        3. Do not distort the main app interface.
        `;
    } else {
        prompt += `
        APP ICON RULES:
        1. Keep central logo/character shape recognizable.
        2. Apply theme textures and lighting (3D render style).
        `;
    }

    parts.push({ text: prompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: { imageConfig: { imageSize: "1K" } }
        });

        if (response.candidates && response.candidates[0].content.parts) {
             for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        throw new Error("No theme image generated");

    } catch (error) {
        console.error("Theme Transform Error:", error);
        throw handleApiError(error);
    }
};

// --- ASO ARCHITECT SERVICE ---

export const generateASOScreenshot = async (
    mode: ASOMode,
    userPrompt: string,
    uiImageB64?: string,
    styleRefB64?: string,
    customSpecs?: ASOStyleSpecs
): Promise<string> => {
    const ai = getAI();
    const parts: any[] = [];
    
    // Add images to parts based on logic
    let styleRefIndex = 0;
    let uiImageIndex = 0;
    let imageCounter = 1;

    if (styleRefB64) {
        // Assume inputs here are raw B64, so construct data URL and optimize
        const rawUrl = `data:image/png;base64,${styleRefB64}`;
        const optimized = await processImageForGemini(rawUrl);
        parts.push({ inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } });
        styleRefIndex = imageCounter++;
    }
    
    if (uiImageB64) {
        const rawUrl = `data:image/png;base64,${uiImageB64}`;
        const optimized = await processImageForGemini(rawUrl);
        parts.push({ inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } });
        uiImageIndex = imageCounter++;
    }

    const defaultSpecs = {
         device: "iPhone 17 Pro Max (Titanium Frame, Thin Bezels) OR Samsung S25 Ultra",
         ratio: "9:16 (Portrait)",
         style: 'Modern, Clean, High-End Tech, "2.5D Pop-out" effect (UI elements floating slightly)',
         decor: "Minimalist (1-2 icons max)"
    };

    const finalSpecs = customSpecs || defaultSpecs;

    // Decor logic injection
    let decorStrategy = "";
    if (!finalSpecs.decor || finalSpecs.decor.toLowerCase().includes("minimalist")) {
        decorStrategy = "STRATEGY: FOCUS ON UI EMPHASIS. Do not add external floating 3D icons unless absolutely necessary. Instead, make the UI itself pop out, add subtle glow, 3D tilt, or zoom into key features to highlight functionality.";
    } else {
        decorStrategy = `STRATEGY: Add decorations as specified: ${finalSpecs.decor}`;
    }

    const baseSystemInstruction = `
    ROLE: You are an expert ASO (App Store Optimization) Architect and Senior Art Director.
    GOAL: Create high-conversion App Store/Google Play screenshots that look like PREMIUM, COMMERCIAL-GRADE MARKETING ASSETS.
    
    DEFAULT LANGUAGE: ENGLISH (Unless the user explicitly asks for another language in the prompt).
    
    VISUAL QUALITY RULES (CRITICAL):
    1. **LIGHTING**: Use professional studio lighting or cinematic lighting. Soft shadows, ambient occlusion, and subtle rim lighting to make elements pop.
    2. **TEXTURES**: UI elements should look tactile—use subtle glassmorphism (frosted glass), matte finishes, or glossy accents where appropriate.
    3. **CLARITY**: Text and UI components must be crisp and legible (Retina Display quality).
    4. **DEPTH**: Use "2.5D Pop-out" techniques—elements floating slightly above the screen, layered compositions, and depth of field to draw focus.
    
    DEFAULT SPECS:
    1. VIEW: Front View (Symmetrical, Flat Lay) or slightly angled if specified for drama.
    2. DEVICE MOCKUP: ${finalSpecs.device}. Render with high-quality reflection and material properties.
    3. STYLE: ${finalSpecs.style}.
    4. ASPECT RATIO: ${finalSpecs.ratio}.
    5. LAYOUT: Caption usually at the TOP (Bold, Sans-serif, High Contrast). Device in center/bottom.
    6. ${decorStrategy}
    
    VISUAL ENHANCEMENT INSTRUCTION:
    - You MUST fill in missing visual details. If the user gives a short prompt (e.g., "camera translate"), you must hallucinate a high-end visualization: "A sleek camera interface scanning a restaurant menu, with augmented reality text overlays glowing in neon blue, soft bokeh background of a cafe."
    `;

    let specificPrompt = "";

    switch (mode) {
        case 'NEW':
            specificPrompt = `
            MODE: A (NEW CREATION).
            INPUT: User Prompt: "${userPrompt}".
            
            TASK: 
            1. **CONCEPTUALIZE**: Invent a modern, beautiful UI for this app concept. It should look like a real, top-tier app on the App Store.
            2. **COLOR PSYCHOLOGY**: Choose a color palette that fits the industry (e.g., Trust Blue for Finance, Energetic Orange for Fitness).
            3. **CAPTION**: Create a catchy 2-5 word Headline/Caption (ENGLISH DEFAULT) at the top. Use a modern font.
            4. **MOCKUP**: Wrap the invented UI in the high-end phone mockup.
            5. **EXECUTION**: Render with the "VISUAL QUALITY RULES" defined above.
            `;
            break;

        case 'FROM_UI':
            specificPrompt = `
            MODE: B (FROM UI).
            INPUT: User Prompt: "${userPrompt}".
            REFERENCE: Image ${uiImageIndex} is the ACTUAL APP UI.
            
            TASK:
            1. **INTEGRATION**: Use Image ${uiImageIndex} as the screen content inside the phone mockup. 
               - **IMPORTANT**: Ensure the UI looks like it is displayed on a high-res screen (add subtle screen reflection/glare).
            2. **ENHANCEMENT**: Apply the 'Visual Rules' (iPhone 17 frame, Front View, Modern BG).
            3. **CONTEXT**: Analyze the UI to understand the feature. Create a relevant Caption (ENGLISH DEFAULT) and background environment that matches the UI colors.
            4. **FOCUS**: Use the prompt "${userPrompt}" to decide what to highlight (e.g., Zoom in on a button, add a glow to a chart).
            `;
            break;

        case 'SYNC':
             specificPrompt = `
            MODE: C (VARIATION & SYNC).
            INPUT: User Prompt: "${userPrompt}".
            REFERENCE 1: Image ${styleRefIndex} is the STYLE MASTER (Existing Screenshot).
            ${uiImageIndex > 0 ? `REFERENCE 2: Image ${uiImageIndex} is the NEW UI content.` : ''}
            
            TASK:
            1. **CONSISTENCY**: Create a NEW screenshot that looks exactly like part of the same set as Image ${styleRefIndex}.
            2. **COPY ATTRIBUTES**:
               - Background color/gradient/pattern.
               - Phone Angle & Device Model.
               - Font Style & Position.
               - Shadow Intensity & Lighting Direction.
            3. **CONTENT**: 
               - If Image ${uiImageIndex} exists, use it inside the phone screen.
               - If not, invent a UI relevant to the prompt "${userPrompt}" that matches the visual language of the Style Master.
            4. **EXECUTION**: Follow the "VISUAL QUALITY RULES" defined above.
            `;
            break;
    }

    parts.push({ text: baseSystemInstruction + "\n" + specificPrompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview', // High quality model for ASO
            contents: { parts },
            config: { 
                imageConfig: { 
                    aspectRatio: "9:16", // Default ASO Ratio
                    imageSize: "2K" // 2K Resolution
                } 
            }
        });

        if (response.candidates && response.candidates[0].content.parts) {
             for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        throw new Error("No ASO image generated");

    } catch (error) {
        console.error("ASO Gen Error:", error);
        throw handleApiError(error);
    }
};

// --- AI FUSION SERVICE ---

export const generateFusionImage = async (
    styleImageB64: string,
    contentImageB64: string,
    userPrompt: string,
    aspectRatio: AspectRatio
): Promise<string> => {
    const ai = getAI();
    
    // Optimize inputs
    const optimizedStyle = await processImageForGemini(styleImageB64);
    const styleData = cleanBase64(optimizedStyle);
    const styleMime = getMimeType(optimizedStyle);

    const optimizedContent = await processImageForGemini(contentImageB64);
    const contentData = cleanBase64(optimizedContent);
    const contentMime = getMimeType(optimizedContent);

    // STRONG NEGATIVE CONSTRAINTS PROMPT
    const systemPrompt = `
    ROLE: Elite Digital Artist & Style Transfer Specialist.
    TASK: Generate a high-quality artwork by STRICTLY fusing the *Visual Style* of Image A with the *Structural Composition* of Image B.

    INPUTS:
    1. IMAGE A (Style Reference): Source of colors, lighting, texture, and brushwork.
    2. IMAGE B (Content Reference): Source of subject, pose, and layout.
    3. PROMPT: "${userPrompt}" (Creative Direction).

    STRICT EXECUTION RULES:

    ► PHASE 1: STYLE EXTRACTION (Image A)
    - EXTRACT: The artistic medium (oil, watercolor, neon 3D, etc.), color palette, lighting scheme, and texture.
    - IGNORE: The actual objects, people, or text in Image A. 
    - NEGATIVE CONSTRAINT: Do NOT copy any specific element (e.g., a face, a tree) from Image A into the result.

    ► PHASE 2: CONTENT ABSTRACTION (Image B)
    - EXTRACT: The "Wireframe" or "Skeleton" of the scene (composition, pose, perspective).
    - IGNORE: The original pixel details, colors, and lighting of Image B.
    - RE-RENDER: Do not simply filter Image B. You must REDRAW the subject of Image B from scratch using the technique of Image A.

    ► PHASE 3: FUSION
    - The result must look like the artist of Image A painted the subject of Image B.
    - The output must be a single, cohesive image. NO COLLAGE.
    `;

    const parts = [
        { inlineData: { data: styleData, mimeType: styleMime } },
        { inlineData: { data: contentData, mimeType: contentMime } },
        { text: systemPrompt }
    ];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                temperature: 0.9, // Creative freedom
                imageConfig: {
                    aspectRatio: aspectRatio === 'Auto' ? '1:1' : aspectRatio,
                    imageSize: "1K"
                }
            }
        });

        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
               if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
           }
        }
        throw new Error("No fusion image generated");

    } catch (error: any) {
        console.error("Fusion Gen Error:", error);
        throw handleApiError(error);
    }
};