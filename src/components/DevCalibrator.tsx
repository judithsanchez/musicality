import React, { useState, useEffect, useRef } from "react";
import { Scissors, RotateCcw } from "lucide-react";
import DevCalibrationPanel from "./DevCalibrationPanel";
import EventAnnotationPanel from "./EventAnnotationPanel";
import { StrictSongMapSchema } from "../types/schemas";
import { addDanceEvent, removeDanceEvent, type DanceEventDraft } from "../utils/danceEvents";

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
  onBackToCatalog: () => void;
  showToast: (msg: string) => void;
  videoElement?: React.ReactNode;
}

const SECTION_PALETTE = [
  { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)", text: "#9ca3af" },
  { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.22)", text: "#d1d5db" },
  { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.32)", text: "#e5e7eb" },
  { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.17)", text: "#a1a1aa" },
  { bg: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.27)", text: "#f3f4f6" },
  { bg: "rgba(255,255,255,0.14)", border: "rgba(255,255,255,0.37)", text: "#ffffff" },
];

const ENERGY_STATE_DEFAULTS: Record<string, { emoji: string }> = {
  INTRO: { emoji: "🎵" },
  VERSE: { emoji: "🎤" },
  CHORUS: { emoji: "🗣️" },
  MONTUNO: { emoji: "🔥" },
  MAMBO: { emoji: "🎺" },
  DESCARGA: { emoji: "🥁" },
  BREAK: { emoji: "🛑" },
  OUTRO: { emoji: "🏁" },
  DERECHO: { emoji: "🎸" },
  MAJAO: { emoji: "💥" }
};

export default function DevCalibrator({
  songData,
  originalSongData,
  calibratedSongData,
  setCalibratedSongData,
  setSongData,
  setOriginalSongData,
  currentTime,
  videoDuration,
  player,
  throttledSeek,
  userDelaySetting,
  onBackToCatalog,
  showToast,
  videoElement
}: DevCalibratorProps) {
  const [editorSections, setEditorSections] = useState<any[]>([]);
  const [tappedDownbeats, setTappedDownbeats] = useState<number[]>([]);
  const [tappedHistory, setTappedHistory] = useState<any[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [timelineLayers, setTimelineLayers] = useState({ sections: true, events: true, downbeats: true });

  const duration = videoDuration || 300;
  const timelineRef = useRef<HTMLDivElement>(null);
  const latestSongDataRef = useRef<any>(null);

  useEffect(() => {
    latestSongDataRef.current = calibratedSongData || songData;
  }, [calibratedSongData, songData]);

  useEffect(() => {
    if (!songData || duration <= 0) return;

    const activeSections = songData.sections || [];
    const sortedSections = [...activeSections].sort((a, b) => a.startTimeMs - b.startTimeMs);

    if (!songData.sections || songData.sections.length === 0) {
      const defaultSec = {
        id: "sec-default",
        label: "",
        energyState: "UNLABELED",
        startTimeMs: 0,
        endTimeMs: duration * 1000 || 300000
      };
      setEditorSections([defaultSec]);
      setTappedDownbeats([]);
      setTappedHistory([]);
    } else {
      setEditorSections(sortedSections);

      if (songData.downbeats && Array.isArray(songData.downbeats) && songData.downbeats.length > 0) {
        const latestSession = songData.downbeats[songData.downbeats.length - 1];
        const sortedTaps = [...(latestSession.rawDownbeats || latestSession.calibratedDownbeats || [])].sort((a, b) => a - b);
        setTappedDownbeats(sortedTaps);
      } else if (songData.consensusDownbeats && Array.isArray(songData.consensusDownbeats)) {
        const sortedTaps = [...songData.consensusDownbeats].sort((a, b) => a - b);
        setTappedDownbeats(sortedTaps);
      } else {
        setTappedDownbeats([]);
      }

      if (songData.downbeats && Array.isArray(songData.downbeats)) {
        setTappedHistory(songData.downbeats);
      } else {
        setTappedHistory([]);
      }
    }
  }, [songData, duration]);

  const autoSaveSongMap = (updatedData: any) => {
    setSaving(true);
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedData)
    })
    .then(r => r.json())
    .then(res => {
      setSaving(false);
      if (!res.success) {
        showToast("❌ Auto-save failed");
      }
    })
    .catch(err => {
      setSaving(false);
      showToast("❌ Auto-save failed");
    });
  };

  const syncSongMapState = (
    sections: any[],
    baseBpm?: number,
    downbeats?: any[],
    consensusDownbeats?: number[]
  ) => {
    const updated = {
      ...songData,
      sections,
      ...(baseBpm !== undefined ? { baseBpm } : {}),
      ...(downbeats !== undefined ? { downbeats } : {}),
      ...(consensusDownbeats !== undefined ? { consensusDownbeats } : {})
    };
    setCalibratedSongData(updated);
    setSongData(updated);
  };

  const updateBeatCalibration = (sectionsList: any[], downbeatsList: number[], triggerAutoSave = false) => {
    const sortedSections = [...sectionsList].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const sortedTaps = [...downbeatsList].sort((a, b) => a - b);

    if (sortedTaps.length === 0) {
      setEditorSections(sortedSections);
      const updated = {
        ...songData,
        sections: sortedSections,
        consensusDownbeats: [],
        downbeats: tappedHistory
      };
      syncSongMapState(sortedSections, songData.baseBpm || (songData.genre === "SALSA" ? 153.4 : 120.0), tappedHistory, []);
      if (triggerAutoSave) {
        autoSaveSongMap(updated);
      }
      return;
    }

    let calculatedBpm = songData.baseBpm || (songData.genre === "SALSA" ? 153.4 : 120.0);
    if (sortedTaps.length >= 2) {
      const referenceBpm = songData.baseBpm || (songData.genre === "SALSA" ? 153.4 : 120.0);
      const refDownbeatGap = 8.0 * (60000.0 / referenceBpm);
      const downbeatGaps: number[] = [];
      for (let i = 0; i < sortedTaps.length - 1; i++) {
        const diff = sortedTaps[i + 1] - sortedTaps[i];
        const gapCount = Math.max(1, Math.round(diff / refDownbeatGap));
        downbeatGaps.push(diff / gapCount);
      }
      if (downbeatGaps.length > 0) {
        const sortedDurs = [...downbeatGaps].sort((a, b) => a - b);
        const half = Math.floor(sortedDurs.length / 2);
        const medianDownbeatGap = sortedDurs.length % 2 !== 0
          ? sortedDurs[half]
          : (sortedDurs[half - 1] + sortedDurs[half]) / 2.0;
        if (medianDownbeatGap > 0) {
          const calcBpm = 480000.0 / medianDownbeatGap;
          calculatedBpm = Math.max(80, Math.min(240, Math.round(calcBpm * 100) / 100));
        }
      }
    }

    const beatIntervalMs = 60000.0 / calculatedBpm;
    const songEndMs = sortedSections.length > 0 ? sortedSections[sortedSections.length - 1].endTimeMs : (duration * 1000 || 300000);

    const firstTap = sortedTaps.find(t => t > 0);

    let snappedTaps: number[] = [];
    if (firstTap !== undefined) {
      const uniqueSnapped = new Set<number>();
      sortedTaps.forEach(t => {
        if (t <= 0) return;
        if (t >= songEndMs) return;
        const k = Math.round((t - firstTap) / (beatIntervalMs * 4));
        const snappedTime = Math.round(firstTap + k * (beatIntervalMs * 4));
        if (snappedTime > 0 && snappedTime < songEndMs) {
          uniqueSnapped.add(snappedTime);
        }
      });
      snappedTaps = Array.from(uniqueSnapped).sort((a, b) => a - b);
    }

    const finalCalibratedTaps = Array.from(new Set([0, ...snappedTaps].filter(t => t >= 0 && t <= songEndMs))).sort((a, b) => a - b);

    setEditorSections(sortedSections);

    const updated = {
      ...songData,
      sections: sortedSections,
      baseBpm: calculatedBpm,
      consensusDownbeats: finalCalibratedTaps,
      downbeats: tappedHistory
    };
    syncSongMapState(sortedSections, calculatedBpm, tappedHistory, finalCalibratedTaps);

    if (triggerAutoSave) {
      autoSaveSongMap(updated);
    }
  };

  const handleTap = () => {
    if (!player) return;
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    const tapTimeMs = Math.round((currentTime - (userDelaySetting / 1000)) * 1000);
    if (tapTimeMs < 0 || tapTimeMs > duration * 1000) return;

    const tooCloseToBoundary = editorSections.some(
      sec => Math.abs(sec.startTimeMs - tapTimeMs) < 200 || Math.abs(sec.endTimeMs - tapTimeMs) < 200
    );
    if (tooCloseToBoundary) {
      showToast("⚠️ Tap is too close to a section boundary.");
      return;
    }

    const currentBpm = songData.baseBpm || (songData.genre === "SALSA" ? 153.4 : 120.0);
    const beatIntervalMs = 60000.0 / currentBpm;
    const minTapGapMs = beatIntervalMs * 3.5;

    const tooCloseToTap = tappedDownbeats.some(t => Math.abs(t - tapTimeMs) < minTapGapMs);
    if (tooCloseToTap) {
      showToast("⚠️ Tap is too close to an existing tap.");
      return;
    }

    const updatedDownbeats = [...tappedDownbeats, tapTimeMs]
      .sort((a, b) => a - b);

    setTappedDownbeats(updatedDownbeats);
    updateBeatCalibration(editorSections, updatedDownbeats);
  };

  const handleClearTaps = () => {
    setTappedDownbeats([]);
    updateBeatCalibration(editorSections, []);
    showToast("🔄 Taps cleared.");
  };

  const handleUpdateSectionTimes = (id: string, field: "startTimeMs" | "endTimeMs", valueMs: number) => {
    const numericVal = Math.round(valueMs);
    const secIdx = editorSections.findIndex(s => s.id === id);
    if (secIdx === -1) return;

    const N = editorSections.length;
    if (N === 0) return;

    const B: number[] = [0];
    for (let i = 0; i < N; i++) {
      B.push(editorSections[i].endTimeMs);
    }

    const boundaryIdx = field === "startTimeMs" ? secIdx : secIdx + 1;
    if (boundaryIdx === 0) return;

    const minDurMs = 100;
    const maxDurationMs = Math.round(duration * 1000);
    const minLimit = boundaryIdx * minDurMs;
    const maxLimit = maxDurationMs - (N - boundaryIdx) * minDurMs;
    const clampedVal = Math.max(minLimit, Math.min(maxLimit, numericVal));

    B[boundaryIdx] = clampedVal;

    for (let k = boundaryIdx + 1; k < N; k++) {
      if (B[k] < B[k - 1] + minDurMs) {
        B[k] = B[k - 1] + minDurMs;
      }
    }

    const lastBeatTimeMs = songData.absoluteBeatMap && songData.absoluteBeatMap.length > 0
      ? songData.absoluteBeatMap[songData.absoluteBeatMap.length - 1]
      : maxDurationMs;
    B[N] = lastBeatTimeMs;

    for (let k = boundaryIdx - 1; k >= 1; k--) {
      if (B[k] > B[k + 1] - minDurMs) {
        B[k] = B[k + 1] - minDurMs;
      }
    }

    const updated = editorSections.map((sec, i) => ({
      ...sec,
      startTimeMs: B[i],
      endTimeMs: B[i + 1],
    }));

    updateBeatCalibration(updated, tappedDownbeats);
    throttledSeek(clampedVal / 1000, false);
  };

  const handleUpdateSectionField = (id: string, field: string, value: any) => {
    const updated = editorSections.map(s => {
      if (s.id === id) {
        if (field === "energyState") {
          const defaults = ENERGY_STATE_DEFAULTS[value] || { emoji: "🎵" };
          return { ...s, energyState: value, emoji: value === "UNLABELED" ? undefined : defaults.emoji };
        }
        return { ...s, [field]: value };
      }
      return s;
    });
    setEditorSections(updated);
    syncSongMapState(updated, songData.baseBpm, tappedHistory, tappedDownbeats);
  };

  const handleAddNewSection = () => {
    const playheadMs = Math.round(currentTime * 1000);
    const targetIdx = editorSections.findIndex(
      s => playheadMs > s.startTimeMs && playheadMs < s.endTimeMs
    );

    if (targetIdx !== -1) {
      const target = editorSections[targetIdx];
      if (playheadMs - target.startTimeMs < 100 || target.endTimeMs - playheadMs < 100) {
        showToast("⚠️ Slice is too close to an existing boundary.");
        return;
      }

      const newSec = {
        id: crypto.randomUUID(),
        label: "",
        energyState: "UNLABELED",
        startTimeMs: playheadMs,
        endTimeMs: target.endTimeMs
      };

      const updated = [...editorSections];
      updated[targetIdx] = { ...target, endTimeMs: playheadMs };
      updated.splice(targetIdx + 1, 0, newSec);

      updateBeatCalibration(updated, tappedDownbeats, true);
      setFocusedSectionId(newSec.id);
      throttledSeek(newSec.startTimeMs / 1000, true);
      showToast("✂️ Sliced section at playhead.");
    } else {
      showToast("⚠️ Playhead is outside defined sections.");
    }
  };

  const handleDeleteSection = (id: string) => {
    if (editorSections.length <= 1) {
      showToast("⚠️ Cannot delete the only section.");
      return;
    }
    const idx = editorSections.findIndex(s => s.id === id);
    const updated = [...editorSections];

    if (idx > 0) {
      updated[idx - 1] = { ...updated[idx - 1], endTimeMs: updated[idx].endTimeMs };
    } else {
      updated[1] = { ...updated[1], startTimeMs: 0 };
    }

    updated.splice(idx, 1);
    updateBeatCalibration(updated, tappedDownbeats, true);
    if (focusedSectionId === id) setFocusedSectionId(updated[Math.max(0, idx - 1)]?.id ?? null);
    showToast("🗑️ Section removed.");
  };

  const handleAddEvent = (draft: DanceEventDraft) => {
    const result = addDanceEvent(latestSongDataRef.current?.events || [], draft, duration * 1000);
    if (result.error) {
      showToast(`⚠️ ${result.error}`);
      return false;
    }
    const updated = { ...latestSongDataRef.current, events: result.events };
    setCalibratedSongData(updated);
    setSongData(updated);
    showToast("Event added.");
    return true;
  };

  const handleRemoveEvent = (eventIndex: number) => {
    const events = removeDanceEvent(latestSongDataRef.current?.events || [], eventIndex);
    const updated = { ...latestSongDataRef.current, events };
    setCalibratedSongData(updated);
    setSongData(updated);
    showToast("Event removed.");
  };

  const handleSaveEvents = () => {
    const updated = {
      ...latestSongDataRef.current,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    autoSaveSongMap(updated);
    showToast("Events saved.");
  };

  const handleSaveTaps = () => {
    let updatedHistory = [...tappedHistory];
    const exists = updatedHistory.some(session => 
      session.rawDownbeats.length === tappedDownbeats.length && 
      session.rawDownbeats.every((val: number, index: number) => val === tappedDownbeats[index])
    );
    const currentCalibratedTaps = latestSongDataRef.current?.consensusDownbeats || [];
    if (!exists && tappedDownbeats.length > 0) {
      updatedHistory.push({
        rawDownbeats: tappedDownbeats,
        calibratedDownbeats: currentCalibratedTaps,
        tappedAt: new Date().toISOString()
      });
      setTappedHistory(updatedHistory);
    }

    const updated = {
      ...latestSongDataRef.current,
      consensusDownbeats: currentCalibratedTaps,
      downbeats: updatedHistory,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    
    setSaving(true);
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    })
    .then(r => r.json())
    .then(res => {
      setSaving(false);
      if (res.success) {
        showToast("💾 Taps saved.");
      } else {
        throw new Error(res.error || "Save failed");
      }
    })
    .catch(err => {
      setSaving(false);
      showToast("❌ Failed to save taps: " + err.message);
    });
  };

  const handleConsolidateTaps = () => {
    const allAttempts = tappedHistory.map(h => h.rawDownbeats);
    if (tappedDownbeats.length > 0) {
      allAttempts.push(tappedDownbeats);
    }
    if (allAttempts.length === 0) return;
    const allTaps = allAttempts.flat().sort((a, b) => a - b);
    const groups: number[][] = [];
    allTaps.forEach(tap => {
      let placed = false;
      for (const group of groups) {
        const avg = group.reduce((sum, v) => sum + v, 0) / group.length;
        if (Math.abs(tap - avg) < 600) {
          group.push(tap);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push([tap]);
      }
    });
    const consensusTaps = groups.map(group => {
      const sorted = [...group].sort((a, b) => a - b);
      const half = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[half]
        : Math.round((sorted[half - 1] + sorted[half]) / 2.0);
    }).sort((a, b) => a - b);
    setTappedDownbeats(consensusTaps);
    updateBeatCalibration(editorSections, consensusTaps);
    showToast("Consolidated tap history using median consensus!");
  };

  const handlePublishSong = () => {
    const updated = {
      ...latestSongDataRef.current,
      status: "READY"
    };
    const validation = StrictSongMapSchema.safeParse(updated);
    if (!validation.success) {
      setValidationErrors(validation.error.issues);
      showToast("Publish blocked by validation errors.");
      return;
    }
    setValidationErrors(null);
    setCalibratedSongData(updated);
    setSongData(updated);
    
    setSaving(true);
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    })
    .then(r => r.json())
    .then(res => {
      setSaving(false);
      if (res.success) {
        showToast("🎉 Song published successfully! Now visible in catalog.");
      } else {
        throw new Error(res.error || "Save failed");
      }
    })
    .catch(err => {
      setSaving(false);
      showToast("❌ Publish failed: " + err.message);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (player) {
          try {
            const state = player.getPlayerState?.();
            if (state === 1) player.pauseVideo(); else player.playVideo();
          } catch (err) { console.warn(err); }
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        throttledSeek(Math.max(0, currentTime - step), true);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        throttledSeek(Math.min(duration, currentTime + step), true);
        return;
      }

      if (e.key === "m" || e.key === "M" || e.key === "Enter" || e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (activeTab === 1) {
          handleAddNewSection();
        }
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        if (activeTab === 3) {
          handleTap();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, editorSections, tappedDownbeats, player, duration, activeTab]);

  const seekTimelineFromClientX = (clientX: number, immediate: boolean) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    throttledSeek(ratio * duration, immediate);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seekTimelineFromClientX(e.clientX, true);
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    seekTimelineFromClientX(e.clientX, false);
    const handleMouseMove = (moveEvt: MouseEvent) => {
      seekTimelineFromClientX(moveEvt.clientX, false);
    };
    const handleMouseUp = (upEvt: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      seekTimelineFromClientX(upEvt.clientX, true);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="glass-panel dev-calibrator-workbench" style={{
      display: "flex",
      flexDirection: "column",
      gap: "24px",
      padding: "24px",
      width: "100%",
      border: "1px solid #27272a",
      background: "rgba(9,9,11,0.85)",
      backdropFilter: "blur(12px)",
      borderRadius: "20px"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fff" }}>
            Song Calibration Workbench
          </span>
          <span style={{
            fontSize: "0.7rem",
            fontWeight: "bold",
            padding: "2px 8px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.08)",
            color: "#a1a1aa"
          }}>
            Status: {songData?.status || "DRAFT"}
          </span>
          {saving && (
            <span style={{ fontSize: "0.75rem", color: "#34d399", display: "flex", alignItems: "center", gap: "4px" }}>
              💾 Saving...
            </span>
          )}
        </div>
      </div>

      <div style={{
        display: "flex",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        paddingBottom: "8px",
        gap: "16px"
      }}>
        {["Sections", "Events", "Downbeat Tapping", "Labels"].map((tabName, idx) => {
          const tabNum = idx + 1;
          const isActive = activeTab === tabNum;
          
          return (
            <button
              key={tabNum}
              onClick={() => setActiveTab(tabNum)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #ffffff" : "2px solid transparent",
                color: isActive ? "#ffffff" : "#9ca3af",
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              {tabName}
            </button>
          );
        })}
      </div>

      {activeTab === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "800px", width: "100%", margin: "0 auto" }}>
          <EventAnnotationPanel
            currentTime={currentTime}
            events={songData?.events || []}
            onAddEvent={handleAddEvent}
            onRemoveEvent={handleRemoveEvent}
            disabled={false}
          />
          <button onClick={handleSaveEvents} disabled={saving} style={{ padding: "9px", border: "none", borderRadius: "8px", fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving..." : "Save Events"}
          </button>
        </div>
      )}

      {activeTab === 3 && (
        <div className={tapFlash ? "active-flash" : ""} style={{
          padding: "20px 16px",
          background: "rgba(255,255,255,0.02)",
          border: `2px solid ${tapFlash ? "#ffffff" : "#27272a"}`,
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          alignItems: "center",
          boxShadow: tapFlash ? "0 0 36px rgba(255,255,255,0.35)" : "none",
          transition: "all 0.08s ease"
        }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            🎧 Downbeat Tap Deck
          </div>

          <button
            onClick={handleTap}
            style={{
              width: "100%",
              height: "90px",
              borderRadius: "14px",
              border: `2px solid ${tapFlash ? "#ffffff" : "#3f3f46"}`,
              background: tapFlash ? "#ffffff" : "rgba(255,255,255,0.04)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px"
            }}
          >
            <span style={{ fontSize: "1.35rem", fontWeight: 900, color: tapFlash ? "#000" : "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>
              TAP ON "1"
            </span>
            <span style={{ fontSize: "0.68rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#71717a" }}>
              Click or press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 3px" }}>T</kbd>
            </span>
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.75rem", color: "#d1d5db", alignItems: "center" }}>
            <span>
              Taps logged: <strong style={{ color: "#ffffff" }}>{tappedDownbeats.length}</strong>
              {tappedHistory.length > 0 && ` (${tappedHistory.length} attempts in history)`}
            </span>
            
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {tappedHistory.length > 0 && (
                <button
                  onClick={handleConsolidateTaps}
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid #27272a",
                    color: "#ffffff",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                >
                  Merge History 🤝
                </button>
              )}

              {tappedDownbeats.length > 0 && (
                <button
                  onClick={handleClearTaps}
                  style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <RotateCcw size={11} /> Clear Taps
                </button>
              )}
              
              <button
                onClick={handleSaveTaps}
                disabled={saving}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #ffffff, #d1d5db)",
                  border: "none",
                  color: "#000",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? "Saving Taps..." : "Save Taps 💾"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dev-widescreen-top-row" style={{
        gridTemplateColumns: activeTab === 1 || activeTab === 4 ? "1.15fr 0.85fr" : "1fr"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: activeTab === 1 || activeTab === 4 ? "100%" : "800px", margin: activeTab === 1 || activeTab === 4 ? "0" : "0 auto", width: "100%" }}>
          {videoElement}
        </div>

        {(activeTab === 1 || activeTab === 4) && (
          <DevCalibrationPanel
            songData={songData}
            editorSections={editorSections}
            onExit={onBackToCatalog}
            onUpdateSectionField={handleUpdateSectionField}
            validationErrors={validationErrors}
            saving={saving}
            onPublishSong={handlePublishSong}
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Song Timeline Editing Console
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {Object.entries(timelineLayers).map(([layer, visible]) => (
              <button
                key={layer}
                onClick={() => setTimelineLayers(current => ({ ...current, [layer]: !visible }))}
                style={{ fontSize: "0.65rem", padding: "3px 7px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: visible ? "#fff" : "transparent", color: visible ? "#000" : "#71717a", cursor: "pointer", textTransform: "capitalize" }}
              >
                {layer}
              </button>
            ))}
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#ffffff", fontWeight: 600 }}>
              {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
            </span>
            {activeTab === 1 && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleAddNewSection}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid #27272a",
                    color: "#ffffff",
                    padding: "4px 12px",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                >
                  <Scissors size={12} /> Slice Here
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ position: "relative", padding: "8px 0" }}>
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            style={{
              position: "relative",
              height: "48px",
              borderRadius: "10px",
              background: "#0c0c0e",
              cursor: "crosshair",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "visible"
            }}
          >
            <div style={{ position: "absolute", inset: 0, borderRadius: "9px", overflow: "hidden" }}>
              {timelineLayers.sections && editorSections.map((sec, idx) => {
                const startSec = sec.startTimeMs / 1000;
                const endSec = sec.endTimeMs / 1000;
                const widthPct = ((endSec - startSec) / duration) * 100;
                const leftPct = (startSec / duration) * 100;
                const color = SECTION_PALETTE[idx % SECTION_PALETTE.length];
                const isActive = sec.id === focusedSectionId;
                const showSimpleLabel = activeTab !== 4;
                const labelText = showSimpleLabel || !sec.label ? `Section ${idx + 1}` : `${sec.emoji || ""} ${sec.label}`;

                return (
                  <div
                    key={sec.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedSectionId(sec.id);
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      background: color.bg,
                      borderRight: `1px solid ${color.border}`,
                      outline: isActive ? "2px solid #ffffff" : "none",
                      outlineOffset: "-2px",
                      zIndex: isActive ? 5 : 1,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      overflow: "hidden",
                      cursor: "pointer"
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: color.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {labelText}
                    </span>
                  </div>
                );
              })}

              {timelineLayers.events && (songData?.events || []).map((event: any, index: number) => {
                const leftPct = (event.timestampMs / (duration * 1000)) * 100;
                const widthPct = event.durationMs ? (event.durationMs / (duration * 1000)) * 100 : 0;
                return (
                  <div key={`event-${index}-${event.timestampMs}`} title={`${event.type}: ${event.description}`} style={{ position: "absolute", top: "6px", bottom: "6px", left: `${leftPct}%`, width: event.durationMs ? `${Math.max(widthPct, 0.3)}%` : "3px", borderRadius: "3px", background: event.uiHighlight ? "#f59e0b" : "#a1a1aa", zIndex: 7, pointerEvents: "none" }} />
                );
              })}

              {timelineLayers.downbeats && (activeTab === 3 ? tappedDownbeats : (songData?.consensusDownbeats || [])).map((downbeat: number, index: number) => (
                <div key={`downbeat-${index}-${downbeat}`} style={{ position: "absolute", top: "12px", bottom: "12px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "1px", background: "#60a5fa", opacity: 0.8, zIndex: 6, pointerEvents: "none" }} />
              ))}

              <div style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${playheadPct}%`,
                width: "2px",
                background: "#ffffff",
                zIndex: 10,
                pointerEvents: "auto",
                cursor: "ew-resize",
                boxShadow: "0 0 10px rgba(255,255,255,0.8)"
              }} onMouseDown={handlePlayheadMouseDown}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "10px", height: "10px", background: "#ffffff", borderRadius: "50%" }} />
                <div style={{ position: "absolute", top: "-8px", bottom: "-8px", left: "50%", width: "18px", transform: "translateX(-50%)" }} />
              </div>
            </div>

            {editorSections.map((sec, idx) => {
              if (idx === editorSections.length - 1) return null;
              const leftPct = ((sec.endTimeMs / 1000) / duration) * 100;

              return (
                <div
                  key={`handle-${sec.id}`}
                  onMouseDown={(e) => {
                    if (activeTab !== 1) return;
                    e.stopPropagation();
                    e.preventDefault();
                    const handleMouseMove = (moveEvt: MouseEvent) => {
                      if (!timelineRef.current) return;
                      const rect = timelineRef.current.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
                      handleUpdateSectionTimes(sec.id, "endTimeMs", ratio * duration * 1000);
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                      autoSaveSongMap(latestSongDataRef.current);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    top: "-8px",
                    width: "12px",
                    height: "64px",
                    transform: "translateX(-50%)",
                    cursor: activeTab === 1 ? "col-resize" : "not-allowed",
                    zIndex: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <div style={{ width: "3px", height: "100%", borderRadius: "1.5px", background: "rgba(255,255,255,0.4)" }} />
                  {activeTab === 1 && (
                    <div style={{ position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "#ffffff", border: "1.5px solid #27272a" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {editorSections.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginTop: "2px", flexWrap: "wrap" }}>
            {editorSections.map((sec, idx) => {
               const color = SECTION_PALETTE[idx % SECTION_PALETTE.length];
               const isActive = sec.id === focusedSectionId;
               const showSimpleLabel = activeTab !== 4;
               const labelText = showSimpleLabel || !sec.label ? `Section ${idx + 1}` : `${sec.emoji || ""} ${sec.label}`;
               return (
                 <button
                   key={sec.id}
                   onClick={() => {
                     setFocusedSectionId(isActive ? null : sec.id);
                     if (!isActive) throttledSeek(sec.startTimeMs / 1000, true);
                   }}
                   style={{
                     fontSize: "0.68rem",
                     fontWeight: 700,
                     padding: "3px 10px",
                     borderRadius: "20px",
                     background: isActive ? "#ffffff" : "rgba(255,255,255,0.04)",
                     border: `1px solid ${isActive ? "#ffffff" : "rgba(255,255,255,0.08)"}`,
                     color: isActive ? "#000000" : "#9ca3af",
                     cursor: "pointer"
                   }}
                 >
                   {labelText}
                 </button>
               );
            })}
          </div>
        )}

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginTop: "8px",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "10px",
          fontSize: "0.72rem",
          color: "#a1a1aa",
          flexWrap: "wrap"
        }}>
          <span style={{ fontWeight: "bold", color: "#ffffff" }}>⌨️ Navigation Guide:</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>Space</kbd> Play/Pause</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>← / →</kbd> Nudge 100ms</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>Shift + ← / →</kbd> Nudge 1.0s</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>C</kbd> Slice Section</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>T</kbd> Tap Downbeat</span>
        </div>
      </div>
    </div>
  );
}
