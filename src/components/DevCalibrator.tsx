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

const PULSE_VISUAL_COMPENSATION_MS = 90;
const TAKE_LABELS = ["Take 1", "Take 2", "Take 3"];
const PHRASE_BEATS = 8;

const emptyTapCalibrationTakes = () => TAKE_LABELS.map((label, index) => ({
  id: `take-${index + 1}`,
  label,
  createdAt: "",
  tapsMs: []
}));

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
  const [tapCalibrationTakes, setTapCalibrationTakes] = useState<any[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [timelineLayers, setTimelineLayers] = useState({ sections: true, events: true, calibrated: true, proposal: true, take1: true, take2: true, take3: true });
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);
  const [liveTime, setLiveTime] = useState(0);
  const [liveIsPlaying, setLiveIsPlaying] = useState(false);

  const duration = videoDuration || 300;
  const timelineRef = useRef<HTMLDivElement>(null);
  const latestSongDataRef = useRef<any>(null);

  useEffect(() => {
    latestSongDataRef.current = calibratedSongData || songData;
  }, [calibratedSongData, songData]);

  useEffect(() => {
    let frameId: number;
    const updateLiveTime = () => {
      let nextTime = currentTime;
      try {
        if (player && typeof player.getCurrentTime === "function") {
          nextTime = player.getCurrentTime() || currentTime;
          setLiveIsPlaying(typeof player.getPlayerState === "function" ? player.getPlayerState() === 1 : false);
        } else {
          setLiveIsPlaying(false);
        }
      } catch {
        setLiveIsPlaying(false);
      }
      setLiveTime(nextTime);
      frameId = requestAnimationFrame(updateLiveTime);
    };
    frameId = requestAnimationFrame(updateLiveTime);
    return () => cancelAnimationFrame(frameId);
  }, [player, currentTime]);

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
    } else {
      setEditorSections(sortedSections);
      setTappedDownbeats([]);
    }
    const savedTakes = Array.isArray(songData.tapCalibrationTakes) ? songData.tapCalibrationTakes : [];
    const normalizedTakes = emptyTapCalibrationTakes().map((fallback, index) => ({
      ...fallback,
      ...(savedTakes[index] || {}),
      label: savedTakes[index]?.label || fallback.label,
      tapsMs: sortedUniqueMs(savedTakes[index]?.tapsMs || [])
    }));
    setTapCalibrationTakes(normalizedTakes);
    setActiveTakeIndex(0);
  }, [songData?.youtubeId]);

  useEffect(() => {
    setTappedDownbeats(tapCalibrationTakes[activeTakeIndex]?.tapsMs || []);
  }, [activeTakeIndex, tapCalibrationTakes]);

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

  const sortedUniqueMs = (values: number[]) => Array.from(new Set(values.map(value => Math.round(value)))).sort((a, b) => a - b);

  const syncSongMapState = (patch: any) => {
    const updated = {
      ...latestSongDataRef.current,
      ...patch
    };
    setCalibratedSongData(updated);
    setSongData(updated);
    latestSongDataRef.current = updated;
  };

  const updateSectionsState = (sectionsList: any[], triggerAutoSave = false) => {
    const sortedSections = [...sectionsList].sort((a, b) => a.startTimeMs - b.startTimeMs);
    setEditorSections(sortedSections);
    const updated = {
      ...latestSongDataRef.current,
      sections: sortedSections,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    syncSongMapState(updated);
    if (triggerAutoSave) {
      autoSaveSongMap(updated);
    }
  };

  const nearestDownbeat = (values: number[], targetMs: number) => {
    if (values.length === 0) return null;
    return values.reduce((best, value) => Math.abs(value - targetMs) < Math.abs(best - targetMs) ? value : best, values[0]);
  };

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const half = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2.0;
  };

  const updateCalibratedDownbeats = (nextDownbeats: number[], message: string) => {
    const updated = {
      ...latestSongDataRef.current,
      calibratedDownbeats: sortedUniqueMs(nextDownbeats),
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    setTappedDownbeats([]);
    syncSongMapState(updated);
    autoSaveSongMap(updated);
    showToast(message);
  };

  const updateTapCalibrationTakes = (nextTakes: any[], message?: string) => {
    const normalizedTakes = nextTakes.map((take, index) => ({
      id: take.id || `take-${index + 1}`,
      label: take.label || TAKE_LABELS[index] || `Take ${index + 1}`,
      createdAt: take.createdAt || new Date().toISOString(),
      tapsMs: sortedUniqueMs(take.tapsMs || [])
    }));
    const updated = {
      ...latestSongDataRef.current,
      tapCalibrationTakes: normalizedTakes,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    setTapCalibrationTakes(normalizedTakes);
    setTappedDownbeats(normalizedTakes[activeTakeIndex]?.tapsMs || []);
    syncSongMapState(updated);
    autoSaveSongMap(updated);
    if (message) {
      showToast(message);
    }
  };

  const estimatePhraseInterval = (takes: any[]) => {
    const expectedIntervalMs = (60000 / (songData?.baseBpm || 150)) * PHRASE_BEATS;
    const estimates: number[] = [];
    takes.forEach(take => {
      const taps = sortedUniqueMs(take.tapsMs || []);
      for (let index = 1; index < taps.length; index++) {
        const gap = taps[index] - taps[index - 1];
        if (gap <= 0) continue;
        const phraseCount = Math.max(1, Math.round(gap / expectedIntervalMs));
        const normalized = gap / phraseCount;
        if (normalized >= expectedIntervalMs * 0.65 && normalized <= expectedIntervalMs * 1.35) {
          estimates.push(normalized);
        }
      }
    });
    return estimates.length ? median(estimates) : expectedIntervalMs;
  };

  const buildTapProposal = (takes: any[]) => {
    const estimatedIntervalMs = estimatePhraseInterval(takes);
    const clusterToleranceMs = Math.max(180, Math.min(450, estimatedIntervalMs * 0.16));
    const warnings: string[] = [];
    const allTaps: any[] = [];
    takes.forEach((take, takeIndex) => {
      const taps = sortedUniqueMs(take.tapsMs || []);
      for (let index = 1; index < taps.length; index++) {
        const gap = taps[index] - taps[index - 1];
        if (gap < estimatedIntervalMs * 0.55) {
          warnings.push(`${take.label || `Take ${takeIndex + 1}`}: taps at ${(taps[index - 1] / 1000).toFixed(2)}s and ${(taps[index] / 1000).toFixed(2)}s are too close.`);
        }
      }
      taps.forEach((tap: number) => allTaps.push({ timestampMs: tap, takeIndex }));
    });
    const sortedTaps = allTaps.sort((a, b) => a.timestampMs - b.timestampMs);
    const clusters: any[] = [];
    sortedTaps.forEach(tap => {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(tap.timestampMs - median(last.values)) > clusterToleranceMs) {
        clusters.push({ values: [tap.timestampMs], takeIndexes: new Set([tap.takeIndex]) });
      } else {
        last.values.push(tap.timestampMs);
        last.takeIndexes.add(tap.takeIndex);
      }
    });
    const clusterSummaries = clusters.map(cluster => ({
      timestampMs: Math.round(median(cluster.values)),
      spreadMs: Math.max(...cluster.values) - Math.min(...cluster.values),
      takeCount: cluster.takeIndexes.size
    }));
    clusterSummaries.forEach(cluster => {
      if (cluster.spreadMs > clusterToleranceMs) {
        warnings.push(`Disagreement near ${(cluster.timestampMs / 1000).toFixed(2)}s is ${Math.round(cluster.spreadMs)}ms.`);
      }
    });
    if (takes.filter(take => (take.tapsMs || []).length > 0).length < 3) {
      warnings.push("Record all 3 takes for a stronger proposal.");
    }
    if (allTaps.length < 3) {
      warnings.push("Add at least 3 clear anchors before trusting the proposal.");
    }
    if (clusterSummaries.length === 0) {
      return {
        proposedDownbeats: [],
        estimatedIntervalMs,
        impliedBpm: (60000 * PHRASE_BEATS) / estimatedIntervalMs,
        confidenceCounts: { high: 0, medium: 0, low: 0 },
        warnings
      };
    }
    clusterSummaries.sort((a, b) => a.timestampMs - b.timestampMs);
    for (let index = 1; index < clusterSummaries.length; index++) {
      const gap = clusterSummaries[index].timestampMs - clusterSummaries[index - 1].timestampMs;
      if (gap > estimatedIntervalMs * 3.25) {
        warnings.push(`Sparse region between ${(clusterSummaries[index - 1].timestampMs / 1000).toFixed(1)}s and ${(clusterSummaries[index].timestampMs / 1000).toFixed(1)}s.`);
      }
    }
    let anchorMs = clusterSummaries[0].timestampMs;
    while (anchorMs - estimatedIntervalMs >= 0) {
      anchorMs -= estimatedIntervalMs;
    }
    const songEndMs = Math.round(duration * 1000 || 300000);
    const proposed: number[] = [];
    const confidenceCounts = { high: 0, medium: 0, low: 0 };
    for (let value = anchorMs; value <= songEndMs; value += estimatedIntervalMs) {
      const nearestCluster = clusterSummaries.reduce((best, cluster) => Math.abs(cluster.timestampMs - value) < Math.abs(best.timestampMs - value) ? cluster : best, clusterSummaries[0]);
      if (Math.abs(nearestCluster.timestampMs - value) <= clusterToleranceMs) {
        proposed.push(nearestCluster.timestampMs);
        if (nearestCluster.takeCount >= 2) {
          confidenceCounts.high += 1;
        } else {
          confidenceCounts.medium += 1;
        }
      } else {
        proposed.push(Math.round(value));
        confidenceCounts.low += 1;
      }
    }
    return {
      proposedDownbeats: sortedUniqueMs(proposed),
      estimatedIntervalMs,
      impliedBpm: (60000 * PHRASE_BEATS) / estimatedIntervalMs,
      confidenceCounts,
      warnings
    };
  };

  const seekToNearestDownbeat = (direction: "prev" | "next", values: number[], label: string) => {
    const currentMs = liveTime * 1000;
    const target = direction === "prev"
      ? [...values].reverse().find(value => value < currentMs - 80)
      : values.find(value => value > currentMs + 80);
    if (target === undefined) {
      showToast(`⚠️ No ${label} downbeat ${direction === "prev" ? "before" : "after"} the playhead.`);
      return;
    }
    throttledSeek(target / 1000, true);
  };

  const handleTap = () => {
    if (!player) return;
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    const tapTimeMs = Math.round((currentTime - (userDelaySetting / 1000)) * 1000);
    if (tapTimeMs < 0 || tapTimeMs > duration * 1000) return;

    const currentBpm = songData.baseBpm || (songData.genre === "SALSA" ? 153.4 : 120.0);
    const beatIntervalMs = 60000.0 / currentBpm;
    const minTapGapMs = Math.max(250, beatIntervalMs * 1.5);
    const activeTake = tapCalibrationTakes[activeTakeIndex] || emptyTapCalibrationTakes()[activeTakeIndex];
    const activeTaps = activeTake?.tapsMs || [];

    const tooCloseToTap = activeTaps.some((t: number) => Math.abs(t - tapTimeMs) < minTapGapMs);
    if (tooCloseToTap) {
      showToast("⚠️ Tap is too close to an existing tap.");
      return;
    }

    const nextTakes = [...tapCalibrationTakes];
    nextTakes[activeTakeIndex] = {
      ...activeTake,
      createdAt: activeTake.createdAt || new Date().toISOString(),
      tapsMs: sortedUniqueMs([...activeTaps, tapTimeMs])
    };
    updateTapCalibrationTakes(nextTakes);
  };

  const handleClearTaps = () => {
    const nextTakes = [...tapCalibrationTakes];
    const activeTake = nextTakes[activeTakeIndex] || emptyTapCalibrationTakes()[activeTakeIndex];
    nextTakes[activeTakeIndex] = { ...activeTake, tapsMs: [], createdAt: "" };
    updateTapCalibrationTakes(nextTakes, `${activeTake.label || "Take"} cleared.`);
  };

  const handleClearAllTakes = () => {
    updateTapCalibrationTakes(emptyTapCalibrationTakes(), "All calibration takes cleared.");
  };

  const handleApproveProposal = () => {
    const proposal = buildTapProposal(tapCalibrationTakes);
    if (proposal.proposedDownbeats.length === 0) {
      showToast("⚠️ Record anchors before approving a proposal.");
      return;
    }
    updateCalibratedDownbeats(proposal.proposedDownbeats, `Approved ${proposal.proposedDownbeats.length} calibrated 1s from human anchors.`);
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

    updateSectionsState(updated);
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
    syncSongMapState({ sections: updated });
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

      updateSectionsState(updated, true);
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
    updateSectionsState(updated, true);
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

  const handleSaveCalibration = () => {
    const updated = {
      ...latestSongDataRef.current,
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
        showToast("💾 Calibration saved.");
      } else {
        throw new Error(res.error || "Save failed");
      }
    })
    .catch(err => {
      setSaving(false);
      showToast("❌ Failed to save calibration: " + err.message);
    });
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

  const liveDisplayTime = player ? liveTime : currentTime;
  const playheadPct = duration > 0 ? (liveDisplayTime / duration) * 100 : 0;
  const calibratedDownbeats = latestSongDataRef.current?.calibratedDownbeats || [];
  const proposal = buildTapProposal(tapCalibrationTakes);
  const proposedDownbeats = proposal.proposedDownbeats;
  const currentMs = Math.round(liveDisplayTime * 1000 + PULSE_VISUAL_COMPENSATION_MS);
  const nearestCalibrated = nearestDownbeat(calibratedDownbeats, currentMs);
  const nearestProposal = nearestDownbeat(proposedDownbeats, currentMs);
  const calibratedDistance = nearestCalibrated === null ? null : nearestCalibrated - currentMs;
  const proposalDistance = nearestProposal === null ? null : nearestProposal - currentMs;
  const nearWindowMs = 90;
  const isNearCalibrated = calibratedDistance !== null && Math.abs(calibratedDistance) <= nearWindowMs;
  const isNearProposal = proposalDistance !== null && Math.abs(proposalDistance) <= nearWindowMs;
  const isOnSelectedDownbeat = liveIsPlaying && isNearCalibrated;
  const calibratedDownbeatCount = calibratedDownbeats.length;
  const calibratedIntervals = calibratedDownbeats.slice(1).map((value: number, index: number) => value - calibratedDownbeats[index]);
  const calibratedMedianInterval = calibratedIntervals.length ? median(calibratedIntervals) : null;
  const currentTakeTaps = tapCalibrationTakes[activeTakeIndex]?.tapsMs || [];
  const takeTapCount = tapCalibrationTakes.reduce((sum, take) => sum + (take.tapsMs || []).length, 0);
  const proposalSummary = `${proposedDownbeats.length} proposed · interval ${Math.round(proposal.estimatedIntervalMs)}ms · implied BPM ${proposal.impliedBpm.toFixed(2)}`;
  const calibratedPulseStyle = isOnSelectedDownbeat
    ? {
        background: "#ffffff",
        color: "#000000",
        border: "2px solid #ffffff",
        boxShadow: "0 0 30px 8px rgba(255,255,255,0.9), inset 0 0 8px rgba(255,255,255,0.5)",
        transform: "scale(1.12)"
      }
    : {};
  const sourcePulseStyle = isOnSelectedDownbeat
    ? {
        border: "2px solid #60a5fa",
        boxShadow: "0 0 22px 5px rgba(96,165,250,0.55)"
      }
    : {};

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
        {["Sections & Labels", "Events", "Downbeat Tapping"].map((tabName, idx) => {
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

      <div style={{
        display: "grid",
        gridTemplateColumns: "1.2fr auto 1fr",
        gap: "12px",
        padding: "14px",
        borderRadius: "14px",
        border: "1px solid rgba(96,165,250,0.28)",
        background: "rgba(37,99,235,0.08)"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 900, color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Human anchor calibration
            </span>
          </div>
          <span style={{ fontSize: "0.82rem", color: "#f4f4f5", lineHeight: 1.45 }}>
            Record 3 sparse passes of clear count-1 anchors. Skip uncertain moments. The app fills a review proposal from human anchors only.
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.74rem", color: "#d4d4d8" }}>
            <span style={{ color: "#60a5fa" }}>● Calibrated 1s: <strong>{calibratedDownbeatCount}</strong></span>
            <span style={{ color: "#fbbf24" }}>● Proposed 1s: <strong>{proposedDownbeats.length}</strong></span>
            <span style={{ color: "#f97316" }}>● Raw anchors: <strong>{takeTapCount}</strong></span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", minWidth: "126px" }}>
          <div
            style={{
              width: "84px",
              height: "84px",
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.48)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              fontWeight: 900,
              transition: "background 0.14s ease-out, color 0.14s ease-out, border 0.14s ease-out, box-shadow 0.14s ease-out, transform 0.14s ease-out",
              ...sourcePulseStyle,
              ...calibratedPulseStyle
            }}
          >
            <span>1</span>
            <span style={{ fontSize: "0.54rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px", opacity: isOnSelectedDownbeat ? 0.82 : 0.42 }}>
              Downbeat
            </span>
          </div>
          <span style={{ fontSize: "0.64rem", color: isOnSelectedDownbeat ? "#ffffff" : "#a1a1aa", fontWeight: 800, textAlign: "center", opacity: isOnSelectedDownbeat ? 1 : 0.7 }}>
            {calibratedDownbeats.length === 0 ? "no approved 1s" : liveIsPlaying ? "APPROVED 1" : "play to preview"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", alignItems: "stretch" }}>
          <div style={{ padding: "9px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: "0.64rem", color: "#fbbf24", fontWeight: 900, textTransform: "uppercase" }}>Proposal</div>
            <div style={{ fontSize: "0.64rem", color: "#d4d4d8", fontWeight: 700, lineHeight: 1.35 }}>{proposalSummary}</div>
          </div>
          <div style={{ padding: "9px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: "0.64rem", color: "#60a5fa", fontWeight: 900, textTransform: "uppercase" }}>Confidence</div>
            <div style={{ fontSize: "0.64rem", color: "#d4d4d8", fontWeight: 700, lineHeight: 1.35 }}>
              high {proposal.confidenceCounts.high} · medium {proposal.confidenceCounts.medium} · low {proposal.confidenceCounts.low}
              <br />
              approved median {calibratedMedianInterval === null ? "—" : `${Math.round(calibratedMedianInterval)}ms`}
            </div>
          </div>
        </div>
      </div>

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
            🎧 Human Anchor Tap Deck
          </div>
          <div style={{ fontSize: "0.82rem", color: "#d4d4d8", textAlign: "center", lineHeight: 1.4 }}>
            Tap only clear count-1 anchors. Skip uncertain moments. Do not try to tap continuously.
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            {tapCalibrationTakes.map((take, index) => (
              <button
                key={take.id}
                onClick={() => setActiveTakeIndex(index)}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 900,
                  padding: "7px 12px",
                  borderRadius: "999px",
                  border: `1px solid ${activeTakeIndex === index ? "#ffffff" : "rgba(255,255,255,0.12)"}`,
                  background: activeTakeIndex === index ? "#ffffff" : "rgba(255,255,255,0.04)",
                  color: activeTakeIndex === index ? "#000" : "#d4d4d8",
                  cursor: "pointer"
                }}
              >
                {take.label}: {(take.tapsMs || []).length}
              </button>
            ))}
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
              TAP CLEAR "1"
            </span>
            <span style={{ fontSize: "0.68rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#71717a" }}>
              Recording {tapCalibrationTakes[activeTakeIndex]?.label || "Take"} · click or press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 3px" }}>T</kbd>
            </span>
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.95fr) 1.5fr", gap: "12px", width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ padding: "10px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#d4d4d8", fontSize: "0.72rem", lineHeight: 1.45 }}>
                <strong style={{ color: "#fff" }}>{tapCalibrationTakes[activeTakeIndex]?.label || "Take"}</strong> has <strong style={{ color: "#fff" }}>{currentTakeTaps.length}</strong> anchors.
                <br />
                Proposal: <strong style={{ color: "#fff" }}>{proposedDownbeats.length}</strong> final 1s · interval <strong style={{ color: "#fff" }}>{Math.round(proposal.estimatedIntervalMs)}ms</strong>.
              </div>
              <button
                onClick={handleClearTaps}
                disabled={currentTakeTaps.length === 0}
                style={{ fontSize: "0.72rem", fontWeight: 800, background: "rgba(255,255,255,0.08)", border: "1px solid #3f3f46", color: "#fff", padding: "7px 12px", borderRadius: "7px", cursor: currentTakeTaps.length === 0 ? "not-allowed" : "pointer", opacity: currentTakeTaps.length === 0 ? 0.55 : 1 }}
              >
                Re-record current take
              </button>
              <button
                onClick={handleClearAllTakes}
                disabled={takeTapCount === 0}
                style={{ fontSize: "0.72rem", fontWeight: 800, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "#d4d4d8", padding: "7px 12px", borderRadius: "7px", cursor: takeTapCount === 0 ? "not-allowed" : "pointer", opacity: takeTapCount === 0 ? 0.55 : 1 }}
              >
                Clear all takes
              </button>
              <button
                onClick={handleApproveProposal}
                disabled={saving || proposedDownbeats.length === 0}
                style={{ fontSize: "0.72rem", fontWeight: 900, background: "linear-gradient(135deg, #ffffff, #d1d5db)", border: "none", color: "#000", padding: "8px 14px", borderRadius: "7px", cursor: saving || proposedDownbeats.length === 0 ? "not-allowed" : "pointer", opacity: saving || proposedDownbeats.length === 0 ? 0.55 : 1 }}
              >
                Approve proposal as calibrated
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.75rem", color: "#d1d5db" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <span>Take 1: <strong style={{ color: "#fff" }}>{tapCalibrationTakes[0]?.tapsMs?.length || 0}</strong></span>
                <span>Take 2: <strong style={{ color: "#fff" }}>{tapCalibrationTakes[1]?.tapsMs?.length || 0}</strong></span>
                <span>Take 3: <strong style={{ color: "#fff" }}>{tapCalibrationTakes[2]?.tapsMs?.length || 0}</strong></span>
                <span>Implied BPM: <strong style={{ color: "#fff" }}>{proposal.impliedBpm.toFixed(2)}</strong></span>
                <span>Confidence: <strong style={{ color: "#fff" }}>{proposal.confidenceCounts.high}/{proposal.confidenceCounts.medium}/{proposal.confidenceCounts.low}</strong></span>
              </div>
              <div style={{ maxHeight: "92px", overflow: "auto", padding: "10px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {proposal.warnings.length === 0 ? (
                  <span style={{ color: "#86efac" }}>No proposal warnings.</span>
                ) : proposal.warnings.map((warning: string, index: number) => (
                  <div key={`warning-${index}`} style={{ color: "#fbbf24", marginBottom: "4px" }}>⚠️ {warning}</div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                {[
                  ["Proposal ◀", () => seekToNearestDownbeat("prev", proposedDownbeats, "proposal"), proposedDownbeats.length === 0],
                  ["Proposal ▶", () => seekToNearestDownbeat("next", proposedDownbeats, "proposal"), proposedDownbeats.length === 0],
                  ["Approved ◀", () => seekToNearestDownbeat("prev", calibratedDownbeats, "approved"), calibratedDownbeatCount === 0],
                  ["Approved ▶", () => seekToNearestDownbeat("next", calibratedDownbeats, "approved"), calibratedDownbeatCount === 0]
                ].map(([label, action, disabled]: any) => (
                  <button
                    key={label}
                    onClick={action}
                    disabled={disabled}
                    style={{ fontSize: "0.68rem", fontWeight: 800, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#d4d4d8", padding: "5px 9px", borderRadius: "7px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 }}
                  >
                    {label}
                  </button>
                ))}
                <span style={{ color: "#a1a1aa", fontSize: "0.68rem" }}>
                  Orange/rose/green are raw takes. Yellow is proposal. Blue is approved.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dev-widescreen-top-row" style={{
        gridTemplateColumns: activeTab === 1 || activeTab === 2 ? "1.15fr 0.85fr" : "1fr"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: activeTab === 1 || activeTab === 2 ? "100%" : "800px", margin: activeTab === 1 || activeTab === 2 ? "0" : "0 auto", width: "100%" }}>
          {videoElement}
        </div>

        {activeTab === 1 && (
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
        {activeTab === 2 && (
          <div className="glass-panel dev-panel right-workspace-column" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px" }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                🎭 Event Ranges
              </span>
              <button
                onClick={onBackToCatalog}
                style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid #27272a", color: "#ffffff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}
              >
                Exit
              </button>
            </div>
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
              {liveDisplayTime.toFixed(2)}s / {duration.toFixed(2)}s
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
                const labelText = sec.label ? `${sec.emoji || ""} ${sec.label}` : `Section ${idx + 1}`;

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
                const widthPct = (event.durationMs / (duration * 1000)) * 100;
                return (
                  <div key={`event-${index}-${event.timestampMs}`} title={`${event.type}: ${event.description}`} style={{ position: "absolute", top: "6px", bottom: "6px", left: `${leftPct}%`, width: `${Math.max(widthPct, 0.3)}%`, borderRadius: "3px", background: event.uiHighlight ? "#f59e0b" : "#a1a1aa", zIndex: 7, pointerEvents: "none" }} />
                );
              })}

              {timelineLayers.proposal && proposedDownbeats.map((downbeat: number, index: number) => (
                <div
                  key={`proposal-downbeat-${index}-${downbeat}`}
                  title={`Proposed ${Math.round(downbeat / 1000)}s`}
                  style={{ position: "absolute", top: "3px", height: "14px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "2px", background: "#fbbf24", opacity: nearestProposal === downbeat ? 1 : 0.72, zIndex: 6, pointerEvents: "none", boxShadow: nearestProposal === downbeat && isNearProposal ? "0 0 10px #fbbf24" : "none" }}
                />
              ))}

              {timelineLayers.calibrated && calibratedDownbeats.map((downbeat: number, index: number) => (
                <div
                  key={`calibrated-downbeat-${index}-${downbeat}`}
                  title={`Human calibrated ${Math.round(downbeat / 1000)}s`}
                  style={{ position: "absolute", top: "24px", height: "18px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "2px", background: "#60a5fa", opacity: nearestCalibrated === downbeat ? 1 : 0.82, zIndex: 6, pointerEvents: "none", boxShadow: nearestCalibrated === downbeat && isNearCalibrated ? "0 0 10px #60a5fa" : "none" }}
                />
              ))}

              {tapCalibrationTakes.map((take, takeIndex) => {
                const layerKey = `take${takeIndex + 1}`;
                const colors = ["#f97316", "#fb7185", "#34d399"];
                if (!timelineLayers[layerKey as keyof typeof timelineLayers]) return null;
                return (take.tapsMs || []).map((downbeat: number, index: number) => (
                  <div key={`${take.id}-${index}-${downbeat}`} title={`${take.label} ${(downbeat / 1000).toFixed(2)}s`} style={{ position: "absolute", top: `${4 + takeIndex * 10}px`, height: "8px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "3px", background: colors[takeIndex], opacity: 0.95, zIndex: 8, pointerEvents: "none", boxShadow: `0 0 9px ${colors[takeIndex]}aa` }} />
                ));
              })}

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
               const labelText = sec.label ? `${sec.emoji || ""} ${sec.label}` : `Section ${idx + 1}`;
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
