import { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCcw } from "lucide-react";

export default function StemMixer({ song, onBackToCatalog }) {
  const [library, setLibrary] = useState("demucs");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Mixer settings: volume, mute, solo for each stem
  // Stems differ by library
  const libraryStems = {
    demucs: ["vocals", "drums", "bass", "other"],
    bs_roformer: ["vocals", "instrumental"],
    openunmix: ["vocals", "drums", "bass", "other"],
    mdxnet: ["vocals", "instrumental"]
  };

  const stems = libraryStems[library];

  const [trackStates, setTrackStates] = useState({});

  // Refs for HTML5 Audio elements
  const audioRefs = useRef({});
  const syncIntervalRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const isSeekingRef = useRef(false);

  // Initialize track states when library or song changes
  useEffect(() => {
    const initialStates = {};
    stems.forEach(stem => {
      initialStates[stem] = {
        volume: 0.8,
        isMuted: false,
        isSoloed: false
      };
    });
    setTrackStates(initialStates);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
  }, [library, song]);

  // Handle loading and cleanup of audio elements
  useEffect(() => {
    setIsLoading(true);
    // Destroy previous audio elements
    Object.keys(audioRefs.current).forEach(key => {
      const audio = audioRefs.current[key];
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    });
    audioRefs.current = {};

    let loadedCount = 0;
    const totalStems = stems.length;
    let maxDur = 0;

    stems.forEach(stem => {
      const audioUrl = `${import.meta.env.BASE_URL}separated/${song.youtubeId}/${library}/${stem}.wav`;
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      audioRefs.current[stem] = audio;

      const checkLoaded = () => {
        loadedCount++;
        if (audio.duration && audio.duration > maxDur) {
          maxDur = audio.duration;
          setDuration(maxDur);
        }
        if (loadedCount >= totalStems) {
          setIsLoading(false);
        }
      };

      audio.addEventListener("canplaythrough", checkLoaded, { once: true });
      audio.addEventListener("error", (e) => {
        console.error(`Error loading stem ${stem} from ${audioUrl}:`, e);
        setHasError(true);
        // still count it to avoid lock
        checkLoaded();
      });
      audio.load();
    });

    // Cleanup on unmount or when song/library changes
    return () => {
      Object.keys(audioRefs.current).forEach(key => {
        const audio = audioRefs.current[key];
        if (audio) {
          audio.pause();
          audio.src = "";
        }
      });
      audioRefs.current = {};
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [library, song, stems]);

  // Update Volumes, Mutes, Solos dynamically
  useEffect(() => {
    const soloActive = Object.values(trackStates).some(state => state.isSoloed);

    stems.forEach(stem => {
      const audio = audioRefs.current[stem];
      if (!audio) return;

      const state = trackStates[stem] || { volume: 0.8, isMuted: false, isSoloed: false };
      
      // Calculate effective volume based on Mute & Solo
      let effectiveVol = state.volume;
      if (state.isMuted) {
        effectiveVol = 0;
      } else if (soloActive && !state.isSoloed) {
        effectiveVol = 0;
      }

      audio.volume = effectiveVol;
    });
  }, [trackStates, stems]);

  // Synchronize Playback (periodic checks for track drift)
  useEffect(() => {
    if (isPlaying) {
      // 1. Play all tracks
      Object.keys(audioRefs.current).forEach(key => {
        audioRefs.current[key].play().catch(err => {
          console.warn(`Error playing track ${key}:`, err);
        });
      });

      // 2. Sync loop (checks drift every 250ms)
      syncIntervalRef.current = setInterval(() => {
        const audioKeys = Object.keys(audioRefs.current);
        if (audioKeys.length < 2) return;

        // Use the first loaded/valid track as the master sync source
        const masterAudio = audioRefs.current[audioKeys[0]];
        if (!masterAudio) return;

        const masterTime = masterAudio.currentTime;

        audioKeys.slice(1).forEach(key => {
          const trackAudio = audioRefs.current[key];
          if (!trackAudio) return;

          // If track drifts by more than 80ms, pull it back/forward
          if (Math.abs(trackAudio.currentTime - masterTime) > 0.08) {
            console.log(`[Sync] Resyncing track ${key} to master (${masterTime.toFixed(3)}s)`);
            trackAudio.currentTime = masterTime;
          }
        });
      }, 250);

      // 3. Progress tracking loop
      progressIntervalRef.current = setInterval(() => {
        const audioKeys = Object.keys(audioRefs.current);
        if (audioKeys.length === 0) return;
        
        const masterAudio = audioRefs.current[audioKeys[0]];
        if (masterAudio && !isSeekingRef.current) {
          setCurrentTime(masterAudio.currentTime);
        }
      }, 100);

    } else {
      // Pause all tracks
      Object.keys(audioRefs.current).forEach(key => {
        audioRefs.current[key].pause();
      });
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlaying]);

  const handlePlayToggle = () => {
    if (isLoading) return;
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    isSeekingRef.current = true;
  };

  const handleSeekEnd = (e) => {
    const val = parseFloat(e.target.value);
    isSeekingRef.current = false;
    setCurrentTime(val);

    Object.keys(audioRefs.current).forEach(key => {
      const audio = audioRefs.current[key];
      if (audio) {
        audio.currentTime = val;
      }
    });
  };

  const handleReset = () => {
    setCurrentTime(0);
    Object.keys(audioRefs.current).forEach(key => {
      const audio = audioRefs.current[key];
      if (audio) {
        audio.currentTime = 0;
      }
    });
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const updateTrackProp = (stem, prop, val) => {
    setTrackStates(prev => ({
      ...prev,
      [stem]: {
        ...prev[stem],
        [prop]: val
      }
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      
      {/* Header controls & Back Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button 
          onClick={onBackToCatalog} 
          className="btn-touch"
          style={{ 
            background: "rgba(255, 255, 255, 0.05)", 
            color: "#ffffff", 
            border: "1px solid #27272a",
            padding: "8px 16px",
            borderRadius: "10px",
            fontSize: "0.85rem",
            fontWeight: "700",
            cursor: "pointer"
          }}
        >
          ← Song Catalog
        </button>

        {/* Library Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.8rem", color: "#a1a1aa", fontWeight: "600" }}>Library:</span>
          <select
            value={library}
            onChange={(e) => setLibrary(e.target.value)}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: "600",
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="demucs">Demucs (4 Stems)</option>
            <option value="bs_roformer">BS-RoFormer (2 Stems)</option>
            <option value="openunmix">OpenUnmix (4 Stems)</option>
            <option value="mdxnet">MDX-Net (2 Stems)</option>
          </select>
        </div>
      </div>

      {/* Main Glass Panel Player Card */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {hasError && (
          <div style={{
            background: "rgba(255, 69, 58, 0.08)",
            border: "1px solid rgba(255, 69, 58, 0.2)",
            borderRadius: "10px",
            padding: "14px 18px",
            color: "#ff453a",
            fontSize: "0.85rem",
            lineHeight: "1.4",
            fontWeight: "500",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            <span style={{ fontWeight: "900", letterSpacing: "0.5px" }}>⚠️ MULTI-TRACK AUDIO LOAD ERROR</span>
            <span>
              Failed to load stem files. This usually happens if you are accessing the app via the wrong port.
            </span>
            <span style={{ color: "#a1a1aa", fontSize: "0.8rem" }}>
              Please check if you are visiting <strong>http://localhost:5174/</strong> (the dev server for the <strong>musicality</strong> workspace where the stems are stored), instead of port <strong>5173</strong> (which runs the <strong>armada-movement</strong> workspace).
            </span>
          </div>
        )}
        
        {/* Track Loading overlay */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "220px", gap: "12px" }}>
            <div className="loading-spinner"></div>
            <span style={{ color: "#a1a1aa", fontWeight: "600", fontSize: "0.9rem" }}>Buffering audio stems...</span>
          </div>
        ) : (
          <>
            {/* Global Timeline Scrubber */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#a1a1aa", fontWeight: "700" }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                onMouseUp={handleSeekEnd}
                onTouchEnd={handleSeekEnd}
                style={{
                  width: "100%",
                  cursor: "pointer",
                  accentColor: "#ffffff",
                  height: "6px",
                  borderRadius: "3px",
                  background: "rgba(255, 255, 255, 0.1)"
                }}
              />
            </div>

            {/* Global Playback Row */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", alignItems: "center" }}>
              <button 
                onClick={handleReset} 
                className="btn-touch"
                style={{ 
                  flex: "0 0 48px", 
                  minHeight: "48px", 
                  display: "flex", 
                  justifyContent: "center", 
                  alignItems: "center", 
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid #27272a" 
                }}
                title="Restart track"
              >
                <RotateCcw size={18} />
              </button>
              
              <button 
                onClick={handlePlayToggle} 
                className="btn-touch btn-play"
                style={{ flex: "0 0 160px", minHeight: "48px", background: "#ffffff", color: "#000000", fontWeight: "800" }}
              >
                {isPlaying ? (
                  <>
                    <Pause size={18} fill="currentColor" />
                    <span>Pause Mix</span>
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    <span>Play Mix</span>
                  </>
                )}
              </button>
            </div>

            {/* Stems Volume Sliders Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: "800", color: "#ffffff", letterSpacing: "0.5px" }}>MIXER CONSOLE</span>
              
              {stems.map((stem) => {
                const state = trackStates[stem] || { volume: 0.8, isMuted: false, isSoloed: false };
                
                return (
                  <div 
                    key={stem} 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "12px", 
                      background: "rgba(255, 255, 255, 0.03)", 
                      padding: "10px 14px", 
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.04)"
                    }}
                  >
                    {/* Stem Label */}
                    <div style={{ flex: "0 0 90px", display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: "800", color: "#ffffff", textTransform: "capitalize" }}>
                        {stem}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "#71717a", fontWeight: "600" }}>
                        WAV stem
                      </span>
                    </div>

                    {/* Mute (M) Button */}
                    <button
                      onClick={() => updateTrackProp(stem, "isMuted", !state.isMuted)}
                      style={{
                        flex: "0 0 32px",
                        height: "32px",
                        borderRadius: "6px",
                        border: state.isMuted ? "1px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.15)",
                        background: state.isMuted ? "#ffffff" : "transparent",
                        color: state.isMuted ? "#000000" : "#ffffff",
                        fontSize: "0.75rem",
                        fontWeight: "900",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease"
                      }}
                      title="Mute track"
                    >
                      M
                    </button>

                    {/* Solo (S) Button */}
                    <button
                      onClick={() => updateTrackProp(stem, "isSoloed", !state.isSoloed)}
                      style={{
                        flex: "0 0 32px",
                        height: "32px",
                        borderRadius: "6px",
                        border: state.isSoloed ? "1px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.15)",
                        background: state.isSoloed ? "#ffffff" : "transparent",
                        color: state.isSoloed ? "#000000" : "#ffffff",
                        fontSize: "0.75rem",
                        fontWeight: "900",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease"
                      }}
                      title="Solo track"
                    >
                      S
                    </button>

                    {/* Volume Slider Icon */}
                    {state.volume === 0 || state.isMuted ? (
                      <VolumeX size={16} style={{ color: "#71717a", flex: "0 0 auto" }} />
                    ) : (
                      <Volume2 size={16} style={{ color: "#a1a1aa", flex: "0 0 auto" }} />
                    )}

                    {/* Volume Slider */}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={state.volume}
                      disabled={state.isMuted}
                      onChange={(e) => updateTrackProp(stem, "volume", parseFloat(e.target.value))}
                      style={{
                        flex: 1,
                        cursor: state.isMuted ? "not-allowed" : "pointer",
                        accentColor: "#ffffff",
                        height: "4px",
                        borderRadius: "2px",
                        background: "rgba(255, 255, 255, 0.15)"
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
