import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Keyboard, Type, BookOpen, X, Home, Flag, Music } from 'lucide-react';
import { dictionary } from './dictionary';
import { soundEngine } from './lib/sound';

type GameState = 'menu' | 'playing' | 'gameover';
type Difficulty = 'easy' | 'medium' | 'hard';

type VisualEffect = {
  id: string;
  type: 'score' | 'miss' | 'explosion' | 'keystroke' | 'spark';
  x: number;
  y: number;
  text?: string;
  color?: string;
};

type WordObj = {
  id: string;
  text: string;
  x: number;
  y: number;
  duration: number;
  spawnTime: number;
  typedLength: number;
};

type Stats = {
  score: number;
  combo: number;
  maxCombo: number;
  hp: number;
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showRules, setShowRules] = useState(false);
  const [words, setWords] = useState<WordObj[]>([]);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ score: 0, combo: 0, maxCombo: 0, hp: 100 });
  const [screenFlash, setScreenFlash] = useState(false);
  const [effects, setEffects] = useState<VisualEffect[]>([]);
  const [track, setTrack] = useState<number>(0);
  const wordIdCounter = useRef(0);

  useEffect(() => {
    soundEngine.playMusic(track);
  }, [track, gameState]); // Re-evaluate when game state changes to keep it playing if needed

  // Difficulty tier increases every 500 score points
  const difficultyTier = Math.floor(stats.score / 500);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRules(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const triggerDamage = (amount: number) => {
    soundEngine.playDamage();
    setStats(s => ({
      ...s,
      hp: Math.max(0, s.hp - amount),
      combo: 0
    }));
    setScreenFlash(true);
    setTimeout(() => setScreenFlash(false), 150);
  };

  // Game over check
  useEffect(() => {
    if (stats.hp <= 0 && gameState === 'playing') {
      soundEngine.playGameOver();
      setGameState('gameover');
    }
  }, [stats.hp, gameState]);

  // Spawning logic
  useEffect(() => {
    if (gameState !== 'playing') return;

    const diffSettings = {
      easy: { baseRate: 2000, minRate: 800, baseTtl: 6000, minTtl: 3000, maxConcurrent: 5, timePerChar: 400 },
      medium: { baseRate: 1500, minRate: 400, baseTtl: 4500, minTtl: 2000, maxConcurrent: 7, timePerChar: 300 },
      hard: { baseRate: 1000, minRate: 200, baseTtl: 3000, minTtl: 1300, maxConcurrent: 10, timePerChar: 200 }
    }[difficulty];

    // Faster spawn rate as difficulty tier increases
    const rate = Math.max(diffSettings.minRate, diffSettings.baseRate - difficultyTier * 150);
    
    const spawnInterval = setInterval(() => {
      setWords(prev => {
        // Max concurrent words limits chaos slightly
        if (prev.length >= diffSettings.maxConcurrent + Math.floor(difficultyTier / 3)) return prev;

        const rawWord = dictionary[Math.floor(Math.random() * dictionary.length)].toLowerCase();
        
        let newX = 0;
        let newY = 0;
        let attempts = 0;
        let valid = false;
        
        while (!valid && attempts < 15) {
          newX = 10 + Math.random() * 80;
          newY = 10 + Math.random() * 80;
          valid = true;
          
          for (const w of prev) {
            const dx = Math.abs(w.x - newX);
            const dy = Math.abs(w.y - newY);
            if (dx < 16 && dy < 10) {
              valid = false;
              break;
            }
          }
          attempts++;
        }

        // Base TTL + extra time for long words, decreases with difficulty
        const baseTtl = Math.max(diffSettings.minTtl, diffSettings.baseTtl - difficultyTier * 400);
        const duration = baseTtl + rawWord.length * diffSettings.timePerChar;

        const newWord: WordObj = {
          id: `word-${Date.now()}-${wordIdCounter.current++}`,
          text: rawWord,
          x: newX,
          y: newY,
          duration,
          spawnTime: Date.now(),
          typedLength: 0
        };

        return [...prev, newWord];
      });
    }, rate);

    return () => clearInterval(spawnInterval);
  }, [gameState, difficultyTier, difficulty]);

  // Setup refs for synchronous event handler state access
  const wordsRef = useRef(words);
  const lockedIdRef = useRef(lockedId);
  const statsRef = useRef(stats);
  const difficultyRef = useRef(difficulty);

  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => { lockedIdRef.current = lockedId; }, [lockedId]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  // TTL & Culling loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const tick = setInterval(() => {
      const now = Date.now();
      const currentWords = wordsRef.current;
      const currentLockedId = lockedIdRef.current;
      const currentStats = statsRef.current;
      const currentDiff = difficultyRef.current;

      const isDead = (w: WordObj) => now >= w.spawnTime + w.duration;
      const deadWords = currentWords.filter(isDead);
      const aliveWords = currentWords.filter(w => !isDead(w));

      if (deadWords.length > 0) {
        let targetLockedMissed = false;
        const newEffects: VisualEffect[] = [];

        deadWords.forEach(w => {
          if (w.id === currentLockedId) targetLockedMissed = true;
          newEffects.push({
            id: `miss-${w.id}-${Date.now()}-${Math.random()}`,
            type: 'miss',
            x: w.x,
            y: w.y,
            text: 'MISS',
            color: 'text-red-500'
          });
        });

        const dmgPerMiss = currentDiff === 'hard' ? 25 : currentDiff === 'easy' ? 8 : 15;
        const dmg = deadWords.length * dmgPerMiss;

        const nextStats = { ...currentStats, hp: Math.max(0, currentStats.hp - dmg), combo: 0 };
        const nextLockedId = targetLockedMissed ? null : currentLockedId;

        wordsRef.current = aliveWords;
        lockedIdRef.current = nextLockedId;
        statsRef.current = nextStats;

        setWords(aliveWords);
        if (targetLockedMissed) setLockedId(null);
        setStats(nextStats);
        setEffects(e => {
          const combined = [...e, ...newEffects];
          return combined.length > 50 ? combined.slice(combined.length - 50) : combined;
        });
        
        soundEngine.playDamage();
        setScreenFlash(true);
        setTimeout(() => setScreenFlash(false), 150);
      }
    }, 50);

    return () => clearInterval(tick);
  }, [gameState]);

  // Typing logic
  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const key = e.key.toLowerCase();
      
      // Match Russian characters only
      if (!/^[а-яё]$/.test(key)) return;

      const currentWords = [...wordsRef.current];
      const currentLockedId = lockedIdRef.current;
      const currentStats = statsRef.current;
      const currentDiff = difficultyRef.current;

      let nextWords = currentWords;
      let nextLockedId = currentLockedId;
      let nextStats = currentStats;
      const newEffects: VisualEffect[] = [];
      let soundToPlay: 'keystroke' | 'wordComplete' | null = null;

      if (currentLockedId) {
        const targetIdx = currentWords.findIndex(w => w.id === currentLockedId);
        if (targetIdx > -1) {
          const target = currentWords[targetIdx];
          if (target.text[target.typedLength] === key) {
            soundToPlay = 'keystroke';
            newEffects.push({
              id: `key-${Date.now()}-${Math.random()}`,
              type: 'keystroke',
              x: target.x + (Math.random() * 4 - 2),
              y: target.y + (Math.random() * 4 - 2),
              text: key.toUpperCase()
            });

            if (target.typedLength + 1 === target.text.length) {
              soundToPlay = 'wordComplete';
              const scoreGain = Math.round(target.text.length * 10 * (1 + currentStats.combo * 0.1) * (currentDiff === 'hard' ? 1.5 : currentDiff === 'easy' ? 0.7 : 1));
              const healAmt = currentDiff === 'hard' ? 1 : currentDiff === 'easy' ? 4 : 2;

              const sparks: VisualEffect[] = Array.from({ length: 5 }).map((_, i) => ({
                id: `spark-${Date.now()}-${Math.random()}-${i}`,
                type: 'spark',
                x: target.x,
                y: target.y
              }));

              newEffects.push(...sparks, {
                id: `score-${Date.now()}-${Math.random()}`,
                type: 'score',
                x: target.x,
                y: target.y,
                text: `+${scoreGain}`,
                color: 'text-emerald-400'
              }, {
                id: `exp-${Date.now()}-${Math.random()}`,
                type: 'explosion',
                x: target.x,
                y: target.y
              });

              nextStats = {
                ...currentStats,
                score: currentStats.score + scoreGain,
                combo: currentStats.combo + 1,
                maxCombo: Math.max(currentStats.maxCombo, currentStats.combo + 1),
                hp: Math.min(100, currentStats.hp + healAmt)
              };
              nextLockedId = null;
              nextWords.splice(targetIdx, 1);
            } else {
              nextWords[targetIdx] = { ...target, typedLength: target.typedLength + 1 };
            }
          } else {
            // Wrong character
            nextStats = { ...currentStats, combo: 0 };
          }
        } else {
          nextLockedId = null;
        }
      } else {
        const candidates = currentWords.filter(w => w.text[0] === key);
        if (candidates.length > 0) {
          const urgencySort = candidates.sort((a, b) => 
            (a.spawnTime + a.duration) - (b.spawnTime + b.duration)
          );
          const selected = urgencySort[0];
          const targetIdx = currentWords.findIndex(w => w.id === selected.id);
          
          nextLockedId = selected.id;

          if (selected.text.length === 1) {
            soundToPlay = 'wordComplete';
            const scoreGain = Math.round(10 * (1 + currentStats.combo * 0.1) * (currentDiff === 'hard' ? 1.5 : currentDiff === 'easy' ? 0.7 : 1));
            const healAmt = currentDiff === 'hard' ? 1 : currentDiff === 'easy' ? 4 : 2;

            const sparks: VisualEffect[] = Array.from({ length: 5 }).map((_, i) => ({
              id: `spark-${Date.now()}-${Math.random()}-${i}`,
              type: 'spark',
              x: selected.x,
              y: selected.y
            }));

            newEffects.push(...sparks, {
              id: `score-${Date.now()}-${Math.random()}`,
              type: 'score',
              x: selected.x,
              y: selected.y,
              text: `+${scoreGain}`,
              color: 'text-emerald-400'
            }, {
              id: `exp-${Date.now()}-${Math.random()}`,
              type: 'explosion',
              x: selected.x,
              y: selected.y
            });

            nextStats = {
              ...currentStats,
              score: currentStats.score + scoreGain,
              combo: currentStats.combo + 1,
              maxCombo: Math.max(currentStats.maxCombo, currentStats.combo + 1),
              hp: Math.min(100, currentStats.hp + healAmt)
            };
            nextLockedId = null;
            nextWords.splice(targetIdx, 1);
          } else {
            soundToPlay = 'keystroke';
            newEffects.push({
              id: `key-${Date.now()}-${Math.random()}`,
              type: 'keystroke',
              x: selected.x + (Math.random() * 4 - 2),
              y: selected.y + (Math.random() * 4 - 2),
              text: key.toUpperCase()
            });
            nextWords[targetIdx] = { ...selected, typedLength: 1 };
          }
        } else {
          nextStats = { ...currentStats, combo: 0 };
        }
      }

      wordsRef.current = nextWords;
      lockedIdRef.current = nextLockedId;
      statsRef.current = nextStats;

      setWords(nextWords);
      if (nextLockedId !== currentLockedId) setLockedId(nextLockedId);
      if (nextStats !== currentStats) setStats(nextStats);
      if (newEffects.length > 0) {
        setEffects(e => {
          const combined = [...e, ...newEffects];
          return combined.length > 50 ? combined.slice(combined.length - 50) : combined;
        });
      }

      if (soundToPlay === 'keystroke') soundEngine.playKeystroke();
      if (soundToPlay === 'wordComplete') soundEngine.playWordComplete();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const startGame = () => {
    setGameState('playing');
    setWords([]);
    setLockedId(null);
    setStats({ score: 0, combo: 0, maxCombo: 0, hp: 100 });
    setEffects([]);
  };

  return (
    <div className="w-full h-screen bg-[#020b06] text-emerald-50 overflow-hidden relative font-sans select-none">
      {/* Background Grid */}
      <motion.div 
        className={`absolute inset-0 bg-grid pointer-events-none ${stats.combo > 15 ? 'glitch-bg' : ''}`} 
        animate={{
          opacity: 0.3 + Math.min(stats.combo, 50) * 0.005,
          backgroundSize: `${50 + Math.min(stats.combo, 30) * 0.5}px ${50 + Math.min(stats.combo, 30) * 0.5}px`
        }}
        transition={{ duration: 0.5 }}
      />
      <div className="absolute inset-0 scanlines pointer-events-none opacity-20 z-[60] mix-blend-overlay" />
      <div className="absolute inset-0 vignette pointer-events-none z-[49]" />

      {/* Critical HP overlay */}
      {gameState === 'playing' && stats.hp <= 30 && stats.hp > 0 && (
        <div className="absolute inset-0 z-[48] bg-red-900/10 glitch-bg pointer-events-none" style={{ boxShadow: 'inset 0 0 100px rgba(239, 68, 68, 0.4)' }} />
      )}

      {/* Effects */}
      {effects.map(effect => {
        if (effect.type === 'score' || effect.type === 'miss') {
          return (
            <motion.div
              key={effect.id}
              initial={{ opacity: 0, y: '-50%', x: '-50%', scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], y: '-250%', x: '-50%', scale: [0.5, 1.2, 1] }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setEffects(prev => prev.filter(e => e.id !== effect.id))}
              className={`absolute font-black text-3xl drop-shadow-[0_0_15px_currentColor] z-[65] pointer-events-none ${effect.color || 'text-emerald-400'}`}
              style={{ left: `${effect.x}%`, top: `${effect.y}%` }}
            >
              {effect.text}
            </motion.div>
          );
        }
        if (effect.type === 'explosion') {
          return (
            <motion.div
              key={effect.id}
              initial={{ opacity: 1, scale: 0, x: '-50%', y: '-50%', borderWidth: '8px' }}
              animate={{ opacity: 0, scale: 3.5, x: '-50%', y: '-50%', borderWidth: '0px' }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              onAnimationComplete={() => setEffects(prev => prev.filter(e => e.id !== effect.id))}
              className="absolute w-24 h-24 rounded-full border-emerald-400 z-[64] pointer-events-none shadow-[0_0_30px_rgba(52,211,153,0.8)]"
              style={{ left: `${effect.x}%`, top: `${effect.y}%` }}
            />
          );
        }
        if (effect.type === 'keystroke') {
          const angle = Math.random() * Math.PI * 2;
          const dist = 60 + Math.random() * 60;
          return (
            <motion.div
              key={effect.id}
              initial={{ opacity: 1, scale: 1.5, x: '-50%', y: '-50%' }}
              animate={{ 
                opacity: 0, 
                scale: 0.5, 
                x: `calc(-50% + ${Math.cos(angle) * dist}px)`, 
                y: `calc(-50% + ${Math.sin(angle) * dist}px - 30px)` 
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              onAnimationComplete={() => setEffects(prev => prev.filter(e => e.id !== effect.id))}
              className="absolute font-mono font-bold text-2xl text-emerald-100 z-[66] pointer-events-none drop-shadow-[0_0_15px_rgba(52,211,153,1)]"
              style={{ left: `${effect.x}%`, top: `${effect.y}%` }}
            >
              {effect.text}
            </motion.div>
          );
        }
        if (effect.type === 'spark') {
          const angle = Math.random() * Math.PI * 2;
          const dist = 120 + Math.random() * 150;
          return (
            <motion.div
              key={effect.id}
              initial={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              animate={{ 
                opacity: 0, 
                scale: 0, 
                x: `calc(-50% + ${Math.cos(angle) * dist}px)`, 
                y: `calc(-50% + ${Math.sin(angle) * dist}px)` 
              }}
              transition={{ duration: 0.8, ease: "circOut" }}
              onAnimationComplete={() => setEffects(prev => prev.filter(e => e.id !== effect.id))}
              className="absolute w-2 h-2 bg-emerald-300 rounded-full z-[63] pointer-events-none shadow-[0_0_15px_rgba(52,211,153,1)]"
              style={{ left: `${effect.x}%`, top: `${effect.y}%` }}
            />
          );
        }
        return null;
      })}

      {/* Screen flash on damage */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            key="screen-flash"
            initial={{ opacity: 0.5, backgroundColor: '#ef4444' }}
            animate={{ opacity: 0, backgroundColor: '#ef4444' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 pointer-events-none mix-blend-overlay"
          />
        )}
      </AnimatePresence>

      {/* HUD (Heads Up Display) */}
      {gameState === 'playing' && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
          <div className="flex flex-col gap-2">
            <div className="text-4xl font-mono font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
              {String(stats.score).padStart(6, '0')}
            </div>
            {stats.combo > 1 && (
              <motion.div
                key={stats.combo}
                initial={{ scale: 1.5, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
                className="text-2xl font-bold italic text-emerald-300 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]"
              >
                {stats.combo}x COMBO
              </motion.div>
            )}
          </div>
          
          <div className="w-64 flex flex-col items-end gap-3 pointer-events-auto">
            <div className="w-full">
              <div className="text-sm font-bold text-emerald-500 mb-1 tracking-widest text-right">HP</div>
              <div className="w-full h-4 bg-emerald-950/80 rounded-full border border-emerald-900 overflow-hidden backdrop-blur-sm">
                <div
                  className={`h-full transition-all duration-500 ease-out ${stats.hp > 50 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]' : 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`}
                  style={{ width: `${stats.hp}%` }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setGameState('menu')} className="px-3 py-1.5 text-xs font-bold text-emerald-600 border border-emerald-900 rounded-lg hover:bg-emerald-900/40 hover:text-emerald-400 hover:border-emerald-700 flex items-center gap-1.5 transition-all cursor-pointer">
                <Home className="w-3.5 h-3.5" /> В МЕНЮ
              </button>
              <button onClick={() => setStats(s => ({...s, hp: 0}))} className="px-3 py-1.5 text-xs font-bold text-red-700 border border-red-900/40 rounded-lg hover:bg-red-900/30 hover:text-red-500 flex items-center gap-1.5 transition-all cursor-pointer">
                <Flag className="w-3.5 h-3.5" /> СДАТЬСЯ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Game Arena */}
      {gameState === 'playing' && (
        <div className="absolute inset-0 z-10 w-full h-full pointer-events-none">
          <AnimatePresence>
            {words.map((word) => {
              const isLocked = word.id === lockedId;
              return (
                <motion.div
                  key={word.id}
                  initial={{ opacity: 0, scale: 0.5, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.3, filter: 'blur(10px)' }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${isLocked ? 'z-50' : 'z-10'}`}
                  style={{ left: `${word.x}%`, top: `${word.y}%` }}
                >
                  <div className="relative">
                    {/* The approach oval */}
                    <div
                      className="absolute inset-0 rounded-full border border-emerald-400 approach-oval pointer-events-none"
                      style={{ animationDuration: `${word.duration}ms` }}
                    />

                    {/* The inner word box */}
                    <div className={`px-6 py-2 rounded-full border-2 backdrop-blur-md whitespace-nowrap overflow-hidden transition-all duration-200 ${isLocked ? 'border-emerald-300 bg-emerald-950/90 shadow-[0_0_25px_rgba(52,211,153,0.6)] scale-110' : 'border-emerald-800/60 bg-[#021207]/80'}`}>
                      <span className="text-2xl font-bold font-mono tracking-wide text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
                        {word.text.substring(0, word.typedLength).split('').map((char, i) => (
                          <motion.span 
                            key={`${word.id}-char-${i}`} 
                            initial={{ scale: 1.5, opacity: 0, y: -5, color: '#ffffff' }} 
                            animate={{ scale: 1, opacity: 1, y: 0, color: '#6ee7b7' }} 
                            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                            className="inline-block"
                          >
                            {char}
                          </motion.span>
                        ))}
                      </span>
                      <span className={`text-2xl font-bold font-mono tracking-wide ${isLocked ? 'text-emerald-500/70' : 'text-emerald-700/80'}`}>
                        {word.text.substring(word.typedLength)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Multiplier background effect */}
      {gameState === 'playing' && stats.combo >= 10 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 mix-blend-screen opacity-[0.03]">
          <motion.span
            key={`bg-${Math.floor(stats.combo / 10)}`}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="text-[25vw] font-bold font-mono text-emerald-500"
          >
            {stats.combo}x
          </motion.span>
        </div>
      )}

      {/* Menu overlays */}
      <AnimatePresence>
        {gameState === 'menu' && (
          <motion.div
            key="menu-overlay"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(10px)', scale: 1.05 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#020b06]/80 backdrop-blur-md"
          >
            <div className="w-full max-w-lg p-10 flex flex-col items-center">
              {/* New TVIS Logo */}
              <div className="relative w-32 h-32 rounded-[2rem] bg-[#031509] flex items-center justify-center border-2 border-emerald-400 shadow-[0_0_60px_rgba(52,211,153,0.3)] mb-8 overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-transparent" />
                <Keyboard className="absolute w-20 h-20 text-emerald-500/20 -bottom-4 -right-2 transform -rotate-12 transition-transform duration-500 group-hover:scale-110" />
                <Type className="relative z-10 w-16 h-16 text-emerald-300 drop-shadow-[0_0_15px_rgba(52,211,153,1)]" />
              </div>
              
              <motion.div
                animate={{ 
                  y: [0, -15, 0],
                  scale: [1, 1.05, 1],
                  rotate: [0, 1, -1, 0]
                }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-100 via-emerald-400 to-emerald-700 mb-14 drop-shadow-[0_0_30px_rgba(52,211,153,0.6)] tracking-widest">
                  TVIS
                </h1>
              </motion.div>

              <div className="flex gap-4">
                <button
                  onClick={startGame}
                  className="group relative px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-[#020b06] font-bold text-xl rounded-full transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(52,211,153,0.8)] hover:scale-105 active:scale-95 flex items-center gap-3 cursor-pointer"
                >
                  <Play className="fill-current w-6 h-6" />
                  НАЧАТЬ ИГРУ
                  <div className="absolute inset-0 rounded-full ring-2 ring-emerald-400 scale-110 opacity-0 group-hover:animate-ping" />
                </button>

                <button
                  onClick={() => setShowRules(true)}
                  className="group px-6 py-4 bg-[#031509] border-2 border-emerald-500/50 hover:bg-emerald-900/40 text-emerald-400 hover:text-emerald-300 font-bold text-lg rounded-full transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:scale-105 active:scale-95 flex items-center gap-3 cursor-pointer"
                >
                  <BookOpen className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  ПРАВИЛА
                </button>
              </div>

              {/* Menu Settings */}
              <div className="mt-8 flex flex-col items-center gap-6 z-10 w-full px-4">
                {/* Difficulty Selector */}
                <div className="flex gap-3 p-1.5 bg-[#031509] border border-emerald-900 shadow-[0_0_20px_rgba(16,185,129,0.1)] rounded-xl relative z-10">
                  <button
                    onClick={() => setDifficulty('easy')}
                    className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 cursor-pointer ${difficulty === 'easy' ? 'bg-emerald-500 text-[#020b06] shadow-[0_0_15px_rgba(16,185,129,0.6)] scale-105' : 'text-emerald-600 hover:text-emerald-400 hover:bg-emerald-950/50'}`}
                  >
                    ЛЕГКИЙ
                  </button>
                  <div className="w-[1px] bg-emerald-900/50 my-2"></div>
                  <button
                    onClick={() => setDifficulty('medium')}
                    className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 cursor-pointer ${difficulty === 'medium' ? 'bg-emerald-500 text-[#020b06] shadow-[0_0_15px_rgba(16,185,129,0.6)] scale-105' : 'text-emerald-600 hover:text-emerald-400 hover:bg-emerald-950/50'}`}
                  >
                    СРЕДНИЙ
                  </button>
                  <div className="w-[1px] bg-emerald-900/50 my-2"></div>
                  <button
                    onClick={() => setDifficulty('hard')}
                    className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 cursor-pointer ${difficulty === 'hard' ? 'bg-emerald-500 text-[#020b06] shadow-[0_0_15px_rgba(16,185,129,0.6)] scale-105' : 'text-emerald-600 hover:text-emerald-400 hover:bg-emerald-950/50'}`}
                  >
                    СЛОЖНЫЙ
                  </button>
                </div>

                {/* Music Selector */}
                <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                  {[1, 2, 3, 4, 5, 6].map(t => (
                    <button
                      key={t}
                      onClick={() => setTrack(t)}
                      className={`px-3 py-1.5 rounded flex items-center justify-center font-bold text-xs transition-all duration-300 cursor-pointer ${track === t ? 'bg-emerald-500 text-[#020b06] shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'border border-emerald-900/50 text-emerald-600 hover:border-emerald-500/50 hover:text-emerald-400 bg-[#031509]'}`}
                    >
                      <Music className="w-3 h-3 mr-1" />
                      Трэк {t}
                    </button>
                  ))}
                  <button
                    onClick={() => setTrack(0)}
                    className={`px-3 py-1.5 rounded flex items-center justify-center font-bold text-xs transition-all duration-300 cursor-pointer ${track === 0 ? 'bg-red-500/20 text-red-500 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'border border-red-900/30 text-red-900 hover:border-red-500/50 hover:text-red-500 bg-[#031509]'}`}
                  >
                    Выкл
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {showRules && (
          <motion.div
            key="rules-overlay"
            initial={{ opacity: 0, scale: 0.95, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: 20, filter: 'blur(10px)' }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-[#010804]/95 backdrop-blur-md p-4 sm:p-6"
          >
            <div className="w-full max-w-2xl bg-gradient-to-b from-[#04170a] to-[#020c05] border border-emerald-800/60 rounded-3xl p-8 sm:p-10 shadow-[0_0_50px_rgba(2,11,6,1)] relative overflow-y-auto max-h-full no-scrollbar">
              <button 
                onClick={() => setShowRules(false)}
                className="absolute top-4 right-4 p-3 rounded-full text-emerald-600/70 hover:text-emerald-300 hover:bg-emerald-900/30 active:bg-emerald-900/50 transition-all cursor-pointer"
                title="Закрыть"
              >
                <X className="w-7 h-7" />
              </button>
              
              <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-100 to-emerald-500 mb-8 tracking-wide drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">ПРАВИЛА</h2>
              
              <div className="space-y-8 text-emerald-100/80 text-[1.1rem] leading-relaxed font-light">
                <section>
                  <h3 className="text-lg font-bold text-emerald-400 mb-3 tracking-widest uppercase">Цель игры</h3>
                  <div className="bg-emerald-950/20 p-5 rounded-2xl border border-emerald-900/30">
                    <p className="m-0">
                      Продержаться как можно дольше, набирая очки за правильный и быстрый ввод слов. Если ваше здоровье (HP) упадет до нуля — игра окончена.
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-emerald-400 mb-4 tracking-widest uppercase">Как играть</h3>
                  <ul className="space-y-5">
                    <li className="flex gap-5 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm mt-0.5">1</div>
                      <div><strong className="text-emerald-200">Слова-мишени:</strong> На экране появляются слова случайным образом.</div>
                    </li>
                    <li className="flex gap-5 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm mt-0.5">2</div>
                      <div><strong className="text-emerald-200">Таймер-кольцо:</strong> Зелёное кольцо вокруг слова сужается. Это ваш таймер. Если не успеете напечатать до смыкания — получите урон!</div>
                    </li>
                    <li className="flex gap-5 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm mt-0.5">3</div>
                      <div><strong className="text-emerald-200">Захват цели:</strong> Печать первой буквы любого слова фиксирует прицел на нём. Остальные слова заблокированы, пока вы не допишете это. <em className="text-emerald-400/80">(Проверьте русскую раскладку)</em></div>
                    </li>
                    <li className="flex gap-5 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm mt-0.5">4</div>
                      <div><strong className="text-emerald-200">Комбо и ошибки:</strong> Безошибочный ввод увеличивает множитель КОМБО. Опечатка внутри слова мгновенно сбрасывает множитель.</div>
                    </li>
                    <li className="flex gap-5 items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm mt-0.5">5</div>
                      <div><strong className="text-emerald-200">Эскалация:</strong> Каждые 500 очков переходят в новый уровень. Слова будут появляться чаще и исчезать быстрее.</div>
                    </li>
                  </ul>
                </section>
              </div>
              
              <button
                onClick={() => setShowRules(false)}
                className="mt-10 w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#010804] font-black text-xl rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] active:scale-95 cursor-pointer"
              >
                ПОНЯТНО
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div
            key="gameover-overlay"
            initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#020b06]/90 backdrop-blur-md"
          >
            <div className="w-full max-w-md bg-[#04170a] border border-emerald-800 rounded-3xl p-8 flex flex-col items-center shadow-[0_0_50px_rgba(2,11,6,0.8)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-emerald-500 to-red-500" />
              
              <h2 className="text-3xl font-bold text-emerald-400 mb-6 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">ИГРА ОКОНЧЕНА</h2>
              
              <div className="w-full space-y-4 mb-8">
                <div className="bg-emerald-950/50 p-4 rounded-xl flex justify-between items-center border border-emerald-900/30">
                  <span className="text-emerald-600 font-bold tracking-wider">СЧЕТ</span>
                  <span className="text-3xl font-mono text-emerald-300 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]">{stats.score}</span>
                </div>
                <div className="bg-emerald-950/50 p-4 rounded-xl flex justify-between items-center border border-emerald-900/30">
                  <span className="text-emerald-600 font-bold tracking-wider">МАКС КОМБО</span>
                  <span className="text-xl font-mono text-emerald-400">{stats.maxCombo}x</span>
                </div>
              </div>

              <div className="w-full flex gap-3">
                <button
                  onClick={() => setGameState('menu')}
                  className="flex-1 py-4 bg-[#031509] border-2 border-emerald-900 text-emerald-600 hover:bg-emerald-900/40 hover:text-emerald-400 hover:border-emerald-700 font-bold text-sm sm:text-base rounded-xl transition-all active:scale-95 flex justify-center items-center gap-2 cursor-pointer"
                >
                  <Home className="w-5 h-5" />
                  В МЕНЮ
                </button>
                <button
                  onClick={startGame}
                  className="flex-[2] py-4 bg-transparent border-2 border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-[#020b06] font-bold text-sm sm:text-base rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(52,211,153,0.6)] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  НАЧАТЬ ЗАНОВО
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

