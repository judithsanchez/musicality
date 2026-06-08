import React, { useState, useEffect, useRef } from "react";
import { Scissors, Play, Pause, RotateCcw } from "lucide-react";
import DevCalibrationPanel from "./DevCalibrationPanel";
import { StrictSongMapSchema } from "../types/schemas";

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

const SECTION_PALETTE = [
  { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)", text: "#9ca3af" },
  { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.22)", text: "#d1d5db" },
  { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.32)", text: "#e5e7eb" },
  { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.17)", text: "#a1a1aa" },
  { bg: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.27)", text: "#f3f4f6" },
  { bg: "rgba(255,255,255,0.14)", border: "rgba(255,255,255,0.37)", text: "#ffffff" },
];

const ENERGY_STATE_DEFAULTS: Record<string, { label: string; emoji: string }> = {
  INTRO: { label: "Intro", emoji: "🎵" },
  VERSE: { label: "Verse", emoji: "🎤" },
  CHORUS: { label: "Chorus", emoji: "🗣️" },
  MONTUNO: { label: "Montuno", emoji: "🔥" },
  MAMBO: { label: "Mambo", emoji: "🎺" },
  DESCARGA: { label: "Descarga", emoji: "🥁" },
  BREAK: { label: "Break", emoji: "🛑" },
  OUTRO: { label: "Outro", emoji: "🏁" },
  DERECHO: { label: "Derecho", emoji: "🎸" },
  MAJAO: { label: "Majao", emoji: "💥" }
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
  setUserDelaySetting,
  onBackToCatalog,
  showToast,
  videoElement
}: DevCalibratorProps) {
  const [editorSections, setEditorSections] = useState<any[]>([]);
  const [phrases, setPhrases] = useState<any[]>([]);
  const [tappedDownbeats, setTappedDownbeats] = useState<number[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);

  const duration = videoDuration || 300;
  const timelineRef = useRef<HTMLDivElement>(null);
  const latestSongDataRef = useRef<any>(null);

  useEffect(() => {
    latestSongDataRef.current = calibratedSongData || songData;
  }, [calibratedSongData, songData]);

  useEffect(() => {
    const status = songData?.status || "DRAFT_CUTTING";
    if (status === "DRAFT_CUTTING") {
      setActiveTab(1);
    } else if (status === "DRAFT_TAPPING") {
      setActiveTab(2);
    } else {
      setActiveTab(3);
    }
  }, [songData?.status]);

  useEffect(() => {
    if (!songData || duration <= 0) return;

    const activeSections = songData.sections || [];
    const sortedSections = [...activeSections].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const activePhrases = songData.phrases || [];

    if (sortedSections.length === 0) {
      const isSalsa = songData.genre === "SALSA";
      const defaultSec = {
        id: "sec-default",
        startTimeMs: 0,
        endTimeMs: Math.round(duration * 1000),
        label: isSalsa ? "Verse" : "Derecho",
        energyState: isSalsa ? "VERSE" : "DERECHO",
        phraseIds: [],
        emoji: isSalsa ? "🎤" : "🎸"
      };
      setEditorSections([defaultSec]);
      setPhrases([]);
      setTappedDownbeats([]);
    } else {
      setEditorSections(sortedSections);
      setPhrases(activePhrases);

      if (songData.rawTaps && Array.isArray(songData.rawTaps)) {
        const sortedTaps = [...songData.rawTaps].sort((a, b) => a - b);
        setTappedDownbeats(sortedTaps);
        if (activePhrases.length === 0) {
          repartitionAllPhrases(sortedSections, sortedTaps);
        }
      } else {
        const restoredDownbeats: number[] = [];
        activePhrases.forEach((ph: any) => {
          const startsAtSectionBoundary = sortedSections.some(s => s.startTimeMs === ph.startTimeMs);
          if (!startsAtSectionBoundary) {
            restoredDownbeats.push(ph.startTimeMs);
          }
        });
        setTappedDownbeats(restoredDownbeats);
      }
    }
  }, [songData, duration]);

  const autoSaveSongMap = (updatedData: any) => {
    setSaving(true);
    const { absoluteBeatMap, ...saveData } = updatedData;
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveData)
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

  const syncSongMapState = (sections: any[], phrasesList: any[], absoluteBeatMap: number[], baseBpm?: number, rawTaps?: number[]) => {
    const updated = {
      ...songData,
      sections,
      phrases: phrasesList,
      absoluteBeatMap,
      ...(baseBpm !== undefined ? { baseBpm } : {}),
      ...(rawTaps !== undefined ? { rawTaps } : {})
    };
    setCalibratedSongData(updated);
    setSongData(updated);
  };

  const repartitionAllPhrases = (sectionsList: any[], downbeatsList: number[], triggerAutoSave = false) => {
    const sortedSections = [...sectionsList].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const sortedTaps = [...downbeatsList].sort((a, b) => a - b);

    let calculatedBpm = songData.baseBpm;
    if (sortedTaps.length >= 2) {
      const initialRefBpm = songData.genre === "SALSA" ? 150.0 : 120.0;
      const defaultInterval = 60000.0 / initialRefBpm;
      const phrase4Interval = defaultInterval * 4;

      let totalBeats = 0;
      for (let i = 0; i < sortedTaps.length - 1; i++) {
        const diff = sortedTaps[i + 1] - sortedTaps[i];
        const units = Math.max(1, Math.round(diff / phrase4Interval));
        totalBeats += units * 4;
      }

      if (totalBeats > 0) {
        const totalDuration = sortedTaps[sortedTaps.length - 1] - sortedTaps[0];
        const calcBpm = 60000.0 / (totalDuration / totalBeats);
        calculatedBpm = Math.max(80, Math.min(240, Math.round(calcBpm * 100) / 100));
      }
    }

    const beatIntervalMs = 60000.0 / calculatedBpm;
    const allPhrases: any[] = [];
    const allBeatTimes: number[] = [];

    const claveProps = songData.genre === "SALSA" ? {
      claveDirection: "NOT_SET",
      claveIsVerified: false,
      claveSource: "DEFAULT"
    } : {};

    const updatedSections = sortedSections.map(sec => {
      const secTaps = sortedTaps.filter(t => t > sec.startTimeMs && t < sec.endTimeMs);
      const anchors = [sec.startTimeMs, ...secTaps, sec.endTimeMs];
      const phraseIds: string[] = [];

      for (let i = 0; i < anchors.length - 1; i++) {
        const tStart = anchors[i];
        const tEnd = anchors[i + 1];
        const gapDur = tEnd - tStart;
        if (gapDur <= 0) continue;

        const N = Math.max(1, Math.round(gapDur / beatIntervalMs));
        const delta = gapDur / N;

        const phraseLengths: number[] = [];
        let rem = N;
        while (rem >= 8) {
          phraseLengths.push(8);
          rem -= 8;
        }
        if (rem >= 4) {
          phraseLengths.push(4);
          rem -= 4;
        }
        if (rem > 0) {
          phraseLengths.push(rem);
        }

        let currentGapBeatIdx = 0;
        for (let pIdx = 0; pIdx < phraseLengths.length; pIdx++) {
          const length = phraseLengths[pIdx];
          const pStartBeatIdx = currentGapBeatIdx;
          const pEndBeatIdx = currentGapBeatIdx + length;

          const phraseStartMs = Math.round(tStart + pStartBeatIdx * delta);
          const phraseEndMs = pIdx === phraseLengths.length - 1 ? tEnd : Math.round(tStart + pEndBeatIdx * delta);

          const calibratedBeats = [];
          for (let k = 0; k < length; k++) {
            const beatTime = Math.round(tStart + (pStartBeatIdx + k) * delta);
            calibratedBeats.push({
              count: k + 1,
              timestampMs: beatTime
            });
            allBeatTimes.push(beatTime);
          }

          let type = "STANDARD_8_COUNT";
          if (length === 8) {
            type = "STANDARD_8_COUNT";
          } else if (length === 4) {
            type = "HALF_PHRASE_4_COUNT";
          } else {
            type = "TRANSITION_BREAK";
          }

          const phraseId = crypto.randomUUID();
          phraseIds.push(phraseId);

          allPhrases.push({
            id: phraseId,
            index: 0,
            startTimeMs: phraseStartMs,
            endTimeMs: phraseEndMs,
            type,
            genre: songData.genre,
            calibratedBeats,
            events: [],
            ...claveProps
          });

          currentGapBeatIdx = pEndBeatIdx;
        }
      }

      return {
        ...sec,
        phraseIds
      };
    });

    if (updatedSections.length > 0) {
      const lastSec = updatedSections[updatedSections.length - 1];
      allBeatTimes.push(lastSec.endTimeMs);
    }

    allPhrases.forEach((ph, idx) => {
      ph.index = idx + 1;
    });

    setEditorSections(updatedSections);
    setPhrases(allPhrases);

    const updated = {
      ...songData,
      sections: updatedSections,
      phrases: allPhrases,
      absoluteBeatMap: allBeatTimes,
      baseBpm: calculatedBpm,
      rawTaps: sortedTaps
    };
    syncSongMapState(updatedSections, allPhrases, allBeatTimes, calculatedBpm, sortedTaps);

    if (triggerAutoSave && songData.status === "DRAFT_CUTTING") {
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

    const tooCloseToTap = tappedDownbeats.some(t => Math.abs(t - tapTimeMs) < 300);
    if (tooCloseToTap) {
      showToast("⚠️ Tap is too close to an existing tap.");
      return;
    }

    const updatedDownbeats = [...tappedDownbeats, tapTimeMs]
      .sort((a, b) => a - b);

    setTappedDownbeats(updatedDownbeats);
    repartitionAllPhrases(editorSections, updatedDownbeats);
  };

  const handleClearTaps = () => {
    setTappedDownbeats([]);
    repartitionAllPhrases(editorSections, []);
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

    repartitionAllPhrases(updated, tappedDownbeats);
    throttledSeek(clampedVal / 1000, false);
  };

  const handleUpdateSectionField = (id: string, field: string, value: any) => {
    const updated = editorSections.map(s => {
      if (s.id === id) {
        if (field === "energyState") {
          const defaults = ENERGY_STATE_DEFAULTS[value] || { label: value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(), emoji: "🎵" };
          return { ...s, energyState: value, label: defaults.label, emoji: defaults.emoji };
        }
        return { ...s, [field]: value };
      }
      return s;
    });
    setEditorSections(updated);
    syncSongMapState(updated, phrases, songData.absoluteBeatMap, songData.baseBpm, tappedDownbeats);
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

      const isSalsa = songData.genre === "SALSA";
      const newSec = {
        id: crypto.randomUUID(),
        label: isSalsa ? "Verse" : "Derecho",
        emoji: isSalsa ? "🎤" : "🎸",
        energyState: isSalsa ? "VERSE" : "DERECHO",
        startTimeMs: playheadMs,
        endTimeMs: target.endTimeMs,
        phraseIds: []
      };

      const updated = [...editorSections];
      updated[targetIdx] = { ...target, endTimeMs: playheadMs };
      updated.splice(targetIdx + 1, 0, newSec);

      repartitionAllPhrases(updated, tappedDownbeats, true);
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
    repartitionAllPhrases(updated, tappedDownbeats, true);
    if (focusedSectionId === id) setFocusedSectionId(updated[Math.max(0, idx - 1)]?.id ?? null);
    showToast("🗑️ Section removed.");
  };

  const handleUpdatePhraseField = (phraseId: string, value: any) => {
    const updatedPhrases = phrases.map(p => {
      if (p.id === phraseId) {
        return {
          ...p,
          claveDirection: value,
          claveIsVerified: true,
          claveSource: "MANUAL"
        };
      }
      return p;
    });
    setPhrases(updatedPhrases);
    syncSongMapState(editorSections, updatedPhrases, songData.absoluteBeatMap, songData.baseBpm, tappedDownbeats);
  };

  const handleLockSections = () => {
    const updated = {
      ...latestSongDataRef.current,
      status: "DRAFT_TAPPING"
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    autoSaveSongMap(updated);
    setActiveTab(2);
    showToast("🔒 Sections locked! Downbeat tapping unlocked.");
  };

  const handleSaveTaps = () => {
    const updated = {
      ...latestSongDataRef.current,
      status: "DRAFT_LABELING"
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    
    setSaving(true);
    const { absoluteBeatMap, ...saveData } = updated;
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveData)
    })
    .then(r => r.json())
    .then(res => {
      setSaving(false);
      if (res.success) {
        showToast("💾 Taps saved! Labeling phase unlocked.");
        setActiveTab(3);
      } else {
        throw new Error(res.error || "Save failed");
      }
    })
    .catch(err => {
      setSaving(false);
      showToast("❌ Failed to save taps: " + err.message);
    });
  };

  const handlePublishSong = () => {
    const updated = {
      ...latestSongDataRef.current,
      status: "READY"
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    
    setSaving(true);
    const { absoluteBeatMap, ...saveData } = updated;
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveData)
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

  const handleUnlockSlicing = () => {
    const updated = {
      ...latestSongDataRef.current,
      status: "DRAFT_CUTTING"
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    autoSaveSongMap(updated);
    showToast("🔓 Slicing unlocked! Work preserved.");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        if (activeTab === 1 && songData?.status === "DRAFT_CUTTING") {
          handleAddNewSection();
        }
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        if (activeTab === 2 && songData?.status === "DRAFT_TAPPING") {
          handleTap();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, editorSections, tappedDownbeats, player, duration, activeTab, songData?.status]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    throttledSeek(ratio * duration, true);
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
            Status: {songData?.status || "DRAFT_CUTTING"}
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
        {["1. Timeline Slicing", "2. Downbeat Tapping", "3. Details & Labeling"].map((tabName, idx) => {
          const tabNum = idx + 1;
          const status = songData?.status || "DRAFT_CUTTING";
          
          let disabled = false;
          if (tabNum === 2 && status === "DRAFT_CUTTING") disabled = true;
          if (tabNum === 3 && (status === "DRAFT_CUTTING" || status === "DRAFT_TAPPING")) disabled = true;
          
          const isActive = activeTab === tabNum;
          
          return (
            <button
              key={tabNum}
              disabled={disabled}
              onClick={() => setActiveTab(tabNum)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #ffffff" : "2px solid transparent",
                color: disabled ? "#4b5563" : (isActive ? "#ffffff" : "#9ca3af"),
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: "bold",
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.2s ease"
              }}
            >
              {tabName}
            </button>
          );
        })}
      </div>

      {activeTab === 2 && (
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
            <span>Taps logged: <strong style={{ color: "#ffffff" }}>{tappedDownbeats.length}</strong></span>
            
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
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
                disabled={phrases.length === 0 || saving}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #ffffff, #d1d5db)",
                  border: "none",
                  color: "#000",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  cursor: (phrases.length === 0 || saving) ? "not-allowed" : "pointer",
                  opacity: (phrases.length === 0 || saving) ? 0.6 : 1
                }}
              >
                {saving ? "Saving Taps..." : "Save Taps 💾"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dev-widescreen-top-row" style={{
        gridTemplateColumns: (activeTab === 1 || activeTab === 2) ? "1fr" : "1.15fr 0.85fr"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: (activeTab === 1 || activeTab === 2) ? "800px" : "100%", margin: (activeTab === 1 || activeTab === 2) ? "0 auto" : "0", width: "100%" }}>
          {videoElement}
        </div>

        {activeTab === 3 && (
          <DevCalibrationPanel
            songData={songData}
            editorSections={editorSections}
            phrases={phrases}
            userDelaySetting={userDelaySetting}
            onUserDelaySettingChange={setUserDelaySetting}
            onExit={onBackToCatalog}
            onUpdateSectionField={handleUpdateSectionField}
            onUpdatePhraseField={handleUpdatePhraseField}
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
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#ffffff", fontWeight: 600 }}>
              {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
            </span>
            {activeTab === 1 && (
              songData?.status === "DRAFT_CUTTING" ? (
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
                  <button
                    onClick={handleLockSections}
                    disabled={saving}
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      background: "linear-gradient(135deg, #ffffff, #d1d5db)",
                      border: "none",
                      color: "#000",
                      padding: "4px 12px",
                      borderRadius: "6px",
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    {saving ? "Locking..." : "Lock Sections & Proceed 🔒"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleUnlockSlicing}
                  disabled={saving}
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    background: "linear-gradient(135deg, #ffffff, #d1d5db)",
                    border: "1px solid #27272a",
                    color: "#000",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  {saving ? "Unlocking..." : "Unlock Slicing 🔓"}
                </button>
              )
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
              {editorSections.map((sec, idx) => {
                const startSec = sec.startTimeMs / 1000;
                const endSec = sec.endTimeMs / 1000;
                const widthPct = ((endSec - startSec) / duration) * 100;
                const leftPct = (startSec / duration) * 100;
                const color = SECTION_PALETTE[idx % SECTION_PALETTE.length];
                const isActive = sec.id === focusedSectionId;
                const showSimpleLabel = activeTab === 1 || activeTab === 2;
                const labelText = showSimpleLabel ? String(idx + 1) : `${sec.emoji || "🎵"} ${sec.label}`;

                return (
                  <div
                    key={sec.id}
                    onClick={() => {
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

              <div style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${playheadPct}%`,
                width: "2px",
                background: "#ffffff",
                zIndex: 10,
                pointerEvents: "none",
                boxShadow: "0 0 10px rgba(255,255,255,0.8)"
              }}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "10px", height: "10px", background: "#ffffff", borderRadius: "50%" }} />
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
                      if (latestSongDataRef.current?.status === "DRAFT_CUTTING") {
                        autoSaveSongMap(latestSongDataRef.current);
                      }
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
               const showSimpleLabel = activeTab === 1 || activeTab === 2;
               const labelText = showSimpleLabel ? String(idx + 1) : `${sec.emoji || "🎵"} ${sec.label}`;
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
