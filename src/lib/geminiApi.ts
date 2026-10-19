export type TipContext = {
  score: number;
  moves: number;
  chain: number;
  mana: number;
};

type GeminiTipResponse = {
  text?: string;
  error?: string;
};

export async function requestArcaneTip(context: TipContext): Promise<string> {
  const response = await fetch('/api/gemini-tip', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      score: Math.max(0, Math.round(context.score)),
      moves: Math.max(0, Math.round(context.moves)),
      chain: Math.max(0, Math.round(context.chain)),
      mana: Math.min(100, Math.max(0, Math.round(context.mana))),
    }),
  });

  const data = (await response.json()) as GeminiTipResponse;
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to generate a tip');
  }

  const text = data.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty tip');
  }

  return text;
}
