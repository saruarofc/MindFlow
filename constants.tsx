
import { Zap, Wind, Target, LucideIcon } from 'lucide-react';
import { FlowMode } from './types';

export interface ModeConfig {
  id: FlowMode;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  desc: string;
}

export const MODES: ModeConfig[] = [
  { 
    id: 'sprint', 
    label: 'Sprint', 
    icon: Zap, 
    color: 'text-[#FFD60A]', 
    bg: 'bg-[#FFD60A]/10', 
    desc: 'Focus on maximum output and high-impact tasks.' 
  },
  { 
    id: 'recovery', 
    label: 'Recovery', 
    icon: Wind, 
    color: 'text-[#00D2FF]', 
    bg: 'bg-[#00D2FF]/10', 
    desc: 'Prioritize mental healing and low-energy maintenance.' 
  },
  { 
    id: 'balance', 
    label: 'Balance', 
    icon: Target, 
    color: 'text-[#5E5CE6]', 
    bg: 'bg-[#5E5CE6]/10', 
    desc: 'Sustainable flow for long-term consistency.' 
  }
];
