import React, { useState, useEffect, useRef } from "react";
import { Scissors } from "lucide-react";
import DevCalibrationPanel from "./DevCalibrationPanel";
import EventAnnotationPanel from "./EventAnnotationPanel";
import { CategoryCollectionSchema, TagCollectionSchema, createVocabularySongMapSchema } from "../types/schemas";
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

const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
  const [taps, setTaps] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [focusedEventIndex, setFocusedEventIndex] = useState<number | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [timelineLayers, setTimelineLayers] = useState({ sections: true, events: true, count1: true, count5: true });
  const [activeTapCount, setActiveTapCount] = useState<1 | 5>(1);
  const [liveTime, setLiveTime] = useState(0);

  const duration = videoDuration || 300;
  const timelineRef = useRef<HTMLDivElement>(null);
  const latestSongDataRef = useRef<any>(null);

  useEffect(() => {
    latestSongDataRef.current = calibratedSongData || songData;
  }, [calibratedSongData, songData]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/categories.json`)
      .then(response => response.json())
      .then(data => {
        const parsed = CategoryCollectionSchema.safeParse(data);
        if (parsed.success) {
          setCategories(parsed.data.categories);
        }
      })
      .catch(err => console.warn(err));

    fetch(`${import.meta.env.BASE_URL}data/tags.json`)
      .then(response => response.json())
      .then(data => {
        const parsed = TagCollectionSchema.safeParse(data);
        if (parsed.success) {
          setTags(parsed.data.tags);
        }
      })
      .catch(err => console.warn(err));
  }, []);

  useEffect(() => {
    let frameId: number;
    const updateLiveTime = () => {
      let nextTime = currentTime;
      try {
        if (player && typeof player.getCurrentTime === "function") {
          nextTime = player.getCurrentTime() || currentTime;
        }
      } catch (err) {
        console.warn(err);
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
        category: "",
        tags: [],
        startTimeMs: 0,
        endTimeMs: duration * 1000 || 300000
      };
      setEditorSections([defaultSec]);
    } else {
      setEditorSections(sortedSections);
    }
    setTaps(Array.isArray(songData.taps) ? songData.taps.sort((a: any, b: any) => a.timeMs - b.timeMs) : []);
    setActiveTapCount(1);
    setFocusedEventIndex(null);
  }, [songData?.youtubeId]);

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

  const updateEventsState = (eventsList: any[], triggerAutoSave = false) => {
    const sortedEvents = [...eventsList].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const updated = {
      ...latestSongDataRef.current,
      events: sortedEvents,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    syncSongMapState(updated);
    if (triggerAutoSave) {
      autoSaveSongMap(updated);
    }
  };

  const updateTapsState = (nextTaps: any[], triggerAutoSave = false) => {
    const sortedTaps = [...nextTaps].sort((a, b) => a.timeMs - b.timeMs);
    const updated = {
      ...latestSongDataRef.current,
      taps: sortedTaps,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    setTaps(sortedTaps);
    syncSongMapState(updated);
    if (triggerAutoSave) {
      autoSaveSongMap(updated);
    }
  };

  const getCategoryLabel = (categoryId: string) => categories.find(category => category.id === categoryId)?.label || categoryId || "Uncategorized";

  const saveVocabulary = (path: string, payload: any, successMessage: string) => {
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          showToast(successMessage);
        } else {
          showToast("Saved locally in memory. Static hosting is read-only.");
        }
      })
      .catch(() => showToast("Added locally. Static hosting is read-only."));
  };

  const handleAddCategory = () => {
    const label = window.prompt("Category name");
    if (!label) return;
    const id = slugify(label);
    if (!id || categories.some(category => category.id === id)) return;
    const nextCategories = [...categories, { id, label: label.trim() }].sort((a, b) => a.label.localeCompare(b.label));
    setCategories(nextCategories);
    saveVocabulary("/api/categories", { schemaVersion: "1.0", categories: nextCategories }, "Category saved.");
  };

  const handleAddTag = () => {
    const label = window.prompt("Tag name");
    if (!label) return;
    const id = slugify(label);
    if (!id || tags.some(tag => tag.id === id)) return;
    const nextTags = [...tags, { id, label: label.trim() }].sort((a, b) => a.label.localeCompare(b.label));
    setTags(nextTags);
    saveVocabulary("/api/tags", { schemaVersion: "1.0", tags: nextTags }, "Tag saved.");
  };

  const handleTap = () => {
    if (!player) return;
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    const tapTimeMs = Math.round((currentTime - (userDelaySetting / 1000)) * 1000);
    if (tapTimeMs < 0 || tapTimeMs > duration * 1000) return;

    const tooCloseToTap = taps.some((tap: any) => tap.count === activeTapCount && Math.abs(tap.timeMs - tapTimeMs) < 120);
    if (tooCloseToTap) {
      showToast("Tap is too close to an existing mark.");
      return;
    }

    updateTapsState([...taps, { id: crypto.randomUUID(), timeMs: tapTimeMs, count: activeTapCount }], true);
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

    B[N] = maxDurationMs;

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
        return { ...s, [field]: value };
      }
      return s;
    });
    setEditorSections(updated);
    syncSongMapState({ sections: updated });
  };

  const handleToggleSectionTag = (id: string, tagId: string) => {
    const updated = editorSections.map(section => {
      if (section.id !== id) return section;
      const currentTags = section.tags || [];
      const nextTags = currentTags.includes(tagId)
        ? currentTags.filter((value: string) => value !== tagId)
        : [...currentTags, tagId];
      return { ...section, tags: nextTags };
    });
    updateSectionsState(updated);
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
        category: "",
        tags: [],
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
    updateEventsState(result.events, true);
    const newIndex = result.events.findIndex(event => event.startTimeMs === draft.startTimeMs && event.endTimeMs === draft.endTimeMs);
    setFocusedEventIndex(newIndex === -1 ? result.events.length - 1 : newIndex);
    showToast("Event added.");
    return true;
  };

  const handleAddEventRangeAtPlayhead = () => {
    const startTimeMs = Math.round(currentTime * 1000);
    const defaultDurationMs = Math.min(8000, Math.max(1000, Math.round(duration * 1000) - startTimeMs));
    handleAddEvent({
      startTimeMs,
      endTimeMs: startTimeMs + defaultDurationMs,
      category: "",
      tags: []
    });
  };

  const handleUpdateEventField = (eventIndex: number, field: string, value: any) => {
    const events = [...(latestSongDataRef.current?.events || [])];
    if (!events[eventIndex]) return;
    events[eventIndex] = { ...events[eventIndex], [field]: value };
    updateEventsState(events);
  };

  const handleToggleEventTag = (eventIndex: number, tagId: string) => {
    const events = [...(latestSongDataRef.current?.events || [])];
    if (!events[eventIndex]) return;
    const currentTags = events[eventIndex].tags || [];
    events[eventIndex] = {
      ...events[eventIndex],
      tags: currentTags.includes(tagId)
        ? currentTags.filter((value: string) => value !== tagId)
        : [...currentTags, tagId]
    };
    updateEventsState(events);
  };

  const handleUpdateEventTimes = (eventIndex: number, field: "startTimeMs" | "endTimeMs", valueMs: number) => {
    const events = [...(latestSongDataRef.current?.events || [])];
    const event = events[eventIndex];
    if (!event) return;

    const maxDurationMs = Math.round(duration * 1000);
    const minDurMs = 100;
    const currentStartMs = event.startTimeMs;
    const currentEndMs = event.endTimeMs;
    let nextStartMs = currentStartMs;
    let nextEndMs = currentEndMs;

    if (field === "startTimeMs") {
      nextStartMs = Math.max(0, Math.min(Math.round(valueMs), currentEndMs - minDurMs));
    } else {
      nextEndMs = Math.min(maxDurationMs, Math.max(Math.round(valueMs), currentStartMs + minDurMs));
    }

    events[eventIndex] = {
      ...event,
      startTimeMs: nextStartMs,
      endTimeMs: nextEndMs
    };
    updateEventsState(events);
    throttledSeek((field === "startTimeMs" ? nextStartMs : nextEndMs) / 1000, false);
  };

  const handleRemoveEvent = (eventIndex: number) => {
    const events = removeDanceEvent(latestSongDataRef.current?.events || [], eventIndex);
    updateEventsState(events, true);
    setFocusedEventIndex(null);
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
    const validation = createVocabularySongMapSchema(categories.map(category => category.id), tags.map(tag => tag.id)).safeParse(updated);
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
        } else if (activeTab === 2) {
          handleAddEventRangeAtPlayhead();
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
  }, [currentTime, editorSections, taps, player, duration, activeTab, activeTapCount]);

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
  const sortedEvents = songData?.events || [];
  const focusedEvent = focusedEventIndex === null ? null : sortedEvents[focusedEventIndex] || null;

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
        {["Sections", "Events", "Taps"].map((tabName, idx) => {
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
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            {[1, 5].map((count) => (
              <button
                key={count}
                onClick={() => setActiveTapCount(count as 1 | 5)}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 900,
                  padding: "7px 12px",
                  borderRadius: "999px",
                  border: `1px solid ${activeTapCount === count ? "#ffffff" : "rgba(255,255,255,0.12)"}`,
                  background: activeTapCount === count ? "#ffffff" : "rgba(255,255,255,0.04)",
                  color: activeTapCount === count ? "#000" : "#d4d4d8",
                  cursor: "pointer"
                }}
              >
                Count {count}: {taps.filter((tap: any) => tap.count === count).length}
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
              TAP COUNT {activeTapCount}
            </span>
            <span style={{ fontSize: "0.68rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#71717a" }}>
              Click or press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 3px" }}>T</kbd>
            </span>
          </button>
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
            editorSections={editorSections}
            categories={categories}
            tags={tags}
            onExit={onBackToCatalog}
            onUpdateSectionField={handleUpdateSectionField}
            onToggleSectionTag={handleToggleSectionTag}
            onAddCategory={handleAddCategory}
            onAddTag={handleAddTag}
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
              selectedEvent={focusedEvent}
              selectedEventIndex={focusedEventIndex}
              categories={categories}
              tags={tags}
              onUpdateEvent={handleUpdateEventField}
              onToggleTag={handleToggleEventTag}
              onAddCategory={handleAddCategory}
              onAddTag={handleAddTag}
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
            {activeTab === 2 && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleAddEventRangeAtPlayhead}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.35)",
                    color: "#fbbf24",
                    padding: "4px 12px",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                >
                  <Scissors size={12} /> Event Here
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
                const labelText = sec.category ? getCategoryLabel(sec.category) : `Section ${idx + 1}`;

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
                const leftPct = (event.startTimeMs / (duration * 1000)) * 100;
                const widthPct = ((event.endTimeMs - event.startTimeMs) / (duration * 1000)) * 100;
                const isActive = index === focusedEventIndex;
                const labelText = event.category ? getCategoryLabel(event.category) : `Event ${index + 1}`;
                return (
                  <div
                    key={`event-${event.id}`}
                    title={labelText}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedEventIndex(index);
                    }}
                    style={{
                      position: "absolute",
                      top: "6px",
                      bottom: "6px",
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.3)}%`,
                      borderRadius: "3px",
                      background: "rgba(245,158,11,0.78)",
                      outline: isActive ? "2px solid #ffffff" : "none",
                      outlineOffset: "-1px",
                      zIndex: isActive ? 12 : 7,
                      pointerEvents: activeTab === 2 ? "auto" : "none",
                      cursor: activeTab === 2 ? "pointer" : "default",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 7px",
                      overflow: "hidden"
                    }}
                  >
                    {activeTab === 2 && (
                      <span style={{ color: "#111827", fontSize: "0.64rem", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {labelText}
                      </span>
                    )}
                  </div>
                );
              })}

              {taps.map((tap: any) => {
                const layerKey = tap.count === 1 ? "count1" : "count5";
                if (!timelineLayers[layerKey as keyof typeof timelineLayers]) return null;
                const color = tap.count === 1 ? "#60a5fa" : "#34d399";
                return (
                  <div key={tap.id} title={`Count ${tap.count} ${(tap.timeMs / 1000).toFixed(2)}s`} style={{ position: "absolute", top: tap.count === 1 ? "5px" : "27px", height: "16px", left: `${(tap.timeMs / (duration * 1000)) * 100}%`, width: "3px", background: color, opacity: 0.95, zIndex: 8, pointerEvents: "none", boxShadow: `0 0 9px ${color}aa` }} />
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
                pointerEvents: "auto",
                cursor: "ew-resize",
                boxShadow: "0 0 10px rgba(255,255,255,0.8)"
              }} onMouseDown={handlePlayheadMouseDown}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "10px", height: "10px", background: "#ffffff", borderRadius: "50%" }} />
                <div style={{ position: "absolute", top: "-8px", bottom: "-8px", left: "50%", width: "18px", transform: "translateX(-50%)" }} />
              </div>
            </div>

            {activeTab === 1 && editorSections.map((sec, idx) => {
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

            {activeTab === 2 && (songData?.events || []).flatMap((event: any, index: number) => {
              const startPct = (event.startTimeMs / (duration * 1000)) * 100;
              const endPct = (event.endTimeMs / (duration * 1000)) * 100;
              return [
                <div
                  key={`event-start-handle-${event.id}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setFocusedEventIndex(index);
                    const handleMouseMove = (moveEvt: MouseEvent) => {
                      if (!timelineRef.current) return;
                      const rect = timelineRef.current.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
                      handleUpdateEventTimes(index, "startTimeMs", ratio * duration * 1000);
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                      autoSaveSongMap(latestSongDataRef.current);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                  style={{ position: "absolute", left: `${startPct}%`, top: "-4px", width: "12px", height: "56px", transform: "translateX(-50%)", cursor: "col-resize", zIndex: 22, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <div style={{ width: "3px", height: "100%", borderRadius: "1.5px", background: "#fbbf24" }} />
                  <div style={{ position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "#fbbf24", border: "1.5px solid #27272a" }} />
                </div>,
                <div
                  key={`event-end-handle-${event.id}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setFocusedEventIndex(index);
                    const handleMouseMove = (moveEvt: MouseEvent) => {
                      if (!timelineRef.current) return;
                      const rect = timelineRef.current.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
                      handleUpdateEventTimes(index, "endTimeMs", ratio * duration * 1000);
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                      autoSaveSongMap(latestSongDataRef.current);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                  style={{ position: "absolute", left: `${endPct}%`, top: "-4px", width: "12px", height: "56px", transform: "translateX(-50%)", cursor: "col-resize", zIndex: 22, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <div style={{ width: "3px", height: "100%", borderRadius: "1.5px", background: "#fbbf24" }} />
                  <div style={{ position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "#fbbf24", border: "1.5px solid #27272a" }} />
                </div>
              ];
            })}
          </div>
        </div>

        {activeTab === 1 && editorSections.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginTop: "2px", flexWrap: "wrap" }}>
            {editorSections.map((sec, idx) => {
               const color = SECTION_PALETTE[idx % SECTION_PALETTE.length];
               const isActive = sec.id === focusedSectionId;
               const labelText = sec.category ? getCategoryLabel(sec.category) : `Section ${idx + 1}`;
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

        {activeTab === 2 && sortedEvents.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginTop: "2px", flexWrap: "wrap" }}>
            {sortedEvents.map((event: any, idx: number) => {
               const isActive = idx === focusedEventIndex;
               const labelText = event.category ? getCategoryLabel(event.category) : `Event ${idx + 1}`;
               return (
                 <button
                   key={`event-chip-${event.id}`}
                   onClick={() => {
                     setFocusedEventIndex(isActive ? null : idx);
                     if (!isActive) throttledSeek(event.startTimeMs / 1000, true);
                   }}
                   style={{
                     fontSize: "0.68rem",
                     fontWeight: 700,
                     padding: "3px 10px",
                     borderRadius: "20px",
                     background: isActive ? "#fbbf24" : "rgba(245,158,11,0.08)",
                     border: `1px solid ${isActive ? "#fbbf24" : "rgba(245,158,11,0.22)"}`,
                     color: isActive ? "#000000" : "#fbbf24",
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
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>C</kbd> Slice Section / Event</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>T</kbd> Tap Count 1 / 5</span>
        </div>
      </div>
    </div>
  );
}
