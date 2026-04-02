import { Flame, Snowflake, Sparkles, Leaf, Zap } from 'lucide-react';

export const ROWS = 8;
export const COLS = 8;

export const ELEMENTS = {
  1: { id: 1, name: "Fire", color: "#ff4030", icon: <Flame size={20} color="#ff4030" /> },
  2: { id: 2, name: "Ice", color: "#40c0ff", icon: <Snowflake size={20} color="#40c0ff" /> },
  3: { id: 3, name: "Arcane", color: "#b040ff", icon: <Sparkles size={20} color="#b040ff" /> },
  4: { id: 4, name: "Earth", color: "#40c060", icon: <Leaf size={20} color="#40c060" /> },
  5: { id: 5, name: "Light", color: "#ffe060", icon: <Zap size={20} color="#ffe060" /> },
};
