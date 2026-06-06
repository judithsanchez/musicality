import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useSyncEngine } from "./hooks/useSyncEngine";
import { isDevMode } from "./config/env";
import { StrictSongMapSchema } from "./types/schemas";

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
  const [mode, setMode] = useState("learn");
  const [player, setPlayer] = useState(null);
  const [playerState, setPlayerState] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [apiReady, setApiReady] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [calibratedSongData, setCalibratedSongData] = useState(null);
  const [userDelaySetting, setUserDelaySetting] = useState(200);
  const [toastMessage, setToastMessage] = useState(null);
  const [currentSong, setCurrentSong] = useState(null);
  const [loadingSong, setLoadingSong] = useState(false);
  const [videoDuration, setVideoDuration] = useState(300.0);
  const [validationErrors, setValidationErrors] = useState(null);

  const playerRef = useRef(null);
  const lastSeekTimeRef = useRef(0);
  const seekThrottleTimeoutRef = useRef(null);
  const headerClicksRef = useRef(0);

  const ytPlayerRefCallback = useCallback((node) => {
    if (node) {
      setYtPlayerMountedVal(prev => prev + 1);
    }
  }, []);
  const [ytPlayerMountedVal, setYtPlayerMountedVal] = useState(0);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

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

  const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

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

  useEffect(() => {
    const handleNavigationRestore = () => {
      const rawPath = window.location.pathname;
      const route = rawPath.startsWith(BASE) ? rawPath.slice(BASE.length) || '/' : rawPath;

      if (route === "/dashboard") {
        setViewingDevDashboard(true);
        setCurrentSong(null);
        setShowDiagnostic(false);
        isInitialRestoreRef.current = false;
        return;
      }

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
                window.history.replaceState(null, "", BASE + "/" || "/");
                setCurrentSong(null);
              }
              isInitialRestoreRef.current = false;
            })
            .catch(err => {
              console.error(err);
              isInitialRestoreRef.current = false;
            });
        } else {
          setShowDiagnostic(calibrate);
          isInitialRestoreRef.current = false;
        }
        return;
      }

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
    setValidationErrors(null);
    setSongData(null);
    setCalibratedSongData(null);
    setMode("learn");

    fetch(import.meta.env.BASE_URL + `songs/${song.youtubeId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("Beatmap load failed");
        return res.json();
      })
      .then((data) => {
        const adjustedData = { ...data };
        if (!adjustedData.status) {
          adjustedData.status = "DRAFT_CUTTING";
        }
        if (!adjustedData.sections || adjustedData.sections.length === 0) {
          const lastBeatTimeMs = adjustedData.absoluteBeatMap && adjustedData.absoluteBeatMap.length > 0
            ? adjustedData.absoluteBeatMap[adjustedData.absoluteBeatMap.length - 1]
            : 300000;
          adjustedData.sections = [
            {
              id: "sec-default",
              startTimeMs: 0,
              endTimeMs: lastBeatTimeMs,
              label: "Intro",
              energyState: "INTRO",
              phraseIds: [],
              emoji: "🎵"
            }
          ];
        }
        if (!adjustedData.phrases) {
          adjustedData.phrases = [];
        }

        const parsed = StrictSongMapSchema.safeParse(adjustedData);
        if (!parsed.success) {
          setValidationErrors(parsed.error.issues);
          setCurrentSong(song);
          setLoadingSong(false);
          return;
        }

        const validSongMap = parsed.data;
        setSongData(validSongMap);
        setCalibratedSongData(JSON.parse(JSON.stringify(validSongMap)));
        setCurrentSong(song);
        setLoadingSong(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingSong(false);
        showToast("❌ Failed to load song beatmap.");
      });
  };

  const handleBackToCatalog = () => {
    if (player && typeof player.pauseVideo === "function") {
      try {
        player.pauseVideo();
      } catch (e) {
        console.warn(e);
      }
    }

    setCurrentSong(null);
    setSongData(null);
    setCalibratedSongData(null);
    setValidationErrors(null);
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
      } catch (e) {
        console.warn(e);
      }
      return;
    }

    const now = Date.now();
    if (now - lastSeekTimeRef.current > 150) {
      lastSeekTimeRef.current = now;
      try {
        player.seekTo(numericVal, false);
      } catch (e) {
        console.warn(e);
      }
    } else {
      if (seekThrottleTimeoutRef.current) {
        clearTimeout(seekThrottleTimeoutRef.current);
      }
      seekThrottleTimeoutRef.current = setTimeout(() => {
        try {
          player.seekTo(numericVal, true);
        } catch (e) {
          console.warn(e);
        }
      }, 150);
    }
  };

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
    };
  }, []);

  useEffect(() => {
    if (!apiReady || !songData) return;

    if (playerRef.current) {
      try {
        if (typeof playerRef.current.destroy === "function") {
          playerRef.current.destroy();
        }
      } catch (e) {
        console.warn(e);
      }
      playerRef.current = null;
      setPlayer(null);
    }

    try {
      const ytPlayer = new window.YT.Player("yt-player", {
        videoId: songData.youtubeId,
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
          },
          onStateChange: (event) => {
            setPlayerState(event.data);
          }
        }
      });
      playerRef.current = ytPlayer;
    } catch (err) {
      console.error(err);
    }

    return () => {
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === "function") {
            playerRef.current.destroy();
          }
        } catch (e) {
          console.warn(e);
        }
        playerRef.current = null;
        setPlayer(null);
      }
    };
  }, [apiReady, songData, ytPlayerMountedVal]);

  useEffect(() => {
    if (player && typeof player.getDuration === "function") {
      try {
        const duration = player.getDuration();
        if (duration > 0) {
          setTimeout(() => {
            setVideoDuration(duration);
          }, 0);
        }
      } catch (e) {
        console.warn(e);
      }
    }
  }, [player, currentSong, playerState]);

  const { currentTime, currentBeat, activeSection, activePhrase, synchronizeAnchors } = useSyncEngine(
    player,
    calibratedSongData || songData,
    null,
    false,
    0,
    0
  );

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
      console.warn(err);
    }
  };

  const handleRewind = () => {
    try {
      if (!player) return;
      const current = player.getCurrentTime();
      let target = current - 10;
      if (target < 0) target = 0;
      player.seekTo(target, true);
      setTimeout(synchronizeAnchors, 100);
    } catch (err) {
      console.warn(err);
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
      console.warn(err);
    }
  };

  const isActuallyPlaying = playerState === 1;

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
          <div style={{ marginTop: "12px", fontWeight: 600, color: "#e5e7eb" }}>Loading Beatmap...</div>
        </div>
      </div>
    );
  }

  if (validationErrors) {
    return (
      <div className="app-container" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center" }}>
        <div className="glass-panel" style={{
          maxWidth: "600px",
          width: "100%",
          padding: "40px",
          borderRadius: "24px",
          border: "1px solid #f87171",
          background: "rgba(9, 9, 11, 0.95)",
          color: "#fca5a5",
          textAlign: "center"
        }}>
          <h2 style={{ margin: "0 0 16px 0", fontSize: "1.8rem", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", color: "#f87171" }}>
            ⚠️ Beatmap Validation Failed
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: "1rem", marginBottom: "24px" }}>
            The selected song map failed Strict schema validations. Playback is blocked to prevent rendering errors.
          </p>
          <div style={{
            maxHeight: "240px",
            overflowY: "auto",
            background: "rgba(0, 0, 0, 0.4)",
            padding: "16px",
            borderRadius: "12px",
            textAlign: "left",
            fontSize: "0.85rem",
            color: "#fca5a5",
            border: "1px solid rgba(248, 113, 113, 0.2)",
            marginBottom: "24px",
            fontFamily: "monospace"
          }}>
            {validationErrors.map((err, idx) => (
              <div key={idx} style={{ marginBottom: "12px", borderBottom: idx < validationErrors.length - 1 ? "1px solid rgba(255, 255, 255, 0.05)" : "none", paddingBottom: "8px" }}>
                <div style={{ fontWeight: "bold", color: "#f87171" }}>Issue #{idx + 1}</div>
                <div><strong>Path:</strong> {err.path.join(" ➔ ") || "Root"}</div>
                <div><strong>Message:</strong> {err.message}</div>
              </div>
            ))}
          </div>
          <button
            onClick={handleBackToCatalog}
            style={{
              background: "linear-gradient(135deg, #ffffff, #d1d5db)",
              border: "none",
              borderRadius: "12px",
              color: "#000",
              padding: "12px 24px",
              fontSize: "0.95rem",
              fontWeight: "900",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(255, 255, 255, 0.15)"
            }}
          >
            Return to Catalog
          </button>
        </div>
      </div>
    );
  }

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

  if (!currentSong) {
    return (
      <div className="app-container">
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

  const sectionsList = songData?.sections || [];
  const nextSection = sectionsList.find(sec => sec.startTimeMs > (currentTime * 1000)) || null;
  const timeToNextSection = nextSection ? (nextSection.startTimeMs / 1000) - currentTime : null;

  return (
    <div className="app-container">
      <div className="testing-top-container">
        <header 
          className="header glass-panel" 
          onClick={handleHeaderClick} 
          style={{ cursor: "pointer", marginBottom: 0 }} 
          title="Click 5 times for Developer Panel"
        >
          <h1 className="song-title">
            {songData ? songData.title : "Salsa Rhythm Hub"}
          </h1>
          <p className="song-artist">
            {songData ? `${songData.artist} — ${songData.genre}` : "Ear-Training Visualizer"}
          </p>
        </header>
      </div>

      <div className="testing-bottom-container">
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
                originalSongData={songData}
                calibratedSongData={calibratedSongData}
                setCalibratedSongData={setCalibratedSongData}
                setSongData={setSongData}
                setOriginalSongData={setSongData}
                breaks={[]}
                setBreaks={() => {}}
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
                    <div className="video-wrapper">
                      <div key={songData?.youtubeId || "yt-player"} id="yt-player" ref={ytPlayerRefCallback}></div>
                      <AudioShield onPlayToggle={handlePlayToggle} />
                    </div>
                  </div>
                }
              />
            </Suspense>
          ) : (
            <div className="left-workspace-column">
              <div className="video-wrapper">
                <div key={songData?.youtubeId || "yt-player"} id="yt-player" ref={ytPlayerRefCallback}></div>
                <AudioShield onPlayToggle={handlePlayToggle} />
              </div>

              {mode === "practice" ? (
                <GameCanvas 
                  key={calibratedSongData?.youtubeId || songData?.youtubeId}
                  songData={calibratedSongData || songData}
                  currentTime={currentTime}
                  isPlaying={isActuallyPlaying}
                  onPlayToggle={handlePlayToggle}
                />
              ) : (
                <Visualizer 
                  danceStyle={songData?.genre?.toLowerCase() || "salsa"}
                  currentTime={currentTime}
                  introEnd={0}
                  currentBeat={currentBeat}
                  activeSection={activeSection}
                  activeBreak={activePhrase?.type === "TRANSITION_BREAK" ? activePhrase : null}
                  isPlaying={isActuallyPlaying}
                />
              )}

              <RoadmapScrubber
                currentTime={currentTime}
                videoDuration={videoDuration}
                introStart={0}
                introEnd={0}
                nextSection={nextSection}
                timeToNextSection={timeToNextSection}
                sectionsList={sectionsList}
                breaks={[]}
                onSeek={throttledSeek}
              />

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
      </div>

      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
