export type TipState = {
  score: number;
  moves: number;
  chain: number;
  mana: number;
};

const BOUNDS: Record<keyof TipState, [number, number]> = {
  score: [0, 10_000_000],
  moves: [0, 1_000],
  chain: [0, 100],
  mana: [0, 100],
};

const ALLOWED_KEYS = Object.keys(BOUNDS) as (keyof TipState)[];

/** Validates a structured game state. Any extra key (e.g. `prompt`) is rejected. */
export function parseTipState(body: unknown): TipState | null {
  if (typeof body === 'string') {
    if (body.length > 1024) return null;
    try {
      return parseTipState(JSON.parse(body));
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== ALLOWED_KEYS.length || !keys.every((k) => (ALLOWED_KEYS as string[]).includes(k))) {
    return null;
  }

  const state = {} as TipState;
  for (const key of ALLOWED_KEYS) {
    const value = record[key];
    const [min, max] = BOUNDS[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      return null;
    }
    state[key] = value;
  }
  return state;
}

/** The prompt is built only on the server, from validated numbers. */
export function buildTipPrompt({score, moves, chain, mana}: TipState): string {
  return [
    'You are an expert match-3 game coach.',
    'Give one short tactical tip (maximum 20 words).',
    `Current score: ${score}.`,
    `Moves left: ${moves}.`,
    `Current chain multiplier: ${chain}.`,
    `Arcane charge: ${mana}%.`,
  ].join(' ');
}
