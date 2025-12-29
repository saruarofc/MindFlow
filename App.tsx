
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  Plus, 
  Zap, 
  Sparkles, 
  CheckCircle2, 
  Timer, 
  Pause, 
  Play, 
  Calendar, 
  TrendingUp,
  BrainCircuit,
  Trash2,
  Clock,
  History as HistoryIcon,
  Maximize2,
  Minimize2,
  ExternalLink,
  X,
  Coffee,
  Sun,
  Loader2,
  Fingerprint
} from 'lucide-react';
import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase, ref, set, onValue, update, push, get, Database } from "firebase/database";
import { MODES } from './constants';
import { analyzeBrainDump, generatePlan } from './geminiService';
import { DailyPlan, FlowMode, HistoryItem, Task, Priority } from './types';

const firebaseConfig = {
  apiKey: "AIzaSyBEZJUEv4JTosClAXWblWFI5YD5zE19JYM",
  authDomain: "pixwin-40e3f.firebaseapp.com",
  databaseURL: "https://pixwin-40e3f-default-rtdb.firebaseio.com",
  projectId: "pixwin-40e3f",
  storageBucket: "pixwin-40e3f.appspot.com",
  messagingSenderId: "548624004367",
  appId: "1:548624004367:android:a34c949f186c576bf0fa7a"
};

let db: Database | undefined;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase Init Failed:", e);
}

const getDeviceId = () => {
  const storageKey = 'mindflow_neural_identity_v4';
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = 'neural_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(storageKey, id);
  }
  return id;
};

const deviceId = getDeviceId();

export default function App() {
  const [activeTab, setActiveTab] = useState<'dump' | 'plan' | 'insights'>('dump');
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<FlowMode>('balance');
  const [brainDump, setBrainDump] = useState("");
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [history, setHistorysetHistorysetHistory] = useState<HistoryItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [activeTimerIdx, setActiveTimerIdx] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isInitialLoading) setIsInitialLoading(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isInitialLoading]);

  useEffect(() => {
    if (!db) {
      setIsInitialLoading(false);
      return;
    }

    const planRef = ref(db, `users/${deviceId}/dailyPlans/${todayStr}`);
    const historyRef = ref(db, `users/${deviceId}/history`);
    const draftRef = ref(db, `users/${deviceId}/draft`);

    const unsubPlan = onValue(planRef, (snapshot) => {
      setDailyPlan(snapshot.exists() ? snapshot.val() : null);
      setIsInitialLoading(false);
    }, () => setIsInitialLoading(false));

    const unsubHistory = onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const list = Object.entries(val).map(([key, data]: [string, any]) => ({
          ...data,
          id: data.id || key
        })) as HistoryItem[];
        setHistory(list.sort((a, b) => b.id.localeCompare(a.id)));
      }
    });

    get(draftRef).then((snapshot) => {
      if (snapshot.exists() && snapshot.val()) setBrainDump(snapshot.val());
    });

    return () => {
      unsubPlan();
      unsubHistory();
    };
  }, [todayStr]);

  useEffect(() => {
    if (!db) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    if (!brainDump.trim()) {
      setIsSyncing(false);
      return;
    }
    
    setIsSyncing(true);
    syncTimeoutRef.current = setTimeout(() => {
      if (db) {
        set(ref(db, `users/${deviceId}/draft`), brainDump)
          .then(() => setIsSyncing(false))
          .catch(() => setIsSyncing(false));
      }
    }, 1500);

    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [brainDump]);

  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      finishTaskInFocus();
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isTimerRunning, timeLeft]);

  const startTimer = (idx: number, duration: number) => {
    setActiveTimerIdx(idx);
    setTimeLeft(duration * 60);
    setIsTimerRunning(true);
  };

  const finishTaskInFocus = () => {
    if (activeTimerIdx === null) return;
    toggleTask(activeTimerIdx, true); 
    setIsFocusMode(false);
    setIsTimerRunning(false);
    setActiveTimerIdx(null);
    setTimeLeft(0);
  };

  const handleRunAnalysis = async () => {
    if (!brainDump.trim()) return;
    setLoading(true);
    try {
      const analysis = await analyzeBrainDump(brainDump, selectedMode);
      const planData = await generatePlan(analysis, selectedMode);
      
      const newPlan: DailyPlan = {
        date: todayStr,
        tasks: (planData.tasks || []).map((t: any) => ({ ...t, completed: false })),
        mood: analysis.mood,
        advice: analysis.coachingAdvice,
        mode: selectedMode,
        groundingSources: analysis.groundingSources
      };

      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        date: todayStr,
        content: brainDump,
        analysis: analysis,
        mode: selectedMode
      };

      if (db) {
        await set(ref(db, `users/${deviceId}/dailyPlans/${todayStr}`), newPlan);
        await push(ref(db, `users/${deviceId}/history`), newHistoryItem);
        await set(ref(db, `users/${deviceId}/draft`), "");
      }
      
      setBrainDump("");
      setActiveTab('plan');
    } catch (e) {
      console.error("AI Error:", e);
    } finally {
      setLoading(false);
    }
  };

  const addQuickTask = async () => {
    if (!quickTaskTitle.trim() || !db) return;
    const newTask: Task = {
      title: quickTaskTitle,
      duration: 25,
      isBreak: false,
      energyRequired: 5,
      completed: false,
      priority: 'medium'
    };
    const updatedTasks = dailyPlan ? [...dailyPlan.tasks, newTask] : [newTask];
    await update(ref(db, `users/${deviceId}/dailyPlans/${todayStr}`), { tasks: updatedTasks });
    setQuickTaskTitle("");
    setShowQuickAdd(false);
  };

  const addQuickBreak = async () => {
    if (!db) return;
    const newTask: Task = {
      title: "Neural Reset Session",
      duration: 10,
      isBreak: true,
      energyRequired: 1,
      completed: false,
      priority: 'low'
    };
    const updatedTasks = dailyPlan ? [...dailyPlan.tasks, newTask] : [newTask];
    await update(ref(db, `users/${deviceId}/dailyPlans/${todayStr}`), { tasks: updatedTasks });
  };

  const toggleTask = (idx: number, forceCompleted?: boolean) => {
    if (!dailyPlan || !db) return;
    const taskPath = `users/${deviceId}/dailyPlans/${todayStr}/tasks/${idx}`;
    const currentCompleted = dailyPlan.tasks[idx].completed;
    const newState = forceCompleted !== undefined ? forceCompleted : !currentCompleted;
    update(ref(db), { [`${taskPath}/completed`]: newState });
  };

  const progress = useMemo(() => {
    if (!dailyPlan?.tasks?.length) return 0;
    return Math.round((dailyPlan.tasks.filter(t => t.completed).length / dailyPlan.tasks.length) * 100);
  }, [dailyPlan]);

  const priorityColor = (p: Priority) => {
    switch(p) {
      case 'high': return 'border-rose-500/50 text-rose-400 bg-rose-500/10';
      case 'medium': return 'border-amber-500/50 text-amber-400 bg-amber-500/10';
      case 'low': return 'border-indigo-500/50 text-indigo-400 bg-indigo-500/10';
      default: return 'border-white/10 text-zinc-500';
    }
  };

  if (isInitialLoading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center space-y-8 z-50">
        <BrainCircuit size={64} className="text-white animate-soft-pulse" />
        <div className="text-center space-y-4">
          <h2 className="text-xl font-black uppercase tracking-[0.3em] text-zinc-300">Synchronizing...</h2>
          <div className="flex justify-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 bg-white/20 rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  if (isFocusMode && activeTimerIdx !== null && dailyPlan) {
    const activeTask = dailyPlan.tasks[activeTimerIdx];
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-110 duration-700 select-none">
        <button onClick={() => setIsFocusMode(false)} className="absolute top-10 right-10 text-zinc-800 hover:text-white transition-all p-4">
          <Minimize2 size={32} />
        </button>
        <div className="text-center space-y-12 w-full max-w-4xl">
          <div className="space-y-6">
            <div className={`mx-auto w-fit px-6 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.4em] ${priorityColor(activeTask.priority)}`}>
              {activeTask.priority} Priority Session
            </div>
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-white leading-tight">
              {activeTask.title}
            </h1>
          </div>
          <div className="font-mono text-[14rem] md:text-[22rem] leading-none font-black tracking-tighter text-white tabular-nums drop-shadow-[0_0_80px_rgba(255,255,255,0.1)]">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <div className="flex gap-12 justify-center">
             <button 
              onClick={() => setIsTimerRunning(!isTimerRunning)} 
              className={`w-32 h-32 rounded-full border-2 flex items-center justify-center transition-all transform active:scale-90 ${
                isTimerRunning ? 'border-zinc-800 text-zinc-500' : 'border-white text-white'
              }`}
             >
                {isTimerRunning ? <Pause size={56} fill="currentColor" /> : <Play size={56} className="ml-2" fill="currentColor" />}
             </button>
             <button 
              onClick={finishTaskInFocus} 
              className="w-32 h-32 rounded-full bg-[#32D74B] text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_80px_rgba(50,215,75,0.4)]"
             >
                <CheckCircle2 size={56} />
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] pb-44 antialiased overflow-x-hidden">
      <header className="sticky top-0 z-50 glass border-b border-white/5 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-black shadow-lg">
            <BrainCircuit size={20} strokeWidth={2.5} />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-base tracking-tight leading-none mb-1">MindFlow</h1>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Neural Sync</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
            <div className="flex gap-1.5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-1.5 h-4 rounded-full transition-all duration-700 ${i < (progress/20) ? 'bg-[#5E5CE6]' : 'bg-white/10'}`} />
              ))}
            </div>
            <span className="text-[12px] font-black text-[#5E5CE6] tabular-nums">{progress}%</span>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-10 space-y-10">
        {activeTab === 'dump' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-2">
                 <Sun size={14} className="text-amber-400" />
                 <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Daily Window</span>
               </div>
               <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">{todayStr}</span>
            </div>

            <div className="flex gap-3">
              {MODES.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`flex-1 p-5 rounded-[1.8rem] border transition-all duration-300 flex flex-col items-center gap-2 ${
                    selectedMode === mode.id 
                    ? `border-white/20 bg-white/10 scale-105` 
                    : 'border-white/5 bg-zinc-900/40 opacity-40 hover:opacity-100'
                  }`}
                >
                  <mode.icon size={22} className={selectedMode === mode.id ? 'text-white' : 'text-zinc-600'} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${selectedMode === mode.id ? 'text-white' : 'text-zinc-600'}`}>
                    {mode.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="ios-card rounded-[2.5rem] p-8 shadow-2xl relative flex flex-col min-h-[460px]">
              <div className="flex items-center justify-between mb-8">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Cognitive Offload</span>
                <Sparkles size={16} className="text-amber-400 animate-soft-pulse" />
              </div>
              
              <textarea
                className="flex-1 w-full p-0 border-none focus:ring-0 text-xl text-zinc-100 placeholder:text-zinc-800 bg-transparent resize-none leading-relaxed font-medium"
                placeholder="Unload everything. Errand, idea, worry? Dump it all here."
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
              />
              
              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => setBrainDump("")} 
                  className="p-6 bg-zinc-900 rounded-[1.8rem] text-zinc-600 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={24} />
                </button>
                <button
                  onClick={handleRunAnalysis}
                  disabled={loading || !brainDump.trim()}
                  className="flex-1 bg-white text-black font-black py-6 rounded-[1.8rem] flex items-center justify-center gap-3 active:scale-[0.98] disabled:bg-zinc-900 disabled:text-zinc-700 transition-all text-base uppercase tracking-tight"
                >
                  {loading ? <Loader2 size={22} className="animate-spin" /> : <><Zap size={22} fill="currentColor" /> Generate Flow</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="space-y-8 animate-in fade-in duration-700">
            {dailyPlan ? (
              <>
                <div className="ios-card p-8 rounded-[2.5rem] relative overflow-hidden group border-l-4 border-l-indigo-500">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Coaching Insight</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-6 leading-tight tracking-tight">{dailyPlan.advice}</h2>
                  
                  <div className="flex gap-3">
                     <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                       {dailyPlan.mode}
                     </div>
                     <div className="bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                       {dailyPlan.mood}
                     </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4">
                   <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Execution Map</h3>
                   <div className="flex gap-2">
                     <button onClick={addQuickBreak} className="p-2.5 bg-white/5 rounded-full border border-white/10 text-zinc-400"><Coffee size={16} /></button>
                     <button onClick={() => setShowQuickAdd(true)} className="p-2.5 bg-white/5 rounded-full border border-white/10 text-zinc-400"><Plus size={16} /></button>
                   </div>
                </div>

                <div className="space-y-4">
                  {dailyPlan.tasks.map((task, idx) => (
                    <div 
                      key={idx} 
                      className={`ios-card flex items-start gap-5 p-6 rounded-[2.2rem] transition-all duration-300 relative border-l-4 ${
                        task.completed ? 'completed-task opacity-40' : 
                        task.priority === 'high' ? 'border-l-rose-500' : task.priority === 'medium' ? 'border-l-amber-500' : 'border-l-indigo-500'
                      }`}
                    >
                      <button 
                        onClick={() => toggleTask(idx)}
                        className={`mt-1 w-10 h-10 min-w-[2.5rem] rounded-[1rem] flex items-center justify-center transition-all ${
                          task.completed ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-white/5 border border-white/10 text-zinc-700'
                        }`}
                      >
                        {task.completed ? <CheckCircle2 size={24} /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                      </button>
                      
                      <div className="flex-1 space-y-2">
                        <div className={`text-lg font-bold tracking-tight leading-tight ${task.completed ? 'line-through text-zinc-600' : 'text-zinc-100'}`}>
                          {task.title}
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-black text-zinc-600 uppercase">
                          <Clock size={14} /> {task.duration}m
                          {activeTimerIdx === idx && !task.completed && (
                            <span className="text-[#5E5CE6] bg-[#5E5CE6]/10 px-2 py-0.5 rounded-lg ml-2 animate-soft-pulse">
                              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>
                      </div>

                      {!task.completed && (
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => activeTimerIdx === idx ? setIsTimerRunning(!isTimerRunning) : startTimer(idx, task.duration)}
                            className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all ${
                              activeTimerIdx === idx ? 'bg-white text-black' : 'bg-white/5 text-zinc-600'
                            }`}
                          >
                            {activeTimerIdx === idx && isTimerRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                          </button>
                          {activeTimerIdx === idx && (
                            <button onClick={() => setIsFocusMode(true)} className="w-12 h-12 rounded-[1.2rem] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center"><Maximize2 size={18} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-28 px-10">
                <div className="w-20 h-20 bg-zinc-900 rounded-[2rem] flex items-center justify-center text-zinc-800 mx-auto mb-8">
                  <LayoutDashboard size={40} />
                </div>
                <h3 className="text-xl font-bold mb-2">Focus Engine Idle</h3>
                <p className="text-zinc-600 text-sm mb-10 max-w-xs mx-auto">Dump your thoughts to initialize your neural flow for today.</p>
                <button onClick={() => setActiveTab('dump')} className="bg-white text-black font-black px-10 py-5 rounded-full active:scale-95 transition-all uppercase text-sm tracking-widest">
                  Initialize Flow
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-10 animate-in fade-in duration-700">
             <div className="flex items-center justify-between px-2">
               <h2 className="text-3xl font-black tracking-tighter">Archive</h2>
               <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-zinc-500">
                <Fingerprint size={20} />
               </div>
             </div>
             
             <div className="space-y-5">
                {history.map((h, idx) => (
                  <div key={idx} className="ios-card rounded-[2.2rem] p-7 transition-all border-l-4 border-l-white/10">
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-zinc-600 text-[10px] font-black uppercase tracking-widest">
                          <Calendar size={12} /> {h.date}
                        </div>
                        <p className="text-zinc-100 text-base font-semibold italic line-clamp-2 opacity-80">"{h.content}"</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                       <div className="flex items-center gap-2 bg-indigo-500/10 px-4 py-2 rounded-2xl border border-indigo-500/20">
                          <Zap size={12} className="text-indigo-400" fill="currentColor" />
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{h.analysis?.energyLevel}/10 Energy</span>
                       </div>
                       <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-2xl border border-emerald-500/20">
                          <TrendingUp size={12} className="text-emerald-400" />
                          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{h.analysis?.mood}</span>
                       </div>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <p className="text-center py-20 text-zinc-700 uppercase font-black tracking-widest text-xs">Awaiting Neural Logs</p>}
             </div>
          </div>
        )}
      </main>

      {showQuickAdd && (
        <div className="fixed inset-0 z-[100] glass flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
          <div className="ios-card w-full max-w-sm rounded-[2.5rem] p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-widest">Injection</h3>
              <button onClick={() => setShowQuickAdd(false)} className="text-zinc-500"><X size={24} /></button>
            </div>
            <input 
              autoFocus
              type="text" 
              placeholder="Inject a task..."
              className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-lg focus:ring-1 focus:ring-white/30 outline-none"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addQuickTask()}
            />
            <button onClick={addQuickTask} className="w-full py-5 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-sm shadow-xl">Confirm</button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-10 left-6 right-6 z-[60] glass border border-white/10 p-2 flex justify-around items-center max-w-sm mx-auto rounded-full shadow-2xl">
        {[
          { id: 'dump', icon: Plus, label: 'Dump' },
          { id: 'plan', icon: LayoutDashboard, label: 'Today' },
          { id: 'insights', icon: HistoryIcon, label: 'History' }
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => setActiveTab(item.id as any)} 
            className={`flex-1 flex flex-col items-center gap-1 py-4 transition-all duration-300 rounded-full ${
              activeTab === item.id 
              ? 'bg-white text-black scale-105 shadow-xl' 
              : 'text-zinc-600'
            }`}
          >
            <item.icon size={20} strokeWidth={activeTab === item.id ? 3 : 2} />
            <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
