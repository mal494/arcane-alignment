import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ELEMENTS } from './constants';
import { generateValidBoard, findMatches, applyGravityAndRefill, TileData } from './gameLogic';
import { requestArcaneTip } from './lib/geminiApi';
import { ArcaneSoundEngine } from './lib/sound';

const AUDIO_PREF_KEY = 'arcane-alignment-muted';
const BOARD_TILE_SIZE = 40;

type GameState = 'title' | 'playing' | 'gameover';
type GameOutcome = 'win' | 'lose';
type CellPoint = { r: number; c: number };
type ParticleBurst = { id: number; x: number; y: number; kind: 'match' | 'win'; intensity: number };
type ArcaneWave = { id: number; x: number; y: number; kind: 'match' | 'win' | 'fail'; intensity: number };

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const Header = ({
  isMuted,
  onToggleMute,
}: {
  isMuted: boolean;
  onToggleMute: () => void;
}) => (
  <div className="w-full h-[120px] bg-[#0a0e18] border border-[#1e3060] rounded-md flex flex-col items-center justify-center relative px-14">
    <button
      type="button"
      onClick={onToggleMute}
      className="absolute top-2 right-2 rounded border border-[#2a4080] bg-[#0d1828] px-2 py-1 text-[10px] tracking-wide text-[#9ec3ff] transition hover:bg-[#152540]"
      aria-label={isMuted ? 'Unmute game sound effects' : 'Mute game sound effects'}
    >
      {isMuted ? '🔇 Muted' : '🔊 Sound'}
    </button>
    <div className="absolute top-2 text-[#1e3060] text-xs tracking-[0.5em]">ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ</div>
    <div className="absolute bottom-2 text-[#1e3060] text-xs tracking-[0.5em]">ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛚ ᛗ</div>
    
    <div className="flex items-center gap-4 mb-1">
      <div className="h-px w-32 bg-[#1e3060]"></div>
      <span className="text-[#1e3060] text-xs">✦</span>
      <span className="text-[#60a0ff] text-xs">⚡</span>
      <span className="text-[#1e3060] text-xs">✦</span>
      <div className="h-px w-32 bg-[#1e3060]"></div>
    </div>
    
    <h1 className="text-3xl font-bold text-[#ffe080] tracking-widest drop-shadow-[0_0_8px_#c0a040]">ARCANE</h1>
    <h2 className="text-sm text-[#c0a040] tracking-[0.3em] mt-1">ALIGNMENT</h2>
    
    <div className="flex items-center gap-4 mt-2">
      <div className="h-px w-32 bg-[#1e3060]"></div>
      <span className="text-[#1e3060] text-xs">✦</span>
      <span className="text-[#60a0ff] text-xs">⚡</span>
      <span className="text-[#1e3060] text-xs">✦</span>
      <div className="h-px w-32 bg-[#1e3060]"></div>
    </div>
  </div>
);

const StatBox = ({ label, value, color }: { label: string, value: string | number, color: string }) => (
  <div className="flex flex-col items-center flex-1 justify-center">
    <span className="text-[10px] text-[#3a5a80] tracking-widest mb-1">{label}</span>
    <span className="text-2xl font-bold text-white" style={{ textShadow: `0 0 10px ${color}` }}>{value}</span>
  </div>
);

const LeftPillar = ({ score, moves, chain }: { score: number, moves: number, chain: number }) => (
  <div className="w-[120px] bg-[#0a0e18] border border-[#1e3060] rounded-md flex flex-col py-4">
    <StatBox label="POWER" value={score.toLocaleString()} color="#60a0ff" />
    <div className="h-px w-20 bg-[#1e3060] mx-auto my-4"></div>
    <StatBox label="MOVES" value={moves} color="#c080ff" />
    <div className="h-px w-20 bg-[#1e3060] mx-auto my-4"></div>
    <StatBox label="CHAIN" value={`×${chain}`} color="#ffcc40" />
  </div>
);

const RightPillar = ({
  tip,
  isLoadingTip,
  tipError,
  prefersReducedMotion,
  onRequestTip,
}: {
  tip: string;
  isLoadingTip: boolean;
  tipError: string;
  prefersReducedMotion: boolean;
  onRequestTip: () => void;
}) => (
  <div className="w-[120px] bg-[#0a0e18] border border-[#1e3060] rounded-md flex flex-col items-center py-4 px-2">
    <span className="text-[10px] text-[#c0a040] tracking-widest mb-4">-- CHALLENGE --</span>
    
    <div className="w-[96px] h-[140px] bg-[#0d1828] border border-[#2a4080] rounded flex flex-col items-center justify-center relative mb-4 arcane-challenge-card">
      <span className="absolute top-1 left-1 text-[#1e3060] text-[8px]">✦</span>
      <span className="absolute top-1 right-1 text-[#1e3060] text-[8px]">✦</span>
      <span className="absolute bottom-1 left-1 text-[#1e3060] text-[8px]">✦</span>
      <span className="absolute bottom-1 right-1 text-[#1e3060] text-[8px]">✦</span>
      
      <div className="text-4xl mb-2">🌑</div>
      <div className="text-[#1e3060] text-[10px] tracking-widest">ᚦ ᚨ ᚱ</div>
    </div>
    
    <h3 className="text-[10px] font-bold text-[#ffe080] tracking-wider text-center mb-2">THE VOID MOON</h3>
    <div className="h-px w-full bg-[#1e3060] mb-2"></div>
    <p className="text-[9px] text-[#7aa0cc] text-center leading-relaxed">
      Ice tiles deal double damage. Fire weakened until dispelled.
    </p>
    <button
      type="button"
      onClick={onRequestTip}
      disabled={isLoadingTip}
      className="mt-3 w-full rounded border border-[#2a4080] bg-[#0d1828] px-2 py-1 text-[9px] tracking-wide text-[#9ec3ff] transition hover:bg-[#152540] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoadingTip ? 'Seeking tip...' : 'Ask Gemini Tip'}
    </button>
    <AnimatePresence mode="wait">
      {tip && !tipError && (
        <motion.p
          key={tip}
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.08 : 0.2 }}
          className="mt-2 text-[8px] text-center text-[#a9c8f0] leading-relaxed"
        >
          {tip}
        </motion.p>
      )}
    </AnimatePresence>
    {tipError && <p className="mt-2 text-[8px] text-center text-[#ff8f8f] leading-relaxed">{tipError}</p>}
  </div>
);

const ChargeBar = ({ mana }: { mana: number }) => (
  <div className="w-[320px] h-[40px] bg-[#0a0e18] border border-[#1e3060] rounded-md flex flex-col items-center justify-center relative overflow-hidden">
    <span className="text-[9px] text-[#3a5080] tracking-widest z-10 mb-1">⚡ ARCANE CHARGE ⚡</span>
    <div className="w-[300px] h-[10px] bg-[#06080f] border border-[#2a4080] rounded-sm relative overflow-hidden">
      <motion.div 
        className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#1a3070] via-[#2060c0] to-[#60b0ff]"
        initial={{ width: 0 }}
        animate={{ width: `${mana}%` }}
        transition={{ type: "spring", bounce: 0 }}
      />
      <div className="absolute top-0 right-0 h-full w-[2px] bg-white opacity-50" style={{ left: `calc(${mana}% - 2px)` }}></div>
    </div>
  </div>
);

const TitleScreen = ({ onStart }: { onStart: () => void }) => {
  return (
    <div className="absolute inset-0 bg-[#040810] flex flex-col items-center justify-center z-50 cursor-pointer" onClick={onStart}>
      <div className="text-[#1e3060] text-xs tracking-[0.5em] mb-8">ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ</div>
      
      <h1 className="text-5xl font-bold text-white tracking-widest drop-shadow-[0_0_15px_#60a0ff] mb-2">ARCANE</h1>
      <h2 className="text-lg text-[#c0a040] tracking-[0.4em] mb-8 animate-pulse">ALIGNMENT</h2>
      
      <div className="text-[#1e3060] text-xs tracking-[0.5em] mb-12">ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ</div>
      
      <p className="text-[#3a6090] text-xs tracking-widest animate-bounce">PRESS ANY KEY</p>
    </div>
  );
};

const GameOverScreen = ({ outcome, onRestart }: { outcome: GameOutcome; onRestart: () => void }) => {
  const isWin = outcome === 'win';
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#03060dcc]">
      <div className="w-[320px] rounded-md border border-[#2a4080] bg-[#0a0e18]/95 p-6 text-center shadow-[0_0_30px_#0b1730]">
        <p className="text-xs tracking-[0.25em] text-[#3a5a80] mb-2">ARCANE TRIAL COMPLETE</p>
        <h3 className={`text-3xl font-bold tracking-wide ${isWin ? 'text-[#ffe080]' : 'text-[#ff9a9a]'}`}>
          {isWin ? 'VICTORY' : 'DEFEAT'}
        </h3>
        <p className="mt-3 text-xs text-[#9ab7dc]">
          {isWin
            ? 'Your charge reached 100% and the ritual stabilized.'
            : 'Your move count reached zero before the ritual completed.'}
        </p>
        <button
          type="button"
          onClick={onRestart}
          className="mt-5 w-full rounded border border-[#2a4080] bg-[#0d1828] px-3 py-2 text-xs tracking-[0.2em] text-[#9ec3ff] transition hover:bg-[#152540]"
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const prefersReducedMotion = useReducedMotion();
  const soundRef = useRef(new ArcaneSoundEngine());
  const burstIdRef = useRef(0);
  const waveIdRef = useRef(0);
  const timeoutIdsRef = useRef<number[]>([]);

  const [gameState, setGameState] = useState<GameState>('title');
  const [gameOutcome, setGameOutcome] = useState<GameOutcome>('lose');
  const [grid, setGrid] = useState<(TileData | null)[][]>([]);
  const [selected, setSelected] = useState<{r: number, c: number} | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(30);
  const [chain, setChain] = useState(1);
  const [mana, setMana] = useState(0);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(AUDIO_PREF_KEY) === 'true';
  });
  const [tip, setTip] = useState('');
  const [tipError, setTipError] = useState('');
  const [isLoadingTip, setIsLoadingTip] = useState(false);
  const [highlightedTiles, setHighlightedTiles] = useState<Set<string>>(new Set());
  const [bursts, setBursts] = useState<ParticleBurst[]>([]);
  const [waves, setWaves] = useState<ArcaneWave[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [isSurging, setIsSurging] = useState(false);
  const [flashKind, setFlashKind] = useState<'none' | 'fail' | 'win'>('none');

  const queueTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      callback();
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
    }, delayMs);
    timeoutIdsRef.current.push(timeoutId);
  }, []);

  useEffect(() => {
    const initializeAudio = () => {
      void soundRef.current.initialize();
    };
    window.addEventListener('pointerdown', initializeAudio, { once: true });
    window.addEventListener('keydown', initializeAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', initializeAudio);
      window.removeEventListener('keydown', initializeAudio);
    };
  }, []);

  useEffect(() => {
    soundRef.current.setMuted(isMuted);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUDIO_PREF_KEY, String(isMuted));
    }
  }, [isMuted]);

  useEffect(() => {
    const engine = soundRef.current;
    let cancelled = false;

    if (gameState === 'playing') {
      void engine.initialize().then(() => {
        if (!cancelled) {
          engine.startAmbient();
        }
      });
    } else {
      engine.stopAmbient();
    }

    return () => {
      cancelled = true;
      if (gameState === 'playing') {
        engine.stopAmbient();
      }
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'playing') {
      return;
    }

    const chainBoost = Math.min(1, Math.max(0, (chain - 1) / 6));
    const manaBoost = Math.min(1, Math.max(0, mana / 100));
    const intensity = manaBoost * 0.7 + chainBoost * 0.3;
    soundRef.current.setAmbientIntensity(intensity);
  }, [gameState, chain, mana]);

  useEffect(() => {
    return () => {
      soundRef.current.stopAmbient();
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current = [];
    };
  }, []);

  const triggerFlash = useCallback((kind: 'fail' | 'win') => {
    setFlashKind(kind);
    queueTimeout(() => setFlashKind('none'), kind === 'win' ? 500 : 250);
  }, [queueTimeout]);

  const triggerShake = useCallback(() => {
    if (prefersReducedMotion) {
      return;
    }
    setIsShaking(false);
    queueTimeout(() => setIsShaking(true), 0);
    queueTimeout(() => setIsShaking(false), 360);
  }, [prefersReducedMotion, queueTimeout]);

  const getCellsCenter = useCallback((cells: CellPoint[]) => {
    if (cells.length === 0) {
      return null;
    }
    const centerX =
      cells.reduce((sum, cell) => sum + (cell.c + 0.5) * BOARD_TILE_SIZE, 0) / cells.length;
    const centerY =
      cells.reduce((sum, cell) => sum + (cell.r + 0.5) * BOARD_TILE_SIZE, 0) / cells.length;
    return { centerX, centerY };
  }, []);

  const triggerSurge = useCallback((durationMs: number) => {
    if (prefersReducedMotion) {
      return;
    }
    setIsSurging(false);
    queueTimeout(() => setIsSurging(true), 0);
    queueTimeout(() => setIsSurging(false), durationMs);
  }, [prefersReducedMotion, queueTimeout]);

  const triggerBurstFromCells = useCallback((cells: CellPoint[], kind: 'match' | 'win', intensity = 1) => {
    if (prefersReducedMotion || cells.length === 0) {
      return;
    }

    const center = getCellsCenter(cells);
    if (!center) {
      return;
    }

    const burstId = burstIdRef.current++;
    setBursts((existing) => [
      ...existing,
      { id: burstId, x: center.centerX, y: center.centerY, kind, intensity },
    ]);
    queueTimeout(() => {
      setBursts((existing) => existing.filter((burst) => burst.id !== burstId));
    }, kind === 'win' ? 1000 : 760);
  }, [getCellsCenter, prefersReducedMotion, queueTimeout]);

  const triggerWaveFromCells = useCallback((
    cells: CellPoint[],
    kind: 'match' | 'win' | 'fail',
    intensity = 1,
  ) => {
    if (prefersReducedMotion || cells.length === 0) {
      return;
    }

    const center = getCellsCenter(cells);
    if (!center) {
      return;
    }

    const waveId = waveIdRef.current++;
    setWaves((existing) => [
      ...existing,
      { id: waveId, x: center.centerX, y: center.centerY, kind, intensity },
    ]);
    queueTimeout(() => {
      setWaves((existing) => existing.filter((wave) => wave.id !== waveId));
    }, kind === 'win' ? 980 : 760);
  }, [getCellsCenter, prefersReducedMotion, queueTimeout]);

  const playSound = useCallback((eventName: Parameters<ArcaneSoundEngine['play']>[0], intensity?: number) => {
    const engine = soundRef.current;
    void engine.initialize().then(() => {
      engine.play(eventName, intensity);
    });
  }, []);

  const startGame = useCallback(() => {
    playSound('buttonClick');
    setGameState('playing');
  }, [playSound]);

  const endGame = useCallback((outcome: GameOutcome) => {
    setIsAnimating(false);
    setGameOutcome(outcome);
    setGameState('gameover');
    if (outcome === 'win') {
      playSound('win');
      triggerFlash('win');
      triggerBurstFromCells(
        [
          { r: 3, c: 3 },
          { r: 3, c: 4 },
          { r: 4, c: 3 },
          { r: 4, c: 4 },
        ],
        'win',
        4.8,
      );
      triggerWaveFromCells(
        [
          { r: 3, c: 3 },
          { r: 3, c: 4 },
          { r: 4, c: 3 },
          { r: 4, c: 4 },
        ],
        'win',
        4.6,
      );
      triggerSurge(560);
      return;
    }

    playSound('lose');
    triggerFlash('fail');
    triggerShake();
    triggerWaveFromCells(
      [
        { r: 3, c: 3 },
        { r: 3, c: 4 },
        { r: 4, c: 3 },
        { r: 4, c: 4 },
      ],
      'fail',
      3.2,
    );
  }, [playSound, triggerFlash, triggerBurstFromCells, triggerShake, triggerSurge, triggerWaveFromCells]);

  useEffect(() => {
    if (gameState === 'playing') {
      setGrid(generateValidBoard());
      setScore(0);
      setMoves(30);
      setChain(1);
      setMana(0);
      setTip('');
      setTipError('');
      setHighlightedTiles(new Set());
      setBursts([]);
      setWaves([]);
      setFlashKind('none');
      setIsShaking(false);
      setIsSurging(false);
    }
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = () => {
      if (gameState === 'title') {
        startGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, startGame]);

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (!nextMuted) {
      playSound('buttonClick');
    }
  };

  const handleTileClick = async (r: number, c: number) => {
    if (gameState !== 'playing' || isAnimating || moves <= 0) return;

    if (!selected) {
      playSound('tileSelect');
      setSelected({ r, c });
      return;
    }

    const isAdjacent = Math.abs(selected.r - r) + Math.abs(selected.c - c) === 1;
    if (!isAdjacent) {
      playSound('tileSelect');
      setSelected({ r, c });
      return;
    }

    // Swap
    setIsAnimating(true);
    setSelected(null);
    const remainingMoves = moves - 1;
    setMoves(remainingMoves);
    setChain(1);
    playSound('move');

    const newGrid = [...grid.map(row => [...row])];
    const temp = newGrid[selected.r][selected.c];
    newGrid[selected.r][selected.c] = newGrid[r][c];
    newGrid[r][c] = temp;
    setGrid(newGrid);

    // Wait for swap animation
    await delay(prefersReducedMotion ? 120 : 260);

    let currentGrid = newGrid;
    let currentChain = 1;
    let currentMana = mana;
    let matches = findMatches(currentGrid);

    if (matches.length === 0) {
      // Swap back
      const revertGrid = [...currentGrid.map(row => [...row])];
      const temp2 = revertGrid[selected.r][selected.c];
      revertGrid[selected.r][selected.c] = revertGrid[r][c];
      revertGrid[r][c] = temp2;
      setGrid(revertGrid);
      playSound('invalidMove');
      triggerFlash('fail');
      triggerShake();
      triggerWaveFromCells(
        [
          { r: selected.r, c: selected.c },
          { r, c },
        ],
        'fail',
        1.6,
      );
      await delay(prefersReducedMotion ? 100 : 260);
      if (remainingMoves <= 0) {
        endGame('lose');
      } else {
        setIsAnimating(false);
      }
      return;
    }

    // Process matches loop
    while (matches.length > 0) {
      const matchKeys = new Set(matches.map(({ r: row, c: col }) => `${row},${col}`));
      setHighlightedTiles(matchKeys);
      playSound('match', currentChain);
      triggerBurstFromCells(matches, 'match', 1 + currentChain * 0.35);
      triggerWaveFromCells(matches, 'match', 1 + currentChain * 0.28);
      triggerSurge(Math.min(460, 240 + currentChain * 45));
      await delay(prefersReducedMotion ? 80 : 160);

      // Remove matches
      const gridWithNulls = [...currentGrid.map(row => [...row])];
      matches.forEach(({ r, c }) => {
        gridWithNulls[r][c] = null;
      });
      setGrid(gridWithNulls);
      setHighlightedTiles(new Set());
      
      // Update score
      const scoreGain = matches.length * 10 * currentChain;
      const manaGain = Math.floor(scoreGain / 10);
      currentMana = Math.min(100, currentMana + manaGain);
      setScore(s => s + scoreGain);
      setMana(currentMana);
      setChain(currentChain);

      await delay(prefersReducedMotion ? 90 : 220);

      // Gravity and refill
      currentGrid = applyGravityAndRefill(gridWithNulls);
      setGrid(currentGrid);
      
      await delay(prefersReducedMotion ? 130 : 320);

      matches = findMatches(currentGrid);
      if (matches.length > 0) {
        currentChain++;
      }
    }

    setIsAnimating(false);
    if (currentMana >= 100) {
      endGame('win');
      return;
    }
    if (remainingMoves <= 0) {
      endGame('lose');
    }
  };

  const handleRequestTip = async () => {
    if (isLoadingTip || gameState !== 'playing') {
      return;
    }

    playSound('buttonClick');
    setIsLoadingTip(true);
    setTipError('');
    try {
      const nextTip = await requestArcaneTip({score, moves, chain, mana});
      setTip(nextTip);
      playSound('tipReveal');
    } catch (error) {
      setTipError(error instanceof Error ? error.message : 'Unable to fetch tip');
    } finally {
      setIsLoadingTip(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-white flex items-center justify-center font-serif select-none overflow-hidden relative">
      {gameState === 'title' && <TitleScreen onStart={startGame} />}

      {gameState !== 'title' && (
        <div className="w-full max-w-[600px] p-4 flex flex-col gap-2">
          <Header isMuted={isMuted} onToggleMute={handleToggleMute} />
          <div className="flex gap-2 justify-center">
            <LeftPillar score={score} moves={moves} chain={chain} />
            <div className="flex flex-col gap-2">
              <div
                className={`relative w-[320px] h-[320px] bg-[#0a0e18] border border-[#1e3060] rounded-md overflow-hidden arcane-board ${isShaking ? 'arcane-board--shake' : ''} ${isSurging ? 'arcane-board--surge' : ''}`}
              >
                <div
                  className="pointer-events-none absolute inset-0 arcane-aura"
                  style={{ '--mana-level': `${Math.max(0.08, mana / 100)}` } as CSSProperties}
                />
                <div className="pointer-events-none absolute inset-0 arcane-rune-wheel">
                  <div className="arcane-rune-wheel__inner">ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ✦ ᛉ ᛋ ᛏ ✦ ᚾ ᛁ ᛃ ᛇ</div>
                </div>
                <div
                  className={`pointer-events-none absolute inset-0 arcane-flash ${
                    flashKind === 'fail' ? 'arcane-flash--fail' : flashKind === 'win' ? 'arcane-flash--win' : ''
                  }`}
                />
                {/* Grid lines */}
                <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-30 pointer-events-none">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i} className="border border-[#1e3060]"></div>
                  ))}
                </div>
                
                <AnimatePresence>
                  {grid.flatMap((row, r) => row.map((tile, c) => {
                    if (!tile) return null;
                    const cellKey = `${r},${c}`;
                    const isHighlighted = highlightedTiles.has(cellKey);
                    const initialScale = prefersReducedMotion ? 1 : 0.78;
                    return (
                      <motion.div
                        key={tile.id}
                        initial={{ opacity: 0, scale: initialScale }}
                        animate={{ opacity: 1, scale: 1, x: c * 40, y: r * 40 }}
                        exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.25 }}
                        transition={
                          prefersReducedMotion
                            ? { duration: 0.08 }
                            : { type: 'spring', stiffness: 280, damping: 22 }
                        }
                        className="absolute w-[40px] h-[40px] p-[2px]"
                        onClick={() => handleTileClick(r, c)}
                      >
                        <div className={`w-full h-full rounded border flex items-center justify-center text-xl cursor-pointer shadow-inner tile-shell
                          ${selected?.r === r && selected?.c === c ? 'border-[#60a0ff] shadow-[0_0_8px_#60a0ff] bg-[#1a2840]' : 'border-[#1e3060] bg-[#0d1828] hover:bg-[#152540]'}
                          ${isHighlighted ? 'tile-match-glow border-[#9ed8ff] bg-[#213754]' : ''}`}
                        >
                          {ELEMENTS[tile.type as keyof typeof ELEMENTS].icon}
                        </div>
                      </motion.div>
                    );
                  }))}
                </AnimatePresence>

                <div className="pointer-events-none absolute inset-0">
                  {waves.map((wave) => {
                    const waveStyle: CSSProperties & {
                      '--wave-scale': string;
                      '--wave-opacity': string;
                      '--wave-color': string;
                    } = {
                      '--wave-scale': `${0.7 + wave.intensity * 0.24}`,
                      '--wave-opacity': `${Math.min(0.9, 0.22 + wave.intensity * 0.1)}`,
                      '--wave-color':
                        wave.kind === 'win'
                          ? '#ffe080'
                          : wave.kind === 'fail'
                            ? '#ff8a9f'
                            : '#86d2ff',
                    };
                    return (
                      <span
                        key={wave.id}
                        className={`arcane-sigil-wave arcane-sigil-wave--${wave.kind}`}
                        style={{ left: `${wave.x}px`, top: `${wave.y}px`, ...waveStyle }}
                      />
                    );
                  })}

                  {bursts.map((burst) => {
                    const particleCount = burst.kind === 'win' ? 22 : Math.min(20, 10 + Math.floor(burst.intensity * 3));
                    const radius = burst.kind === 'win' ? 92 : 40 + burst.intensity * 12;
                    return (
                      <div
                        key={burst.id}
                        className={`arcane-burst ${burst.kind === 'win' ? 'arcane-burst--win' : ''}`}
                        style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
                      >
                        {Array.from({ length: particleCount }).map((_, index) => {
                          const angle = (Math.PI * 2 * index) / particleCount;
                          const distance = radius + (index % 3) * 8;
                          const particleStyle: CSSProperties & {
                            '--dx': string;
                            '--dy': string;
                            '--delay': string;
                            '--particle-color': string;
                            '--particle-size': string;
                          } = {
                            '--dx': `${Math.cos(angle) * distance}px`,
                            '--dy': `${Math.sin(angle) * distance}px`,
                            '--delay': `${index * 10}ms`,
                            '--particle-color': burst.kind === 'win' ? '#ffe080' : '#9fd8ff',
                            '--particle-size': `${Math.min(9, 4 + burst.intensity * 1.1)}px`,
                          };
                          return <span key={`${burst.id}-${index}`} className="arcane-particle" style={particleStyle} />;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <ChargeBar mana={mana} />
            </div>
            <RightPillar
              tip={tip}
              isLoadingTip={isLoadingTip}
              tipError={tipError}
              prefersReducedMotion={Boolean(prefersReducedMotion)}
              onRequestTip={handleRequestTip}
            />
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <GameOverScreen
          outcome={gameOutcome}
          onRestart={() => {
            playSound('buttonClick');
            setGameState('playing');
          }}
        />
      )}
    </div>
  );
}
