import {GoogleGenAI} from '@google/genai';
import {checkRateLimit, getClientIp} from './_lib/rateLimit.js';
import {buildTipPrompt, parseTipState} from './_lib/tipState.js';

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (name: string, value: string | string[]) => void;
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed'});
    return;
  }

  const rate = await checkRateLimit(getClientIp(req.headers));
  if ('status' in rate) {
    if (rate.status === 429) {
      const retryAfter = rate.reset ? Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)) : 60;
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({error: 'Too many requests'});
    } else {
      res.status(503).json({error: 'Service temporarily unavailable'});
    }
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({error: 'Server is missing GEMINI_API_KEY'});
    return;
  }

  const state = parseTipState(req.body);
  if (!state) {
    res.status(400).json({error: 'Request must be {score, moves, chain, mana} as bounded integers'});
    return;
  }
  const prompt = buildTipPrompt(state);

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
