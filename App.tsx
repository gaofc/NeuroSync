import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { TechRippleUI } from './components/TimerUI';
import { PiPContainer, usePiPWindow } from './components/PiPContainer';
import { AlertTriangle, Radio, LayoutDashboard, PictureInPicture2, ArrowRight } from 'lucide-react';

const App: React.FC = () => {
  const { pipWindow, setPipWindow, togglePiP, isSupported } = usePiPWindow();
  const [hasSelectedMode, setHasSelectedMode] = useState(false);

  useEffect(() => {
    document.title = "Holographic Wave";
  }, []);

  const handlePageMode = () => {
    setHasSelectedMode(true);
  };

  const handleWidgetMode = async () => {
    // Force the app to render the Main View immediately.
    // This ensures TechRippleUI is mounted and initialized in the DOM 
    // BEFORE we attempt to open the PiP window.
    // We use flushSync to ensure this happens synchronously so we don't lose
    // the "User Gesture" token required by togglePiP().
    flushSync(() => {
        setHasSelectedMode(true);
    });

    // Now that the UI exists, open PiP. 
    // The existing UI will be portaled into the new window.
    // Dimensions increased to 600x400 to accommodate full text visibility.
    await togglePiP(600, 400);
  };

  // --- SELECTION SCREEN ---
  if (!hasSelectedMode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden bg-[radial-gradient(circle_at_center,_#172554_0%,_#020617_100%)] p-6">
         {/* Decorative Grid */}
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none"></div>
         
         <div className="relative z-10 max-w-4xl w-full flex flex-col items-center">
            <h1 className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-cyan-100 to-cyan-500 mb-2 tracking-[0.2em] font-mono uppercase text-center">
              System Initialization
            </h1>
            <p className="text-cyan-200/50 font-mono text-sm mb-12 tracking-wider">Select operational interface mode</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              
              {/* PAGE MODE CARD */}
              <button 
                onClick={handlePageMode}
                className="group relative flex flex-col items-start p-8 rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-sm hover:bg-slate-800/60 transition-all duration-300 text-left hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]"
              >
                <div className="absolute top-4 right-4 text-white/10 group-hover:text-cyan-400/20 transition-colors">
                   <LayoutDashboard size={80} strokeWidth={1} />
                </div>
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-transform">
                   <LayoutDashboard size={24} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2 font-mono group-hover:text-cyan-300">Dashboard Console</h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Full operations interface. View real-time biometric telemetry, event logs, detailed graphs, and configure system parameters.
                </p>
                <div className="mt-auto flex items-center gap-2 text-xs font-bold font-mono uppercase tracking-widest text-cyan-600 group-hover:text-cyan-400 transition-colors">
                  <span>Initialize Console</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* WIDGET MODE CARD */}
              <button 
                onClick={handleWidgetMode}
                disabled={!isSupported}
                className={`group relative flex flex-col items-start p-8 rounded-2xl border bg-slate-900/40 backdrop-blur-sm transition-all duration-300 text-left
                  ${!isSupported 
                    ? 'border-red-900/30 opacity-50 cursor-not-allowed' 
                    : 'border-white/10 hover:bg-slate-800/60 hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]'
                  }`}
              >
                 <div className="absolute top-4 right-4 text-white/10 group-hover:text-purple-400/20 transition-colors">
                   <PictureInPicture2 size={80} strokeWidth={1} />
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform ${!isSupported ? 'bg-red-500/10 text-red-400' : 'bg-purple-500/10 text-purple-400'}`}>
                   {isSupported ? <PictureInPicture2 size={24} /> : <AlertTriangle size={24} />}
                </div>
                <h2 className={`text-xl font-bold mb-2 font-mono ${!isSupported ? 'text-red-300' : 'text-white group-hover:text-purple-300'}`}>
                  Holo-Emitter
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Compact desktop widget mode. Projects biometric status and ripple visualization into a floating, always-on-top window.
                </p>
                <div className={`mt-auto flex items-center gap-2 text-xs font-bold font-mono uppercase tracking-widest transition-colors ${!isSupported ? 'text-red-500' : 'text-purple-600 group-hover:text-purple-400'}`}>
                  <span>{!isSupported ? 'Unavailable' : 'Launch Widget'}</span>
                  {isSupported && <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />}
                </div>
                {!isSupported && <span className="absolute bottom-8 right-8 text-[10px] text-red-500/60 font-mono">PiP API Not Supported</span>}
              </button>

            </div>
         </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    // Updated background to match the "Deep Blue Holographic" theme of the PiP window
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden bg-[radial-gradient(circle_at_center,_#172554_0%,_#020617_100%)]">
      
      {/* Decorative Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none"></div>

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-screen flex flex-col">
        
        {!isSupported && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-900/80 border border-red-700 rounded text-red-200 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>Browser does not support PiP API</span>
          </div>
        )}

        {/* The Visualization Container */}
        <div className={`flex-1 w-full transition-all duration-700 ${pipWindow ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
           <PiPContainer pipWindow={pipWindow} setPipWindow={setPipWindow}>
              <TechRippleUI 
                togglePiP={isSupported ? () => togglePiP(600, 400) : undefined}
                isPiPActive={!!pipWindow}
              />
           </PiPContainer>
        </div>

        {/* Placeholder when PiP is active */}
        {pipWindow && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="pointer-events-auto p-8 flex flex-col items-center text-center animate-in fade-in duration-700">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-cyan-500/30 blur-2xl rounded-full"></div>
                <Radio className="relative w-16 h-16 text-cyan-400 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500 mb-2 tracking-widest font-mono uppercase">
                Signal Projected
              </h2>
              <p className="text-cyan-200/50 text-sm font-mono mb-8">
                Waveform active in external holographic window
              </p>
              <button 
                onClick={() => togglePiP()}
                className="px-8 py-3 bg-cyan-950/50 hover:bg-cyan-900/50 text-cyan-400 border border-cyan-500/30 rounded-full transition-all text-xs font-mono uppercase tracking-[0.2em] hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                Terminate Signal
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;