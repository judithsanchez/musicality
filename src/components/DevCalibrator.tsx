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
type PulseSource = "calibrated" | "librosa" | "beatNetLite" | "mixxx";

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
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [timelineLayers, setTimelineLayers] = useState({ sections: true, events: true, human: true, librosa: true, beatNetLite: true, mixxx: false, manual: true });
  const [calibrationMode, setCalibrationMode] = useState<"whole" | "section" | "custom">("whole");
  const [customRangeStartSec, setCustomRangeStartSec] = useState("0");
  const [customRangeEndSec, setCustomRangeEndSec] = useState("");
  const [liveTime, setLiveTime] = useState(0);
  const [liveIsPlaying, setLiveIsPlaying] = useState(false);
  const [pulseSource, setPulseSource] = useState<PulseSource>("calibrated");

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

  const getCalibrationRange = () => {
    const songEndMs = Math.round(duration * 1000 || 300000);
    if (calibrationMode === "section") {
      const selected = editorSections.find(section => section.id === focusedSectionId)
        || editorSections.find(section => currentTime * 1000 >= section.startTimeMs && currentTime * 1000 <= section.endTimeMs);
      if (!selected) {
        return { error: "Select a section or move the playhead inside one." };
      }
      return { startMs: selected.startTimeMs, endMs: selected.endTimeMs, label: selected.label || "selected section" };
    }
    if (calibrationMode === "custom") {
      const startMs = Math.max(0, Math.round(Number(customRangeStartSec) * 1000));
      const endMs = Math.min(songEndMs, Math.round(Number(customRangeEndSec) * 1000));
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { error: "Enter a valid custom range." };
      }
      return { startMs, endMs, label: "custom range" };
    }
    return { startMs: 0, endMs: songEndMs, label: "whole song" };
  };

  const tapsInsideRange = (values: number[], startMs: number, endMs: number) => values.filter(value => value >= startMs && value <= endMs);

  const replaceDownbeatsInRange = (current: number[], startMs: number, endMs: number, replacement: number[]) => {
    return sortedUniqueMs([
      ...current.filter(value => value < startMs || value > endMs),
      ...replacement.filter(value => value >= startMs && value <= endMs)
    ]);
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

  const detectorStats = (candidate: number[], human: number[]) => {
    const intervals = candidate.slice(1).map((value, index) => value - candidate[index]);
    const nearestDiffs = candidate.map(value => {
      const match = nearestDownbeat(human, value);
      return match === null ? null : value - match;
    }).filter((value): value is number => value !== null);
    const nearestAbsDiffs = nearestDiffs.map(value => Math.abs(value));
    return {
      markerCount: candidate.length,
      medianIntervalMs: intervals.length ? median(intervals) : null,
      medianNearestHumanDiffMs: nearestDiffs.length ? median(nearestDiffs) : null,
      medianNearestHumanAbsDiffMs: nearestAbsDiffs.length ? median(nearestAbsDiffs) : null,
      within100ms: nearestAbsDiffs.filter(value => value <= 100).length,
      within250ms: nearestAbsDiffs.filter(value => value <= 250).length
    };
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

  const handleApplyOffsetCalibration = () => {
    const range: any = getCalibrationRange();
    if (range.error) {
      showToast(`⚠️ ${range.error}`);
      return;
    }
    const current = latestSongDataRef.current?.calibratedDownbeats || [];
    const existing = tapsInsideRange(current, range.startMs, range.endMs);
    const manual = tapsInsideRange(tappedDownbeats, range.startMs, range.endMs);
    if (existing.length === 0) {
      showToast("⚠️ No calibrated downbeats in this range to shift.");
      return;
    }
    if (manual.length === 0) {
      showToast("⚠️ Tap at least one downbeat inside this range.");
      return;
    }
    const offsets = manual.map(tap => {
      const nearest = existing.reduce((best, value) => Math.abs(value - tap) < Math.abs(best - tap) ? value : best, existing[0]);
      return tap - nearest;
    });
    const offset = Math.round(median(offsets));
    const shifted = existing.map(value => value + offset).filter(value => value >= range.startMs && value <= range.endMs);
    const next = replaceDownbeatsInRange(current, range.startMs, range.endMs, shifted);
    updateCalibratedDownbeats(next, `Applied ${offset}ms offset to ${range.label}.`);
  };

  const handleReplaceRangeWithTaps = () => {
    const range: any = getCalibrationRange();
    if (range.error) {
      showToast(`⚠️ ${range.error}`);
      return;
    }
    const manual = tapsInsideRange(tappedDownbeats, range.startMs, range.endMs);
    if (manual.length === 0) {
      showToast("⚠️ Tap at least one downbeat inside this range.");
      return;
    }
    const current = latestSongDataRef.current?.calibratedDownbeats || [];
    const next = replaceDownbeatsInRange(current, range.startMs, range.endMs, manual);
    updateCalibratedDownbeats(next, `Replaced calibrated downbeats in ${range.label}.`);
  };

  const handleUseRawAsCalibrated = () => {
    const raw = latestSongDataRef.current?.rawDownbeats || [];
    if (raw.length === 0) {
      showToast("⚠️ No raw Librosa downbeats available.");
      return;
    }
    updateCalibratedDownbeats(raw, "Copied raw Librosa downbeats into calibrated downbeats.");
  };

  const seekToNearestDownbeat = (direction: "prev" | "next", source: PulseSource) => {
    const detectors = latestSongDataRef.current?.metadata?.detectors || {};
    const valuesBySource: Record<PulseSource, number[]> = {
      calibrated: latestSongDataRef.current?.calibratedDownbeats || [],
      librosa: detectors.librosaCandidateDownbeats || latestSongDataRef.current?.rawDownbeats || [],
      beatNetLite: detectors.beatNetLiteDownbeats || [],
      mixxx: Array.isArray(detectors.mixxxBeatgrid) ? detectors.mixxxBeatgrid : detectors.mixxxBeatgrid?.downbeats || []
    };
    const values = valuesBySource[source];
    const currentMs = liveTime * 1000;
    const target = direction === "prev"
      ? [...values].reverse().find(value => value < currentMs - 80)
      : values.find(value => value > currentMs + 80);
    if (target === undefined) {
      showToast(`⚠️ No ${source} downbeat ${direction === "prev" ? "before" : "after"} the playhead.`);
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

    const tooCloseToTap = tappedDownbeats.some(t => Math.abs(t - tapTimeMs) < minTapGapMs);
    if (tooCloseToTap) {
      showToast("⚠️ Tap is too close to an existing tap.");
      return;
    }

    const updatedDownbeats = [...tappedDownbeats, tapTimeMs]
      .sort((a, b) => a - b);

    setTappedDownbeats(updatedDownbeats);
  };

  const handleClearTaps = () => {
    setTappedDownbeats([]);
    showToast("🔄 Manual taps cleared.");
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
  const calibrationRangePreview: any = getCalibrationRange();
  const manualTapsInRange = calibrationRangePreview.error
    ? 0
    : tapsInsideRange(tappedDownbeats, calibrationRangePreview.startMs, calibrationRangePreview.endMs).length;
  const detectorMetadata = latestSongDataRef.current?.metadata?.detectors || {};
  const rawDownbeats = latestSongDataRef.current?.rawDownbeats || [];
  const librosaDownbeats = detectorMetadata.librosaCandidateDownbeats || rawDownbeats;
  const beatNetLiteDownbeats = detectorMetadata.beatNetLiteDownbeats || [];
  const mixxxDownbeats = Array.isArray(detectorMetadata.mixxxBeatgrid) ? detectorMetadata.mixxxBeatgrid : detectorMetadata.mixxxBeatgrid?.downbeats || [];
  const calibratedDownbeats = latestSongDataRef.current?.calibratedDownbeats || [];
  const currentMs = Math.round(liveDisplayTime * 1000 + PULSE_VISUAL_COMPENSATION_MS);
  const nearestLibrosa = nearestDownbeat(librosaDownbeats, currentMs);
  const nearestBeatNetLite = nearestDownbeat(beatNetLiteDownbeats, currentMs);
  const nearestMixxx = nearestDownbeat(mixxxDownbeats, currentMs);
  const nearestCalibrated = nearestDownbeat(calibratedDownbeats, currentMs);
  const librosaDistance = nearestLibrosa === null ? null : nearestLibrosa - currentMs;
  const beatNetLiteDistance = nearestBeatNetLite === null ? null : nearestBeatNetLite - currentMs;
  const mixxxDistance = nearestMixxx === null ? null : nearestMixxx - currentMs;
  const calibratedDistance = nearestCalibrated === null ? null : nearestCalibrated - currentMs;
  const pulseSources: Record<PulseSource, { label: string; shortLabel: string; values: number[]; distance: number | null; color: string }> = {
    calibrated: { label: "Human calibrated", shortLabel: "HUMAN", values: calibratedDownbeats, distance: calibratedDistance, color: "#60a5fa" },
    librosa: { label: "Librosa candidate", shortLabel: "LIBROSA", values: librosaDownbeats, distance: librosaDistance, color: "#c084fc" },
    beatNetLite: { label: "BeatNetLite candidate", shortLabel: "BEATNETLITE", values: beatNetLiteDownbeats, distance: beatNetLiteDistance, color: "#34d399" },
    mixxx: { label: "Mixxx beatgrid", shortLabel: "MIXXX", values: mixxxDownbeats, distance: mixxxDistance, color: "#fbbf24" }
  };
  const selectedPulse = pulseSources[pulseSource];
  const selectedPulseDownbeats = selectedPulse.values;
  const pulseDistance = selectedPulse.distance;
  const nearWindowMs = 90;
  const isNearLibrosa = librosaDistance !== null && Math.abs(librosaDistance) <= nearWindowMs;
  const isNearBeatNetLite = beatNetLiteDistance !== null && Math.abs(beatNetLiteDistance) <= nearWindowMs;
  const isNearMixxx = mixxxDistance !== null && Math.abs(mixxxDistance) <= nearWindowMs;
  const isNearCalibrated = calibratedDistance !== null && Math.abs(calibratedDistance) <= nearWindowMs;
  const isOnSelectedDownbeat = liveIsPlaying && pulseDistance !== null && Math.abs(pulseDistance) <= nearWindowMs;
  const detectorRows = [
    { key: "calibrated", label: "Human", color: "#60a5fa", values: calibratedDownbeats, distance: calibratedDistance, stats: detectorStats(calibratedDownbeats, calibratedDownbeats) },
    { key: "librosa", label: "Librosa", color: "#c084fc", values: librosaDownbeats, distance: librosaDistance, stats: detectorStats(librosaDownbeats, calibratedDownbeats) },
    { key: "beatNetLite", label: "BeatNetLite", color: "#34d399", values: beatNetLiteDownbeats, distance: beatNetLiteDistance, stats: detectorStats(beatNetLiteDownbeats, calibratedDownbeats) },
    { key: "mixxx", label: "Mixxx", color: "#fbbf24", values: mixxxDownbeats, distance: mixxxDistance, stats: detectorStats(mixxxDownbeats, calibratedDownbeats), unavailable: detectorMetadata.mixxxBeatgrid?.reason }
  ];
  const calibratedDownbeatCount = calibratedDownbeats.length;
  const rawDownbeatCount = librosaDownbeats.length;
  const ingestionMeta = latestSongDataRef.current?.metadata?.ingestion;
  const hasHumanCalibration = calibratedDownbeatCount > 0 && JSON.stringify(calibratedDownbeats) !== JSON.stringify(librosaDownbeats);
  const calibratedLabel = hasHumanCalibration ? "Human/calibrated" : "Calibrated";
  const ingestionStatus = rawDownbeatCount > 0
    ? `Librosa baseline found ${rawDownbeatCount} markers at ${songData?.baseBpm || latestSongDataRef.current?.baseBpm || "?"} BPM.`
    : ingestionMeta?.analysisSkipped
      ? "Audio analysis was skipped for this song. You can still tap manually."
      : "No Librosa markers were saved for this song. You can still tap manually, or re-run ingestion once YouTube/audio extraction works.";
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
        border: `2px solid ${selectedPulse.color}`,
        boxShadow: `0 0 22px 5px ${selectedPulse.color}88`
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

      <div style={{
        display: "grid",
        gridTemplateColumns: "1.2fr auto 1fr",
        gap: "12px",
        padding: "14px",
        borderRadius: "14px",
        border: `1px solid ${rawDownbeatCount > 0 ? "rgba(96,165,250,0.28)" : "rgba(245,158,11,0.35)"}`,
        background: rawDownbeatCount > 0 ? "rgba(37,99,235,0.08)" : "rgba(245,158,11,0.08)"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 900, color: rawDownbeatCount > 0 ? "#93c5fd" : "#fbbf24", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Auto downbeat diagnostics
            </span>
            <select
              value={pulseSource}
              onChange={event => setPulseSource(event.target.value as PulseSource)}
              style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", borderRadius: "8px", padding: "5px 8px", fontSize: "0.68rem", fontWeight: 800 }}
            >
              <option value="calibrated">Pulse human calibrated</option>
              <option value="librosa">Pulse Librosa candidate</option>
              <option value="beatNetLite">Pulse BeatNetLite candidate</option>
              {mixxxDownbeats.length > 0 && <option value="mixxx">Pulse Mixxx beatgrid</option>}
            </select>
          </div>
          <span style={{ fontSize: "0.82rem", color: "#f4f4f5", lineHeight: 1.45 }}>
            {ingestionStatus}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.74rem", color: "#d4d4d8" }}>
            <span style={{ color: "#c084fc" }}>● Librosa raw: <strong>{rawDownbeatCount}</strong></span>
            <span style={{ color: "#60a5fa" }}>● {calibratedLabel}: <strong>{calibratedDownbeatCount}</strong></span>
            <span style={{ color: "#34d399" }}>● BeatNetLite: <strong>{beatNetLiteDownbeats.length}</strong></span>
            <span style={{ color: "#fbbf24" }}>● Mixxx: <strong>{mixxxDownbeats.length}</strong>{detectorMetadata.mixxxBeatgrid?.reason ? ` (${detectorMetadata.mixxxBeatgrid.reason})` : ""}</span>
            <span style={{ color: "#f97316" }}>● Manual taps: <strong>{tappedDownbeats.length}</strong></span>
            {ingestionMeta && (
              <span>source: <strong>{ingestionMeta.audioSource}</strong> · fallback BPM: <strong>{ingestionMeta.usedFallbackBpm ? "yes" : "no"}</strong></span>
            )}
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
            {selectedPulseDownbeats.length === 0 ? "no pulse source" : liveIsPlaying ? `${selectedPulse.shortLabel} 1` : "play to preview"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", alignItems: "stretch" }}>
          {detectorRows.filter(row => row.key !== "mixxx" || row.values.length > 0 || row.unavailable).map(row => {
            return (
              <div key={row.key} style={{ padding: "9px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: "0.64rem", color: row.color, fontWeight: 900, textTransform: "uppercase" }}>{row.label}</div>
                <div style={{ fontSize: "0.58rem", color: "#a1a1aa", fontWeight: 700, lineHeight: 1.35 }}>
                  {row.unavailable && row.values.length === 0
                    ? row.unavailable
                    : `${row.stats.markerCount} marks · med ${row.stats.medianIntervalMs === null ? "—" : `${Math.round(row.stats.medianIntervalMs)}ms`} · err ${row.stats.medianNearestHumanAbsDiffMs === null ? "—" : `${Math.round(row.stats.medianNearestHumanAbsDiffMs)}ms`} · 100/250 ${row.stats.within100ms}/${row.stats.within250ms}`}
                </div>
              </div>
            );
          })}
        </div>
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

          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.9fr) 1.6fr", gap: "12px", width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase" }}>
                Calibration scope
              </label>
              <select
                value={calibrationMode}
                onChange={event => setCalibrationMode(event.target.value as "whole" | "section" | "custom")}
                style={{ background: "#111113", border: "1px solid #3f3f46", color: "#fff", borderRadius: "8px", padding: "8px" }}
              >
                <option value="whole">Whole song</option>
                <option value="section">Selected section</option>
                <option value="custom">Custom range</option>
              </select>
              {calibrationMode === "custom" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={customRangeStartSec}
                    onChange={event => setCustomRangeStartSec(event.target.value)}
                    placeholder="Start sec"
                    style={{ background: "#111113", border: "1px solid #3f3f46", color: "#fff", borderRadius: "8px", padding: "8px" }}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={customRangeEndSec}
                    onChange={event => setCustomRangeEndSec(event.target.value)}
                    placeholder="End sec"
                    style={{ background: "#111113", border: "1px solid #3f3f46", color: "#fff", borderRadius: "8px", padding: "8px" }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.75rem", color: "#d1d5db" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <span>Scope: <strong style={{ color: "#fff" }}>{calibrationRangePreview.error || calibrationRangePreview.label}</strong></span>
                <span>Librosa: <strong style={{ color: "#fff" }}>{rawDownbeatCount}</strong></span>
                <span>BeatNetLite: <strong style={{ color: "#fff" }}>{beatNetLiteDownbeats.length}</strong></span>
                <span>{calibratedLabel}: <strong style={{ color: "#fff" }}>{calibratedDownbeatCount}</strong></span>
                <span>Manual in scope: <strong style={{ color: "#fff" }}>{manualTapsInRange}</strong></span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                <button
                  onClick={handleUseRawAsCalibrated}
                  disabled={saving || rawDownbeatCount === 0}
                  style={{ fontSize: "0.72rem", fontWeight: 800, background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.5)", color: "#f5d0fe", padding: "7px 12px", borderRadius: "7px", cursor: saving || rawDownbeatCount === 0 ? "not-allowed" : "pointer", opacity: saving || rawDownbeatCount === 0 ? 0.55 : 1 }}
                >
                  Use Raw as Calibrated
                </button>
                <button
                  onClick={handleApplyOffsetCalibration}
                  disabled={saving || manualTapsInRange === 0}
                  style={{ fontSize: "0.72rem", fontWeight: 800, background: "rgba(255,255,255,0.08)", border: "1px solid #3f3f46", color: "#fff", padding: "7px 12px", borderRadius: "7px", cursor: saving || manualTapsInRange === 0 ? "not-allowed" : "pointer", opacity: saving || manualTapsInRange === 0 ? 0.55 : 1 }}
                >
                  Apply Offset to Range
                </button>
                <button
                  onClick={handleReplaceRangeWithTaps}
                  disabled={saving || manualTapsInRange === 0}
                  style={{ fontSize: "0.72rem", fontWeight: 800, background: "rgba(255,255,255,0.08)", border: "1px solid #3f3f46", color: "#fff", padding: "7px 12px", borderRadius: "7px", cursor: saving || manualTapsInRange === 0 ? "not-allowed" : "pointer", opacity: saving || manualTapsInRange === 0 ? 0.55 : 1 }}
                >
                  Replace Range With Taps
                </button>
                {tappedDownbeats.length > 0 && (
                  <button
                    onClick={handleClearTaps}
                    style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <RotateCcw size={11} /> Clear Manual Taps
                  </button>
                )}
                <button
                  onClick={handleSaveCalibration}
                  disabled={saving}
                  style={{ fontSize: "0.72rem", fontWeight: 800, background: "linear-gradient(135deg, #ffffff, #d1d5db)", border: "none", color: "#000", padding: "7px 14px", borderRadius: "7px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Saving..." : "Save Calibration 💾"}
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                {[
                  ["Librosa ◀", () => seekToNearestDownbeat("prev", "librosa"), rawDownbeatCount === 0],
                  ["Librosa ▶", () => seekToNearestDownbeat("next", "librosa"), rawDownbeatCount === 0],
                  ["BeatNetLite ◀", () => seekToNearestDownbeat("prev", "beatNetLite"), beatNetLiteDownbeats.length === 0],
                  ["BeatNetLite ▶", () => seekToNearestDownbeat("next", "beatNetLite"), beatNetLiteDownbeats.length === 0],
                  ["Human ◀", () => seekToNearestDownbeat("prev", "calibrated"), calibratedDownbeatCount === 0],
                  ["Human ▶", () => seekToNearestDownbeat("next", "calibrated"), calibratedDownbeatCount === 0]
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
                  Play the song and watch the playhead cross blue markers. If it is consistently early/late, tap a few 1s and apply offset.
                </span>
              </div>
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

              {timelineLayers.librosa && librosaDownbeats.map((downbeat: number, index: number) => (
                <div
                  key={`librosa-downbeat-${index}-${downbeat}`}
                  title={`Librosa ${Math.round(downbeat / 1000)}s`}
                  style={{ position: "absolute", top: "4px", height: "12px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "2px", background: "#c084fc", opacity: nearestLibrosa === downbeat ? 1 : 0.72, zIndex: 6, pointerEvents: "none", boxShadow: nearestLibrosa === downbeat && isNearLibrosa ? "0 0 10px #c084fc" : "none" }}
                />
              ))}

              {timelineLayers.human && calibratedDownbeats.map((downbeat: number, index: number) => (
                <div
                  key={`human-downbeat-${index}-${downbeat}`}
                  title={`Human calibrated ${Math.round(downbeat / 1000)}s`}
                  style={{ position: "absolute", top: "18px", height: "12px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "2px", background: "#60a5fa", opacity: nearestCalibrated === downbeat ? 1 : 0.82, zIndex: 6, pointerEvents: "none", boxShadow: nearestCalibrated === downbeat && isNearCalibrated ? "0 0 10px #60a5fa" : "none" }}
                />
              ))}

              {timelineLayers.beatNetLite && beatNetLiteDownbeats.map((downbeat: number, index: number) => (
                <div
                  key={`beatnetlite-downbeat-${index}-${downbeat}`}
                  title={`BeatNetLite ${Math.round(downbeat / 1000)}s`}
                  style={{ position: "absolute", top: "32px", height: "12px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "2px", background: "#34d399", opacity: nearestBeatNetLite === downbeat ? 1 : 0.75, zIndex: 6, pointerEvents: "none", boxShadow: nearestBeatNetLite === downbeat && isNearBeatNetLite ? "0 0 10px #34d399" : "none" }}
                />
              ))}

              {timelineLayers.mixxx && mixxxDownbeats.map((downbeat: number, index: number) => (
                <div
                  key={`mixxx-downbeat-${index}-${downbeat}`}
                  title={`Mixxx ${Math.round(downbeat / 1000)}s`}
                  style={{ position: "absolute", top: "2px", bottom: "2px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "2px", background: "#fbbf24", opacity: nearestMixxx === downbeat ? 1 : 0.75, zIndex: 6, pointerEvents: "none", boxShadow: nearestMixxx === downbeat && isNearMixxx ? "0 0 10px #fbbf24" : "none" }}
                />
              ))}

              {timelineLayers.manual && tappedDownbeats.map((downbeat: number, index: number) => (
                <div key={`manual-tap-${index}-${downbeat}`} title={`Manual tap ${Math.round(downbeat / 1000)}s`} style={{ position: "absolute", top: "3px", bottom: "3px", left: `${(downbeat / (duration * 1000)) * 100}%`, width: "3px", background: "#f97316", opacity: 0.95, zIndex: 8, pointerEvents: "none", boxShadow: "0 0 9px rgba(249,115,22,0.8)" }} />
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
