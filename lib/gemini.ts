import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TAXONOMY, Category } from "./categories";

let _ai: GoogleGenAI | null = null;

function getAi() {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

function getModel() {
  return process.env.GEMINI_MODEL || process.env.GEMINI_MODEL_DEV || "gemini-3.5-flash";
}

export type Classification = { category: Category; score: number };

function makePrompt(title: string, text: string) {
  return `You are a senior editor at a TLDR-style tech newsletter. Given the article title and full text, return ONLY a JSON object (no markdown, no extra text) with the following keys:

- summary: a punchy 2-3 sentence insight summary for a Reels-style news card.
- tldr: an array of 3-5 short, self-contained bullet points capturing the core facts, in the style of TLDR.tech. Each bullet should be a fact, not a sentence fragment.
- categories: an array of objects { category, score } drawn only from the allowed list, where score is a relevance number 0.0-1.0. Exclude any category with score < 0.4. Articles can belong to more than one category.

Allowed categories: ${TAXONOMY.join(", ")}

Title: ${title}

Text (first 12k chars):
${text.slice(0, 12000)}
`;
}

function parseJsonResponse(raw: string) {
  let json = raw.trim();
  if (json.startsWith("```")) {
    json = json.replace(/```(?:json)?\n?|\n?```/g, "").trim();
  }
  const parsed = JSON.parse(json);
  return parsed;
}

export async function summarizeAndClassify(
  title: string,
  text: string
): Promise<{ summary: string; tldr: string[]; categories: Classification[] }> {
  const model = getModel();
  const response = await getAi().models.generateContent({
    model,
    contents: makePrompt(title, text),
    config: {
      temperature: 0.3,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
  });

  const raw = response.text?.trim() || "{}";
  const parsed = parseJsonResponse(raw);

  const validCategories: Classification[] = (parsed.categories || [])
    .filter((c: any) => TAXONOMY.includes(c.category))
    .filter((c: any) => c.score >= 0.4)
    .map((c: any) => ({ category: c.category, score: Number(c.score) }));

  const tldr: string[] = Array.isArray(parsed.tldr)
    ? parsed.tldr.slice(0, 5)
    : [];

  return {
    summary: parsed.summary || "No summary available.",
    tldr,
    categories: validCategories,
  };
}

export async function validateWithStrongModel(
  title: string,
  text: string,
  baseline: { summary: string; tldr: string[]; categories: Classification[] }
) {
  const model = process.env.GEMINI_MODEL_PROD || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const response = await getAi().models.generateContent({
    model,
    contents:
      makePrompt(title, text) +
      `\n\nFor comparison, here is a baseline output. Use it only as a reference if helpful:\n${JSON.stringify(baseline)}`,
    config: {
      temperature: 0.3,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
  });

  const raw = response.text?.trim() || "{}";
  const parsed = parseJsonResponse(raw);
  const validCategories: Classification[] = (parsed.categories || [])
    .filter((c: any) => TAXONOMY.includes(c.category))
    .filter((c: any) => c.score >= 0.4)
    .map((c: any) => ({ category: c.category, score: Number(c.score) }));

  return {
    summary: parsed.summary || "No summary available.",
    tldr: Array.isArray(parsed.tldr) ? parsed.tldr.slice(0, 5) : [],
    categories: validCategories,
  };
}

export async function generateTldr(title: string, text: string): Promise<string[]> {
  const model = getModel();
  const response = await getAi().models.generateContent({
    model,
    contents: `You are a senior editor. Given the article title and text, produce 3-5 short, self-contained TLDR bullet points capturing the core facts. Return ONLY a JSON object { "tldr": [...] } (no markdown, no extra text).

Title: ${title}

Text (first 12k chars):
${text.slice(0, 12000)}
`,
    config: {
      temperature: 0.3,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
  });

  const raw = response.text?.trim() || "{}";
  const parsed = parseJsonResponse(raw);
  return Array.isArray(parsed.tldr) ? parsed.tldr.slice(0, 5) : [];
}
