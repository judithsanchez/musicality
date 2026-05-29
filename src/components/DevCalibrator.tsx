import React, { useState, useEffect, useRef } from "react";
import {
  Check, RotateCcw, Trash2, Lock, Unlock, Scissors,
  Clock, Music, ChevronLeft, ChevronRight
} from "lucide-react";
import { AgnosticSong, BeatCountType } from "../types/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DevCalibratorProps {
  songData: any;
  originalSongData: any;
  calibratedSongData: any;
  setCalibratedSongData: (data: any) => void;
  setSongData: (data: any) => void;
  setOriginalSongData: (data: any) => void;
  breaks: any[];
  setBreaks: (breaks: any[]) => void;
  currentTime: number;
  videoDuration: number;
  player: any;
  throttledSeek: (time: number, immediate: boolean) => void;
  userDelaySetting: number;
  setUserDelaySetting: (delay: number) => void;
  onBackToCatalog: () => void;
  showToast: (msg: string) => void;
  videoElement?: React.ReactNode;
}

interface EditorSection {
  id: string;
  name: string;
  emoji: string;
  startTimestamp: number;
  endTimestamp: number;
  focusInstrument: string;
  beatCountType: BeatCountType;
  displayCounts: boolean;
  localOffsetMs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_PALETTE = [
  { bg: "rgba(255,255,255,0.04)",  border: "rgba(255,255,255,0.12)", text: "#9ca3af" },
  { bg: "rgba(255,255,255,0.08)",  border: "rgba(255,255,255,0.22)", text: "#d1d5db" },
  { bg: "rgba(255,255,255,0.12)",  border: "rgba(255,255,255,0.32)", text: "#e5e7eb" },
  { bg: "rgba(255,255,255,0.06)",  border: "rgba(255,255,255,0.17)", text: "#a1a1aa" },
  { bg: "rgba(255,255,255,0.10)",  border: "rgba(255,255,255,0.27)", text: "#f3f4f6" },
  { bg: "rgba(255,255,255,0.14)",  border: "rgba(255,255,255,0.37)", text: "#ffffff" },
];

const BEAT_COUNT_OPTIONS: { value: BeatCountType; label: string }[] = [
  { value: "salsa-8",  label: "Salsa 8-Count (1–8)"   },
  { value: "bachata-4",label: "Bachata 8-Count (1–8)" },
  { value: "none",     label: "No Metronome / Free"    },
];

const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DevCalibrator({
  songData, originalSongData, calibratedSongData,
  setCalibratedSongData, setSongData, setOriginalSongData,
  breaks, setBreaks,
  currentTime, videoDuration,
  player, throttledSeek,
  userDelaySetting, setUserDelaySetting,
  onBackToCatalog, showToast,
  videoElement,
}: DevCalibratorProps) {
  const agnosticSong = (calibratedSongData || songData) as AgnosticSong;
  const youtubeId    = agnosticSong?.youtubeId || "unknown";
  const duration     = videoDuration || 300;
  const defaultMetronome = songData?.metadata?.danceStyle?.toLowerCase() === "bachata" ? ("bachata-4" as const) : ("salsa-8" as const);

  const [editorSections,  setEditorSections]  = useState<EditorSection[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [globalTapLog,    setGlobalTapLog]    = useState<number[]>(agnosticSong?.globalTapLog || []);
  const [tapFlash,        setTapFlash]        = useState(false);
  const [selectedBoundaryIdx, setSelectedBoundaryIdx] = useState<number | null>(null);
  const [isDraggingBoundary, setIsDraggingBoundary] = useState<number | null>(null);
  const [isTappingModeActive, setIsTappingModeActive] = useState(false);

  const loadedSongIdRef = useRef<string | null>(null);
  const timelineRef     = useRef<HTMLDivElement>(null);

  // ── Load sections on song change ──────────────────────────────────────────
  useEffect(() => {
    // Wait for the YouTube player to report a real duration before initialising
    if (!agnosticSong || videoDuration <= 0) return;
    if (loadedSongIdRef.current === youtubeId) return;
    loadedSongIdRef.current = youtubeId;

    const activeSections = agnosticSong.calibratedBeatmap?.sections || [];
    const sorted = [...activeSections].sort((a, b) => a.startTimestamp - b.startTimestamp);

    const formatted: EditorSection[] = sorted.map((sec, idx) => {
      const start = sec.startTimestamp;
      const end =
        typeof sec.endTimestamp === "number" && sec.endTimestamp > start
          ? sec.endTimestamp
          : idx < sorted.length - 1
          ? sorted[idx + 1].startTimestamp
          : videoDuration;
      return {
        id:              sec.id || `sec-${idx}-${sec.name}`,
        name:            sec.name,
        emoji:           sec.emoji || "🎵",
        startTimestamp:  start,
        endTimestamp:    end,
        focusInstrument: sec.focusInstrument || "",
        beatCountType:   sec.beatCountType   || defaultMetronome,
        displayCounts:   sec.displayCounts   !== false,
        localOffsetMs:   sec.localOffsetMs   || 0,
      };
    });

    // Guarantee the timeline is fully contiguous and covers the whole song.
    if (formatted.length > 0) {
      formatted[0].startTimestamp = 0;
      for (let i = 0; i < formatted.length - 1; i++) {
        formatted[i].endTimestamp = Math.max(formatted[i].startTimestamp + 0.1, formatted[i].endTimestamp);
        formatted[i + 1].startTimestamp = formatted[i].endTimestamp;
      }
      const lastIdx = formatted.length - 1;
      formatted[lastIdx].endTimestamp = Math.max(formatted[lastIdx].startTimestamp + 0.1, videoDuration);
    }

    setEditorSections(formatted);
    setGlobalTapLog(agnosticSong.globalTapLog || []);
    setFocusedSectionId(null);
  }, [songData, videoDuration, youtubeId]);

  // ── Beat grid application ─────────────────────────────────────────────────
  const applyVisualGridShifts = (sectionsList: EditorSection[], tapLog: number[]) => {
    const baseSong = originalSongData || songData;
    if (!baseSong) return;

    let processedBeats = JSON.parse(JSON.stringify(baseSong.beats || []));

    if (tapLog.length > 0) {
      const delay       = userDelaySetting / 1000;
      const firstTap    = tapLog[0] - delay;
      const beat1s      = processedBeats.filter((b: any) => b.beat === 1);
      if (beat1s.length > 0) {
        let best = beat1s[0], minDiff = Infinity;
        for (const b of beat1s) {
          const d = Math.abs(firstTap - b.timestamp);
          if (d < minDiff) { minDiff = d; best = b; }
        }
        const shift = firstTap - best.timestamp;
        processedBeats = processedBeats.map((b: any) => ({
          ...b, timestamp: parseFloat(Math.max(0, b.timestamp + shift).toFixed(3))
        }));
      }
    }

    processedBeats = processedBeats.map((b: any) => {
      const sec = sectionsList.find(s => b.timestamp >= s.startTimestamp && b.timestamp <= s.endTimestamp);
      if (sec?.localOffsetMs) {
        const off = sec.localOffsetMs / 1000;
        return {
          ...b,
          timestamp: parseFloat(
            Math.max(sec.startTimestamp, Math.min(sec.endTimestamp, b.timestamp + off)).toFixed(3)
          ),
        };
      }
      return b;
    }).sort((a: any, b: any) => a.timestamp - b.timestamp);

    processedBeats = processedBeats.map((b: any, idx: number) => {
      const sec = sectionsList.find(s => b.timestamp >= s.startTimestamp && b.timestamp <= s.endTimestamp);
      if (sec) {
        const style = sec.beatCountType;
        if (style === "bachata-4") return { ...b, beat: (idx % 8) + 1 };
        if (style === "swing-6")   return { ...b, beat: (idx % 6) + 1 };
        if (style === "waltz-3")   return { ...b, beat: (idx % 3) + 1 };
        if (style === "none")      return { ...b, beat: 0 };
      }
      return { ...b, beat: (idx % 8) + 1 };
    });

    setCalibratedSongData({
      ...(calibratedSongData || songData),
      beats: processedBeats,
      sections: sectionsList.map(s => ({
        id: s.id, name: s.name, emoji: s.emoji,
        startTimestamp: s.startTimestamp, endTimestamp: s.endTimestamp,
        focusInstrument: s.focusInstrument, beatCountType: s.beatCountType,
        displayCounts: s.displayCounts, localOffsetMs: s.localOffsetMs,
      })),
      metadata: {
        ...(calibratedSongData || songData).metadata,
        bpm: (calibratedSongData || songData).metadata?.bpm || 120,
      },
    });
  };

  const syncSections = (list: EditorSection[]) => {
    setEditorSections(list);
    applyVisualGridShifts(list, globalTapLog);
  };

  // ── Slice at playhead ─────────────────────────────────────────────────
  const sliceAtPlayhead = () => {
    const sliceTime = parseFloat(Math.max(0, Math.min(duration, currentTime)).toFixed(3));
    const MIN_SEC_DURATION = 0.1; // 100ms minimum section duration to prevent zero-length or tiny sections

    if (editorSections.length === 0) {
      const initial: EditorSection = {
        id: `sec-${Date.now()}-full`,
        name: "",
        emoji: "🎵",
        startTimestamp: 0,
        endTimestamp: duration,
        focusInstrument: "",
        beatCountType: defaultMetronome,
        displayCounts: true,
        localOffsetMs: 0,
      };
      if (sliceTime < MIN_SEC_DURATION) {
        syncSections([initial]);
        setFocusedSectionId(initial.id);
        showToast("🎵 Timeline initialised! Seek to a transition point and slice again.");
        return;
      }
      const newSec: EditorSection = {
        id: `sec-${Date.now()}`,
        name: "", emoji: "🎵",
        startTimestamp: sliceTime, endTimestamp: duration,
        focusInstrument: "", beatCountType: defaultMetronome,
        displayCounts: true, localOffsetMs: 0,
      };
      const split = [{ ...initial, endTimestamp: sliceTime }, newSec];
      syncSections(split);
      setFocusedSectionId(newSec.id);
      showToast(`✂️ Sliced at ${formatTime(sliceTime)}`);
      return;
    }

    // Find the section that actually contains sliceTime
    const targetIdx = editorSections.findIndex(
      s => sliceTime >= s.startTimestamp && sliceTime <= s.endTimestamp
    );

    if (targetIdx !== -1) {
      const target = editorSections[targetIdx];
      // Check if both resulting sections would be at least MIN_SEC_DURATION
      if (sliceTime - target.startTimestamp < MIN_SEC_DURATION || target.endTimestamp - sliceTime < MIN_SEC_DURATION) {
        showToast("⚠️ Slice is too close to an existing boundary (minimum 100ms per section).");
        return;
      }

      const newSec: EditorSection = {
        id:              `sec-${Date.now()}`,
        name:            "",
        emoji:           "🎵",
        startTimestamp:  sliceTime,
        endTimestamp:    target.endTimestamp,
        focusInstrument: target.focusInstrument,
        beatCountType:   target.beatCountType,
        displayCounts:   target.displayCounts,
        localOffsetMs:   0,
      };

      const updated = [...editorSections];
      updated[targetIdx] = { ...target, endTimestamp: sliceTime };
      updated.splice(targetIdx + 1, 0, newSec);

      syncSections(updated);
      setFocusedSectionId(newSec.id);
      showToast(`✂️ Sliced at ${formatTime(sliceTime)}`);
    } else {
      showToast("⚠️ Playhead is outside defined sections.");
    }
  };

  // ── Boundary nudge ────────────────────────────────────────────────────────
  const nudgeBoundary = (sectionId: string, deltaMs: number, isStart: boolean) => {
    const sec = editorSections.find(s => s.id === sectionId);
    if (!sec) return;
    const delta     = deltaMs / 1000;
    const field     = isStart ? "startTimestamp" as const : "endTimestamp" as const;
    const current   = isStart ? sec.startTimestamp : sec.endTimestamp;
    handleUpdateSectionTimes(sectionId, field, current + delta);
  };

  // ── Contiguous boundary update ────────────────────────────────────────────
  const handleUpdateSectionTimes = (id: string, field: "startTimestamp" | "endTimestamp", value: number) => {
    const numericVal = parseFloat(value.toFixed(3));
    const secIdx     = editorSections.findIndex(s => s.id === id);
    if (secIdx === -1) return;

    const N = editorSections.length;
    if (N === 0) return;

    // Create the boundaries array
    const B: number[] = [0];
    for (let i = 0; i < N; i++) {
      B.push(editorSections[i].endTimestamp);
    }

    // Determine which boundary is being moved.
    const boundaryIdx = field === "startTimestamp" ? secIdx : secIdx + 1;

    // Start of first section is fixed at 0.
    if (boundaryIdx === 0) return;

    const minDur = 0.1;
    // Clamp the target value to make sure there's enough space for all sections
    const minLimit = boundaryIdx * minDur;
    const maxLimit = duration - (N - boundaryIdx) * minDur;
    const clampedVal = Math.max(minLimit, Math.min(maxLimit, numericVal));

    B[boundaryIdx] = clampedVal;

    // Push right neighbors
    for (let k = boundaryIdx + 1; k < N; k++) {
      if (B[k] < B[k - 1] + minDur) {
        B[k] = B[k - 1] + minDur;
      }
    }
    // Make sure the last one is duration
    B[N] = duration;

    // Push left neighbors
    for (let k = boundaryIdx - 1; k >= 1; k--) {
      if (B[k] > B[k + 1] - minDur) {
        B[k] = B[k + 1] - minDur;
      }
    }

    // Update editorSections
    const updated = editorSections.map((sec, i) => ({
      ...sec,
      startTimestamp: B[i],
      endTimestamp: B[i + 1],
    }));

    syncSections(updated);
    throttledSeek(clampedVal, false);
  };

  // ── Field update ──────────────────────────────────────────────────────────
  const handleUpdateSectionField = (id: string, field: keyof EditorSection, value: any) => {
    syncSections(editorSections.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // ── Delete (maintains contiguity) ─────────────────────────────────────────
  const handleDeleteSection = (id: string) => {
    if (editorSections.length <= 1) {
      showToast("⚠️ Cannot delete the only section.");
      return;
    }
    const idx     = editorSections.findIndex(s => s.id === id);
    const updated = [...editorSections];

    if (idx > 0) {
      updated[idx - 1] = { ...updated[idx - 1], endTimestamp: updated[idx].endTimestamp };
    } else {
      updated[1] = { ...updated[1], startTimestamp: 0 };
    }

    updated.splice(idx, 1);
    syncSections(updated);
    if (focusedSectionId === id) setFocusedSectionId(updated[Math.max(0, idx - 1)]?.id ?? null);
    showToast("🗑️ Section removed.");
  };

  // ── TAP on 1 ─────────────────────────────────────────────────────────────
  const handleTap = () => {
    if (!player) return;
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    if (!isTappingModeActive && focusedSectionId) {
      const activeSec = editorSections.find(s => s.id === focusedSectionId);
      if (activeSec && (currentTime < activeSec.startTimestamp || currentTime > activeSec.endTimestamp)) {
        showToast("⚠️ Tap ignored: outside section boundaries!");
        return;
      }
    }

    const updated = [...globalTapLog, currentTime].sort((a, b) => a - b);
    setGlobalTapLog(updated);
    applyVisualGridShifts(editorSections, updated);
  };

  const handleClearTaps = () => {
    setGlobalTapLog([]);
    applyVisualGridShifts(editorSections, []);
    showToast("🔄 Taps cleared.");
  };

  // ── Global Mouse Drag Listener for Boundary Handles ──────────────────────
  useEffect(() => {
    if (isDraggingBoundary === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || isDraggingBoundary === null) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = ratio * duration;
      const sec = editorSections[isDraggingBoundary];
      if (sec) {
        handleUpdateSectionTimes(sec.id, "endTimestamp", targetTime);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingBoundary(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingBoundary, editorSections, duration]);

  // ── Keyboard hotkeys ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Space → Play / Pause
      if (e.code === "Space") {
        e.preventDefault();
        if (player) {
          try {
            const state = player.getPlayerState?.();
            if (state === 1) player.pauseVideo(); else player.playVideo();
          } catch (err) { console.warn("Play toggle error:", err); }
        }
        return;
      }

      // Arrow keys → seek ±2.5s OR micro-calibrate selected boundary
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!isTappingModeActive && selectedBoundaryIdx !== null && selectedBoundaryIdx < editorSections.length - 1) {
          const sec = editorSections[selectedBoundaryIdx];
          const delta = e.shiftKey ? -0.5 : -0.05; // -500ms or -50ms
          handleUpdateSectionTimes(sec.id, "endTimestamp", sec.endTimestamp + delta);
        } else {
          throttledSeek(Math.max(0, currentTime - 2.5), true);
        }
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!isTappingModeActive && selectedBoundaryIdx !== null && selectedBoundaryIdx < editorSections.length - 1) {
          const sec = editorSections[selectedBoundaryIdx];
          const delta = e.shiftKey ? 0.5 : 0.05; // +500ms or +50ms
          handleUpdateSectionTimes(sec.id, "endTimestamp", sec.endTimestamp + delta);
        } else {
          throttledSeek(Math.min(duration, currentTime + 2.5), true);
        }
        return;
      }

      // Escape → Deselect active boundary
      if (e.key === "Escape") {
        setSelectedBoundaryIdx(null);
        return;
      }

      // M / Enter → Slice at playhead
      if (e.key === "m" || e.key === "M" || e.key === "Enter") {
        e.preventDefault();
        if (!isTappingModeActive) {
          sliceAtPlayhead();
        }
        return;
      }

      // T → Tap downbeat (for calibration)
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, editorSections, globalTapLog, focusedSectionId, selectedBoundaryIdx, player, duration, isTappingModeActive]);

  // ── Timeline click to seek ────────────────────────────────────────────────
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect  = timelineRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    throttledSeek(ratio * duration, true);
    setSelectedBoundaryIdx(null); // Clear active boundary selection when clicking timeline track
  };

  // ── Final save ────────────────────────────────────────────────────────────
  const handleFinalSaveToDisk = () => {
    const activeBeatmap = calibratedSongData || songData;
    const baseSong      = originalSongData   || songData;
    if (!activeBeatmap || !baseSong) return;

    const payload = {
      youtubeId,
      activeBeatmap: {
        ...activeBeatmap,
        isCalibrated: true,
        globalTapLog,
        globalReactionDelayMs: userDelaySetting,
        calibratedBeatmap: {
          bpm: activeBeatmap.calibratedBeatmap?.bpm || activeBeatmap.metadata?.bpm || 120,
          beats: activeBeatmap.beats,
          sections: editorSections.map(s => ({
            id: s.id, name: s.name, emoji: s.emoji,
            startTimestamp: s.startTimestamp, endTimestamp: s.endTimestamp,
            focusInstrument: s.focusInstrument, beatCountType: s.beatCountType,
            displayCounts: s.displayCounts, localOffsetMs: s.localOffsetMs,
          })),
        },
        breaks,
      },
      originalBeatmap: { ...baseSong, breaks },
      calibration: {
        recordedAt:     new Date().toISOString(),
        youtubeId,
        globalTapLog,
        reactionDelayMs: userDelaySetting,
        sections:        editorSections,
      },
    };

    showToast("💾 Saving…");
    fetch("/api/save-beatmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(r => { if (!r.ok) throw new Error("Server write failed"); return r.json(); })
      .then(result => {
        if (result.success) {
          setOriginalSongData(JSON.parse(JSON.stringify(activeBeatmap)));
          setSongData(JSON.parse(JSON.stringify(activeBeatmap)));
          showToast("🎉 Calibration committed to disk!");
        } else throw new Error(result.error);
      })
      .catch(err => {
        console.error("Final save failed:", err);
        showToast("❌ Save failed. Check console.");
      });
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeSec     = editorSections.find(s => s.id === focusedSectionId) ?? null;
  const playheadPct   = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isTapDeckOpen = false; // Kept hidden for now per user request

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="glass-panel dev-calibrator-workbench"
      style={{
        display: "flex", flexDirection: "column", gap: "24px",
        padding: "24px", width: "100%",
        border: "1px solid #27272a",
        background: "rgba(9,9,11,0.85)",
        backdropFilter: "blur(12px)", borderRadius: "20px",
        fontFamily: "inherit",
      }}
    >
      {/* ── ROW 1: Widescreen Top Row (Video Left, Contextual & Tap Right) ── */}
      <div className="dev-widescreen-top-row">
        
        {/* Left Column: Video Element */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {videoElement}
          
          {/* Tap Deck (if open) goes here for ease of handle! */}
          {isTapDeckOpen && (
            <div
              className={tapFlash ? "active-flash" : ""}
              style={{
                padding: "20px 16px",
                background: "rgba(255,255,255,0.02)",
                border: `2px solid ${tapFlash ? "#ffffff" : "#27272a"}`,
                borderRadius: "16px",
                display: "flex", flexDirection: "column", gap: "14px", alignItems: "center",
                boxShadow: tapFlash ? "0 0 36px rgba(255,255,255,0.35)" : "none",
                transition: "all 0.08s ease",
              }}
            >
              <div style={{
                fontSize: "0.7rem", fontWeight: 700, color: "#a1a1aa",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                🎧 Tap Calibration — {activeSec?.name}
              </div>

              <button
                onClick={handleTap}
                style={{
                  width: "100%", height: "90px", borderRadius: "14px",
                  border: `2px solid ${tapFlash ? "#ffffff" : "#3f3f46"}`,
                  background: tapFlash ? "#ffffff" : "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
                  transition: "all 0.08s ease",
                }}
              >
                <span style={{ fontSize: "1.35rem", fontWeight: 900, color: tapFlash ? "#000" : "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>
                  TAP ON "1"
                </span>
                <span style={{ fontSize: "0.68rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#71717a" }}>
                  Click here or press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 3px" }}>T</kbd>
                </span>
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.75rem", color: "#d1d5db" }}>
                <span>Taps logged: <strong style={{ color: "#ffffff" }}>{globalTapLog.length}</strong></span>
                {globalTapLog.length > 0 && (
                  <button
                    onClick={handleClearTaps}
                    style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <RotateCcw size={11} /> Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Header & Contextual Editors */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Header Panel */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid #27272a",
            borderRadius: "14px", padding: "16px",
            display: "flex", flexDirection: "column", gap: "12px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#ffffff", textTransform: "uppercase", letterSpacing: "1px" }}>
                🛠️ Downbeat Workbench
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleFinalSaveToDisk}
                  style={{
                    background: "#ffffff",
                    border: "none", color: "#000000",
                    padding: "6px 14px", borderRadius: "8px",
                    fontSize: "0.75rem", fontWeight: 900, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "6px",
                  }}
                >
                  <Check size={13} /> Commit Calibration
                </button>
                <button
                  onClick={onBackToCatalog}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid #27272a",
                    color: "#a1a1aa", padding: "6px 12px", borderRadius: "8px",
                    fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Exit
                </button>
              </div>
            </div>
            {/* Global parameters / details */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#71717a", paddingTop: "8px", borderTop: "1px solid #27272a" }}>
              <span>BPM: <strong style={{ color: "#ffffff" }}>{agnosticSong.calibratedBeatmap?.bpm || (agnosticSong as any).metadata?.bpm || 120}</strong></span>
              <span>Delay: <strong style={{ color: "#ffffff" }}>{userDelaySetting}ms</strong></span>
              <span>Sections: <strong style={{ color: "#ffffff" }}>{editorSections.length}</strong></span>
            </div>

            {/* Mode Segmented Selector */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              paddingTop: "10px",
              borderTop: "1px solid #27272a"
            }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Select Workbench Mode
              </span>
              <div style={{
                display: "flex",
                background: "rgba(0,0,0,0.4)",
                padding: "2px",
                borderRadius: "8px",
                border: "1px solid #27272a",
              }}>
                <button
                  onClick={() => setIsTappingModeActive(false)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: !isTappingModeActive ? "rgba(255,255,255,0.08)" : "transparent",
                    color: !isTappingModeActive ? "#fff" : "#71717a",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    boxShadow: !isTappingModeActive ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: !isTappingModeActive ? "#ffffff" : "transparent" }} />
                  Sections Mode
                </button>
                <button
                  onClick={() => setIsTappingModeActive(true)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: isTappingModeActive ? "rgba(255,255,255,0.08)" : "transparent",
                    color: isTappingModeActive ? "#ffffff" : "#71717a",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    boxShadow: isTappingModeActive ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: isTappingModeActive ? "#ffffff" : "transparent", boxShadow: isTappingModeActive ? "0 0 6px #ffffff" : "none" }} />
                  Tapping Mode
                </button>
              </div>
            </div>
          </div>

          {/* Conditional Editor Swap */}
          {isTappingModeActive ? (
            /* Tapping Calibration Deck */
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid #27272a",
              borderRadius: "14px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  🎧 Downbeat Tap Deck
                </span>
                {globalTapLog.length > 0 && (
                  <button
                    onClick={handleClearTaps}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#a1a1aa",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <RotateCcw size={12} /> Clear Taps
                  </button>
                )}
              </div>

              {/* The Massive Clickable Downbeat Button */}
              <button
                onClick={handleTap}
                style={{
                  width: "100%",
                  height: "100px",
                  borderRadius: "14px",
                  border: `2px solid ${tapFlash ? "#ffffff" : "#27272a"}`,
                  background: tapFlash ? "#ffffff" : "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  boxShadow: tapFlash ? "0 0 30px rgba(255,255,255,0.4)" : "none",
                  transition: "all 0.08s ease",
                }}
              >
                <span style={{ fontSize: "1.4rem", fontWeight: 900, color: tapFlash ? "#000" : "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>
                  TAP ON "1"
                </span>
                <span style={{ fontSize: "0.7rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#71717a" }}>
                  Click here or press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 3px" }}>T</kbd>
                </span>
              </button>

              {/* Progress and Target Banner */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid #27272a",
                borderRadius: "10px",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 700 }}>
                  <span style={{ color: "#ffffff" }}>
                    {globalTapLog.length >= 25 ? "🎉 Precision target reached!" : "⚠️ Keep tapping!"}
                  </span>
                  <span style={{ color: "#fff" }}>{globalTapLog.length} / 25 taps</span>
                </div>
                
                {/* Visual Progress Bar */}
                <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(100, (globalTapLog.length / 25) * 100)}%`,
                    height: "100%",
                    background: "#ffffff",
                    borderRadius: "3px",
                    transition: "width 0.2s ease",
                  }} />
                </div>
                
                <span style={{ fontSize: "0.65rem", color: "#71717a", fontStyle: "italic" }}>
                  {globalTapLog.length >= 25
                    ? "Ideal downbeat coverage achieved. You can save anytime!"
                    : "Record at least 25 taps to auto-average reaction delay accurately."}
                </span>
              </div>
            </div>
          ) : activeSec ? (
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "14px", padding: "16px",
              display: "flex", flexDirection: "column", gap: "14px",
            }}>

              {/* Section name row */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="text"
                  value={activeSec.emoji}
                  onChange={(e) => handleUpdateSectionField(activeSec.id, "emoji", e.target.value)}
                  style={{
                    width: "36px", textAlign: "center", padding: "6px 4px",
                    borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: "1rem",
                  }}
                />
                <input
                  type="text"
                  value={activeSec.name}
                  onChange={(e) => handleUpdateSectionField(activeSec.id, "name", e.target.value)}
                  placeholder="Section name…"
                  style={{
                    flexGrow: 1, padding: "7px 12px", borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.3)", color: "#fff",
                    fontSize: "0.85rem", fontWeight: 700, outline: "none",
                  }}
                />
                {/* Focus/Tap toggle */}
                <button
                  onClick={() => setFocusedSectionId(focusedSectionId === activeSec.id ? null : activeSec.id)}
                  title={isTapDeckOpen ? "Release to close tap deck" : "Open tap calibration deck"}
                  style={{
                    background: isTapDeckOpen ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${isTapDeckOpen ? "#ffffff" : "#27272a"}`,
                    color: isTapDeckOpen ? "#ffffff" : "#a1a1aa",
                    padding: "6px 10px", borderRadius: "8px",
                    fontSize: "0.7rem", fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "5px",
                  }}
                >
                  {isTapDeckOpen ? <Lock size={12} /> : <Unlock size={12} />}
                  {isTapDeckOpen ? "Calibrating" : "Calibrate"}
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDeleteSection(activeSec.id)}
                  title="Delete section (extends neighbor)"
                  style={{
                    background: "rgba(255,255,255,0.02)", border: "1px solid #27272a",
                    color: "#a1a1aa", padding: "6px 8px", borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Start timestamp nudger */}
              <NudgerRow
                label="Start"
                value={activeSec.startTimestamp}
                color="#ffffff"
                onNudge={(ms) => nudgeBoundary(activeSec.id, ms, true)}
                onMarkFromPlayhead={() => handleUpdateSectionTimes(activeSec.id, "startTimestamp", currentTime)}
                disabled={editorSections.findIndex(s => s.id === activeSec.id) === 0}
              />

              {/* End timestamp nudger */}
              <NudgerRow
                label="End"
                value={activeSec.endTimestamp}
                color="#ffffff"
                onNudge={(ms) => nudgeBoundary(activeSec.id, ms, false)}
                onMarkFromPlayhead={() => handleUpdateSectionTimes(activeSec.id, "endTimestamp", currentTime)}
                disabled={false}
              />

              {/* Grid Offset Nudger Row */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px",
                padding: "6px 10px",
                gap: "8px",
              }}>
                <span style={{ fontSize: "0.68rem", color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Grid Offset
                </span>
                <span style={{ fontFamily: "monospace", fontSize: "0.75rem", fontWeight: 700, color: "#ffffff", marginLeft: "auto", marginRight: "8px" }}>
                  {activeSec.localOffsetMs >= 0 ? "+" : ""}{activeSec.localOffsetMs}ms
                </span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => handleUpdateSectionField(activeSec.id, "localOffsetMs", activeSec.localOffsetMs - 50)}
                    title="Nudge -50ms"
                    style={{
                      padding: "4px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)",
                      color: "#9ca3af", cursor: "pointer", transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  >
                    -50ms
                  </button>
                  <button
                    onClick={() => handleUpdateSectionField(activeSec.id, "localOffsetMs", 0)}
                    disabled={activeSec.localOffsetMs === 0}
                    title="Reset offset to 0ms"
                    style={{
                      padding: "4px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700,
                      background: activeSec.localOffsetMs === 0 ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${activeSec.localOffsetMs === 0 ? "rgba(255,255,255,0.05)" : "#27272a"}`,
                      color: activeSec.localOffsetMs === 0 ? "#3f3f46" : "#ffffff",
                      cursor: activeSec.localOffsetMs === 0 ? "not-allowed" : "pointer",
                      transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => { if (activeSec.localOffsetMs !== 0) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                    onMouseLeave={(e) => { if (activeSec.localOffsetMs !== 0) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => handleUpdateSectionField(activeSec.id, "localOffsetMs", activeSec.localOffsetMs + 50)}
                    title="Nudge +50ms"
                    style={{
                      padding: "4px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)",
                      color: "#9ca3af", cursor: "pointer", transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  >
                    +50ms
                  </button>
                </div>
              </div>

              {/* Beat count modulo & Focus instrument side-by-side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {/* Beat count modulo */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.68rem", color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Beat Modulo
                  </label>
                  <select
                    value={activeSec.beatCountType}
                    onChange={(e) => handleUpdateSectionField(activeSec.id, "beatCountType", e.target.value)}
                    style={{
                      padding: "6px 10px", borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.35)", color: "#e5e7eb",
                      fontSize: "0.8rem", outline: "none",
                    }}
                  >
                    {BEAT_COUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Focus instrument */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.68rem", color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Focus Instrument
                  </label>
                  <input
                    type="text"
                    value={activeSec.focusInstrument}
                    onChange={(e) => handleUpdateSectionField(activeSec.id, "focusInstrument", e.target.value)}
                    placeholder="e.g. Cowbell"
                    style={{
                      padding: "6px 10px", borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.35)", color: "#e5e7eb",
                      fontSize: "0.8rem", outline: "none",
                    }}
                  />
                </div>
              </div>

              <p style={{ fontSize: "0.65rem", color: "#4b5563", textAlign: "center", margin: 0 }}>
                Nudging adjusts adjacent sections to keep the timeline contiguous.
              </p>
            </div>
          ) : (
            editorSections.length > 0 && (
              <div style={{ textAlign: "center", padding: "24px", background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: "14px", fontSize: "0.78rem", color: "#6b7280", fontStyle: "italic" }}>
                Click a section in the timeline or a pill below to edit it.
              </div>
            )
          )}
        </div>

      </div>

      {/* ── ROW 2: Full-Width Visual Timeline (Editing Console) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", padding: "16px 20px" }}>
        
        {/* Timeline Header controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Music size={12} style={{ color: "#ffffff" }} /> Song Timeline Editing Console
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#ffffff", fontWeight: 600 }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            {!isTappingModeActive && (
              <button
                onClick={sliceAtPlayhead}
                title="Hotkey: M or Enter"
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  fontSize: "0.72rem", fontWeight: 700,
                  background: "rgba(255,255,255,0.05)", border: "1px solid #27272a",
                  color: "#ffffff", padding: "4px 12px", borderRadius: "6px",
                  cursor: "pointer", transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              >
                <Scissors size={12} /> Slice Here
                <kbd style={{ background: "rgba(255,255,255,0.08)", borderRadius: "3px", padding: "0 4px", fontSize: "0.65rem" }}>M</kbd>
              </button>
            )}
            {isTappingModeActive ? (
              <span style={{ fontSize: "0.65rem", color: "#ffffff", fontWeight: 600 }}>
                🎯 Tapping Mode Active: Press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 4px", color: "#fff" }}>T</kbd> to tap downbeats · <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 4px", color: "#fff" }}>Space</kbd> play/pause
              </span>
            ) : (
              <span style={{ fontSize: "0.65rem", color: "#6b7280" }}>
                <kbd style={{ background: "rgba(255,255,255,0.06)", borderRadius: "3px", padding: "0 3px" }}>Space</kbd> play/pause
                {" · "}
                <kbd style={{ background: "rgba(255,255,255,0.06)", borderRadius: "3px", padding: "0 3px" }}>←→</kbd> seek / nudge
                {" · "}
                <kbd style={{ background: "rgba(255,255,255,0.06)", borderRadius: "3px", padding: "0 3px" }}>Esc</kbd> deselect
              </span>
            )}
          </div>
        </div>

        {/* Timeline Track with protruding boundary handles */}
        <div style={{
          position: "relative",
          padding: "8px 0",
          opacity: isTappingModeActive ? 0.5 : 1,
          pointerEvents: isTappingModeActive ? "none" : "auto",
          transition: "opacity 0.25s ease, filter 0.25s ease",
          filter: isTappingModeActive ? "grayscale(30%)" : "none",
        }}>
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            style={{
              position: "relative", height: "48px",
              borderRadius: "10px",
              background: "#0c0c0e", cursor: isTappingModeActive ? "not-allowed" : "crosshair",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "visible", // ALLOW handles to protrude above and below!
            }}
          >
            
            {/* Inner Container to clip the Section Blocks */}
            <div
              style={{
                position: "absolute", inset: 0,
                borderRadius: "9px", overflow: "hidden",
              }}
            >
              {/* Section blocks */}
              {editorSections.length === 0 ? (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", color: "#6b7280", fontStyle: "italic", pointerEvents: "none",
                }}>
                  Press <strong style={{ color: "#ffffff", margin: "0 4px" }}>M</strong> or click "Slice Here" to start sectioning
                </div>
              ) : (
                editorSections.map((sec, idx) => {
                  const widthPct  = ((sec.endTimestamp - sec.startTimestamp) / duration) * 100;
                  const leftPct   = (sec.startTimestamp / duration) * 100;
                  const color     = SECTION_PALETTE[idx % SECTION_PALETTE.length];
                  const isActive  = sec.id === focusedSectionId;
                  return (
                    <div
                      key={sec.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedSectionId(isActive ? null : sec.id);
                        if (!isActive) throttledSeek(sec.startTimestamp, true);
                      }}
                      style={{
                        position: "absolute", top: 0, bottom: 0,
                        left: `${leftPct}%`, width: `${widthPct}%`,
                        background: color.bg,
                        borderRight: `1px solid ${color.border}`,
                        outline: isActive ? `2.5px solid ${color.border}` : "none",
                        outlineOffset: "-2.5px",
                        display: "flex", alignItems: "center",
                        padding: "0 10px", overflow: "hidden",
                        cursor: "pointer", transition: "outline 0.1s ease",
                        zIndex: isActive ? 2 : 1,
                      }}
                    >
                      <span style={{
                        fontSize: "0.7rem", fontWeight: 800,
                        color: color.text, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis",
                        textShadow: "0 1.5px 3px rgba(0,0,0,0.9)",
                      }}>
                        {sec.emoji} {sec.name}
                      </span>
                    </div>
                  );
                })
              )}

              {/* Playhead */}
              <div
                style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${playheadPct}%`, width: "2px",
                  background: "#ffffff", zIndex: 10, pointerEvents: "none",
                  boxShadow: "0 0 10px rgba(255,255,255,0.8)",
                }}
              >
                <div style={{
                  position: "absolute", top: 0, left: "50%",
                  transform: "translateX(-50%)",
                  width: "10px", height: "10px",
                  background: "#ffffff", borderRadius: "50%",
                }} />
              </div>

            </div>

            {/* Division Line Boundary Handles (protrude above and below timeline) */}
            {editorSections.length > 1 && editorSections.map((sec, idx) => {
              // We only render internal boundaries (N-1 divisions between sections)
              if (idx === editorSections.length - 1) return null;

              const leftPct = (sec.endTimestamp / duration) * 100;
              const isSelected = selectedBoundaryIdx === idx;
              const isDragging = isDraggingBoundary === idx;

              return (
                <div
                  key={`handle-${sec.id}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsDraggingBoundary(idx);
                    setSelectedBoundaryIdx(idx);
                  }}
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    top: "-8px",
                    width: "12px", // touch target
                    height: "64px", // protrudes 8px above and below (48 + 16 = 64)
                    transform: "translateX(-50%)",
                    cursor: "col-resize",
                    zIndex: isSelected ? 30 : 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Glowing Vertical Line */}
                  <div
                    style={{
                      width: "3px",
                      height: "100%",
                      borderRadius: "1.5px",
                      background: isSelected 
                        ? "linear-gradient(to bottom, #ffffff, #d1d5db)" // Bright White
                        : isDragging
                        ? "#e5e7eb" // Light gray
                        : "rgba(255,255,255,0.2)", // Subtle translucent
                      boxShadow: isSelected
                        ? "0 0 8px #ffffff, 0 0 16px rgba(255,255,255,0.6)"
                        : isDragging
                        ? "0 0 6px rgba(255,255,255,0.4)"
                        : "0 1px 3px rgba(0,0,0,0.4)",
                      transition: "all 0.15s ease",
                    }}
                  />
                  {/* Handle center indicator knob */}
                  <div
                    style={{
                      position: "absolute",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: isSelected ? "#ffffff" : "#a1a1aa",
                      border: `1.5px solid ${isSelected ? "#d1d5db" : "#27272a"}`,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                    }}
                  />
                </div>
              );
            })}

          </div>
        </div>

        {/* Section Pills Row under timeline */}
        {!isTappingModeActive && editorSections.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginTop: "2px", flexWrap: "wrap" }}>
            {editorSections.map((sec, idx) => {
              const color    = SECTION_PALETTE[idx % SECTION_PALETTE.length];
              const isActive = sec.id === focusedSectionId;
              return (
                <button
                  key={sec.id}
                  onClick={() => {
                    setFocusedSectionId(isActive ? null : sec.id);
                    if (!isActive) throttledSeek(sec.startTimestamp, true);
                  }}
                  style={{
                    fontSize: "0.68rem", fontWeight: 700,
                    padding: "3px 10px", borderRadius: "20px",
                    background: isActive ? color.bg : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isActive ? color.border : "rgba(255,255,255,0.08)"}`,
                    color: isActive ? color.text : "#9ca3af",
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                >
                  {sec.emoji} {sec.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── NudgerRow sub-component ─────────────────────────────────────────────────

interface NudgerRowProps {
  label: string;
  value: number;
  color: string;
  onNudge: (deltaMs: number) => void;
  onMarkFromPlayhead: () => void;
  disabled: boolean;
}

function NudgerRow({ label, value, color, onNudge, onMarkFromPlayhead, disabled }: NudgerRowProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      padding: "6px 10px",
      gap: "8px",
    }}>
      <span style={{ fontSize: "0.68rem", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", minWidth: "40px" }}>
        {label}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: "0.75rem", fontWeight: 700, color, marginLeft: "auto", marginRight: "8px" }}>
        {value.toFixed(3)}s
      </span>
      <div style={{ display: "flex", gap: "4px" }}>
        <button
          onClick={() => !disabled && onNudge(-100)}
          disabled={disabled}
          title="Nudge -100ms"
          style={{
            padding: "4px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700,
            background: disabled ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: disabled ? "#374151" : "#9ca3af",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
        >
          -0.1s
        </button>
        <button
          onClick={onMarkFromPlayhead}
          title="Snap to current playhead position"
          style={{
            padding: "4px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid #27272a",
            color: "#ffffff", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "4px",
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
        >
          <Clock size={10} /> Mark
        </button>
        <button
          onClick={() => !disabled && onNudge(100)}
          disabled={disabled}
          title="Nudge +100ms"
          style={{
            padding: "4px 8px", borderRadius: "5px", fontSize: "0.65rem", fontWeight: 700,
            background: disabled ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: disabled ? "#374151" : "#9ca3af",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
        >
          +0.1s
        </button>
      </div>
    </div>
  );
}
