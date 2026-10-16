import {GoogleGenAI} from '@google/genai';

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string | string[]) => void;
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_PROMPT_LENGTH = 2000;

function getPrompt(body: unknown): string | null {
  if (typeof body === 'string') {
    try {
      return getPrompt(JSON.parse(body));
    } catch {
      return null;
    }
  }

  if (!body || typeof body !== 'object' || !('prompt' in body)) {
    return null;
  }

  const prompt = (body as {prompt?: unknown}).prompt;
  if (typeof prompt !== 'string') {
    return null;
  }

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt || trimmedPrompt.length > MAX_PROMPT_LENGTH) {
    return null;
  }

  return trimmedPrompt;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed'});
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({error: 'Server is missing GEMINI_API_KEY'});
    return;
  }

  const prompt = getPrompt(req.body);
  if (!prompt) {
    res.status(400).json({error: 'Request must include a non-empty prompt string'});
    return;
  }

  try {
    const client = new GoogleGenAI({apiKey});
    const response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
      contents: prompt,
    });

    const text = typeof response.text === 'string' ? response.text.trim() : '';
    if (!text) {
      res.status(502).json({error: 'Gemini returned an empty response'});
      return;
    }

    res.status(200).json({text});
  } catch (error) {
    console.error('Gemini request failed:', error);
    res.status(500).json({error: 'Failed to generate a response'});
  }
}
