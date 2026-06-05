import { useState, useEffect, useRef, useCallback, RefObject } from "react";

interface SyncEngineResult {
  currentTime: number;
  currentBeat: any;
  activeSection: any;
  activePhrase: any;
  synchronizeAnchors: () => void;
}

export function useSyncEngine(
  player: any,
  songData: any,
  localAudioRef: RefObject<HTMLAudioElement | null> | null = null,
  useLocalAudio: boolean = false,
  latencyOffset: number = 0,
  gridShift: number = 0
): SyncEngineResult {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<any>(null);
  const [activePhrase, setActivePhrase] = useState<any>(null);

  const playerRef = useRef<any>(player);
  const songDataRef = useRef<any>(songData);
  const frameIdRef = useRef<number | null>(null);

  const anchorYtTimeRef = useRef<number>(0);
  const anchorPerfTimeRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(1);
  const isPlayingRef = useRef<boolean>(false);
  const lastDriftCheckRef = useRef<number>(0);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    songDataRef.current = songData;
  }, [songData]);

  const synchronizeAnchors = useCallback(() => {
    if (useLocalAudio && localAudioRef?.current) {
      setCurrentTime(localAudioRef.current.currentTime);
      return;
    }

    const ytPlayer = playerRef.current;
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;

    anchorYtTimeRef.current = ytPlayer.getCurrentTime();
    anchorPerfTimeRef.current = performance.now();
    playbackRateRef.current = ytPlayer.getPlaybackRate ? ytPlayer.getPlaybackRate() : 1;
    isPlayingRef.current = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() === 1 : false; 
    lastDriftCheckRef.current = performance.now();
  }, [useLocalAudio, localAudioRef]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        try {
          if (useLocalAudio && localAudioRef?.current) {
            localAudioRef.current.pause();
          } else if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
            playerRef.current.pauseVideo();
          }
        } catch {
        }
        isPlayingRef.current = false;
      } else {
        setTimeout(synchronizeAnchors, 150);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [useLocalAudio, localAudioRef, synchronizeAnchors]);

  useEffect(() => {
    const updateLoop = () => {
      const sData = songDataRef.current;
      let elapsed = 0;

      if (useLocalAudio && localAudioRef?.current) {
        elapsed = localAudioRef.current.currentTime;
        isPlayingRef.current = !localAudioRef.current.paused;
      } else {
        const ytPlayer = playerRef.current;
        if (ytPlayer && isPlayingRef.current) {
          const now = performance.now();
          const timeDelta = (now - anchorPerfTimeRef.current) / 1000;
          elapsed = anchorYtTimeRef.current + timeDelta * playbackRateRef.current;

          if (now - lastDriftCheckRef.current > 2000) {
            lastDriftCheckRef.current = now;
            try {
              const actualYtTime = ytPlayer.getCurrentTime();
              const drift = Math.abs(elapsed - actualYtTime);
              if (drift > 0.1) { 
                anchorYtTimeRef.current = actualYtTime;
                anchorPerfTimeRef.current = now;
                playbackRateRef.current = ytPlayer.getPlaybackRate ? ytPlayer.getPlaybackRate() : 1;
                elapsed = actualYtTime;
              }
            } catch (err) {
              console.warn(err);
            }
          }
        } else if (ytPlayer) {
          try {
            elapsed = ytPlayer.getCurrentTime() || 0;
          } catch {
          }
        }
      }

      if (elapsed < 0) elapsed = 0;
      setCurrentTime(elapsed);

      const elapsedMs = elapsed * 1000;
      const visualTimeMs = elapsedMs - latencyOffset;

      if (sData) {
        let matchedSection = null;
        if (sData.sections && sData.sections.length > 0) {
          for (let i = 0; i < sData.sections.length; i++) {
            const sec = sData.sections[i];
            if (visualTimeMs >= sec.startTimeMs && visualTimeMs < sec.endTimeMs) {
              matchedSection = sec;
              break;
            }
          }
        }
        setActiveSection(matchedSection);

        let matchedPhrase = null;
        if (sData.phrases && sData.phrases.length > 0) {
          for (let i = 0; i < sData.phrases.length; i++) {
            const ph = sData.phrases[i];
            if (visualTimeMs >= ph.startTimeMs && visualTimeMs < ph.endTimeMs) {
              matchedPhrase = ph;
              break;
            }
          }
        }
        setActivePhrase(matchedPhrase);

        let closestBeat: any = null;
        let minDiff = Infinity;

        if (matchedPhrase?.calibratedBeats && matchedPhrase.calibratedBeats.length > 0) {
          for (let i = 0; i < matchedPhrase.calibratedBeats.length; i++) {
            const beat = matchedPhrase.calibratedBeats[i];
            const timeDiff = visualTimeMs - beat.timestampMs;
            if (timeDiff >= -30 && timeDiff < 100) {
              const absDiff = Math.abs(timeDiff);
              if (absDiff < minDiff) {
                minDiff = absDiff;
                closestBeat = beat;
              }
            }
          }
        } else if (sData.absoluteBeatMap && sData.absoluteBeatMap.length > 0) {
          for (let i = 0; i < sData.absoluteBeatMap.length; i++) {
            const timestampMs = sData.absoluteBeatMap[i];
            const timeDiff = visualTimeMs - timestampMs;
            if (timeDiff >= -30 && timeDiff < 100) {
              const absDiff = Math.abs(timeDiff);
              if (absDiff < minDiff) {
                minDiff = absDiff;
                const baseCount = (i % 8) + 1;
                closestBeat = {
                  count: baseCount,
                  timestampMs
                };
              }
            }
          }
        }

        if (closestBeat) {
          const count = closestBeat.count;
          const shiftedBeatNum = (((count - 1 + gridShift + 8) % 8) + 1);
          setCurrentBeat({
            ...closestBeat,
            count: shiftedBeatNum
          });
        } else {
          setCurrentBeat(null);
        }
      }

      frameIdRef.current = requestAnimationFrame(updateLoop);
    };

    frameIdRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, [useLocalAudio, localAudioRef, latencyOffset, gridShift]);

  useEffect(() => {
    if (!player || useLocalAudio) return;

    const statePollInterval = setInterval(() => {
      const ytPlayer = playerRef.current;
      if (!ytPlayer || typeof ytPlayer.getPlayerState !== "function") return;

      const playerState = ytPlayer.getPlayerState();
      const currentRate = ytPlayer.getPlaybackRate ? ytPlayer.getPlaybackRate() : 1;
      const isPlaying = playerState === 1;

      if (isPlaying !== isPlayingRef.current || currentRate !== playbackRateRef.current) {
        synchronizeAnchors();
      }
      
      if (isPlaying) {
        const elapsedDelta = (performance.now() - anchorPerfTimeRef.current) / 1000;
        const reckoned = anchorYtTimeRef.current + elapsedDelta * playbackRateRef.current;
        const actual = ytPlayer.getCurrentTime();
        if (Math.abs(reckoned - actual) > 0.5) { 
          synchronizeAnchors();
        }
      }
    }, 200);

    return () => clearInterval(statePollInterval);
  }, [player, useLocalAudio, synchronizeAnchors]);

  return {
    currentTime,
    currentBeat,
    activeSection,
    activePhrase,
    synchronizeAnchors
  };
}
