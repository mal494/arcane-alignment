import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ELEMENTS } from './constants';
import { generateValidBoard, findMatches, applyGravityAndRefill, TileData } from './gameLogic';

const Header = () => (
  <div className="w-full h-[120px] bg-[#0a0e18] border border-[#1e3060] rounded-md flex flex-col items-center justify-center relative">
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

const RightPillar = () => (
  <div className="w-[120px] bg-[#0a0e18] border border-[#1e3060] rounded-md flex flex-col items-center py-4 px-2">
    <span className="text-[10px] text-[#c0a040] tracking-widest mb-4">-- CHALLENGE --</span>
    
    <div className="w-[96px] h-[140px] bg-[#0d1828] border border-[#2a4080] rounded flex flex-col items-center justify-center relative mb-4">
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

export default function App() {
  const [gameState, setGameState] = useState<'title' | 'playing' | 'gameover'>('title');
  const [grid, setGrid] = useState<TileData[][]>([]);
  const [selected, setSelected] = useState<{r: number, c: number} | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(30);
  const [chain, setChain] = useState(1);
  const [mana, setMana] = useState(0);

  useEffect(() => {
    if (gameState === 'playing') {
      setGrid(generateValidBoard());
      setScore(0);
      setMoves(30);
      setChain(1);
      setMana(0);
    }
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = () => {
      if (gameState === 'title') {
        setGameState('playing');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const handleTileClick = async (r: number, c: number) => {
    if (isAnimating || moves <= 0) return;

    if (!selected) {
      setSelected({ r, c });
      return;
    }

    const isAdjacent = Math.abs(selected.r - r) + Math.abs(selected.c - c) === 1;
    if (!isAdjacent) {
      setSelected({ r, c });
      return;
    }

    // Swap
    setIsAnimating(true);
    setSelected(null);
    setMoves(m => m - 1);
    setChain(1);

    const newGrid = [...grid.map(row => [...row])];
    const temp = newGrid[selected.r][selected.c];
    newGrid[selected.r][selected.c] = newGrid[r][c];
    newGrid[r][c] = temp;
    setGrid(newGrid);

    // Wait for swap animation
    await new Promise(resolve => setTimeout(resolve, 300));

    let currentGrid = newGrid;
    let currentChain = 1;
    let matches = findMatches(currentGrid);

    if (matches.length === 0) {
      // Swap back
      const revertGrid = [...currentGrid.map(row => [...row])];
      const temp2 = revertGrid[selected.r][selected.c];
      revertGrid[selected.r][selected.c] = revertGrid[r][c];
      revertGrid[r][c] = temp2;
      setGrid(revertGrid);
      await new Promise(resolve => setTimeout(resolve, 300));
      setIsAnimating(false);
      return;
    }

    // Process matches loop
    while (matches.length > 0) {
      // Remove matches
      const gridWithNulls = [...currentGrid.map(row => [...row])];
      matches.forEach(({ r, c }) => {
        gridWithNulls[r][c] = null as any;
      });
      setGrid(gridWithNulls);
      
      // Update score
      setScore(s => s + matches.length * 10 * currentChain);
      setMana(m => Math.min(100, m + Math.floor((matches.length * 10 * currentChain) / 10)));
      setChain(currentChain);

      await new Promise(resolve => setTimeout(resolve, 300));

      // Gravity and refill
      currentGrid = applyGravityAndRefill(gridWithNulls);
      setGrid(currentGrid);
      
      await new Promise(resolve => setTimeout(resolve, 400));

      matches = findMatches(currentGrid);
      if (matches.length > 0) {
        currentChain++;
      }
    }

    setIsAnimating(false);
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-white flex items-center justify-center font-serif select-none overflow-hidden">
      {gameState === 'title' && <TitleScreen onStart={() => setGameState('playing')} />}
      
      {gameState === 'playing' && (
        <div className="w-full max-w-[600px] p-4 flex flex-col gap-2">
          <Header />
          <div className="flex gap-2 justify-center">
            <LeftPillar score={score} moves={moves} chain={chain} />
            <div className="flex flex-col gap-2">
              <div className="relative w-[320px] h-[320px] bg-[#0a0e18] border border-[#1e3060] rounded-md overflow-hidden">
                {/* Grid lines */}
                <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-30 pointer-events-none">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i} className="border border-[#1e3060]"></div>
                  ))}
                </div>
                
                <AnimatePresence>
                  {grid.flatMap((row, r) => row.map((tile, c) => {
                    if (!tile) return null;
                    return (
                      <motion.div
                        key={tile.id}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1, x: c * 40, y: r * 40 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="absolute w-[40px] h-[40px] p-[2px]"
                        onClick={() => handleTileClick(r, c)}
                      >
                        <div className={`w-full h-full rounded border flex items-center justify-center text-xl cursor-pointer shadow-inner
                          ${selected?.r === r && selected?.c === c ? 'border-[#60a0ff] shadow-[0_0_8px_#60a0ff] bg-[#1a2840]' : 'border-[#1e3060] bg-[#0d1828] hover:bg-[#152540]'}`}
                        >
                          {ELEMENTS[tile.type as keyof typeof ELEMENTS].icon}
                        </div>
                      </motion.div>
                    );
                  }))}
                </AnimatePresence>
              </div>
              <ChargeBar mana={mana} />
            </div>
            <RightPillar />
          </div>
        </div>
      )}
    </div>
  );
}
