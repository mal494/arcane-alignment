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

function buildTipPrompt({score, moves, chain, mana}: TipContext): string {
  return [
    'You are an expert match-3 game coach.',
    'Give one short tactical tip (maximum 20 words).',
    `Current score: ${score}.`,
    `Moves left: ${moves}.`,
    `Current chain multiplier: ${chain}.`,
    `Arcane charge: ${mana}%.`,
  ].join(' ');
}

export async function requestArcaneTip(context: TipContext): Promise<string> {
  const response = await fetch('/api/gemini-tip', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({prompt: buildTipPrompt(context)}),
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
