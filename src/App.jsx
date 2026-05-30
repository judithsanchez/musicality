import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useSyncEngine } from "./hooks/useSyncEngine";
import { adaptToAgnosticSong } from "./utils/schemaAdapter";
import { isDevMode } from "./config/env";

// Subcomponents
import SongSelector from "./components/SongSelector";
import ControlBar from "./components/ControlBar";
import AudioShield from "./components/AudioShield";
import Visualizer from "./components/Visualizer";
import GameCanvas from "./components/GameCanvas";
import RoadmapScrubber from "./components/RoadmapScrubber";
import DevDashboard from "./components/DevDashboard";

const DevCalibrator = lazy(() => {
  if (isDevMode) {
    return import("./components/DevCalibrator");
  } else {
    return Promise.resolve({ default: () => null });
  }
});



export default function App() {
  const isInitialRestoreRef = useRef(true);
  const [songData, setSongData] = useState(null);
  const [viewingDevDashboard, setViewingDevDashboard] = useState(false);

  // High-level Learning Mode vs Practice Mode state
  const [mode, setMode] = useState("learn"); // 'learn' or 'practice'

  // Media states
  const [player, setPlayer] = useState(null);
  const [playerState, setPlayerState] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [apiReady, setApiReady] = useState(false);

  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [originalSongData, setOriginalSongData] = useState(null);
  const [calibratedSongData, setCalibratedSongData] = useState(null);
  const [userDelaySetting, setUserDelaySetting] = useState(220); // ms — user-adjustable reaction delay
  const [toastMessage, setToastMessage] = useState(null);

  // Song Selection States
  const [currentSong, setCurrentSong] = useState(null);
  const [loadingSong, setLoadingSong] = useState(false);
  const [introStart, setIntroStart] = useState(0.0);
  const [introEnd, setIntroEnd] = useState(0.0);
  const [videoDuration, setVideoDuration] = useState(300.0);
  const [breaks, setBreaks] = useState([]);

  const playerRef = useRef(null);
  const lastSeekTimeRef = useRef(0);
  const seekThrottleTimeoutRef = useRef(null);
  const headerClicksRef = useRef(0);

  const [ytPlayerMountedVal, setYtPlayerMountedVal] = useState(0);
  const ytPlayerRefCallback = useCallback((node) => {
    if (node) {
      console.log("[App] yt-player DOM element mounted!");
      setYtPlayerMountedVal(prev => prev + 1);
    }
  }, []);

  // Helper to show modern fading glass toast notifications
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Sync showDiagnostic to root container width
  useEffect(() => {
    const rootEl = document.getElementById("root");
    if (rootEl) {
      if (showDiagnostic) {
        rootEl.classList.add("dev-mode-active");
      } else {
        rootEl.classList.remove("dev-mode-active");
      }
    }
  }, [showDiagnostic]);

  // GITHUB PAGES WORKAROUND (see issue #25):
  // Vite injects BASE_URL at build time: '/' locally, '/armada-movement/' on GitHub Pages.
  // The router must strip this prefix before matching routes and re-prepend it when
  // calling pushState, because window.location.pathname includes the base on GH Pages.
  // If hosting moves to Netlify/Vercel/etc with server-side rewrites, remove this
  // variable and all BASE references below, and delete public/404.html + the ?p= script
  // in index.html. Tracked: https://github.com/judithsanchez/armada-movement/issues/25
  const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, ''); // strip trailing slash

  // 1. Sync React state → browser URL (pathname-based, base-aware)
  useEffect(() => {
    if (isInitialRestoreRef.current) {
      return;
    }
    let targetPath;
    if (viewingDevDashboard) {
      targetPath = BASE + "/dashboard";
    } else if (currentSong) {
      targetPath = showDiagnostic
        ? `${BASE}/song/${currentSong.youtubeId}/calibrate`
        : `${BASE}/song/${currentSong.youtubeId}`;
    } else {
      targetPath = BASE + "/" || "/";
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }
  }, [viewingDevDashboard, currentSong, showDiagnostic]);

  // 2. Restore state from URL on mount + handle browser back/forward
  useEffect(() => {
    const handleNavigationRestore = () => {
      // Strip base prefix to get the route segment
      const rawPath = window.location.pathname;
      const route = rawPath.startsWith(BASE) ? rawPath.slice(BASE.length) || '/' : rawPath;

      // /dashboard
      if (route === "/dashboard") {
        setViewingDevDashboard(true);
        setCurrentSong(null);
        setShowDiagnostic(false);
        isInitialRestoreRef.current = false;
        return;
      }

      // /song/:youtubeId  or  /song/:youtubeId/calibrate
      const songMatch = route.match(/^\/song\/([^/]+)(\/calibrate)?$/);
      if (songMatch) {
        const songId = songMatch[1];
        const calibrate = Boolean(songMatch[2]);
        setViewingDevDashboard(false);

        if (!currentSong || currentSong.youtubeId !== songId) {
          fetch(import.meta.env.BASE_URL + "songs/catalog.json")
            .then(res => res.json())
            .then(catalog => {
              const matched = catalog.find(s => s.youtubeId === songId);
              if (matched) {
                handleSelectSong(matched);
                if (calibrate) setShowDiagnostic(true);
              } else {
                // Song not found — fall back to root
                window.history.replaceState(null, "", BASE + "/" || "/");
                setCurrentSong(null);
              }
              isInitialRestoreRef.current = false;
            })
            .catch(err => {
              console.error("[Navigation] Catalog restore failed:", err);
              isInitialRestoreRef.current = false;
            });
        } else {
          setShowDiagnostic(calibrate);
          isInitialRestoreRef.current = false;
        }
        return;
      }

      // / or anything else → catalog
      setViewingDevDashboard(false);
      setCurrentSong(null);
      setShowDiagnostic(false);
      isInitialRestoreRef.current = false;
    };

    handleNavigationRestore();
    window.addEventListener("popstate", handleNavigationRestore);
    return () => window.removeEventListener("popstate", handleNavigationRestore);
  }, [currentSong]);

  const handleSelectSong = (song) => {
    setLoadingSong(true);

    // Clear all existing song-related state
    setSongData(null);
    setOriginalSongData(null);
    setCalibratedSongData(null);
    setBreaks([]);
    setMode("learn"); // Reset to Learn Mode

    fetch(import.meta.env.BASE_URL + `songs/${song.youtubeId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("Beatmap load failed");
        return res.json();
      })
      .then((data) => {
        const adapted = adaptToAgnosticSong(data);
        setSongData(adapted);
        setOriginalSongData(JSON.parse(JSON.stringify(adapted)));
        setCalibratedSongData(JSON.parse(JSON.stringify(adapted)));
        setIntroStart(data.metadata?.introStart || 0.0);
        setIntroEnd(data.metadata?.introEnd || 0.0);
        setBreaks(data.breaks || []);

        setCurrentSong(song);
        setLoadingSong(false);

        console.log("[App] Loaded advanced beatmap successfully for:", data.metadata.songTitle);
      })
      .catch((err) => {
        console.error("[App] Failed to load song beatmap:", err);
        setLoadingSong(false);
        showToast("❌ Failed to load song beatmap.");
      });
  };

  const handleBackToCatalog = () => {
    // Stop the video player if playing
    if (player && typeof player.pauseVideo === "function") {
      try {
        player.pauseVideo();
      } catch (e) {
        console.warn("Pause error on back navigation:", e);
      }
    }

    setCurrentSong(null);
    setSongData(null);
    setOriginalSongData(null);
    setCalibratedSongData(null);
    setIntroStart(0.0);
    setIntroEnd(0.0);
    setBreaks([]);
    setVideoDuration(300.0);
  };

  const throttledSeek = (timeSec, isFinal = false) => {
    if (!player || typeof player.seekTo !== "function") return;

    const numericVal = parseFloat(parseFloat(timeSec).toFixed(2));

    if (isFinal) {
      if (seekThrottleTimeoutRef.current) {
        clearTimeout(seekThrottleTimeoutRef.current);
        seekThrottleTimeoutRef.current = null;
      }
      try {
        player.seekTo(numericVal, true);
        console.log(`[YouTube Seek] Final seek to ${numericVal}s`);
      } catch (e) {
        console.warn("Final seek error:", e);
      }
      return;
    }

    const now = Date.now();
    if (now - lastSeekTimeRef.current > 150) {
      lastSeekTimeRef.current = now;
      try {
        // seek with allowSeekAhead = false to avoid slamming YouTube servers during active dragging
        player.seekTo(numericVal, false);
      } catch (e) {
        console.warn("Throttled seek error:", e);
      }
    } else {
      if (seekThrottleTimeoutRef.current) {
        clearTimeout(seekThrottleTimeoutRef.current);
      }
      seekThrottleTimeoutRef.current = setTimeout(() => {
        try {
          player.seekTo(numericVal, true);
        } catch (e) {
          console.warn("Debounced seek error:", e);
        }
      }, 150);
    }
  };

  // Load the YouTube Player API script dynamically in background
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setTimeout(() => setApiReady(true), 0);
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

  // Construct YouTube Player when API is ready
  useEffect(() => {
    if (!apiReady || !songData) return;

    // If an existing player exists, destroy it first
    if (playerRef.current) {
      try {
        if (typeof playerRef.current.destroy === "function") {
          playerRef.current.destroy();
        }
      } catch (e) {
        console.warn("[App] Error destroying old player in effect:", e);
      }
      playerRef.current = null;
      setPlayer(null);
    }

    console.log("[App] Constructing YouTube Player for:", songData.metadata.youtubeId);
    try {
      const ytPlayer = new window.YT.Player("yt-player", {
        videoId: songData.metadata.youtubeId,
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          enablejsapi: 1
        },
        events: {
          onReady: (event) => {
            setPlayer(event.target);
            playerRef.current = event.target;
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
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === "function") {
            playerRef.current.destroy();
          }
        } catch (e) {
          console.warn("[App] Cleanup destroy error:", e);
        }
        playerRef.current = null;
        setPlayer(null);
      }
    };
  }, [apiReady, songData, ytPlayerMountedVal]);

  // Dynamic Duration Sync: query player's duration once ready
  useEffect(() => {
    if (player && typeof player.getDuration === "function") {
      try {
        const duration = player.getDuration();
        if (duration > 0) {
          setTimeout(() => {
            setVideoDuration(duration);
            console.log(`[App] Synced YouTube Video Duration: ${duration}s`);
          }, 0);
        }
      } catch (e) {
        console.warn("Error getting player duration:", e);
      }
    }
  }, [player, currentSong, playerState]);

  // Hook into the high-precision sync engine
  const { currentTime, currentBeat, activeSection, synchronizeAnchors } = useSyncEngine(
    player,
    calibratedSongData || songData,
    null,
    false,
    0, // zero AV latency offset
    0  // zero static grid count shift
  );

  // Touch Controller click handlers
  const handlePlayToggle = () => {
    try {
      if (!player) return;
      if (playerState === 1) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
      setTimeout(synchronizeAnchors, 50);
    } catch (err) {
      console.warn("PlayToggle error: ", err);
    }
  };

  const handleRewind = () => {
    try {
      if (!player) return;
      const current = player.getCurrentTime();
      let target = current - 10;
      if (target < 0) target = 0;
      player.seekTo(target, true);
      console.log(`[YouTube] Rewinding to: ${target.toFixed(2)}s`);
      setTimeout(synchronizeAnchors, 100);
    } catch (err) {
      console.warn("Rewind error: ", err);
    }
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    try {
      if (player) {
        player.setPlaybackRate(rate);
      }
      setTimeout(synchronizeAnchors, 50);
    } catch (err) {
      console.warn("SpeedChange error: ", err);
    }
  };

  // getContainerClass deleted (defined in Visualizer.jsx)

  const isActuallyPlaying = playerState === 1;

  // Skip audio to ~30s so user can bypass the difficult intro (dev calibration mode only)
  const handleSkipIntro = () => {
    try {
      if (player) {
        player.seekTo(30, true);
      }
      showToast("⏩ Skipped to 0:30 — intro bypassed!");
      setTimeout(synchronizeAnchors, 100);
    } catch (e) {
      console.warn("Skip intro error:", e);
    }
  };

  const handleHeaderClick = () => {
    if (!isDevMode) {
      return;
    }

    headerClicksRef.current += 1;
    if (headerClicksRef.current >= 5) {
      headerClicksRef.current = 0;
      const nextVal = !showDiagnostic;
      setShowDiagnostic(nextVal);
      showToast(nextVal ? "🛠️ Developer Panel Toggled!" : "🔒 Dev Panel Locked!");
    }
  };

  // Toast notification if unlocked via URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isDevMode && params.get("dev") === "true") {
      setTimeout(() => {
        setShowDiagnostic(true);
        showToast("🛠️ Developer Mode Unlocked via URL!");
      }, 0);
    }
  }, []);




  if (loadingSong) {
    return (
      <div className="app-container" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        <header className="header glass-panel">
          <h1 className="song-title">Salsa Rhythm Hub</h1>
          <p className="song-artist">Syncing Beat Grid...</p>
        </header>
        <div className="glass-panel loading-container">
          <div className="loading-spinner"></div>
          <div style={{ fontWeight: 600, color: "#e5e7eb" }}>Loading Beatmap...</div>
        </div>
      </div>
    );
  }

  // Render Developer Dashboard View
  if (viewingDevDashboard) {
    return (
      <div className="app-container" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <DevDashboard 
          onBack={() => setViewingDevDashboard(false)} 
          onIngestSuccess={(song) => {
            setViewingDevDashboard(false);
            handleSelectSong(song);
            setShowDiagnostic(true);
            showToast("🚀 Ingestion successful! Calibration workbench opened.");
          }} 
        />
        {toastMessage && (
          <div className="toast-notification">
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  // Render Catalog Selector View
  if (!currentSong) {
    return (
      <div className="app-container" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <SongSelector 
          onSelectSong={handleSelectSong} 
          onOpenDevDashboard={isDevMode ? () => setViewingDevDashboard(true) : null}
        />
        {toastMessage && (
          <div className="toast-notification">
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  // Active Break and Transitions Indicators
  const activeBreak = breaks.find(b => currentTime >= b.startTimestamp && currentTime < b.endTimestamp) || null;
  const sectionsList = songData?.sections || [];
  const nextSection = sectionsList.find(sec => sec.startTimestamp > currentTime) || null;
  const timeToNextSection = nextSection ? nextSection.startTimestamp - currentTime : null;

  return (
    <div className="app-container" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      
      {/* Upper Navigation & Skip Intro */}
      {showDiagnostic && currentTime < introEnd && (
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "16px", width: "100%" }}>
          <button 
            className="btn-step" 
            onClick={handleSkipIntro}
            style={{ 
              margin: 0, 
              padding: "6px 12px",
              fontSize: "0.75rem",
              background: "linear-gradient(135deg, #ffffff, #d1d5db)", 
              color: "#000000", 
              fontWeight: "800",
              boxShadow: "0 4px 12px rgba(255, 255, 255, 0.25)",
              animation: "pulse 2s infinite"
            }}
          >
            ⏩ Skip Intro
          </button>
        </div>
      )}

      {/* Header Section */}
      <header 
        className="header glass-panel" 
        onClick={handleHeaderClick} 
        style={{ cursor: "pointer" }} 
        title="Click 5 times for Developer Panel"
      >
        <h1 className="song-title">
          {songData ? songData.metadata.songTitle : "Salsa Rhythm Hub"}
        </h1>
        <p className="song-artist">
          {songData ? `${songData.metadata.artist} — ${songData.metadata.danceStyle.toUpperCase()}` : "Ear-Training Visualizer"}
        </p>
      </header>

      {/* Main workspace layout */}
      <div className={showDiagnostic ? "dev-workspace-layout-full" : "normal-workspace-layout"}>
        {showDiagnostic ? (
          <Suspense fallback={
            <div className="glass-panel loading-container" style={{ minHeight: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="loading-spinner"></div>
              <div style={{ fontWeight: 600, color: "#e5e7eb" }}>Loading Calibration Workbench...</div>
            </div>
          }>
            <DevCalibrator
              songData={songData}
              originalSongData={originalSongData}
              calibratedSongData={calibratedSongData}
              setCalibratedSongData={setCalibratedSongData}
              setSongData={setSongData}
              setOriginalSongData={setOriginalSongData}
              breaks={breaks}
              setBreaks={setBreaks}
              currentTime={currentTime}
              videoDuration={videoDuration}
              player={player}
              throttledSeek={throttledSeek}
              userDelaySetting={userDelaySetting}
              setUserDelaySetting={setUserDelaySetting}
              onBackToCatalog={() => {
                setShowDiagnostic(false);
                showToast("🔒 Dev Panel Locked!");
              }}
              showToast={showToast}
              videoElement={
                <div className="left-workspace-column" style={{ margin: 0, width: "100%" }}>
                  {/* Defensive IFrame Player & Overlay Protection */}
                  <div className="video-wrapper">
                    <div key={songData?.metadata?.youtubeId || "yt-player"} id="yt-player" ref={ytPlayerRefCallback}></div>
                    <AudioShield onPlayToggle={handlePlayToggle} />
                  </div>
                </div>
              }
            />
          </Suspense>
        ) : (
          <div className="left-workspace-column">
              
            {/* Defensive IFrame Player & Overlay Protection */}
            <div className="video-wrapper">
              <div key={songData?.metadata?.youtubeId || "yt-player"} id="yt-player" ref={ytPlayerRefCallback}></div>
              <AudioShield onPlayToggle={handlePlayToggle} />
            </div>

            {/* Dynamic Interface: Learn Mode beats pulses OR Practice Mode gamified tapping zone */}
            {mode === "practice" ? (
              <GameCanvas 
                key={calibratedSongData?.metadata?.youtubeId || songData?.metadata?.youtubeId}
                songData={calibratedSongData || songData}
                currentTime={currentTime}
                isPlaying={isActuallyPlaying}
                onPlayToggle={handlePlayToggle}
              />
            ) : (
              <Visualizer 
                danceStyle={songData?.metadata?.danceStyle || "salsa"}
                currentTime={currentTime}
                introEnd={introEnd}
                currentBeat={currentBeat}
                activeSection={activeSection}
                activeBreak={activeBreak}
                isPlaying={isActuallyPlaying}
              />
            )}

            {/* Segmented Roadmap Progress Scrubber */}
            <RoadmapScrubber
              currentTime={currentTime}
              videoDuration={videoDuration}
              introStart={introStart}
              introEnd={introEnd}
              nextSection={nextSection}
              timeToNextSection={timeToNextSection}
              sectionsList={sectionsList}
              breaks={breaks}
              onSeek={throttledSeek}
            />

            {/* Unified Touch Controlbar */}
            <ControlBar 
              isActuallyPlaying={isActuallyPlaying}
              onPlayToggle={handlePlayToggle}
              playbackRate={playbackRate}
              onSpeedChange={handleSpeedChange}
              onRewind={handleRewind}
            />
          </div>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
