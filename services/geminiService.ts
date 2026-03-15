import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { TargetLanguage, ThemeType, ThemeIntensity, GenderOption, ASOMode, ASOStyleSpecs, AspectRatio } from "../types";

let globalApiKey = '';

export const setGlobalApiKey = (key: string) => {
    globalApiKey = key;
};

const getAI = (specificKey?: string) => {
    let key = specificKey || process.env.GEMINI_API_KEY || globalApiKey || '';

    if (!key) {
        throw new Error("API Key not configured. Set GEMINI_API_KEY in environment variables.");
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
        { id: '4:3', val: 4 / 3 },
        { id: '3:4', val: 3 / 4 },
        { id: '16:9', val: 16 / 9 },
        { id: '9:16', val: 9 / 16 },
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

// --- MAGIC EDIT CHAT (Multi-turn Gemini-style conversation with images) ---
export interface ChatTurn {
    role: 'user' | 'model';
    text?: string;
    imageDataUrl?: string; // data:image/...;base64,...
}

export const magicEditChat = async (
    history: ChatTurn[],
    newMessage: string,
    newImageDataUrl?: string
): Promise<{ text: string; imageBase64?: string }> => {
    const ai = getAI();

    // Build proper multi-turn contents for Gemini
    // Send up to 3 most recent images from history + text context from last 8 turns
    const contents: any[] = [];
    const recentHistory = history.slice(-8);

    // Collect up to 3 most recent images (for style reference memory)
    const MAX_IMAGES = 3;
    const imageIndices: number[] = [];
    for (let i = recentHistory.length - 1; i >= 0 && imageIndices.length < MAX_IMAGES; i--) {
        if (recentHistory[i].imageDataUrl) {
            imageIndices.unshift(i); // keep order
        }
    }

    // Build conversation turns
    for (let i = 0; i < recentHistory.length; i++) {
        const turn = recentHistory[i];
        const parts: any[] = [];

        // Include image if it's one of the 3 most recent images
        if (turn.imageDataUrl && imageIndices.includes(i)) {
            try {
                const optimized = await processImageForGemini(turn.imageDataUrl);
                parts.push({ inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } });
            } catch (e) {
                console.warn('Failed to process history image, skipping');
            }
        }

        // Include text
        if (turn.text) {
            parts.push({ text: turn.text });
        }

        if (parts.length > 0) {
            contents.push({ role: turn.role, parts });
        }
    }

    // Add new user message
    const newParts: any[] = [];
    if (newImageDataUrl) {
        const optimized = await processImageForGemini(newImageDataUrl);
        newParts.push({ inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } });
    }
    newParts.push({ text: newMessage });
    contents.push({ role: 'user', parts: newParts });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: contents,
            config: {
                systemInstruction: `You are Magic Edit — a creative AI image editor and assistant.

CAPABILITIES:
• Edit images based on user instructions (style changes, object edits, color changes, etc.)
• Generate new images from text descriptions
• Answer questions about images or creative topics
• Apply style from one image to another when given multiple images
• Remember and reference ALL images from the conversation — users may ask you to combine styles or elements from different images shared earlier

RULES:
• When editing an image, preserve the original composition unless explicitly asked to change it
• If an image is provided with instructions, edit it and return the modified image
• If no image is provided, generate a new image or answer the text question
• When user references "previous image" or "the first image", look at earlier images in the conversation
• Be concise in text responses — let the images speak
• If the edit fails or is unclear, explain what went wrong briefly`,
                imageConfig: { imageSize: "1K" }
            }
        });

        let resultText = "";
        let resultImageBase64: string | undefined;

        if (response.candidates && response.candidates[0]?.content?.parts) {
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
        console.error("Magic Edit Chat Error:", error.message || error);
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

// --- ANALYZE IMAGE FOR SMART STYLE SUGGESTIONS ---
export const analyzeImageForStyles = async (
    imageB64: string,
    mimeType: string,
    userContext?: string,
): Promise<{ emoji: string; label: string; prompt: string }[]> => {
    const ai = getAI();
    try {
        const rawUrl = `data:${mimeType};base64,${imageB64}`;
        const optimized = await processImageForGemini(rawUrl);

        const contextClause = userContext?.trim()
            ? `\n\nUSER DIRECTION: "${userContext}"\nThe user has specified a direction. You MUST tailor ALL suggestions to match this direction.\nExamples:\n- "châu Âu" or "European" → suggest SPECIFIC European country styles: French Parisian, Italian Tuscan, Spanish Mediterranean, English Victorian, Scandinavian, Greek Aegean, German Bauhaus, Dutch Colonial\n- "châu Á" or "Asian" → suggest SPECIFIC Asian country styles: Japanese Wabi-Sabi, Chinese Ming Dynasty, Korean Hanok, Vietnamese Colonial, Thai Royal, Indian Mughal, Balinese Tropical, Moroccan Riad\n- "hiện đại" or "modern" → suggest specific modern movements: Bauhaus, Memphis, Brutalist, Deconstructivist, High-Tech, Organic Modern, Neo-Futurism, Smart Home\n- Any other direction → interpret and suggest the most relevant specific sub-styles\n\nDo NOT suggest styles outside the user's direction. Every suggestion must be a SPECIFIC variant within the directed category.`
            : '';

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } },
                    { text: `Analyze this image and suggest 8 distinct style variations.${userContext ? ` User wants: "${userContext}"` : ''}` }
                ]
            },
            config: {
                systemInstruction: `You are a DOMAIN EXPERT interior designer, architect, and visual stylist with deep knowledge of specific design traditions from every country and era.

CRITICAL RULE: COMPOSITION LOCK
- Same camera angle, same object placement, same framing, same spatial layout.
- ONLY change: materials, textures, fabrics, color palette, lighting mood, decorative elements, surface finishes.
${contextClause}

STEP 1: Analyze the uploaded image — identify: room type, furniture layout, objects present, camera angle, lighting.

STEP 2: Generate EXACTLY 8 style suggestions. Each must be a SPECIFIC, NAMED style tradition (not generic).

PROMPT DETAIL REQUIREMENTS — Each prompt MUST include ALL of these:
1. COMPOSITION ANCHOR: "Keep the EXACT same composition, camera angle, all furniture positions and object placement unchanged."
2. SURFACE MATERIALS: Specific material names (e.g., "herringbone oak parquet", "Carrara marble", "rattan weave", "brushed brass")
3. COLOR PALETTE: Exact color descriptions (e.g., "warm terracotta #C4622D, olive green #687530, cream white #FFF8E7")
4. TEXTILES & FABRICS: Specific fabric types (e.g., "linen drapes", "velvet cushions", "jute rug", "silk throw")
5. WALL TREATMENT: Specific finish (e.g., "Venetian plaster", "exposed brick", "wainscoting panels", "lime wash")
6. LIGHTING: Specific mood (e.g., "warm amber 2700K candlelight glow", "cool daylight from north-facing windows")
7. DECORATIVE ACCENTS: 2-3 specific items (e.g., "blue-and-white Delft pottery", "ikebana arrangement", "Berber textile")
8. ATMOSPHERE: Overall mood in 2-3 words (e.g., "serene and contemplative", "opulent warmth", "rustic authenticity")

EACH prompt should be 60-100 words long with maximum specificity.

FORMAT: Return JSON array of 8 objects with {emoji, label, prompt}.
- emoji: flag emoji of the country/region OR relevant style emoji
- label: "[Country/Region] [Style Name]" (e.g., "French Parisian", "Japanese Wabi-Sabi")
- prompt: The hyper-detailed style-transfer prompt as described above`,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            emoji: { type: Type.STRING },
                            label: { type: Type.STRING },
                            prompt: { type: Type.STRING }
                        },
                        required: ["emoji", "label", "prompt"]
                    }
                }
            }
        });

        const text = response.text;
        if (!text) return [];
        return JSON.parse(text);
    } catch (error: any) {
        console.error("Style Analysis Error:", error.message || error);
        return [];
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
            You are an EXPERT Interior Designer, Architect, and Visual Stylist with encyclopedic knowledge of design traditions from every country and era.
            
            INPUTS:
            1. REFERENCE IMAGE (Uploaded): Analyze EXACTLY: room type, furniture layout, every object present, camera angle, lighting setup.
            2. USER DIRECTION: "${basePrompt}" (Style direction, theme, or modification request).
            
            INTERPRETING USER DIRECTION:
            - "châu Âu" / "European" → Generate ${count} SPECIFIC European country styles (French Parisian, Italian Tuscan, Spanish Mediterranean, English Victorian...)
            - "châu Á" / "Asian" → Generate ${count} SPECIFIC Asian country styles (Japanese Wabi-Sabi, Chinese Ming, Korean Hanok...)
            - "hiện đại" / "modern" → Generate ${count} SPECIFIC modern movements (Bauhaus, Memphis, Brutalist...)
            - Empty/vague → Generate ${count} diverse global styles relevant to the image category
            - Specific instruction → Apply that instruction with ${count} detailed variations

            ★★★ COMPOSITION LOCK (CRITICAL) ★★★
            Every prompt MUST start with: "Keep the EXACT same composition, camera angle, all furniture positions and object placement unchanged."

            EACH PROMPT MUST INCLUDE ALL 8 DETAIL LAYERS:
            1. COMPOSITION LOCK (above)
            2. SURFACE MATERIALS: Specific names (e.g., "herringbone oak parquet", "Carrara marble countertops", "brushed brass hardware")
            3. COLOR PALETTE: Exact colors with hex codes (e.g., "warm terracotta #C4622D, sage green #B2AC88, cream white #FFF8E7")
            4. TEXTILES & FABRICS: (e.g., "raw linen drapes", "velvet emerald cushions", "hand-woven jute rug")
            5. WALL TREATMENT: (e.g., "Venetian plaster in warm ochre", "exposed whitewashed brick", "dark wainscoting panels")
            6. LIGHTING: Specific mood (e.g., "warm amber 2700K from wrought-iron chandeliers", "soft natural light through sheer curtains")
            7. DECORATIVE ACCENTS: 2-3 specific items (e.g., "blue Delft pottery", "Murano glass vase", "vintage Persian rug")
            8. ATMOSPHERE: 2-3 mood words (e.g., "rustic elegance", "serene minimalism", "opulent warmth")

            Each prompt should be 80-120 words. Be EXTREMELY specific — name exact materials, patterns, and regional design vocabularies.

            OUTPUT: Return ONLY a JSON array of ${count} prompt strings.
            `;

            parts.push({ text: `Analyze this reference image and generate ${count} hyper-detailed style variation prompts. User direction: "${basePrompt}"` });

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
    signal?: AbortSignal,
    refImageB64?: string,
    refMimeType?: string
): Promise<string[]> => {
    const ai = getAI();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const genderInstruction = gender === 'MALE'
        ? "CONSTRAINT: ALL subjects must be MALE."
        : gender === 'FEMALE'
            ? "CONSTRAINT: ALL subjects must be FEMALE."
            : "If the idea implies diversity, include a mix of genders/ages as requested.";

    const parts: any[] = [];

    // --- IMAGE-AWARE MODE: Send reference image for AI to analyze ---
    if (refImageB64 && refMimeType) {
        const rawDataUrl = `data:${refMimeType};base64,${refImageB64}`;
        const optimized = await processImageForGemini(rawDataUrl);
        parts.push({ inlineData: { data: cleanBase64(optimized), mimeType: getMimeType(optimized) } });

        const systemPrompt = `
            You are an Expert Visual Variation Director.
            
            CONTEXT:
            - You are given a REFERENCE IMAGE (the uploaded image) and a USER INSTRUCTION.
            - Your job: Create ${count} DISTINCT variation prompts that MODIFY the reference image according to the user's instruction.
            
            USER INSTRUCTION: "${baseIdea}"
            
            ★★★ ABSOLUTE RULE: COMPOSITION LOCK ★★★
            The generated image MUST have the EXACT SAME:
            - Camera angle and framing
            - Object placement and spatial layout  
            - Subject position and pose
            - Overall scene structure
            
            You may ONLY change:
            - Visual style, materials, textures, color palette
            - Lighting mood and atmosphere
            - Surface finishes and decorative details
            - What the user explicitly requests
            
            CRITICAL: Do NOT create new scenes or rearrange objects. The output must look like the SAME PHOTO with a different visual treatment applied.
            
            MODIFICATION INTELLIGENCE:
            - If user says "style changes" (e.g., Japanese, European, Minimalist) → Keep the EXACT same room/scene/composition. ONLY change materials, colors, textures, decorative style.
            - If user says "old / young / age" → Keep the SAME pose, clothes, background. ONLY change apparent age.
            - If user says outfit changes → Keep the SAME person, pose, background. ONLY change outfit.
            - If user says background changes → Keep the SAME subject, pose, outfit. ONLY change background.
            
            EACH PROMPT MUST:
            1. Start with: "Using the reference image as the EXACT composition template,"
            2. Then specify the style/modification to apply
            3. Emphasize: "Keep identical camera angle, framing, object positions, and spatial layout."
            4. Add specific style details (materials, colors, textures, lighting)
            
            ${genderInstruction}
            
            EXAMPLE for style change:
            Reference: Living room with sofa, coffee table, bookshelf
            User: "Japanese and European styles"
            Output:
            [
              "Using the reference image as the EXACT composition template, apply Japanese Zen interior style. Keep identical camera angle, framing, and all furniture positions. Replace materials with: light natural wood (hinoki), tatami-textured flooring, shoji screen elements, washi paper accents. Neutral earth tones (beige, warm gray, soft white). Soft diffused natural lighting. Minimalist decoration.",
              "Using the reference image as the EXACT composition template, apply Scandinavian Modern style. Keep identical camera angle, framing, and all furniture positions. Replace materials with: blonde birch wood, white-washed surfaces, wool throws, sheepskin accents. Cool neutral palette (white, light gray, pale blue). Bright airy natural lighting. Hygge atmosphere."
            ]
            
            Return ONLY a JSON array of ${count} prompt strings.
        `;

        parts.push({ text: `Analyze this reference image and create ${count} variation(s) based on: "${baseIdea}"` });

        try {
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
            if (!text) return Array(count).fill(baseIdea);
            const parsed = JSON.parse(text) as string[];
            while (parsed.length < count) parsed.push(parsed[0] || baseIdea);
            return parsed.slice(0, count);
        } catch (error) {
            console.error("Image-Aware Prompt Gen Error:", error);
            if (handleApiError(error).message.includes("Quota")) throw handleApiError(error);
            return Array(count).fill(baseIdea);
        }
    }

    // --- TEXT-ONLY MODE (no reference image) ---
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

    parts.push({ text: `Idea: "${baseIdea}"` });

    try {
        const response = await ai.models.generateContent({
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

        const text = response.text;
        if (!text) return Array(count).fill(baseIdea);
        const parsed = JSON.parse(text) as string[];

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
    modifyBackground?: boolean,
    paletteImageB64?: string,
    paletteMimeType?: string,
    chainRefB64?: string,
    chainRefMimeType?: string
) => {
    const ai = getAI();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
        const parts: any[] = [];

        let styleRefIndex = 0;
        let faceRefIndex = 0;
        let paletteRefIndex = 0;
        let chainRefIndex = 0;
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
            // PALETTE REF (Freepik-style color/material reference)
            if (paletteImageB64 && paletteMimeType) {
                const rawDataUrl = `data:${paletteMimeType};base64,${paletteImageB64}`;
                const optimizedPalette = await processImageForGemini(rawDataUrl);
                parts.push({ inlineData: { data: cleanBase64(optimizedPalette), mimeType: getMimeType(optimizedPalette) } });
                paletteRefIndex = currentIndex++;
            }
            // CHAIN REF (Style consistency from previous generation)
            if (chainRefB64 && chainRefMimeType) {
                const rawDataUrl = `data:${chainRefMimeType};base64,${chainRefB64}`;
                const optimizedChain = await processImageForGemini(rawDataUrl);
                parts.push({ inlineData: { data: cleanBase64(optimizedChain), mimeType: getMimeType(optimizedChain) } });
                chainRefIndex = currentIndex++;
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
                finalPrompt = `EDIT THIS EXACT IMAGE — DO NOT CREATE A NEW IMAGE. Preserve the EXACT camera angle, every object's position, room layout, furniture placement, and framing from the reference. ONLY change: ${prompt}. The output must be the SAME photograph with modified surface materials/colors. Do NOT rearrange, add, or remove any elements.`;
            } else {
                finalPrompt = prompt;
            }
        } else if (mode === 'VARIATION') {
            let modifiers = [];

            if (gender && gender !== 'ORIGINAL') {
                modifiers.push(`GENDER OVERRIDE: Subject MUST be ${gender}.`);
            }
            if (modifyBackground) {
                modifiers.push(`BACKGROUND: CHANGE the background to fit the context described in the instruction.`);
            } else {
                modifiers.push(`BACKGROUND: PRESERVE the exact background/environment from the Reference Image unless the instruction explicitly asks to change it.`);
            }

            const qualityControl = "FINAL CHECK: Ensure hands, fingers, and limbs are anatomically correct. No extra limbs. No distorted faces.";

            if (styleRefIndex > 0) {
                finalPrompt = `
                TASK: EDIT THIS EXACT IMAGE — DO NOT CREATE A NEW IMAGE.
                
                You are an image EDITOR, not an image GENERATOR.
                Your job is to MODIFY the provided reference image, NOT to create a new scene.
                
                REFERENCE IMAGE (Image ${styleRefIndex}): This is the image you are EDITING.
                
                ════════════════════════════════════════
                ██ ABSOLUTE RULE: PIXEL-LEVEL COMPOSITION LOCK ██
                ════════════════════════════════════════
                
                The output image MUST be a DIRECT EDIT of Image ${styleRefIndex}.
                
                PRESERVE EXACTLY (zero tolerance):
                ✓ Camera angle — same lens, same perspective, same distance
                ✓ Every object's EXACT position — same pixel location, same size ratio
                ✓ Room/scene structure — same walls, same floor area, same window positions
                ✓ Furniture layout — same bed position, same shelf position, same table position
                ✓ Framing and crop — identical composition boundaries
                ✓ Subject pose — if person exists, same pose and body position
                
                NEVER DO ANY OF THESE:
                ✗ DO NOT create a new room layout
                ✗ DO NOT rearrange any furniture or objects
                ✗ DO NOT change camera angle or perspective
                ✗ DO NOT add objects that don't exist in the reference
                ✗ DO NOT remove objects that exist in the reference
                ✗ DO NOT generate a "similar looking" scene — it must be THE SAME scene
                
                ════════════════════════════════════════
                WHAT TO MODIFY (style changes ONLY):
                ════════════════════════════════════════
                Based on instruction: "${prompt}"
                
                Apply ONLY these surface-level changes:
                → Material textures (e.g., wood type, fabric type, metal finish)
                → Color palette and color grading
                → Wall treatments (paint color, wallpaper pattern)
                → Textile patterns and colors (bedding, curtains, rugs)
                → Lighting warmth/mood (but NOT light source positions)
                → Decorative style of existing objects
                
                Think of it as: Photoshop "material swap" — same photo, different surfaces.
                
                ${modifiers.join('\n')}
                
                ${faceRefIndex > 0 ? `FACE REFERENCE (Image ${faceRefIndex}): Use this face for the subject.` : ''}
                ${paletteRefIndex > 0 ? `COLOR PALETTE (Image ${paletteRefIndex}): Extract and apply the exact color palette, material textures, and visual mood from this palette image.` : ''}
                ${chainRefIndex > 0 ? `STYLE MATCH (Image ${chainRefIndex}): Match the exact materials, lighting, and color grading of this previous output.` : ''}
                
                ${qualityControl}
                `;
            }
        }

        parts.push({ text: finalPrompt });

        const imageConfig: any = { aspectRatio: aspectRatio };
        if (model === 'gemini-3-pro-image-preview') imageConfig.imageSize = "1K";

        // Add system instruction for VARIATION mode to enforce composition
        const systemInstruction = (mode === 'VARIATION' && styleRefIndex > 0)
            ? `You are a precision image editor. You ONLY modify surface-level visual properties (materials, colors, textures, lighting mood) of the provided reference image. You NEVER change the composition, layout, camera angle, or object positions. Every output must look like the EXACT same photograph with different surface materials applied. If the user asks you to "create" or "generate", interpret it as "edit the reference image to apply this style". NEVER generate a new scene.`
            : undefined;

        const requestPromise = ai.models.generateContent({
            model: model,
            contents: { parts },
            config: {
                imageConfig,
                ...(systemInstruction ? { systemInstruction } : {})
            }
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