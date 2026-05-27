import React, { useState, useEffect, useRef } from "react";
import { useSyncEngine } from "./hooks/useSyncEngine";
import { Play, Pause, RotateCcw, Music } from "lucide-react";

// ==========================================================================
// Piecewise-Linear Warping Helper Algorithms
// ==========================================================================

const applyWarpToBeats = (originalBeats, activeAnchors) => {
  if (activeAnchors.length === 0) {
    return JSON.parse(JSON.stringify(originalBeats));
  }

  return originalBeats.map((b, idx) => {
    let warpedTime = b.timestamp;
    
    // Find bounding anchors
    let leftAnchor = null;
    let rightAnchor = null;

    for (let a of activeAnchors) {
      if (a.beatIndex <= idx) {
        leftAnchor = a;
      } else if (a.beatIndex > idx && !rightAnchor) {
        rightAnchor = a;
      }
    }

    if (leftAnchor && rightAnchor) {
      // Case 1: Piecewise linear interpolation between left and right anchors
      const oLeft = leftAnchor.originalTime;
      const oRight = rightAnchor.originalTime;
      const tLeft = leftAnchor.tappedTime;
      const tRight = rightAnchor.tappedTime;
      
      const dO = oRight - oLeft;
      const dT = tRight - tLeft;
      
      if (dO > 0) {
        warpedTime = tLeft + ((b.timestamp - oLeft) / dO) * dT;
      } else {
        warpedTime = tLeft;
      }
    } else if (leftAnchor) {
      // Case 2: Extrapolation after the last anchor (constant offset)
      const offset = leftAnchor.tappedTime - leftAnchor.originalTime;
      warpedTime = b.timestamp + offset;
    } else if (rightAnchor) {
      // Case 3: Extrapolation before the first anchor (constant offset)
      const offset = rightAnchor.tappedTime - rightAnchor.originalTime;
      warpedTime = b.timestamp + offset;
    }

    // Piecewise modular re-indexing (forces the anchored beats to count 1)
    let newBeatNum = b.beat;
    if (leftAnchor) {
      newBeatNum = ((idx - leftAnchor.beatIndex) % 8 + 8) % 8 + 1;
    } else if (rightAnchor) {
      newBeatNum = ((idx - rightAnchor.beatIndex) % 8 + 8) % 8 + 1;
    }

    return {
      timestamp: parseFloat(Math.max(0, warpedTime).toFixed(3)),
      beat: newBeatNum
    };
  });
};

const applyWarpToSections = (originalSections, originalBeats, warpedBeats) => {
  if (!originalSections || originalSections.length === 0) return [];
  if (warpedBeats.length === 0) return JSON.parse(JSON.stringify(originalSections));

  return originalSections.map((sec) => {
    const sOld = sec.startTimestamp;
    
    // Find bounding original beats
    let leftIdx = 0;
    let rightIdx = originalBeats.length - 1;

    for (let i = 0; i < originalBeats.length; i++) {
      if (originalBeats[i].timestamp <= sOld) {
        leftIdx = i;
      } else {
        rightIdx = i;
        break;
      }
    }

    const oLeft = originalBeats[leftIdx].timestamp;
    const oRight = originalBeats[rightIdx].timestamp;
    const wLeft = warpedBeats[leftIdx].timestamp;
    const wRight = warpedBeats[rightIdx].timestamp;

    let sNew = wLeft;
    const dO = oRight - oLeft;
    
    if (dO > 0) {
      const dT = wRight - wLeft;
      sNew = wLeft + ((sOld - oLeft) / dO) * dT;
    } else {
      sNew = wLeft;
    }

    return {
      ...sec,
      startTimestamp: parseFloat(Math.max(0, sNew).toFixed(3))
    };
  });
};

export default function App() {
  const [songData, setSongData] = useState(null);
  
  // Media states
  const [player, setPlayer] = useState(null);
  const [playerState, setPlayerState] = useState(-1); 
  const [useLocalAudio, setUseLocalAudio] = useState(true); 
  const [localPlaying, setLocalPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [apiReady, setApiReady] = useState(false);



  // Creator Diagnostic & Calibration states
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [originalSongData, setOriginalSongData] = useState(null);
  const [calibratedSongData, setCalibratedSongData] = useState(null);
  const [calibrationStats, setCalibrationStats] = useState(null);
  const [anchors, setAnchors] = useState([]);
  const [rawTaps, setRawTaps] = useState([]);       // raw clock times when user pressed button
  const [estimatedDelay, setEstimatedDelay] = useState(null); // ms — auto-computed reaction delay
  const [toastMessage, setToastMessage] = useState(null);

  const playerRef = useRef(null);
  const localAudioRef = useRef(null);

  // Helper to show modern fading glass toast notifications
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Compute median human reaction delay from raw taps vs nearest original beat-1
  const computeReactionDelay = (taps, originalBeats) => {
    if (!taps || taps.length < 2 || !originalBeats) return null;
    const beat1Times = originalBeats.filter(b => b.beat === 1).map(b => b.timestamp);
    const delays = taps.map(tapTime => {
      // Find the nearest beat-1 that comes BEFORE the tap (tap is always after hearing)
      let bestDelay = null;
      let bestDiff = Infinity;
      for (const bt of beat1Times) {
        const diff = tapTime - bt;
        if (diff > 0 && diff < 2000 && diff < bestDiff) { // reaction window 0–2000ms
          bestDiff = diff;
          bestDelay = diff;
        }
      }
      return bestDelay;
    }).filter(d => d !== null);

    if (delays.length === 0) return null;
    const sorted = [...delays].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]; // median in seconds
  };

  // 1. Fetch song beatmap JSON generated by our advanced Salsa analyser
  useEffect(() => {
    fetch("/songs/66HCBysrJS8.json")
      .then((res) => {
        if (!res.ok) throw new Error("Catalog load failed");
        return res.json();
      })
      .then((data) => {
        setSongData(data);
        setOriginalSongData(JSON.parse(JSON.stringify(data)));
        setCalibratedSongData(JSON.parse(JSON.stringify(data)));
        console.log("[App] Loaded advanced beatmap successfully for:", data.metadata.songTitle);
      })
      .catch((err) => {
        console.error("[App] Failed to load song beatmap JSON:", err);
      });
  }, []);

  // 2. Load the YouTube Player API script dynamically in background
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setApiReady(true);
      console.log("[App] YouTube Player API loaded.");
    };
  }, []);

  // 3. Construct YouTube Player when API is ready
  useEffect(() => {
    if (!apiReady || !songData || player || useLocalAudio) return;

    try {
      const ytPlayer = new window.YT.Player("yt-player", {
        videoId: songData.metadata.youtubeId,
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          showinfo: 0,
          enablejsapi: 1
        },
        events: {
          onReady: (event) => {
            setPlayer(event.target);
            console.log("[App] YouTube Player Ready.");
          },
          onStateChange: (event) => {
            setPlayerState(event.data);
          }
        }
      });
      playerRef.current = ytPlayer;
    } catch (err) {
      console.error("[App] Error constructing YouTube Player: ", err);
    }

    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        playerRef.current.destroy();
        setPlayer(null);
      }
    };
  }, [apiReady, songData, useLocalAudio]);

  // 4. Hook into the high-precision sync engine (supplying local audio ref, toggle parameter)
  const { currentTime, currentBeat, activeSection, synchronizeAnchors } = useSyncEngine(
    player,
    calibratedSongData || songData,
    localAudioRef,
    useLocalAudio,
    0, // zero AV latency offset
    0  // zero static grid count shift
  );

  // 5. Sync rate changes to local audio element directly
  useEffect(() => {
    if (useLocalAudio && localAudioRef.current) {
      localAudioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, useLocalAudio]);

  // 6. Touch Controller click handlers
  const handlePlayToggle = () => {
    try {
      if (useLocalAudio) {
        const audio = localAudioRef.current;
        if (!audio) return;
        
        if (audio.paused) {
          audio.play();
          setLocalPlaying(true);
        } else {
          audio.pause();
          setLocalPlaying(false);
        }
      } else {
        if (!player) return;
        if (playerState === 1) {
          player.pauseVideo();
        } else {
          player.playVideo();
        }
      }
      setTimeout(synchronizeAnchors, 50);
    } catch (err) {
      console.warn("PlayToggle error: ", err);
    }
  };

  const handleRewind = () => {
    try {
      if (useLocalAudio) {
        const audio = localAudioRef.current;
        if (!audio) return;
        
        let target = audio.currentTime - 10;
        if (target < 0) target = 0;
        audio.currentTime = target;
        console.log(`[Local Audio] Rewinding to: ${target.toFixed(2)}s`);
      } else {
        if (!player) return;
        const current = player.getCurrentTime();
        let target = current - 10;
        if (target < 0) target = 0;
        player.seekTo(target, true);
        console.log(`[YouTube] Rewinding to: ${target.toFixed(2)}s`);
      }
      setTimeout(synchronizeAnchors, 100);
    } catch (err) {
      console.warn("Rewind error: ", err);
    }
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    try {
      if (useLocalAudio) {
        const audio = localAudioRef.current;
        if (audio) {
          audio.playbackRate = rate;
        }
      } else {
        if (player) {
          player.setPlaybackRate(rate);
        }
      }
      setTimeout(synchronizeAnchors, 50);
    } catch (err) {
      console.warn("SpeedChange error: ", err);
    }
  };

  // Toggle modes dynamically
  const toggleSourceMode = (mode) => {
    try {
      if (useLocalAudio && localAudioRef.current) {
        localAudioRef.current.pause();
        setLocalPlaying(false);
      } else if (player) {
        player.pauseVideo();
      }
    } catch (e) {}

    setUseLocalAudio(mode === "local");
    setTimeout(synchronizeAnchors, 100);
  };

  const getContainerClass = () => {
    if (!activeSection) return "";
    const name = activeSection.name.toLowerCase();
    if (name.includes("intro")) return "active-intro";
    if (name.includes("verse") || name.includes("groove")) return "active-verse";
    if (name.includes("chorus") || name.includes("montuno") || name.includes("mambo")) return "active-montuno";
    return "";
  };

  const getSectionColorStyles = () => {
    if (!activeSection) return {};
    const name = activeSection.name.toLowerCase();
    if (name.includes("intro")) return { background: "hsl(var(--salsa-intro-bg))", border: "1px solid hsl(var(--salsa-intro-accent) / 0.15)" };
    if (name.includes("verse") || name.includes("groove")) return { background: "hsl(var(--salsa-verse-bg))", border: "1px solid hsl(var(--salsa-verse-accent) / 0.15)" };
    if (name.includes("chorus") || name.includes("montuno") || name.includes("mambo")) return { background: "hsl(var(--salsa-montuno-bg))", border: "1px solid hsl(var(--salsa-montuno-accent) / 0.15)" };
    return {};
  };

  const isActuallyPlaying = useLocalAudio ? localPlaying : playerState === 1;

  // ==========================================================================
  // Creator Multi-Anchor & Permanent save Click Handlers
  // ==========================================================================
  
  const handleTapOnOne = () => {
    if (!isActuallyPlaying) {
      showToast("⚠️ Play the audio to calibrate downbeat!");
      return;
    }

    const tapTime = currentTime;
    const baseSong = originalSongData || songData;
    if (!baseSong || !baseSong.beats || baseSong.beats.length === 0) return;

    // 1. Record the raw tap timestamp FIRST — this is the ground truth
    const newRawTaps = [...rawTaps, tapTime];
    setRawTaps(newRawTaps);

    // 2. Auto-update reaction delay estimate (live, after each tap)
    const delay = computeReactionDelay(newRawTaps, baseSong.beats);
    setEstimatedDelay(delay);

    // 3. Find closest original beat index (for warp anchor)
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < baseSong.beats.length; i++) {
      const b = baseSong.beats[i];
      const diff = Math.abs(tapTime - b.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    if (closestIndex === -1) return;

    // 4. Avoid duplicate anchors within 4 beats of each other
    const filteredAnchors = anchors.filter(a => Math.abs(a.beatIndex - closestIndex) > 4);
    const newAnchor = {
      beatIndex: closestIndex,
      tappedTime: tapTime,
      originalTime: baseSong.beats[closestIndex].timestamp
    };
    const newAnchors = [...filteredAnchors, newAnchor].sort((a, b) => a.beatIndex - b.beatIndex);
    setAnchors(newAnchors);

    // 5. Apply warping transformation in real-time
    const shiftedBeats = applyWarpToBeats(baseSong.beats, newAnchors);
    const shiftedSections = applyWarpToSections(baseSong.sections, baseSong.beats, shiftedBeats);
    setCalibratedSongData({ ...baseSong, sections: shiftedSections, beats: shiftedBeats });

    const closestBeat = baseSong.beats[closestIndex];
    const timeOffset = tapTime - closestBeat.timestamp;
    setCalibrationStats({
      tappedTime: tapTime,
      closestBeatIndex: closestIndex,
      closestBeatTime: closestBeat.timestamp,
      offsetMs: Math.round(timeOffset * 1000)
    });

    const delayMs = delay ? Math.round(delay * 1000) : '?';
    showToast(`🎯 Tap #${newRawTaps.length} — delay est. ${delayMs}ms`);
  };

  const handleDeleteAnchor = (beatIndexToDelete) => {
    const baseSong = originalSongData || songData;
    if (!baseSong) return;

    const newAnchors = anchors.filter(a => a.beatIndex !== beatIndexToDelete);
    setAnchors(newAnchors);

    // Recompute warped timelines
    const shiftedBeats = applyWarpToBeats(baseSong.beats, newAnchors);
    const shiftedSections = applyWarpToSections(baseSong.sections, baseSong.beats, shiftedBeats);

    const newCalibratedData = {
      ...baseSong,
      sections: shiftedSections,
      beats: shiftedBeats
    };

    setCalibratedSongData(newCalibratedData);

    if (newAnchors.length > 0) {
      const last = newAnchors[newAnchors.length - 1];
      const closestBeat = baseSong.beats[last.beatIndex];
      const timeOffset = last.tappedTime - closestBeat.timestamp;
      setCalibrationStats({
        tappedTime: last.tappedTime,
        closestBeatIndex: last.beatIndex,
        closestBeatTime: closestBeat.timestamp,
        offsetMs: Math.round(timeOffset * 1000)
      });
    } else {
      setCalibrationStats(null);
    }

    showToast("🗑️ Anchor deleted. Recalculated grid!");
  };

  const handleResetCalibration = () => {
    if (originalSongData) {
      setCalibratedSongData(JSON.parse(JSON.stringify(originalSongData)));
    }
    setAnchors([]);
    setRawTaps([]);
    setEstimatedDelay(null);
    setCalibrationStats(null);
    showToast("🔄 Reset all anchors and taps. Restored original raw grid.");
  };

  // Skip audio to ~30s so user can bypass the difficult intro
  const handleSkipIntro = () => {
    try {
      if (useLocalAudio && localAudioRef.current) {
        localAudioRef.current.currentTime = 30;
      } else if (player) {
        player.seekTo(30, true);
      }
      showToast("⏩ Skipped to 0:30 — intro bypassed!");
      setTimeout(synchronizeAnchors, 100);
    } catch (e) {
      console.warn("Skip intro error:", e);
    }
  };

  const handleCopyCalibratedJson = () => {
    const dataToExport = calibratedSongData || songData;
    if (!dataToExport) return;
    
    try {
      const jsonStr = JSON.stringify(dataToExport, null, 2);
      navigator.clipboard.writeText(jsonStr)
        .then(() => {
          showToast("📋 Copied calibrated JSON to clipboard!");
        })
        .catch(err => {
          console.error("Failed to copy JSON: ", err);
          showToast("❌ Copy failed. Check console.");
        });
    } catch (e) {
      console.error(e);
      showToast("❌ Error converting to JSON.");
    }
  };

  const handleDownloadCalibratedJson = () => {
    const dataToExport = calibratedSongData || songData;
    if (!dataToExport) return;

    try {
      const youtubeId = dataToExport.metadata.youtubeId || "beatmap";
      const filename = `${youtubeId}_calibrated.json`;
      const jsonStr = JSON.stringify(dataToExport, null, 2);
      
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast(`💾 Downloaded ${filename} successfully!`);
    } catch (e) {
      console.error("Download failed: ", e);
      showToast("❌ Download failed. Check console.");
    }
  };

  const handleSaveToDisk = () => {
    const dataToSave = calibratedSongData || songData;
    if (!dataToSave) return;

    // Build full tapCalibration block so we can analyse it later
    const reactionDelayMs = estimatedDelay ? Math.round(estimatedDelay * 1000) : null;
    const correctedTaps = rawTaps.map(t =>
      parseFloat(Math.max(0, t - (estimatedDelay || 0)).toFixed(3))
    );

    // Match each corrected tap to the nearest beat-1 in the ORIGINAL beatmap
    const baseSong = originalSongData || songData;
    const beat1Times = baseSong
      ? baseSong.beats.filter(b => b.beat === 1).map(b => b.timestamp)
      : [];

    const matchedAnchors = correctedTaps.map(ct => {
      let best = null;
      let bestDiff = Infinity;
      for (const bt of beat1Times) {
        const diff = Math.abs(ct - bt);
        if (diff < bestDiff) { bestDiff = diff; best = bt; }
      }
      return { correctedTapTime: ct, matchedBeat1: best, diffMs: Math.round(bestDiff * 1000) };
    });

    const payload = {
      ...dataToSave,
      tapCalibration: {
        recordedAt: new Date().toISOString(),
        tapCount: rawTaps.length,
        rawTaps: rawTaps.map(t => parseFloat(t.toFixed(3))),
        reactionDelayMs,
        correctedTaps,
        matchedAnchors
      }
    };

    showToast("💾 Saving permanently to disk...");

    fetch("/api/save-beatmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("Server write failed");
        return res.json();
      })
      .then(result => {
        if (result.success) {
          setOriginalSongData(JSON.parse(JSON.stringify(dataToSave)));
          showToast(`✅ Saved! ${rawTaps.length} taps recorded. Delay: ${reactionDelayMs ?? '?'}ms`);
        } else {
          throw new Error(result.error);
        }
      })
      .catch(err => {
        console.error("Save to disk failed:", err);
        showToast("❌ Save to disk failed. Check console.");
      });
  };

  return (
    <div className="app-container" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 1. Header Section */}
      <header className="header glass-panel">
        <h1 className="song-title">
          {songData ? songData.metadata.songTitle : "Salsa Rhythm Hub"}
        </h1>
        <p className="song-artist">
          {songData ? `${songData.metadata.artist} — ${songData.metadata.danceStyle.toUpperCase()} On1` : "Ear-Training Visualizer"}
        </p>
      </header>

      {/* 2. Dynamic Source Selector */}
      <div className="source-switcher">
        <button
          className={`source-btn ${useLocalAudio ? "active" : ""}`}
          onClick={() => toggleSourceMode("local")}
        >
          <Music size={16} />
          <span>Local MP3 (Auto-Fallback)</span>
        </button>
        <button
          className={`source-btn ${!useLocalAudio ? "active" : ""}`}
          onClick={() => toggleSourceMode("youtube")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: "16px" }}><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17z"/><path d="m10 15 5-3-5-3v6z" fill="currentColor"/></svg>
          <span>YouTube Player</span>
        </button>
      </div>



      {/* 4.5. Creator Diagnostic & Calibration Trigger Button */}
      <button 
        className="diagnose-trigger"
        onClick={() => setShowDiagnostic(!showDiagnostic)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px" }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        <span>{showDiagnostic ? "Hide Creator Diagnostic Panel" : "Open Creator Diagnostic & Calibration"}</span>
      </button>

      {/* 4.6. Creator Diagnostic & Calibration Panel */}
      {showDiagnostic && (
        <div className="diagnose-panel">
          <div>
            <h3 className="diagnose-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#c084fc", marginRight: "6px" }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Salsa Tap Calibration
            </h3>
            <p className="diagnose-subtitle">
              Press <strong>TAP ON "1"</strong> every time you hear count 1. Tap as many times as you like — more taps = better accuracy. Skip the intro if it's hard to find the one.
            </p>
          </div>

          {/* Skip intro helper */}
          <button
            className="btn-diagnose-action"
            onClick={handleSkipIntro}
            style={{ width: "100%", margin: "0 0 8px 0", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", fontWeight: "600" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "5px" }}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            Skip to 0:30 (bypass intro)
          </button>

          {/* Live stats bar */}
          {rawTaps.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginBottom: "10px"
            }}>
              <div style={{ background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.2)", borderRadius: "8px", padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#c084fc", lineHeight: 1 }}>{rawTaps.length}</div>
                <div style={{ fontSize: "0.6rem", color: "#9ca3af", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Taps Recorded</div>
              </div>
              <div style={{ background: estimatedDelay ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)", border: `1px solid ${estimatedDelay ? "rgba(16,185,129,0.2)" : "rgba(107,114,128,0.2)"}`, borderRadius: "8px", padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: estimatedDelay ? "#10b981" : "#6b7280", lineHeight: 1 }}>
                  {estimatedDelay ? `${Math.round(estimatedDelay * 1000)}ms` : "—"}
                </div>
                <div style={{ fontSize: "0.6rem", color: "#9ca3af", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Reaction Delay</div>
              </div>
            </div>
          )}

          {/* Last 5 raw taps mini-readout */}
          {rawTaps.length > 0 && (
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "8px 10px", marginBottom: "10px", fontFamily: "monospace", fontSize: "0.7rem", color: "#6b7280" }}>
              <span style={{ color: "#9ca3af", marginRight: "6px" }}>Last taps:</span>
              {rawTaps.slice(-5).map((t, i) => (
                <span key={i} style={{ color: "#a1a1aa", marginRight: "6px" }}>{t.toFixed(2)}s</span>
              ))}
            </div>
          )}

          {/* TAP button */}
          <div className="diagnose-tap-pad-container">
            <button
              className="btn-diagnose-tap"
              onClick={handleTapOnOne}
            >
              <span>TAP ON "1"</span>
              <span style={{ fontSize: "0.65rem", opacity: 0.8, fontWeight: "400" }}>Every time you hear count 1</span>
              <div className="tap-count-badge">
                {rawTaps.length} {rawTaps.length === 1 ? "tap" : "taps"} · {anchors.length} {anchors.length === 1 ? "anchor" : "anchors"}
              </div>
            </button>
          </div>

          {/* Reset + Save */}
          <div className="diagnose-actions" style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
            {rawTaps.length > 0 && (
              <button
                className="btn-diagnose-action"
                onClick={handleResetCalibration}
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "5px" }}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                Reset all taps
              </button>
            )}
            {rawTaps.length > 0 && (
              <button
                className="btn-diagnose-action primary"
                onClick={handleSaveToDisk}
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
                  border: "none",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
                title="Saves warped beatmap + raw tap data to disk for analysis"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save {rawTaps.length} taps to disk
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. Media Player Display */}
      {useLocalAudio ? (
        /* Local Audio Fallback Card */
        <div className="audio-card" onClick={handlePlayToggle} style={{ cursor: "pointer" }}>
          <audio
            ref={localAudioRef}
            src="/songs/66HCBysrJS8.mp3"
            style={{ display: "none" }}
            onPlay={() => setLocalPlaying(true)}
            onPause={() => setLocalPlaying(false)}
            onEnded={() => setLocalPlaying(false)}
          />
          <div className={`vinyl-record ${isActuallyPlaying ? "spinning" : ""}`}>
            <div className="vinyl-center"></div>
          </div>
          <div style={{ marginTop: "16px", fontSize: "0.85rem", fontWeight: "600", color: "#a1a1aa" }}>
            {isActuallyPlaying ? "💿 Spinning Pobre Diablo locally..." : "💿 Local MP3 Mode Ready"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "4px" }}>
            No YouTube API connection required
          </div>
        </div>
      ) : (
        /* YouTube Embed IFrame */
        <div className="video-wrapper">
          <div id="yt-player"></div>
          <div className="touch-shield" onClick={handlePlayToggle}></div>
        </div>
      )}

      {/* 6. Section Banner */}
      <div 
        className={`section-banner ${getContainerClass()}`} 
        style={getSectionColorStyles()}
      >
        {activeSection && activeSection.emoji ? (
          <>
            <span className="banner-emoji">{activeSection.emoji}</span>
            <span>
              {activeSection.name} {activeSection.focus ? `(Focus: ${activeSection.focus.toUpperCase()})` : ""}
            </span>
          </>
        ) : (
          <span>
            {isActuallyPlaying ? "🎶 Listen to the Salsa swing..." : "⏸️ Press Play to start ear-training"}
          </span>
        )}
      </div>

      {/* 7. Beats Pulse Tracker (8 neon counts) */}
      <div className="glass-panel" style={{ padding: "20px 10px" }}>
        <div className="beats-container">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((beatNum) => {
            const canLight = beatNum === 1 || beatNum === 3 || beatNum === 5;
            const isActive = canLight && currentBeat && currentBeat.beat === beatNum;
            const isGold = beatNum === 1 || beatNum === 5;
            return (
              <div key={beatNum} className={`beat-circle${isActive ? (isGold ? " accent-gold" : " accent-cyan") : ""}`}>
                <span>{beatNum}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#6b7280", padding: "0 8px" }}>
          <span>Elapsed Time: {currentTime.toFixed(3)}s</span>
          <span>Tempo: {songData ? songData.metadata.bpm : 0} BPM</span>
        </div>
      </div>

      {/* 8. Custom bottom touch controls */}
      <div className="glass-panel" style={{ marginTop: "auto", padding: "16px" }}>
        <div className="controls-panel">
          <button className="btn-touch" onClick={handleRewind} title="Rewind 10s">
            <RotateCcw size={20} />
            <span>-10s</span>
          </button>

          <button className="btn-touch btn-play" onClick={handlePlayToggle}>
            {isActuallyPlaying ? (
              <>
                <Pause size={20} fill="#fff" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={20} fill="#fff" />
                <span>Play</span>
              </>
            )}
          </button>

          <div className="speed-toggle-container">
            {[0.5, 0.75, 1.0].map((rate) => (
              <button
                key={rate}
                className={`speed-option ${playbackRate === rate ? "active" : ""}`}
                onClick={() => handleSpeedChange(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 9. Floating Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
