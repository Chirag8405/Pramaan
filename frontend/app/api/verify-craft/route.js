import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
    "You are an expert handicraft auditor. Analyze this image. Does it clearly show an artisan in a workshop setting with raw materials and traditional tools? Return ONLY a JSON object with two keys: 'terroir_score' (integer 0-100) and 'reason' (1 sentence string).";

function normalizeResult(parsed) {
    const rawScore = Number(parsed?.terroir_score);
    const safeScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
    const reason =
        typeof parsed?.reason === "string" && parsed.reason.trim().length > 0
            ? parsed.reason.trim()
            : "Image assessment completed.";

    return {
        terroir_score: safeScore,
        reason
    };
}

function extractJsonObject(text) {
    if (!text || typeof text !== "string") {
        throw new Error("Model returned empty content.");
    }

    // Find a balanced JSON object in the returned text. This handles
    // surrounding commentary or extra text the model may include.
    const start = text.indexOf("{");
    if (start === -1) {
        throw new Error("Model did not return a JSON object.");
    }

    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;

        if (depth === 0) {
            const jsonSlice = text.slice(start, i + 1);
            try {
                return JSON.parse(jsonSlice);
            } catch (err) {
                // If parsing fails, continue scanning for another possible object
                // (rare) or fall through to error below.
                break;
            }
        }
    }

    throw new Error("Model did not return a valid JSON object.");
}

async function callOpenAIVision({ base64Image, mimeType }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is missing.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: process.env.OPENAI_VISION_MODEL || "gpt-4.1",
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_image",
                            image_url: `data:${mimeType};base64,${base64Image}`
                        }
                    ]
                }
            ]
        })
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload?.error?.message || "OpenAI Vision call failed.");
    }

    // Try several common response shapes for the Responses API.
    let text = "";
    if (typeof payload.output_text === "string" && payload.output_text.trim()) {
        text = payload.output_text;
    } else if (Array.isArray(payload.output) && payload.output.length > 0) {
        text = payload.output
            .map((o) => {
                if (typeof o === "string") return o;
                if (Array.isArray(o.content)) return o.content.map((c) => c.text || "").join("");
                if (typeof o.content === "string") return o.content;
                return "";
            })
            .join("\n");
    } else if (typeof payload?.text === "string") {
        text = payload.text;
    }

    return normalizeResult(extractJsonObject(String(text || "")));
}

async function callGeminiVision({ base64Image, mimeType }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing.");
    }

    const model = process.env.GEMINI_VISION_MODEL || "gemini-1.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: SYSTEM_PROMPT },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }
            ]
        })
    });

    const payload = await response.json();
    if (!response.ok) {
        const message = payload?.error?.message || "Gemini Vision call failed.";
        throw new Error(message);
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    return normalizeResult(extractJsonObject(text));
}

export async function POST(req) {
    try {
        const provider = (process.env.VISION_PROVIDER || "openai").toLowerCase();
        if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "GEMINI_API_KEY is missing on the server." }, { status: 503 });
        }
        if (provider === "openai" && !process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "OPENAI_API_KEY is missing on the server." }, { status: 503 });
        }

        const formData = await req.formData();
        const image = formData.get("image");

        if (!image || typeof image.arrayBuffer !== "function") {
            return NextResponse.json({ error: "Missing image file in form field 'image'." }, { status: 400 });
        }

        const mimeType = image.type || "image/jpeg";
        if (!mimeType.startsWith("image/")) {
            return NextResponse.json({ error: "Uploaded file is not an image." }, { status: 400 });
        }

        const fileBuffer = Buffer.from(await image.arrayBuffer());
        const base64Image = fileBuffer.toString("base64");

        const result = provider === "gemini" ? await callGeminiVision({ base64Image, mimeType }) : await callOpenAIVision({ base64Image, mimeType });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to verify craft image.",
                detail: error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}