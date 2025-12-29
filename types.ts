
export type FlowMode = 'sprint' | 'recovery' | 'balance';
export type Priority = 'high' | 'medium' | 'low';

export interface Task {
  title: string;
  duration: number;
  isBreak: boolean;
  energyRequired: number;
  completed: boolean;
  priority: Priority;
}

export interface Analysis {
  mood: string;
  energyLevel: number;
  suggestedTasks: string[];
  coachingAdvice: string;
  burnoutRisk: boolean;
  focusInsight: string;
  groundingSources?: { title: string; uri: string }[];
}

export interface DailyPlan {
  date: string;
  tasks: Task[];
  mood: string;
  advice: string;
  mode: FlowMode;
  groundingSources?: { title: string; uri: string }[];
}

export interface HistoryItem {
  id: string;
  date: string;
  content: string;
  analysis: Analysis;
  mode: FlowMode;
}
