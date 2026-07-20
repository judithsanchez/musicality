import { useEffect, useRef, useState } from "react";

export default function Visualizer({
  danceStyle: _danceStyle = "salsa",
  currentTime = 0,
  introEnd = 0,
  currentBeat = null,
  activeSection: _activeSection = null,
  activeBreak: _activeBreak = null,
  isPlaying = false
}) {
  const [pulse, setPulse] = useState(null);
  const lastBeatRef = useRef(null);
  const pulseTimerRef = useRef(null);
  const isQuietSection = ["intro", "outro"].includes(_activeSection?.category);
  const isActive = 
    isPlaying &&
    !isQuietSection &&
    currentTime >= introEnd && 
    currentBeat && 
    currentBeat.count === 1;

  useEffect(() => {
    if (!isActive) return;
    const beatKey = currentBeat.timestampMs || currentBeat.timeMs || currentTime;
    if (lastBeatRef.current === beatKey) return;
    lastBeatRef.current = beatKey;
    setPulse({ id: `${beatKey}-${performance.now()}` });
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setPulse(null), 430);
  }, [currentBeat, currentTime, isActive]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  return (
    <div className="downbeat-overlay" aria-hidden="true">
      {pulse && (
        <div key={pulse.id} className="downbeat-pulse">
          <div className="downbeat-shockwave" />
          <div className="downbeat-core">
            <span>1</span>
          </div>
        </div>
      )}
    </div>
  );
}
