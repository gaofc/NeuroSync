import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { MonitorUp, Activity, ScanFace, Gauge, Move3d, Rotate3d, History, Settings, X, Sliders, Save, Pause, Monitor, MonitorOff, RefreshCw, Lock, Power, AlertCircle, Zap, ShieldAlert, Hourglass, Key, BrainCircuit, MessageSquareWarning, Volume2, VolumeX, Eye, EyeOff, Target, Mic, MicOff } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

interface TechRippleUIProps {
  togglePiP?: () => void;
  isPiPActive?: boolean;
}

interface WaveConfig {
  speed: number;
  frequency: number;
  amplitude: number;
  colorPrimary: string;
  colorSecondary: string;
  jitter: number; 
  label: string;
  thought: string; 
  message: string; 
}

interface LogEntry {
  id: number;
  timestamp: string;
  config: WaveConfig;
}

interface AiHudState {
  label: string;
  thought: string;
  message: string;
  directMessage?: string; 
  timestamp: string;
  colorPrimary: string;
}

const ANOMALY_LIMIT = 100;
const DECAY_RATE = 5; 
const TRIGGER_THRESHOLD = 80; 

const DEFAULT_THRESHOLDS = {
  SCORING: {
    STAGNATION: 100,    
    PRESENCE_LOST: 35,  
    NOD: 50,            
    SHAKE: 50,          
    VISUAL_SURGE: 35,   
    EXPRESSION: 35,     
    LEAN_IN: 35,        
    LEAN_OUT: 35,
    PRESENCE_FOUND: 35, 
    NORMAL: 0
  },
  EXPRESSION: {
    SPIKE_THRESHOLD: 0.2, 
    RESET_THRESHOLD: 0.1,  
  },
  MOVEMENT: {
    SPIKE_THRESHOLD: 0.15, 
    LEAN_Z_DISTANCE: 0.4,  
    RESET_THRESHOLD: 0.05, 
  },
  ROTATION: {
    RESET_THRESHOLD: 0.1,  
  },
  GESTURE: {
    BUFFER_SIZE: 15,       
    NOD: {
      PITCH_RANGE_MIN: 12, 
    },
    SHAKE: {
      YAW_RANGE_MIN: 15,   
    }
  },
  SCREEN: {
    SAMPLE_INTERVAL_MS: 1000, 
    CHANGE_THRESHOLD: 0.15,   
  },
  IDLE: {
    TIMEOUT_MS: 30000,      
    EVENT_COOLDOWN_MS: 1500 
  },
  AI: {
    ANALYSIS_COOLDOWN_MS: 60000 
  }
};

const IDLE_CONFIG: WaveConfig = {
  speed: 0.01, frequency: 0.005, amplitude: 10, colorPrimary: '#94a3b8', colorSecondary: 'rgba(148, 163, 184, 0.2)', jitter: 0,
  label: "SYS.IDLE", thought: "No input detected for 30s.", message: "Entering power save mode."
};

const LOCKED_CONFIG: WaveConfig = {
  speed: 0.005, frequency: 0.002, amplitude: 5, colorPrimary: '#475569', colorSecondary: 'rgba(71, 85, 105, 0.1)', jitter: 0,
  label: "SYS.LOCKED", thought: "Waiting for visual uplink...", message: "System Standby."
};

const DEFAULT_CONFIGS: Record<string, WaveConfig> = {
  NORMAL: {
    speed: 0.05, frequency: 0.01, amplitude: 20, colorPrimary: '#22d3ee', colorSecondary: 'rgba(34, 211, 238, 0.2)', jitter: 0,
    label: "SYS.MONITOR", thought: "Scanning biometric telemetry.", message: "Monitoring subject..."
  },
  NOD: {
    speed: 0.1, frequency: 0.02, amplitude: 45, colorPrimary: '#4ade80', colorSecondary: 'rgba(74, 222, 128, 0.3)', jitter: 0.02,
    label: "DET.GESTURE", thought: "Vertical oscillation identified.", message: "Affirmative Action."
  },
  SHAKE: {
    speed: 0.15, frequency: 0.08, amplitude: 40, colorPrimary: '#f87171', colorSecondary: 'rgba(248, 113, 113, 0.3)', jitter: 0.25,
    label: "DET.GESTURE", thought: "Horizontal instability detected.", message: "Negative Response."
  },
  LEAN_IN: {
    speed: 0.08, frequency: 0.015, amplitude: 50, colorPrimary: '#facc15', colorSecondary: 'rgba(250, 204, 21, 0.3)', jitter: 0.01,
    label: "DET.PROXIMITY", thought: "Z-axis translation spike (+).", message: "Movement: Leaning Forward."
  },
  LEAN_OUT: {
    speed: 0.08, frequency: 0.015, amplitude: 50, colorPrimary: '#fb923c', colorSecondary: 'rgba(251, 146, 60, 0.3)', jitter: 0.01,
    label: "DET.PROXIMITY", thought: "Z-axis translation spike (-).", message: "Movement: Leaning Back."
  },
  EXPRESSION: {
    speed: 0.12, frequency: 0.06, amplitude: 45, colorPrimary: '#d946ef', colorSecondary: 'rgba(217, 70, 239, 0.3)', jitter: 0.15,
    label: "BIO.EMOTION", thought: "Blendshape variance exceeded threshold.", message: "Micro-expression detected."
  },
  VISUAL_SURGE: {
    speed: 0.18, frequency: 0.1, amplitude: 35, colorPrimary: '#3b82f6', colorSecondary: 'rgba(59, 130, 246, 0.3)', jitter: 0.1,
    label: "SYS.VISUAL", thought: "Optical flow variance spike.", message: "Significant screen activity."
  },
  STAGNATION: {
    speed: 0.02, frequency: 0.15, amplitude: 10, colorPrimary: '#f43f5e', colorSecondary: 'rgba(244, 63, 94, 0.2)', jitter: 0.4,
    label: "BIO.STAGNANT", thought: "Subject immobile for extended period.", message: "Vitality Check Required."
  },
  PRESENCE_FOUND: {
    speed: 0.1, frequency: 0.02, amplitude: 60, colorPrimary: '#34d399', colorSecondary: 'rgba(52, 211, 153, 0.2)', jitter: 0,
    label: "SYS.ALERT", thought: "Biometric signature acquired.", message: "Subject DETECTED."
  },
  PRESENCE_LOST: {
    speed: 0.01, frequency: 0.005, amplitude: 2, colorPrimary: '#ef4444', colorSecondary: 'rgba(239, 68, 68, 0.2)', jitter: 0.05,
    label: "SYS.WARN", thought: "Signal interrupted.", message: "Subject MISSING."
  }
};

const TARGET_BLENDSHAPES = [
  'browDownLeft', 'browDownRight', 'browInnerUp',
  'eyeWideLeft', 'eyeWideRight',
  'jawOpen',
  'mouthSmileLeft', 'mouthSmileRight',
  'mouthPucker',
  'mouthFrownLeft', 'mouthFrownRight'
];

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
const euclideanDistance = (v1: number[], v2: number[]) => {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) sum += Math.pow(v1[i] - v2[i], 2);
  return Math.sqrt(sum);
};

const captureFrame = (videoEl: HTMLVideoElement | null): string | null => {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(videoEl, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    } catch (e) { return null; }
};

const calculateHistogram = (ctx: CanvasRenderingContext2D, width: number, height: number): number[] => {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const histogram = new Array(24).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.floor(data[i] / 32)]++;
    histogram[8 + Math.floor(data[i + 1] / 32)]++;
    histogram[16 + Math.floor(data[i + 2] / 32)]++;
  }
  return histogram.map(val => val / (width * height));
};

const calculateEulerAngles = (matrix: Float32Array | number[]) => {
  const r32 = matrix[9], r33 = matrix[10], r31 = matrix[8], r21 = matrix[4], r11 = matrix[0];
  return { 
      pitch: Math.atan2(r32, r33) * (180 / Math.PI), 
      yaw: Math.atan2(-r31, Math.sqrt(r32 * r32 + r33 * r33)) * (180 / Math.PI), 
      roll: Math.atan2(r21, r11) * (180 / Math.PI) 
  };
};

// Helper for PCM decoding from Live API
const decodePCM = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const dataInt16 = new Int16Array(bytes.buffer);
  const float32Data = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    float32Data[i] = dataInt16[i] / 32768.0;
  }
  return float32Data;
};

// Helper for PCM encoding for Live API
function encodePCM(inputData: Float32Array) {
    const l = inputData.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        // Clamp logic to avoid overflow
        let s = Math.max(-1, Math.min(1, inputData[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Convert to base64
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const SliderGroup = memo(({ label, category, settingKey, subKey, min, max, step, value, onChange }: any) => (
  <div className="flex flex-col gap-1 mb-3">
    <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-cyan-200/70">
      <span>{label}</span>
      <span className="text-cyan-400 font-bold">{value.toFixed(step < 1 ? 2 : 0)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(category, settingKey, parseFloat(e.target.value), subKey)} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
  </div>
));

const SettingsPanel = memo(({ config, onUpdate, onApiKeyUpdate, isDebugMode, onToggleDebug, onClose }: any) => {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(config)));
  const [localApiKey, setLocalApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');

  const updateField = useCallback((category: any, key: any, value: any, subKey?: any) => {
    setDraft((prev: any) => {
        const next = { ...prev };
        next[category] = { ...prev[category] };
        if (subKey) next[category][key] = { ...prev[category][key], [subKey]: value };
        else next[category][key] = value;
        return next;
    });
  }, []);

  const handleSave = () => {
    onUpdate(draft);
    localStorage.setItem('gemini_api_key', localApiKey);
    onApiKeyUpdate(localApiKey);
    onClose();
  };

  return (
    <div className="absolute top-0 left-0 h-full w-80 max-w-full z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-6 settings-anim border-r border-white/10 shadow-2xl">
       <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 text-cyan-400"><Sliders size={18} /><span className="font-mono text-sm font-bold">Parameters</span></div>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20} /></button>
       </div>
       <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 pb-4">
          <section>
            <h3 className="text-xs font-bold text-cyan-200/60 mb-3 uppercase border-b border-cyan-500/20 pb-1">View Options</h3>
            <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-white/50 uppercase flex gap-2">{isDebugMode ? <Eye size={12}/> : <EyeOff size={12}/>} Debug Overlay</span>
              <button onClick={() => onToggleDebug(!isDebugMode)} className={`w-8 h-4 rounded-full relative transition-colors ${isDebugMode ? 'bg-cyan-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isDebugMode ? 'translate-x-4.5 left-[2px]' : 'left-[2px]'}`} style={{ transform: isDebugMode ? 'translateX(16px)' : 'translateX(0)' }}></div>
              </button>
            </div>
          </section>
          
          <section>
            <h3 className="text-xs font-bold text-cyan-200/60 mb-3 uppercase border-b border-cyan-500/20 pb-1">Connection</h3>
            <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5 space-y-2 mb-4">
              <label className="text-[10px] font-mono text-white/50 uppercase block mb-2">Gemini API Key</label>
              <input type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} placeholder="Enter API Key" className="w-full bg-slate-800 border border-white/10 rounded px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none" />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-cyan-200/60 mb-3 uppercase border-b border-cyan-500/20 pb-1">Anomaly Weights (Score)</h3>
            <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5 space-y-2">
                <SliderGroup label="Frozen / Stagnation" category="SCORING" settingKey="STAGNATION" min={0} max={100} step={1} value={draft.SCORING.STAGNATION} onChange={updateField} />
                <SliderGroup label="Presence Found" category="SCORING" settingKey="PRESENCE_FOUND" min={0} max={100} step={1} value={draft.SCORING.PRESENCE_FOUND} onChange={updateField} />
                <SliderGroup label="Presence Lost" category="SCORING" settingKey="PRESENCE_LOST" min={0} max={100} step={1} value={draft.SCORING.PRESENCE_LOST} onChange={updateField} />
                <SliderGroup label="Nod Gesture" category="SCORING" settingKey="NOD" min={0} max={100} step={1} value={draft.SCORING.NOD} onChange={updateField} />
                <SliderGroup label="Shake Gesture" category="SCORING" settingKey="SHAKE" min={0} max={100} step={1} value={draft.SCORING.SHAKE} onChange={updateField} />
                <SliderGroup label="Expression / Talk" category="SCORING" settingKey="EXPRESSION" min={0} max={100} step={1} value={draft.SCORING.EXPRESSION} onChange={updateField} />
                <SliderGroup label="Visual Surge" category="SCORING" settingKey="VISUAL_SURGE" min={0} max={100} step={1} value={draft.SCORING.VISUAL_SURGE} onChange={updateField} />
                <SliderGroup label="Lean In" category="SCORING" settingKey="LEAN_IN" min={0} max={100} step={1} value={draft.SCORING.LEAN_IN} onChange={updateField} />
                <SliderGroup label="Lean Out" category="SCORING" settingKey="LEAN_OUT" min={0} max={100} step={1} value={draft.SCORING.LEAN_OUT} onChange={updateField} />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-widest border-b border-white/5 pb-1">AI Core</h3>
            <SliderGroup label="Analysis Cooldown (ms)" category="AI" settingKey="ANALYSIS_COOLDOWN_MS" min={5000} max={120000} step={1000} value={draft.AI.ANALYSIS_COOLDOWN_MS} onChange={updateField} />
          </section>

          <section>
            <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-widest border-b border-white/5 pb-1">Expression Analysis</h3>
            <SliderGroup label="Spike Threshold" category="EXPRESSION" settingKey="SPIKE_THRESHOLD" min={0.1} max={1.0} step={0.05} value={draft.EXPRESSION.SPIKE_THRESHOLD} onChange={updateField} />
            <SliderGroup label="Reset (Idle)" category="EXPRESSION" settingKey="RESET_THRESHOLD" min={0.01} max={0.5} step={0.01} value={draft.EXPRESSION.RESET_THRESHOLD} onChange={updateField} />
          </section>

          <section>
            <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-widest border-b border-white/5 pb-1">Body Movement</h3>
            <SliderGroup label="Movement Spike" category="MOVEMENT" settingKey="SPIKE_THRESHOLD" min={0.05} max={0.5} step={0.01} value={draft.MOVEMENT.SPIKE_THRESHOLD} onChange={updateField} />
            <SliderGroup label="Lean Distance (Z)" category="MOVEMENT" settingKey="LEAN_Z_DISTANCE" min={0.1} max={2.0} step={0.1} value={draft.MOVEMENT.LEAN_Z_DISTANCE} onChange={updateField} />
          </section>

          <section>
            <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-widest border-b border-white/5 pb-1">Gesture (Nod/Shake)</h3>
            <SliderGroup label="Nod Angle Min" category="GESTURE" settingKey="NOD" subKey="PITCH_RANGE_MIN" min={5} max={20} step={1} value={draft.GESTURE.NOD.PITCH_RANGE_MIN} onChange={updateField} />
            <SliderGroup label="Shake Angle Min" category="GESTURE" settingKey="SHAKE" subKey="YAW_RANGE_MIN" min={5} max={30} step={1} value={draft.GESTURE.SHAKE.YAW_RANGE_MIN} onChange={updateField} />
          </section>

          <section>
            <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-widest border-b border-white/5 pb-1">Screen Monitor</h3>
            <SliderGroup label="Sample Rate (ms)" category="SCREEN" settingKey="SAMPLE_INTERVAL_MS" min={500} max={5000} step={500} value={draft.SCREEN.SAMPLE_INTERVAL_MS} onChange={updateField} />
            <SliderGroup label="Change Thresh" category="SCREEN" settingKey="CHANGE_THRESHOLD" min={0.05} max={1.0} step={0.05} value={draft.SCREEN.CHANGE_THRESHOLD} onChange={updateField} />
          </section>
          
          <section>
            <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-widest border-b border-white/5 pb-1">System</h3>
            <SliderGroup label="Idle Timeout (ms)" category="IDLE" settingKey="TIMEOUT_MS" min={2000} max={60000} step={5000} value={draft.IDLE.TIMEOUT_MS} onChange={updateField} />
          </section>
       </div>
       <div className="pt-4 mt-auto border-t border-white/10">
          <button onClick={handleSave} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white p-3 rounded flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase"><Save size={14} /> Save Configuration</button>
       </div>
    </div>
  );
});

export const TechRippleUI: React.FC<TechRippleUIProps> = ({ togglePiP, isPiPActive = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  
  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const liveSessionRef = useRef<any>(null);
  const liveSessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextAudioStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const speakingTimeoutRef = useRef<any>(null);

  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false); // To track if user is recording/speaking
  const isMicOnRef = useRef(false);

  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const thresholdsRef = useRef(DEFAULT_THRESHOLDS);
  useEffect(() => { thresholdsRef.current = thresholds; }, [thresholds]);
  const isSettingsOpenRef = useRef(isSettingsOpen);
  useEffect(() => { isSettingsOpenRef.current = isSettingsOpen; }, [isSettingsOpen]);

  const [activeConfig, setActiveConfig] = useState<WaveConfig>(LOCKED_CONFIG);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [anomalyScore, setAnomalyScore] = useState(0);
  const [aiHudState, setAiHudState] = useState<AiHudState>({ label: "AI.WAITING", thought: "Initializing neural connection...", message: "Awaiting sufficient telemetry data for analysis.", timestamp: "", colorPrimary: "#475569" });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  
  // New State for Goal Tracking
  const [userGoal, setUserGoal] = useState("");
  const userGoalRef = useRef(""); 
  useEffect(() => { userGoalRef.current = userGoal; }, [userGoal]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  // Ref to track modal state in callbacks without re-binding
  const showGoalModalRef = useRef(false);
  useEffect(() => { showGoalModalRef.current = showGoalModal; }, [showGoalModal]);
  
  const [tempGoal, setTempGoal] = useState("");

  const lastAnalysisTimeRef = useRef<number>(0);
  const warmupEndTimeRef = useRef<number>(0);

  // Sync mic ref
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);

  // Initialize Audio Context (must be triggered by user interaction)
  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (!inputAudioCtxRef.current) {
        inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
  }, []);

  const getLiveSession = useCallback(() => {
    if (liveSessionPromiseRef.current) return liveSessionPromiseRef.current;
    if (!apiKey) return null;

    const ai = new GoogleGenAI({ apiKey });
    liveSessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            // Keep system instruction simple, we will send text directives via user turns
            systemInstruction: { parts: [{ text: "You are a helpful assistant." }] },
        },
        callbacks: {
            onopen: () => console.log("Live Session Connected"),
            onmessage: async (msg: LiveServerMessage) => {
                // Handle Audio Output
                const ctx = audioCtxRef.current;
                if (!ctx) return;
                
                const part = msg.serverContent?.modelTurn?.parts?.[0];
                if (part?.inlineData?.data) {
                    const float32Data = decodePCM(part.inlineData.data);
                    
                    const buffer = ctx.createBuffer(1, float32Data.length, 24000);
                    buffer.getChannelData(0).set(float32Data);
                    
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(ctx.destination);
                    
                    if (nextAudioStartTimeRef.current < ctx.currentTime) {
                        nextAudioStartTimeRef.current = ctx.currentTime;
                    }
                    source.start(nextAudioStartTimeRef.current);
                    nextAudioStartTimeRef.current += buffer.duration;
                    
                    audioSourcesRef.current.add(source);
                    source.onended = () => audioSourcesRef.current.delete(source);
                    
                    setIsSpeaking(true);
                    
                    // Update fallback timeout to reset speaking state
                    const remaining = Math.max(0, nextAudioStartTimeRef.current - ctx.currentTime);
                    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                    speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), remaining * 1000 + 100);
                }
            },
            onclose: () => {
                console.log("Live Session Closed");
                liveSessionRef.current = null;
            },
            onerror: (e) => console.error("Live Session Error", e)
        }
    }).then(session => {
        liveSessionRef.current = session;
        return session;
    });

    return liveSessionPromiseRef.current;
  }, [apiKey]);

  // Updated to support either exact repetition OR instruction-based generation
  const generateAndPlaySpeech = useCallback(async (text: string, isInstruction: boolean = false) => {
    if (!apiKey) return;
    initAudioContext();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    try {
        let session = liveSessionRef.current;
        if (!session) {
             session = await getLiveSession();
        }
        
        if (session) {
            // If isInstruction is true, we pass the text as a prompt for the model to generate a response.
            // If false (default), we ask it to repeat exactly.
            const prompt = isInstruction 
                ? text 
                : `Say this exactly as written in a natural tone: ${text}`;

            await (session as any).sendClientContent({
                turns: [{ role: "user", parts: [{ text: prompt }] }],
                turnComplete: true
            });
        }

    } catch (e) {
        console.error("Speech Gen Error:", e);
        // Reset session on error to force reconnect next time
        liveSessionPromiseRef.current = null;
        liveSessionRef.current = null;
        setIsSpeaking(false);
    }
  }, [apiKey, initAudioContext, getLiveSession]);

  const toggleMic = useCallback(async () => {
      // Toggle logic
      if (isMicOn) {
          // STOP MIC
          if (micStreamRef.current) {
              micStreamRef.current.getTracks().forEach(track => track.stop());
              micStreamRef.current = null;
          }
          if (inputProcessorRef.current) {
              inputProcessorRef.current.disconnect();
              inputProcessorRef.current = null;
          }
          if (sourceNodeRef.current) {
              sourceNodeRef.current.disconnect();
              sourceNodeRef.current = null;
          }
          setIsMicOn(false);
          // We intentionally leave isSpeaking true/false managed by playback logic
      } else {
          // START MIC
          try {
              initAudioContext();
              const inputCtx = inputAudioCtxRef.current;
              if (!inputCtx) return;
              if (inputCtx.state === 'suspended') await inputCtx.resume();

              // Ensure Live Session Connected
              let session = liveSessionRef.current;
              if (!session) {
                  session = await getLiveSession();
              }
              if (!session) return; // Should catch error elsewhere

              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              micStreamRef.current = stream;
              
              const source = inputCtx.createMediaStreamSource(stream);
              sourceNodeRef.current = source;
              
              const processor = inputCtx.createScriptProcessor(4096, 1, 1);
              inputProcessorRef.current = processor;

              processor.onaudioprocess = (e) => {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const base64Data = encodePCM(inputData);
                  
                  // Use the Ref to ensure we have the live session
                  if (liveSessionRef.current) {
                      liveSessionRef.current.sendRealtimeInput({
                          media: {
                              mimeType: "audio/pcm;rate=16000",
                              data: base64Data
                          }
                      });
                  }
              };

              source.connect(processor);
              processor.connect(inputCtx.destination);
              setIsMicOn(true);

          } catch (e) {
              console.error("Mic Error:", e);
              setIsMicOn(false);
          }
      }
  }, [isMicOn, initAudioContext, getLiveSession]);

  useEffect(() => {
    // Safety check: if modal is open, do not trigger analysis even if score is high
    if (showGoalModal) {
         setAnomalyScore(0);
         return;
    }

    // BLOCKING LOGIC: If Mic is on OR AI is speaking, suppress anomaly checks
    // This prevents the background "system" from interrupting a conversation
    if (isMicOnRef.current || isSpeaking) {
        setAnomalyScore(0);
        return;
    }

    if (anomalyScore >= ANOMALY_LIMIT) {
        const now = Date.now();
        
        // Warmup period check: Prevent AI analysis in the first minute
        if (now < warmupEndTimeRef.current) {
            setAnomalyScore(0);
            return;
        }

        if (now - lastAnalysisTimeRef.current < thresholdsRef.current.AI.ANALYSIS_COOLDOWN_MS) { setAnomalyScore(0); return; }
        lastAnalysisTimeRef.current = now;
        
        const logData = history.map((entry, index) => {
            let duration = "now";
            if (index < history.length - 1) duration = `${((history[index + 1].id - entry.id) / 1000).toFixed(2)}s`;
            return { Duration: duration, Type: entry.config.label, Message: entry.config.message, Thought: entry.config.thought };
        });

        const applyAiUpdates = (data: any) => {
             if (!data.system_status) return;
             const ss = data.system_status;
             
             setActiveConfig(prev => ({ 
                 ...prev, 
                 label: ss.label, 
                 thought: ss.thought, 
                 message: ss.message 
             }));
             
             setAiHudState({ 
                 label: ss.label, 
                 thought: ss.thought, 
                 message: ss.message, 
                 directMessage: data.direct_message || undefined, 
                 timestamp: new Date().toLocaleTimeString(), 
                 colorPrimary: ss.color 
             });
             
             if (data.direct_message) generateAndPlaySpeech(data.direct_message);
        };

        const analyzeAnomaly = async () => {
            if (!apiKey) return;
            // DOUBLE CHECK BLOCKING inside async in case state changed rapidly
            if (isMicOnRef.current || isSpeaking) return;

            const historyContext = logData.map(h => `- Duration: [${h.Duration}] | Event: ${h.Type} | Message: "${h.Message}" | System Thought: "${h.Thought}"`).join('\n');
            const currentParams = JSON.stringify({ label: activeConfig.label, thought: activeConfig.thought, message: activeConfig.message, colorPrimary: activeConfig.colorPrimary }, null, 2);
            // Use Ref to ensure we get the latest goal even inside the closure
            const currentGoal = userGoalRef.current || "No specific goal set";

            const prompt = `
You are the central AI core of a futuristic biometric monitoring interface. 
The "Anomaly Score" for the user has reached 100% (Critical). 
Analyze the recent event log to determine the user's status and intent.

CONTEXT DATA:
1. Recent Event Log (Last 10 detected events):
${historyContext}

2. Current System State (Visuals):
${currentParams}

3. USER STATED OBJECTIVE: "${currentGoal}"

TASK:
1. Analyze the sequence of events.
2. Determine if the user is actively working towards their stated objective: "${currentGoal}".
3. Determine if the system needs visual confirmation (screen/webcam images) for a deeper diagnosis. 
   Set "further_analysis_needed" to true if the logs are ambiguous, suggest distraction, or if you need to verify screen content matches the goal (e.g. "I want to learn Chinese" but screen shows high visual surge from entertainment).
4. Formulate a hypothesis on what the user is doing.
5. Define the SYSTEM STATUS (Label, Thought, Message) and COLOR CODE to represent this state on the HUD.

RESPONSE FORMAT (JSON ONLY):
{
  "further_analysis_needed": boolean,
  "system_status": {
    "label": "Short System Label (e.g. SYS.ALERT)",
    "thought": "System thought log. Compare observed behavior vs stated goal.",
    "message": "System result. Brief status update for the user.",
    "color": "hex string (Theme color for HUD UI only)"
  }
}
`;
            
            try {
                const ai = new GoogleGenAI({ apiKey });
                const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: 'application/json' } });
                const parsed = JSON.parse(result.text || "{}");
                applyAiUpdates(parsed);
                if (parsed.further_analysis_needed) {
                    const webcamFrame = captureFrame(videoRef.current);
                    const screenFrame = captureFrame(screenVideoRef.current);
                    if (webcamFrame || screenFrame) {
                        const parts: any[] = [
                            { text: `
VISUAL EVIDENCE ACQUIRED.
I have attached the current view from the user's webcam (Face) and/or screen (Work).
USER STATED OBJECTIVE: "${currentGoal}"

TASK:
1. Re-evaluate the situation based on the visual evidence.
2. Check if the screen content aligns with the user's objective: "${currentGoal}".
3. Refine the system status.
4. If the user is distracted from their goal ("${currentGoal}"), provide a gentle, human-like direct message to guide them back. If the user encounters difficulties, you can provide him with some hints. If they are focused, do not disturb (direct_message: null).

RESPONSE FORMAT (JSON ONLY):
{
  "system_status": {
    "label": "Short System Label",
    "thought": "System thought log. Compare visual evidence with goal.",
    "message": "System result.",
    "color": "hex string"
  },
  "direct_message": "Sentences spoken to the user in a kind, human tone. (or null)"
}
` }, { text: `PREVIOUS HYPOTHESIS: ${JSON.stringify(parsed.system_status)}` }
                        ];
                        if (webcamFrame) parts.push({ inlineData: { mimeType: 'image/jpeg', data: webcamFrame } });
                        if (screenFrame) parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenFrame } });
                        const visualResult = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts }, config: { responseMimeType: 'application/json' } });
                        applyAiUpdates(JSON.parse(visualResult.text || "{}"));
                    }
                }
            } catch (err) { console.error(err); }
        };
        analyzeAnomaly();
        setAnomalyScore(0);
    }
  }, [anomalyScore, history, apiKey, activeConfig, generateAndPlaySpeech, userGoal, showGoalModal, isSpeaking]); // Added isSpeaking to dependency

  const currentConfigRef = useRef<WaveConfig>({ ...LOCKED_CONFIG });
  const targetConfigRef = useRef<WaveConfig>({ ...LOCKED_CONFIG });
  const lastEventTime = useRef<number>(0);
  const lastActiveTime = useRef<number>(Date.now()); 
  const isIdleRef = useRef<boolean>(false);
  const prevPresenceRef = useRef<boolean>(false); 
  const lastFaceDetectedRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [personPresent, setPersonPresent] = useState(false);
  const [expressionRate, setExpressionRate] = useState(0);
  const [rotationRate, setRotationRate] = useState(0);
  const [positionRate, setPositionRate] = useState(0);
  const [eulerAngles, setEulerAngles] = useState({ pitch: 0, yaw: 0, roll: 0 });
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenChangeRate, setScreenChangeRate] = useState(0);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const prevHistogramRef = useRef<number[] | null>(null);
  const blendShapeHistoryRef = useRef<number[][]>([]);
  const rotationHistoryRef = useRef<number[][]>([]); 
  const positionHistoryRef = useRef<number[][]>([]); 
  const angleBufferRef = useRef<{pitch: number, yaw: number}[]>([]); 

  useEffect(() => {
    if (!isScreenSharing) { setAnomalyScore(0); return; }
    const decayInterval = setInterval(() => { setAnomalyScore(prev => Math.max(0, prev - DECAY_RATE)); }, 1000); 
    return () => clearInterval(decayInterval);
  }, [isScreenSharing]);

  const triggerEvent = useCallback((configKey: string, customMessage?: string) => {
    const now = Date.now();
    const t = thresholdsRef.current; 
    const isSystemAlert = configKey === 'PRESENCE_FOUND' || configKey === 'PRESENCE_LOST';
    const isDebounced = now - lastEventTime.current < t.IDLE.EVENT_COOLDOWN_MS;

    // Check if goal modal is open OR if speaking/listening. If so, ignore non-critical events.
    if (showGoalModalRef.current || isMicOnRef.current) {
         if (configKey !== 'NORMAL') return; 
    }

    if (isSystemAlert || !isDebounced || configKey === 'NORMAL') {
        const weight = (t.SCORING as any)[configKey] ?? 0;
        // Only increase score if modal/mic is NOT active
        if (weight > 0 && !showGoalModalRef.current && !isMicOnRef.current) setAnomalyScore(prev => Math.min(ANOMALY_LIMIT, prev + weight));
    }
    if (!isSystemAlert && isDebounced && configKey !== 'NORMAL') return; 
    const newConfig = { ...(DEFAULT_CONFIGS[configKey] || IDLE_CONFIG) };
    if (customMessage) newConfig.message = customMessage;
    lastEventTime.current = now;
    if (!isSystemAlert) { lastActiveTime.current = now; isIdleRef.current = false; }
    setActiveConfig(newConfig);
    if (configKey === 'NORMAL') return;
    setHistory(prev => [...prev, { id: now + Math.random(), timestamp: new Date().toLocaleTimeString(), config: newConfig }].slice(-10));
  }, []);

  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  useEffect(() => { targetConfigRef.current = activeConfig; }, [activeConfig]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => { try { track.stop(); } catch(e) {} });
    screenStreamRef.current = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setIsScreenSharing(false); setScreenChangeRate(0); prevHistogramRef.current = null;
    setActiveConfig(LOCKED_CONFIG); setAnomalyScore(0);
    setUserGoal(""); // Reset Goal on Stop
    
    // Cleanup Mic
    if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
    }
    setIsMicOn(false);
  }, []);

  const setScreenVideoElement = useCallback((node: HTMLVideoElement | null) => {
    screenVideoRef.current = node;
    if (node && screenStreamRef.current) { if (node.srcObject !== screenStreamRef.current) node.srcObject = screenStreamRef.current; node.play().catch(() => {}); }
  }, []);

  const setWebcamVideoElement = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && webcamStreamRef.current) { if (node.srcObject !== webcamStreamRef.current) node.srcObject = webcamStreamRef.current; node.play().catch(() => {}); }
  }, []);

  const handleEnterPiP = useCallback(() => {
    // Note: Do not stop screen share here. Portaling the video element preserves the stream.
    if (togglePiP) togglePiP();
  }, [togglePiP]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) { stopScreenShare(); return; }
    stopScreenShare(); await new Promise(resolve => setTimeout(resolve, 100));
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } });
        screenStreamRef.current = stream; 
        if (screenVideoRef.current) { screenVideoRef.current.srcObject = stream; screenVideoRef.current.play().catch(e => console.error(e)); }
        setIsScreenSharing(true); 
        
        // Trigger Goal Modal
        setTempGoal(""); 
        setShowGoalModal(true);
        triggerEvent('NORMAL', "Visual Uplink Established."); 

        stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { stopScreenShare(); }
  };

  const handleGoalSubmit = () => {
    const goal = tempGoal || "General Task";
    setUserGoal(goal);
    setShowGoalModal(false);
    triggerEvent('NORMAL', `Directive Confirmed: ${goal}`);
    
    // Send a directive to the AI to improvise the welcome message based on the goal
    const ttsInstruction = `The user has just set their session goal: "${goal}". Act as their high-tech, intelligent biometric monitoring system. Warmly welcome them, acknowledge their specific goal, and inform them that they have a one-minute calibration phase to prepare before strict monitoring begins. Be concise, professional, and encouraging.`;
    generateAndPlaySpeech(ttsInstruction, true);
    
    // Set warmup to 1 minute from now
    warmupEndTimeRef.current = Date.now() + 60000;
  };

  const handleInitialize = () => {
    initAudioContext();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    setIsAudioEnabled(true);
    if (apiKey) toggleScreenShare(); else setShowKeyModal(true);
  };

  const handleKeySubmit = () => {
    if (!tempKey.trim()) return;
    localStorage.setItem('gemini_api_key', tempKey);
    setApiKey(tempKey); setShowKeyModal(false); toggleScreenShare();
  };

  const prevPiPActive = useRef(isPiPActive);
  useEffect(() => { if (prevPiPActive.current && !isPiPActive) stopScreenShare(); prevPiPActive.current = isPiPActive; }, [isPiPActive, stopScreenShare]);

  useEffect(() => {
    return () => { 
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop()); 
        if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
        if (audioCtxRef.current) audioCtxRef.current.close(); 
        if (inputAudioCtxRef.current) inputAudioCtxRef.current.close();
        if (liveSessionRef.current) {
            liveSessionRef.current.close();
        }
    };
  }, []); 
  
  // Cleanup Live Session if API Key changes
  useEffect(() => {
    if (liveSessionRef.current) {
        liveSessionRef.current.close();
        liveSessionRef.current = null;
        liveSessionPromiseRef.current = null;
    }
  }, [apiKey]);

  useEffect(() => {
    let intervalId: any;
    const offCanvas = document.createElement('canvas'); const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCanvas.width = 64; offCanvas.height = 64;
    const checkScreen = () => {
        if (!screenVideoRef.current || !offCtx) return;
        if (screenVideoRef.current.paused && screenStreamRef.current) screenVideoRef.current.play().catch(() => {});
        try {
            offCtx.drawImage(screenVideoRef.current, 0, 0, 64, 64);
            const currentHist = calculateHistogram(offCtx, 64, 64);
            if (prevHistogramRef.current) {
                const diff = euclideanDistance(currentHist, prevHistogramRef.current);
                setScreenChangeRate(diff);
                if (diff > thresholdsRef.current.SCREEN.CHANGE_THRESHOLD) triggerEvent('VISUAL_SURGE');
                if (diff > 0.05) lastActiveTime.current = Date.now();
            }
            prevHistogramRef.current = currentHist;
        } catch (e) { }
    };
    if (isScreenSharing) intervalId = setInterval(checkScreen, thresholdsRef.current.SCREEN.SAMPLE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isScreenSharing, triggerEvent]); 

  useEffect(() => {
    if(!isScreenSharing) return; 
    if (personPresent && !prevPresenceRef.current) triggerEvent('PRESENCE_FOUND');
    else if (!personPresent && prevPresenceRef.current) triggerEvent('PRESENCE_LOST');
    prevPresenceRef.current = personPresent;
  }, [personPresent, triggerEvent, isScreenSharing]);

  useEffect(() => {
    if(!isScreenSharing) return; 
    const handleActivity = () => {
      lastActiveTime.current = Date.now();
      if (isIdleRef.current) { isIdleRef.current = false; triggerEvent('NORMAL', "Input detected. System active."); }
    };
    window.addEventListener('mousemove', handleActivity); window.addEventListener('keydown', handleActivity);
    return () => { window.removeEventListener('mousemove', handleActivity); window.removeEventListener('keydown', handleActivity); };
  }, [triggerEvent, isScreenSharing]);

  useEffect(() => {
    if(!isScreenSharing) return; 
    const idleCheck = setInterval(() => {
      const t = thresholdsRef.current;
      const isTimeOut = Date.now() - lastActiveTime.current > t.IDLE.TIMEOUT_MS;
      if (!isIdleRef.current && isTimeOut) {
        isIdleRef.current = true;
        if (personPresent) triggerEvent('STAGNATION');
        else setHistory(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), config: IDLE_CONFIG }].slice(-10)); 
      }
    }, 1000);
    return () => clearInterval(idleCheck);
  }, [activeConfig.label, isScreenSharing, personPresent, triggerEvent]);

  useEffect(() => {
    if(!isScreenSharing) return;
    let faceLandmarker: FaceLandmarker | null = null;
    let animationId: number;
    let lastVideoTime = -1;
    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
          outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, runningMode: "VIDEO", numFaces: 1
        });
        startWebcam();
      } catch (error) { console.error("MediaPipe Load Error:", error); }
    };
    const startWebcam = async () => {
      if (navigator.mediaDevices?.getUserMedia) {
        let stream = webcamStreamRef.current;
        if (!stream) { try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); webcamStreamRef.current = stream; } catch (e) { return; } }
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.addEventListener('loadeddata', predictWebcam); }
      }
    };
    const predictWebcam = () => {
      if (isSettingsOpenRef.current) { setTimeout(() => { animationId = requestAnimationFrame(predictWebcam); }, 100); return; }
      const video = videoRef.current; const t = thresholdsRef.current;
      if (!video || !faceLandmarker) return;
      if (video.paused && webcamStreamRef.current) video.play().catch(() => {});
      if (video.currentTime !== lastVideoTime && !video.paused && !video.ended) {
        lastVideoTime = video.currentTime;
        const results = faceLandmarker.detectForVideo(video, performance.now());
        const now = performance.now();
        let isPresentRaw = false;
        if (results.faceLandmarks && results.faceLandmarks.length > 0) { isPresentRaw = true; lastFaceDetectedRef.current = now; }
        const isPresentDebounced = (now - lastFaceDetectedRef.current) < 1000;
        setPersonPresent(prev => (prev !== isPresentDebounced ? isPresentDebounced : prev));
        if (isPresentRaw) {
          const categories = results.faceBlendshapes[0].categories;
          const currentExp = TARGET_BLENDSHAPES.map(n => categories.find(c => c.categoryName === n)?.score || 0);
          const matrix = results.facialTransformationMatrixes![0].data;
          const currentRot = [matrix[0], matrix[1], matrix[2], matrix[4], matrix[5], matrix[6], matrix[8], matrix[9], matrix[10]];
          const currentPos = [matrix[12]/10, matrix[13]/10, matrix[14]/10]; 
          const angles = calculateEulerAngles(matrix);
          setEulerAngles(angles);
          const updateRate = (current: any, buffer: any, setRate: any) => {
            let avg = current;
            if (buffer.length > 0) avg = new Array(current.length).fill(0).map((_, i) => buffer.reduce((acc: any, val: any) => acc + val[i], 0) / buffer.length);
            const dist = euclideanDistance(current, avg); setRate(dist); buffer.push(current); if (buffer.length > 20) buffer.shift(); return dist;
          };
          const eRate = updateRate(currentExp, blendShapeHistoryRef.current, setExpressionRate);
          const rRate = updateRate(currentRot, rotationHistoryRef.current, setRotationRate);
          const pRate = updateRate(currentPos, positionHistoryRef.current, setPositionRate);
          if (eRate > t.EXPRESSION.RESET_THRESHOLD || rRate > t.ROTATION.RESET_THRESHOLD || pRate > t.MOVEMENT.RESET_THRESHOLD) lastActiveTime.current = Date.now();
          if (eRate > t.EXPRESSION.SPIKE_THRESHOLD && pRate < 0.1) triggerEvent('EXPRESSION');
          if (pRate > t.MOVEMENT.SPIKE_THRESHOLD && Math.abs(currentPos[2] - (positionHistoryRef.current[0] || currentPos)[2]) > t.MOVEMENT.LEAN_Z_DISTANCE) triggerEvent(currentPos[2] - (positionHistoryRef.current[0] || currentPos)[2] > 0 ? 'LEAN_IN' : 'LEAN_OUT');
          const ab = angleBufferRef.current; ab.push({ pitch: angles.pitch, yaw: angles.yaw }); if (ab.length > t.GESTURE.BUFFER_SIZE) ab.shift();
          if (ab.length === t.GESTURE.BUFFER_SIZE) {
             const pitches = ab.map(a => a.pitch); const yaws = ab.map(a => a.yaw);
             if (Math.max(...pitches) - Math.min(...pitches) > t.GESTURE.NOD.PITCH_RANGE_MIN) triggerEvent('NOD');
             else if (Math.max(...yaws) - Math.min(...yaws) > t.GESTURE.SHAKE.YAW_RANGE_MIN) triggerEvent('SHAKE');
          }
        } else { setExpressionRate(0); setRotationRate(0); setPositionRate(0); setEulerAngles({pitch:0, yaw:0, roll:0}); blendShapeHistoryRef.current = []; rotationHistoryRef.current = []; positionHistoryRef.current = []; angleBufferRef.current = []; }
      }
      animationId = requestAnimationFrame(predictWebcam);
    };
    setupMediaPipe();
    return () => { if(faceLandmarker) faceLandmarker.close(); cancelAnimationFrame(animationId); };
  }, [triggerEvent, isScreenSharing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frameId: number;
    let time = 0;

    const render = () => {
      const rect = container.getBoundingClientRect();
      const logicalWidth = rect.width;
      const logicalHeight = rect.height;
      
      if (logicalWidth === 0 || logicalHeight === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const requiredWidth = Math.floor(logicalWidth * dpr);
      const requiredHeight = Math.floor(logicalHeight * dpr);

      if (canvas.width !== requiredWidth || canvas.height !== requiredHeight) {
         canvas.width = requiredWidth;
         canvas.height = requiredHeight;
         ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, logicalWidth, logicalHeight);
      
      const cur = currentConfigRef.current;
      const tgt = targetConfigRef.current;
      const smooth = 0.05; 

      cur.speed = lerp(cur.speed, tgt.speed, smooth);
      cur.frequency = lerp(cur.frequency, tgt.frequency, smooth);
      cur.amplitude = lerp(cur.amplitude, tgt.amplitude, smooth);
      cur.jitter = lerp(cur.jitter, tgt.jitter, smooth);
      cur.colorPrimary = tgt.colorPrimary;
      cur.colorSecondary = tgt.colorSecondary;

      time += cur.speed;
      const centerY = logicalHeight * 0.25;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.moveTo(0, centerY); ctx.lineTo(logicalWidth, centerY); ctx.stroke();

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      [1, 2, 3].forEach(idx => {
        ctx.beginPath();
        ctx.strokeStyle = idx === 1 ? cur.colorPrimary : cur.colorSecondary;
        ctx.lineWidth = idx === 1 ? 2.5 : 1.5;
        const phase = idx * 2.5;
        ctx.moveTo(0, centerY);
        
        for (let x = 0; x <= logicalWidth + 5; x += 2) {
           const normX = x / logicalWidth; 
           const atten = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, normX))), 2);
           
           let yOff = Math.sin(x * cur.frequency + time + phase);
           yOff += Math.sin(x * (cur.frequency * 2.2) - time * 0.5) * 0.4;
           if(cur.jitter > 0) yOff += (Math.random() - 0.5) * cur.jitter * 3;
           
           ctx.lineTo(x, centerY + yOff * cur.amplitude * atten);
        }
        ctx.stroke();
        
        if(idx === 1) {
           ctx.shadowBlur = 15; ctx.shadowColor = cur.colorPrimary; ctx.stroke(); ctx.shadowBlur = 0;
        }
      });
      frameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-transparent overflow-hidden flex flex-col items-center justify-center group/container">
      <style>{`
        .log-entry-anim { animation: slide-up 0.4s ease-out forwards; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .settings-anim { animation: slide-right 0.3s ease-out forwards; }
        @keyframes slide-right { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .hud-glass { background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.1); }
        .trigger-toast-anim { animation: slide-in-left 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes slide-in-left { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .speaking-pulse { animation: speak-pulse 1.5s infinite; }
        @keyframes speak-pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .mic-pulse { animation: mic-pulse 2s infinite; }
        @keyframes mic-pulse { 0% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4); } 70% { box-shadow: 0 0 0 15px rgba(34, 211, 238, 0); } 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); } }
      `}</style>
      <video ref={setWebcamVideoElement} className="absolute opacity-0 pointer-events-none w-px h-px" autoPlay playsInline muted />
      <video ref={setScreenVideoElement} className="absolute opacity-0 pointer-events-none w-px h-px" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0 block pointer-events-none w-full h-full" />
      
      {/* GOAL INPUT MODAL */}
      {showGoalModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/30 rounded-xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.2)] relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.05)_50%,transparent_100%)] opacity-20 pointer-events-none" style={{backgroundSize: '100% 3px'}}></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4 text-cyan-400"><BrainCircuit size={20} /><h3 className="font-mono font-bold tracking-widest uppercase text-sm">Objective Parameter</h3></div>
                    <p className="text-xs text-cyan-100/60 font-mono mb-6 leading-relaxed">Define the primary directive for this session. The system will optimize analysis based on this goal.</p>
                    <div className="space-y-4">
                      <div className="relative">
                        <input type="text" value={tempGoal} onChange={(e) => setTempGoal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleGoalSubmit(); }} placeholder="E.g. I want to learn Chinese..." className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all" autoFocus />
                      </div>
                      <button onClick={handleGoalSubmit} className="w-full px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition-all">Initialize Directive</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {showKeyModal && !showGoalModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/30 rounded-xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.2)] relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.05)_50%,transparent_100%)] opacity-20 pointer-events-none" style={{backgroundSize: '100% 3px'}}></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4 text-cyan-400"><Key size={20} /><h3 className="font-mono font-bold tracking-widest uppercase text-sm">Security Clearance</h3></div>
                    <p className="text-xs text-cyan-100/60 font-mono mb-6 leading-relaxed">To access the neural interface, please authenticate with your Gemini API Key.</p>
                    <div className="space-y-4"><div className="relative"><input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="Enter API Key..." className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all" autoFocus /></div><div className="flex gap-3 pt-2"><button onClick={() => setShowKeyModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-mono uppercase text-white/60 hover:text-white transition-colors">Cancel</button><button onClick={handleKeySubmit} disabled={!tempKey.trim()} className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase tracking-wider shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all">Connect</button></div></div>
                    <div className="mt-6 pt-4 border-t border-white/5 text-center"><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400/60 hover:text-cyan-400 font-mono underline decoration-cyan-400/30 underline-offset-4 transition-colors">Generate Identity Key &rarr;</a></div>
                </div>
            </div>
        </div>
      )}
      {!isScreenSharing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-500">
             <div className="relative group cursor-pointer" onClick={handleInitialize}>
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-500"></div>
                <button className="relative px-8 py-4 bg-slate-900 ring-1 ring-white/10 rounded-full flex items-center gap-4 hover:bg-slate-800 transition-all active:scale-95">
                  <Power className="w-6 h-6 text-cyan-400 animate-pulse" />
                  <span className="font-mono text-cyan-100 tracking-[0.2em] text-sm uppercase font-bold">Initialize Visual Link</span>
                </button>
             </div>
             <p className="mt-6 text-[10px] font-mono text-cyan-200/40 uppercase tracking-widest text-center max-w-xs">System Standby. Establish screen uplink to activate biometric sensors and holographic interface.</p>
        </div>
      )}
      {isScreenSharing && (
        <>
            <div className="absolute top-6 left-6 z-40 flex flex-col gap-2">
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-white/40 hover:text-cyan-400 hover:bg-white/5 rounded-full transition-all" title="Detection Parameters"><Settings size={20} /></button>
                <div className="p-2 text-white/40 pointer-events-none" title="Audio Status">{isAudioEnabled ? (isSpeaking ? <Volume2 size={20} className="text-cyan-400 speaking-pulse"/> : <Volume2 size={20} className="text-white/40"/>) : <VolumeX size={20} className="text-red-400"/>}</div>
            </div>
            {isSettingsOpen && (<SettingsPanel config={thresholds} onUpdate={setThresholds} onApiKeyUpdate={setApiKey} isDebugMode={isDebugMode} onToggleDebug={setIsDebugMode} onClose={handleCloseSettings} />)}
            {isDebugMode && (
                <div className="absolute top-6 right-6 z-30 flex flex-col gap-2 items-end animate-in fade-in duration-300">
                    <div className="flex items-center gap-3 hud-glass px-3 py-1.5 rounded shadow-lg">
                        <div className="flex flex-col items-end"><span className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Subject</span><span className={`text-[10px] font-bold font-mono tracking-wider ${personPresent ? 'text-emerald-400' : 'text-red-400'}`}>{personPresent ? 'DETECTED' : 'MISSING'}</span></div><div className={`p-1.5 rounded-full ${personPresent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{personPresent ? <ScanFace size={14} /> : <ScanFace size={14} />}</div>
                    </div>
                    <div className="flex items-center gap-3 hud-glass px-3 py-1.5 rounded shadow-lg">
                        <div className="flex flex-col items-end"><span className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Exp. Var</span><span className="text-[10px] font-bold font-mono tracking-wider text-cyan-400">{expressionRate.toFixed(3)}</span></div><Gauge size={14} className="text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-3 hud-glass px-3 py-1.5 rounded shadow-lg">
                        <div className="flex flex-col items-end"><span className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Rot. Var</span><div className="flex gap-2"><span className={`text-[8px] font-mono ${Math.abs(eulerAngles.pitch) > 25 ? 'text-red-400' : 'text-white/50'}`}>P:{eulerAngles.pitch.toFixed(0)}°</span><span className={`text-[8px] font-mono ${Math.abs(eulerAngles.yaw) > 35 ? 'text-red-400' : 'text-white/50'}`}>Y:{eulerAngles.yaw.toFixed(0)}°</span></div><span className="text-[10px] font-bold font-mono tracking-wider text-purple-400">{rotationRate.toFixed(3)}</span></div><Rotate3d size={14} className="text-purple-400" />
                    </div>
                    <div className="flex items-center gap-3 hud-glass px-3 py-1.5 rounded shadow-lg">
                        <div className="flex flex-col items-end"><span className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Pos. Var</span><span className="text-[10px] font-bold font-mono tracking-wider text-orange-400">{positionRate.toFixed(3)}</span></div><Move3d size={14} className="text-orange-400" />
                    </div>
                    <div className="flex items-center gap-3 hud-glass px-3 py-1.5 rounded shadow-lg animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex flex-col items-end"><span className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Vis. Var</span><span className={`text-[10px] font-bold font-mono tracking-wider ${screenChangeRate > thresholdsRef.current.SCREEN.CHANGE_THRESHOLD ? 'text-blue-400' : 'text-blue-400/70'}`}>{screenChangeRate.toFixed(3)}</span></div><Activity size={14} className="text-blue-400" />
                    </div>
                </div>
            )}
            <div className={`absolute left-6 bottom-6 w-80 z-20 flex flex-col justify-end transition-all duration-500 ${isPiPActive ? 'top-auto bottom-2' : ''}`}>
                 <div className="flex items-center gap-2 mb-2 opacity-50"><BrainCircuit size={14} className="text-white" /><span className="text-[9px] font-mono uppercase tracking-widest text-white">Neural Directive</span></div>
                <div className="log-entry-anim relative group">
                    <div className="flex flex-col gap-1 pl-3 border-l-4 transition-all duration-500 bg-slate-900/40 p-4 rounded-r-lg backdrop-blur-sm shadow-xl" style={{ borderColor: aiHudState.colorPrimary }}>
                        <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-bold font-mono tracking-wider uppercase" style={{ color: aiHudState.colorPrimary, textShadow: `0 0 10px ${aiHudState.colorPrimary}` }}>{aiHudState.label}</span><span className="text-[9px] text-white/30 font-mono">{aiHudState.timestamp}</span></div>
                        <div className="text-[11px] text-cyan-100/80 font-mono italic leading-tight mb-2 opacity-80" style={{ textShadow: '0 0 5px rgba(34, 211, 238, 0.2)' }}>&gt; {aiHudState.thought}</div>
                        <div className="text-xs font-bold font-mono text-white leading-relaxed" style={{ textShadow: `0 0 10px ${aiHudState.colorPrimary}` }}>{aiHudState.message}</div>
                        {aiHudState.directMessage && (<div className="mt-2 pt-2 border-t border-white/10 animate-in fade-in duration-500"><div className="flex items-start gap-2"><MessageSquareWarning size={14} className="text-yellow-400 shrink-0 mt-0.5" /><span className="text-[11px] font-bold text-yellow-100 font-mono leading-tight">"{aiHudState.directMessage}"</span></div><div className="mt-1 flex justify-end"><span className="text-[8px] text-white/30 font-mono uppercase tracking-widest flex items-center gap-1">{isSpeaking ? 'Audio Link Active' : 'Audio Transmitted'}{isSpeaking && <span className="block w-1 h-1 rounded-full bg-cyan-400 speaking-pulse"></span>}</span></div></div>)}
                    </div>
                </div>
            </div>
            {isDebugMode && (
                <div className={`absolute right-6 bottom-6 z-20 flex flex-col items-end gap-4 transition-all duration-500 animate-in fade-in duration-300 ${isPiPActive ? 'scale-90 origin-bottom-right bottom-2' : ''}`}>
                    <div className="w-80 flex flex-col justify-end items-end">
                        <div className="flex items-center gap-2 mb-2 opacity-50 w-full justify-end"><span className="text-[9px] font-mono uppercase tracking-widest text-white">Event Log</span><History size={12} className="text-white" /></div>
                        <div className="flex flex-col justify-end relative w-full items-end max-h-[200px] overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-slate-900/0 to-transparent z-10 pointer-events-none"></div>
                            {history.map((entry, index) => { const isLatest = index === history.length - 1; const glowColor = entry.config.colorPrimary; return (<div key={entry.id} className="log-entry-anim mb-2 relative group w-full"><div className="flex flex-col gap-0.5 pr-3 border-r-2 transition-all duration-300 items-end text-right bg-slate-900/20 py-1 rounded-l" style={{ borderColor: glowColor, opacity: isLatest ? 0.9 : 0.4 }}><div className="flex items-center justify-end gap-2 w-full"><span className="text-[9px] text-white/30 font-mono">{entry.timestamp}</span><span className="text-[10px] font-bold font-mono tracking-wider uppercase" style={{ color: glowColor }}>{entry.config.label}</span></div><div className={`text-[10px] font-medium transition-all duration-300 ${isLatest ? 'text-white/90' : 'text-white/50'}`}>{entry.config.message}</div></div></div>); })}
                        </div>
                    </div>
                    <div className="w-64">
                        <div className={`hud-glass p-3 rounded-lg border-l-2 transition-colors duration-300 ${anomalyScore > TRIGGER_THRESHOLD ? 'border-red-500 bg-red-900/20' : 'border-cyan-500'}`}>
                            <div className="flex justify-between items-end mb-1"><span className={`text-[9px] font-mono tracking-widest uppercase ${anomalyScore > TRIGGER_THRESHOLD ? 'text-red-300 animate-pulse' : 'text-cyan-200/50'}`}>{anomalyScore > TRIGGER_THRESHOLD ? 'CRITICAL THRESHOLD' : 'ANOMALY INDEX'}</span><span className={`text-lg font-bold font-mono ${anomalyScore > TRIGGER_THRESHOLD ? 'text-red-400' : 'text-cyan-400'}`}>{Math.round(anomalyScore)}<span className="text-xs text-white/30"> / {ANOMALY_LIMIT}</span></span></div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden"><div className={`h-full transition-all duration-200 ease-linear ${anomalyScore > TRIGGER_THRESHOLD ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]'}`} style={{ width: `${Math.min(100, (anomalyScore / ANOMALY_LIMIT) * 100)}%` }} /></div>
                        </div>
                    </div>
                </div>
            )}
            {!isPiPActive && isDebugMode && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none animate-in fade-in duration-300">
                    <Activity className="w-6 h-6 animate-pulse transition-colors duration-500" style={{ color: activeConfig.colorPrimary }} />
                    <div className="text-[10px] font-mono tracking-[0.4em] uppercase opacity-70" style={{ color: activeConfig.colorPrimary }}>{activeConfig.label}</div>
                </div>
            )}
            
            {/* VOICE INTERACTION BUTTON - CENTERED AND TRANSPARENT */}
            <div className={`absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center transition-all duration-500 ${isPiPActive ? 'bottom-8' : 'bottom-24'}`}>
                <button 
                  onClick={toggleMic}
                  className={`relative group flex items-center justify-center rounded-full transition-all duration-300 backdrop-blur-sm
                    ${isMicOn 
                        ? 'w-20 h-20 bg-red-500/20 border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] mic-pulse' 
                        : 'w-16 h-16 bg-white/5 border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                    }`}
                >
                    {isMicOn ? (
                        <div className="relative z-10">
                            <div className="absolute -inset-4 bg-red-500/20 rounded-full animate-ping opacity-75"></div>
                            <MicOff size={32} className="text-red-400 relative z-20" />
                        </div>
                    ) : (
                        <Mic size={24} className="text-white/60 group-hover:text-cyan-400 transition-colors" />
                    )}
                </button>
                <div className={`mt-3 px-3 py-1 rounded bg-black/40 backdrop-blur text-[10px] font-mono uppercase tracking-widest transition-opacity duration-300 ${isMicOn ? 'text-red-400 border border-red-500/30' : 'text-white/30 border border-white/5'}`}>
                    {isMicOn ? "Listening..." : "Push to Speak"}
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-40">
                {togglePiP && !isPiPActive && (<button onClick={handleEnterPiP} className="p-4 rounded-full bg-white/5 hover:bg-white/10 text-white border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all hover:scale-105 active:scale-95 group relative" title="Project Hologram"><MonitorUp className="w-6 h-6 group-hover:text-cyan-400 transition-colors" /></button>)}
                {!isPiPActive && (<button onClick={toggleScreenShare} className={`p-4 rounded-full border shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all hover:scale-105 active:scale-95 group relative ${isScreenSharing ? 'bg-blue-500/20 border-blue-400/50 text-blue-400' : 'bg-white/5 border-white/20 text-white hover:bg-white/10'}`} title="Stop Visual Intel"><MonitorOff className="w-6 h-6" /></button>)}
            </div>
        </>
      )}
      <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 mix-blend-overlay"></div>
    </div>
  );
};