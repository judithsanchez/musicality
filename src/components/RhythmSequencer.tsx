import React, { useRef, useState, useEffect } from "react";
import { BeatmapSchema, Beat, Section } from "../types/beatmap";

interface RhythmSequencerProps {
  songData: BeatmapSchema | null;
  currentTime: number;
  isPlaying: boolean;
  customSections?: any[]; // Allow editor draft sections to override
  onSeek?: (time: number) => void;
}

export default function RhythmSequencer({
  songData,
  currentTime,
  isPlaying,
  customSections,
  onSeek
}: RhythmSequencerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Sync container width on mount and resize
  useEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!songData || !songData.beats || songData.beats.length === 0) {
    return (
      <div style={{
        padding: "30px", textAlign: "center", color: "#6b7280",
        background: "rgba(255,255,255,0.02)", borderRadius: "16px",
        border: "1px dashed rgba(255,255,255,0.08)", fontSize: "0.85rem"
      }}>
        No rhythm data available. Upload a song or complete beat analysis first.
      </div>
    );
  }

  const beats: Beat[] = songData.beats;
  const sections: any[] = customSections || songData.calibratedBeatmap?.sections || songData.sections || [];
  const activityMasks = songData.activityMasks || {};

  // Window config
  const secondsToShow = 5; // Total seconds visible at once
  const pixelsPerSecond = containerWidth / secondsToShow;
  const centerTime = currentTime;
  const startTime = centerTime - secondsToShow / 2;
  const endTime = centerTime + secondsToShow / 2;

  // Helper: map time to X position
  const getX = (t: number) => {
    return (t - startTime) * pixelsPerSecond;
  };

  // Helper: check if instrument is active at timestamp
  const isInstrumentActive = (t: number, key: string) => {
    const intervals = activityMasks[key];
    if (!intervals || intervals.length === 0) return true; // fallback to active if no data
    for (const [start, end] of intervals) {
      if (t >= start && t <= end) return true;
    }
    return false;
  };

  // 1. Filter beats in window
  const visibleBeats = beats.filter(b => b.timestamp >= startTime - 0.5 && b.timestamp <= endTime + 0.5);

  // 2. Generate Clave Hits in window
  const claveHits: { timestamp: number; label: string; active: boolean }[] = [];
  // 3. Generate Congas Hits in window
  const congaHits: { timestamp: number; type: "bass" | "slap" | "open"; label: string; active: boolean }[] = [];
  // 4. Generate Cowbell Hits in window
  const cowbellHits: { timestamp: number; type: "low" | "high"; label: string; active: boolean }[] = [];

  // Group visible beats by their section to determine clave direction / rhythm type
  visibleBeats.forEach((b, idx) => {
    const t_curr = b.timestamp;
    const b_num = b.beat;

    // Find section for this beat
    const sec = sections.find(s => t_curr >= s.startTimestamp && t_curr <= s.endTimestamp) || sections[0];
    const claveDirection = sec?.claveDirection || "3-2";

    // Find index of next beat to calculate subdivision (midpoint)
    const globalIdx = beats.indexOf(b);
    const t_next = globalIdx + 1 < beats.length ? beats[globalIdx + 1].timestamp : t_curr + 0.35;
    const t_mid = (t_curr + t_next) / 2.0;

    const isClaveActive = isInstrumentActive(t_curr, "clave");
    const isCongaActive = isInstrumentActive(t_curr, "congas");
    const isCowbellActive = isInstrumentActive(t_curr, "cowbell");

    // Clave
    if (claveDirection === "3-2") {
      if (b_num === 1) claveHits.push({ timestamp: t_curr, label: "1", active: isClaveActive });
      if (b_num === 2) claveHits.push({ timestamp: t_mid, label: "2.5", active: isInstrumentActive(t_mid, "clave") });
      if (b_num === 4) claveHits.push({ timestamp: t_curr, label: "4", active: isClaveActive });
      if (b_num === 6) claveHits.push({ timestamp: t_curr, label: "6", active: isClaveActive });
      if (b_num === 7) claveHits.push({ timestamp: t_curr, label: "7", active: isClaveActive });
    } else {
      // 2-3 Clave
      if (b_num === 2) claveHits.push({ timestamp: t_curr, label: "2", active: isClaveActive });
      if (b_num === 3) claveHits.push({ timestamp: t_curr, label: "3", active: isClaveActive });
      if (b_num === 5) claveHits.push({ timestamp: t_curr, label: "5", active: isClaveActive });
      if (b_num === 6) claveHits.push({ timestamp: t_mid, label: "6.5", active: isInstrumentActive(t_mid, "clave") });
      if (b_num === 8) claveHits.push({ timestamp: t_curr, label: "8", active: isClaveActive });
    }

    // Congas Tumbao Pattern
    if (b_num === 1 || b_num === 5) {
      congaHits.push({ timestamp: t_curr, type: "bass", label: "Bass", active: isCongaActive });
    } else if (b_num === 2 || b_num === 6) {
      congaHits.push({ timestamp: t_curr, type: "slap", label: "Slap", active: isCongaActive });
    } else if (b_num === 4 || b_num === 8) {
      congaHits.push({ timestamp: t_curr, type: "open", label: "Open", active: isCongaActive });
      congaHits.push({ timestamp: t_mid, type: "open", label: "Open", active: isInstrumentActive(t_mid, "congas") });
    }

    // Cowbell Martillo Pattern
    if (b_num % 2 === 1) {
      cowbellHits.push({ timestamp: t_curr, type: "low", label: "Low", active: isCowbellActive });
    } else {
      cowbellHits.push({ timestamp: t_curr, type: "high", label: "High", active: isCowbellActive });
    }
  });

  // 5. Get visible vocal intervals
  const vocalIntervals: [number, number][] = (activityMasks.vocals || [])
    .filter(([start, end]: [number, number]) => end >= startTime && start <= endTime);

  // Click on background to seek
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickTime = startTime + (clickX / pixelsPerSecond);
    onSeek(Math.max(0, clickTime));
  };

  return (
    <div
      ref={containerRef}
      onClick={handleBackgroundClick}
      style={{
        position: "relative",
        width: "100%",
        height: "210px",
        background: "rgba(10, 10, 12, 0.85)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        overflow: "hidden",
        cursor: onSeek ? "pointer" : "default",
        userSelect: "none",
        fontFamily: "inherit"
      }}
    >
      {/* 1. Scrolling grid and elements */}
      <div style={{ position: "absolute", inset: 0 }}>
        
        {/* Vocal Active Blocks Background Layer */}
        {vocalIntervals.map(([start, end], idx) => {
          const xStart = Math.max(0, getX(start));
          const xEnd = Math.min(containerWidth, getX(end));
          return (
            <div
              key={`vocal-${idx}`}
              style={{
                position: "absolute",
                left: `${xStart}px`,
                width: `${xEnd - xStart}px`,
                top: "170px",
                height: "30px",
                background: "rgba(16, 185, 129, 0.08)",
                borderTop: "1px solid rgba(16, 185, 129, 0.2)",
                borderBottom: "1px solid rgba(16, 185, 129, 0.2)",
                pointerEvents: "none"
              }}
            />
          );
        })}

        {/* Vertical Beat Grids */}
        {visibleBeats.map((b) => {
          const x = getX(b.timestamp);
          const isDownbeat = b.beat === 1 || b.beat === 5;
          return (
            <div
              key={`grid-${b.timestamp}`}
              style={{
                position: "absolute",
                left: `${x}px`,
                top: 0,
                bottom: 0,
                width: "1px",
                borderLeft: isDownbeat ? "1px dashed rgba(255, 255, 255, 0.2)" : "1px dotted rgba(255, 255, 255, 0.06)",
                pointerEvents: "none"
              }}
            >
              <span style={{
                position: "absolute",
                top: "6px",
                left: "4px",
                fontSize: "0.65rem",
                fontWeight: isDownbeat ? 900 : 500,
                color: isDownbeat ? "#ffffff" : "#4b5563",
                background: isDownbeat ? "rgba(0,0,0,0.5)" : "transparent",
                padding: "0 2px",
                borderRadius: "3px"
              }}>
                {b.beat}
              </span>
            </div>
          );
        })}

        {/* ── LANES ── */}
        {/* Lane 1: Clave (Top) */}
        <div style={{ position: "absolute", top: "30px", left: 0, right: 0, height: "36px", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
          {claveHits.map((hit, idx) => {
            if (!hit.active) return null; // Only show if active
            const x = getX(hit.timestamp);
            if (x < -10 || x > containerWidth + 10) return null;
            return (
              <div
                key={`clave-${idx}-${hit.timestamp}`}
                style={{
                  position: "absolute",
                  left: `${x}px`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "#22d3ee",
                  boxShadow: "0 0 10px #22d3ee, 0 0 2px #ffffff",
                  border: "1.5px solid #ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none"
                }}
              />
            );
          })}
        </div>

        {/* Lane 2: Congas */}
        <div style={{ position: "absolute", top: "72px", left: 0, right: 0, height: "42px", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
          {congaHits.map((hit, idx) => {
            if (!hit.active) return null; // Only show if active
            const x = getX(hit.timestamp);
            if (x < -15 || x > containerWidth + 15) return null;

            // Differentiate slap, open, bass visually
            let color = "#f59e0b"; // gold
            let border = "1px solid #ffffff";
            let shadow = "0 0 8px #f59e0b";
            let radius = "4px"; // default square
            if (hit.type === "slap") {
              color = "#ef4444"; // red slap
              shadow = "0 0 8px #ef4444";
              radius = "50%"; // round slap
            } else if (hit.type === "bass") {
              color = "#3b82f6"; // blue bass
              shadow = "0 0 8px #3b82f6";
              radius = "8px 8px 0 0"; // tombstone
            }

            return (
              <div
                key={`conga-${idx}-${hit.timestamp}`}
                style={{
                  position: "absolute",
                  left: `${x}px`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  minWidth: "20px",
                  height: "14px",
                  borderRadius: radius,
                  background: color,
                  border: border,
                  boxShadow: shadow,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.5rem",
                  fontWeight: 900,
                  color: "#000000",
                  padding: "0 2px",
                  pointerEvents: "none"
                }}
              >
                {hit.type[0].toUpperCase()}
              </div>
            );
          })}
        </div>

        {/* Lane 3: Cowbell */}
        <div style={{ position: "absolute", top: "120px", left: 0, right: 0, height: "42px", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
          {cowbellHits.map((hit, idx) => {
            if (!hit.active) return null; // Only show if active
            const x = getX(hit.timestamp);
            if (x < -15 || x > containerWidth + 15) return null;

            let color = "#d946ef"; // pink/magenta
            let shapeStyle: React.CSSProperties = {
              width: "12px",
              height: "12px",
              transform: "translate(-50%, -50%) rotate(45deg)",
              border: "1.5px solid #ffffff",
              background: color,
              boxShadow: "0 0 8px #d946ef",
            };

            if (hit.type === "high") {
              color = "#a855f7"; // purple high bell
              shapeStyle = {
                width: "10px",
                height: "10px",
                transform: "translate(-50%, -50%) rotate(45deg)",
                border: "1px solid #ffffff",
                background: color,
                boxShadow: "0 0 6px #a855f7",
              };
            }

            return (
              <div
                key={`cowbell-${idx}-${hit.timestamp}`}
                style={{
                  position: "absolute",
                  left: `${x}px`,
                  top: "50%",
                  pointerEvents: "none",
                  ...shapeStyle
                }}
              />
            );
          })}
        </div>

        {/* Lane 4: Vocals (Text / Region Label) */}
        <div style={{ position: "absolute", top: "170px", left: 0, right: 0, height: "30px", display: "flex", alignItems: "center" }}>
          {vocalIntervals.map(([start, end], idx) => {
            const x = getX((start + end) / 2);
            if (x < 30 || x > containerWidth - 30) return null;
            return (
              <span
                key={`vocallbl-${idx}`}
                style={{
                  position: "absolute",
                  left: `${x}px`,
                  transform: "translateX(-50%)",
                  fontSize: "0.6rem",
                  fontWeight: 800,
                  color: "#10b981",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  background: "rgba(0,0,0,0.6)",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  border: "1px solid rgba(16, 185, 129, 0.15)",
                  pointerEvents: "none"
                }}
              >
                Vocal Section
              </span>
            );
          })}
        </div>

      </div>

      {/* 2. Constant Labels Overlay on Left Side (Frosted glass) */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "75px",
        background: "linear-gradient(to right, rgba(10,10,12,0.95) 70%, rgba(10,10,12,0))",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 0",
        boxSizing: "border-box",
        zIndex: 5,
        pointerEvents: "none",
        fontSize: "0.62rem",
        fontWeight: 800,
        color: "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        borderLeft: "1px solid rgba(255, 255, 255, 0.05)"
      }}>
        <div style={{ height: "20px", display: "flex", alignItems: "center", paddingLeft: "8px" }}>Time</div>
        <div style={{ height: "36px", display: "flex", alignItems: "center", paddingLeft: "8px", color: "#22d3ee" }}>Clave</div>
        <div style={{ height: "42px", display: "flex", alignItems: "center", paddingLeft: "8px", color: "#f59e0b" }}>Congas</div>
        <div style={{ height: "42px", display: "flex", alignItems: "center", paddingLeft: "8px", color: "#d946ef" }}>Cowbell</div>
        <div style={{ height: "30px", display: "flex", alignItems: "center", paddingLeft: "8px", color: "#10b981" }}>Vocals</div>
      </div>

      {/* 3. Center playhead marker line (White vertical neon line) */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: 0,
        bottom: 0,
        width: "2px",
        background: "#ffffff",
        boxShadow: "0 0 8px #ffffff, 0 0 3px rgba(255,255,255,0.5)",
        zIndex: 10,
        pointerEvents: "none"
      }}>
        <div style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "12px",
          height: "12px",
          background: "#ffffff",
          borderRadius: "50%",
          boxShadow: "0 0 10px #ffffff"
        }} />
      </div>
    </div>
  );
}
