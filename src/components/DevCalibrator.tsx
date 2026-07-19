import React, { useState, useEffect, useMemo, useRef } from "react";
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
const DEVICE_CALIBRATION_KEY = "musicality.deviceCalibration";
const METRONOME_INTERVAL_MS = 600;
const REVIEWED_ANCHOR_COLORS: Record<number, string> = {
  1: "#60a5fa",
  4: "#f472b6",
  5: "#34d399",
  8: "#fbbf24"
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
  const [taps, setTaps] = useState<any[]>([]);
  const [tapCalibrationPasses, setTapCalibrationPasses] = useState<any[]>([]);
  const [reviewedAnchors, setReviewedAnchors] = useState<any[]>([]);
  const [activePassId, setActivePassId] = useState<string | null>(null);
  const [deviceCalibration, setDeviceCalibration] = useState<any>(null);
  const [metronomeActive, setMetronomeActive] = useState(false);
  const [metronomeBeat, setMetronomeBeat] = useState(0);
  const [metronomeSamples, setMetronomeSamples] = useState<number[]>([]);
  const [activeRetapRegion, setActiveRetapRegion] = useState<any>(null);
  const [verificationGroupId, setVerificationGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [focusedEventIndex, setFocusedEventIndex] = useState<number | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [saving, setSaving] = useState<boolean>(false);
  const [timelineLayers, setTimelineLayers] = useState({ sections: true, events: true, rawTaps: true, reviewed: true });
  const [timelineView, setTimelineView] = useState<"sections" | "events" | "taps" | "all">("sections");
  const [eventTimelineScope, setEventTimelineScope] = useState<"song" | "section">("song");
  const [timelineZoom, setTimelineZoom] = useState<{ startTimeMs: number; endTimeMs: number } | null>(null);
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [liveTime, setLiveTime] = useState(0);
  const [vocabularyModal, setVocabularyModal] = useState<"category" | "tag" | null>(null);
  const [vocabularyDraft, setVocabularyDraft] = useState("");

  const duration = videoDuration || 300;
  const liveDisplayTime = player ? liveTime : currentTime;
  const timelineRef = useRef<HTMLDivElement>(null);
  const latestSongDataRef = useRef<any>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<any>(null);
  const metronomeTimerRef = useRef<number | null>(null);
  const metronomeBeatTimeRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const anchorLoopTimerRef = useRef<number | null>(null);
  const reviewedAnchorOptions = songData?.genre === "BACHATA"
    ? [
      { count: 1, label: "1" },
      { count: 4, label: "Tap (4)" },
      { count: 5, label: "5" },
      { count: 8, label: "Tap (8)" }
    ]
    : [
      { count: 1, label: "1" },
      { count: 5, label: "5" }
    ];
  const countCycle = reviewedAnchorOptions.map(option => option.count);
  const vocabularyModalTitle = vocabularyModal === "category" ? "New Category" : "New Tag";

  const getEditorCurrentTime = () => {
    try {
      if (player && typeof player.getCurrentTime === "function") {
        const playerTime = player.getCurrentTime();
        if (Number.isFinite(playerTime)) return playerTime;
      }
    } catch (err) {
      console.warn(err);
    }
    return liveDisplayTime || currentTime;
  };

  const median = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  };

  const expectedNextCount = (count: number) => {
    const index = countCycle.indexOf(count);
    return countCycle[(index + 1) % countCycle.length];
  };

  const anchorLabel = (count: number) => reviewedAnchorOptions.find(option => option.count === count)?.label || String(count);
  const tapById = useMemo(() => new Map(taps.map((tap: any) => [tap.id, tap])), [taps]);

  const tapGroups = useMemo(() => {
    const anchors = [...reviewedAnchors].sort((a, b) => a.timeMs - b.timeMs);
    if (anchors.length === 0) return [];

    const gaps = anchors.slice(1).map((anchor, index) => anchor.timeMs - anchors[index].timeMs);
    const localMedianGap = median(gaps.filter(gap => gap <= 6000)) || median(gaps) || 0;
    const splitThresholdMs = localMedianGap > 0 ? Math.min(3200, localMedianGap * 1.45) : 3200;
    const rawGroups: any[][] = [];
    let currentGroup: any[] = [];

    anchors.forEach((anchor, index) => {
      if (index > 0 && anchor.timeMs - anchors[index - 1].timeMs > splitThresholdMs) {
        rawGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(anchor);
    });
    if (currentGroup.length > 0) {
      rawGroups.push(currentGroup);
    }

    return rawGroups.map((group, index) => {
      const groupGaps = group.slice(1).map((anchor, anchorIndex) => anchor.timeMs - group[anchorIndex].timeMs);
      const previousGroupAnchor = rawGroups[index - 1]?.at(-1);
      const nextGroupAnchor = rawGroups[index + 1]?.[0];
      const gapBefore = previousGroupAnchor ? group[0].timeMs - previousGroupAnchor.timeMs : 0;
      const gapAfter = nextGroupAnchor ? nextGroupAnchor.timeMs - group.at(-1).timeMs : 0;
      const cycleAnchors = group.reduce((values: any[], anchor: any) => {
        const last = values.at(-1);
        if (!last || Math.abs(anchor.timeMs - last.timeMs) > 800) {
          values.push(anchor);
        }
        return values;
      }, []);
      const cycleGaps = cycleAnchors.slice(1).map((anchor: any, anchorIndex: number) => anchor.timeMs - cycleAnchors[anchorIndex].timeMs);
      const invalidCycle = cycleAnchors.slice(1).some((anchor: any, anchorIndex: number) => anchor.count !== expectedNextCount(cycleAnchors[anchorIndex].count));
      const hasUncertain = group.some(anchor => anchor.confidence === "uncertain");
      const hasSuggested = group.some(anchor => !anchor.reviewed || anchor.confidence === "suggested");
      const hasLargeInternalGap = groupGaps.some(gap => gap > splitThresholdMs);
      const groupTapIds = new Set(group.map(anchor => anchor.tapId));
      const groupTaps = taps.filter((tap: any) => groupTapIds.has(tap.id) || (tap.correctedTimeMs >= group[0].timeMs - 250 && tap.correctedTimeMs <= group.at(-1).timeMs + 250));
      const passIds = Array.from(new Set(groupTaps.map((tap: any) => tap.passId)));
      let passDisagreement = false;
      if (passIds.length > 1) {
        const basePassId = passIds[0];
        const baseTaps = groupTaps.filter((tap: any) => tap.passId === basePassId);
        const repairTaps = groupTaps.filter((tap: any) => tap.passId !== basePassId);
        passDisagreement = repairTaps.some((tap: any) => {
          const closest = baseTaps.reduce((best: number, baseTap: any) => Math.min(best, Math.abs(baseTap.correctedTimeMs - tap.correctedTimeMs)), Infinity);
          return closest > 150;
        });
      }
      const reasons: string[] = [];
      if (index === 0 && group[0].timeMs < 20000) reasons.push("intro");
      if (cycleAnchors.length < 3) reasons.push("sparse");
      if (invalidCycle) reasons.push("pattern");
      if (hasLargeInternalGap) reasons.push("large gap");
      if (gapBefore > splitThresholdMs) reasons.push("gap before");
      if (gapAfter > splitThresholdMs) reasons.push("gap after");
      if (hasUncertain) reasons.push("uncertain");
      if (passDisagreement) reasons.push("pass disagreement");
      if (hasSuggested) reasons.push("needs review");
      if (passIds.length > 1 && !passDisagreement) reasons.push("passes agree");

      let confidence = "high";
      if (cycleAnchors.length < 3 || invalidCycle || hasLargeInternalGap || hasUncertain || passDisagreement || (index === 0 && group[0].timeMs < 20000) || ((gapBefore > splitThresholdMs || gapAfter > splitThresholdMs) && cycleAnchors.length <= 5)) {
        confidence = "low";
      } else if (cycleAnchors.length < 4 || hasSuggested) {
        confidence = "medium";
      }

      return {
        id: `tap-group-${index}`,
        index,
        anchors: group,
        startTimeMs: group[0].timeMs,
        endTimeMs: group.at(-1).timeMs,
        pattern: cycleAnchors.map((anchor: any) => anchor.count).join(" "),
        medianGapMs: median(cycleGaps),
        maxGapMs: cycleGaps.length ? Math.max(...cycleGaps) : 0,
        passIds,
        confidence,
        reasons: reasons.length ? reasons : ["stable"]
      };
    });
  }, [reviewedAnchors, taps, countCycle]);

  const verificationGroup = useMemo(() => {
    if (verificationGroupId) {
      return tapGroups.find((group: any) => group.id === verificationGroupId) || null;
    }
    return null;
  }, [tapGroups, verificationGroupId]);

  const verificationAnchors = useMemo(() => {
    if (!verificationGroup) return [];
    return [...verificationGroup.anchors].sort((a: any, b: any) => a.timeMs - b.timeMs);
  }, [verificationGroup]);

  const currentVerificationAnchor = useMemo(() => {
    if (!verificationGroup) return null;
    const liveTimeMs = liveDisplayTime * 1000;
    return verificationAnchors.find((anchor: any) => Math.abs(anchor.timeMs - liveTimeMs) <= 140) || null;
  }, [liveDisplayTime, verificationAnchors, verificationGroup]);

  const nextVerificationAnchor = useMemo(() => {
    if (!verificationGroup) return null;
    const liveTimeMs = liveDisplayTime * 1000;
    return verificationAnchors.find((anchor: any) => anchor.timeMs >= liveTimeMs - 80) || verificationAnchors[0] || null;
  }, [liveDisplayTime, verificationAnchors, verificationGroup]);

  const sectionStructureReady = useMemo(() => {
    const sections = [...editorSections].sort((a, b) => a.startTimeMs - b.startTimeMs);
    if (sections.length < 2 || sections[0]?.category !== "intro") return false;
    const songEndMs = Math.round(duration * 1000);
    if (sections[0].startTimeMs > 250 || sections.at(-1).endTimeMs < songEndMs - 250) return false;
    return sections.slice(1).every((section, index) => {
      const previous = sections[index];
      return section.startTimeMs >= previous.startTimeMs && Math.abs(section.startTimeMs - previous.endTimeMs) <= 250 && section.endTimeMs > section.startTimeMs;
    });
  }, [duration, editorSections]);

  const visibleTimeline = useMemo(() => {
    const songEndMs = Math.round(duration * 1000);
    if (!timelineZoom) return { startTimeMs: 0, endTimeMs: songEndMs };
    return {
      startTimeMs: Math.max(0, Math.min(timelineZoom.startTimeMs, songEndMs - 1000)),
      endTimeMs: Math.max(1000, Math.min(timelineZoom.endTimeMs, songEndMs))
    };
  }, [duration, timelineZoom]);

  const visibleDurationMs = Math.max(1000, visibleTimeline.endTimeMs - visibleTimeline.startTimeMs);
  const timelinePct = (timeMs: number) => ((timeMs - visibleTimeline.startTimeMs) / visibleDurationMs) * 100;
  const timelineWidthPct = (startTimeMs: number, endTimeMs: number) => ((endTimeMs - startTimeMs) / visibleDurationMs) * 100;
  const timelineRangeVisible = (startTimeMs: number, endTimeMs: number) => endTimeMs >= visibleTimeline.startTimeMs && startTimeMs <= visibleTimeline.endTimeMs;
  const clampVisibleTime = (timeMs: number) => Math.max(visibleTimeline.startTimeMs, Math.min(visibleTimeline.endTimeMs, timeMs));
  const timelineModeShowsSections = activeTab === 2
    ? eventTimelineScope === "section"
    : timelineView === "sections" || timelineView === "events" || timelineView === "taps" || (timelineView === "all" && (timelineLayers.sections || activeTab === 3));
  const timelineModeShowsEvents = activeTab === 2 || timelineView === "events" || (timelineView === "all" && timelineLayers.events);
  const timelineModeShowsRawTaps = timelineView === "taps" || (timelineView === "all" && timelineLayers.rawTaps);
  const timelineModeShowsReviewed = timelineView === "taps" || (timelineView === "all" && timelineLayers.reviewed);

  useEffect(() => {
    latestSongDataRef.current = calibratedSongData || songData;
  }, [calibratedSongData, songData]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DEVICE_CALIBRATION_KEY);
      if (stored) {
        setDeviceCalibration(JSON.parse(stored));
      }
    } catch (err) {
      console.warn(err);
    }
  }, []);

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
    if (activeTab === 1) setTimelineView("sections");
    if (activeTab === 2) {
      setTimelineView("events");
      setEventTimelineScope("song");
      setTimelineZoom(null);
    }
    if (activeTab === 3) setTimelineView("taps");
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 2 && !sectionStructureReady) {
      setActiveTab(1);
    }
  }, [activeTab, sectionStructureReady]);

  useEffect(() => {
    if (activeTab !== 2 || eventTimelineScope !== "section" || !focusedSectionId) return;
    const section = editorSections.find(sec => sec.id === focusedSectionId);
    if (!section) return;
    const liveTimeMs = liveDisplayTime * 1000;
    if (liveTimeMs > section.endTimeMs - 80 || liveTimeMs < section.startTimeMs - 250) {
      throttledSeek(section.startTimeMs / 1000, true);
    }
  }, [activeTab, editorSections, eventTimelineScope, focusedSectionId, liveDisplayTime, throttledSeek]);

  useEffect(() => {
    if (!followPlayhead || !timelineZoom) return;
    const liveTimeMs = liveDisplayTime * 1000;
    if (liveTimeMs >= visibleTimeline.startTimeMs && liveTimeMs <= visibleTimeline.endTimeMs) return;
    const windowSize = visibleTimeline.endTimeMs - visibleTimeline.startTimeMs;
    const songEndMs = duration * 1000;
    const startTimeMs = Math.max(0, Math.min(songEndMs - windowSize, liveTimeMs - windowSize * 0.35));
    setTimelineZoom({ startTimeMs, endTimeMs: startTimeMs + windowSize });
  }, [duration, followPlayhead, liveDisplayTime, timelineZoom, visibleTimeline.endTimeMs, visibleTimeline.startTimeMs]);

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
    const nextPasses = Array.isArray(songData.tapCalibrationPasses) ? songData.tapCalibrationPasses : [];
    setTapCalibrationPasses(nextPasses);
    setTaps(Array.isArray(songData.taps) ? songData.taps.sort((a: any, b: any) => a.correctedTimeMs - b.correctedTimeMs) : []);
    setReviewedAnchors(Array.isArray(songData.reviewedAnchors) ? songData.reviewedAnchors.sort((a: any, b: any) => a.timeMs - b.timeMs) : []);
    setActivePassId(nextPasses.at(-1)?.id || null);
    setFocusedEventIndex(null);
  }, [songData?.youtubeId]);

  const autoSaveSongMap = (updatedData: any) => {
    pendingSaveRef.current = updatedData;
    if (saveInFlightRef.current) return;
    const dataToSave = pendingSaveRef.current;
    pendingSaveRef.current = null;
    saveInFlightRef.current = true;
    setSaving(true);
    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataToSave)
    })
    .then(r => r.json())
    .then(res => {
      if (!res.success) {
        showToast("❌ Auto-save failed");
      }
    })
    .catch(err => {
      showToast("❌ Auto-save failed");
    })
    .finally(() => {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        autoSaveSongMap(pendingSaveRef.current);
        return;
      }
      setSaving(false);
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
    const sortedTaps = [...nextTaps].sort((a, b) => a.correctedTimeMs - b.correctedTimeMs);
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

  const updateTapCalibrationState = (nextPasses: any[], nextTaps: any[], nextAnchors: any[], triggerAutoSave = false) => {
    const sortedTaps = [...nextTaps].sort((a, b) => a.correctedTimeMs - b.correctedTimeMs);
    const sortedAnchors = [...nextAnchors].sort((a, b) => a.timeMs - b.timeMs);
    const updated = {
      ...latestSongDataRef.current,
      tapCalibrationPasses: nextPasses,
      taps: sortedTaps,
      reviewedAnchors: sortedAnchors,
      status: latestSongDataRef.current?.status === "READY" ? "READY" : "DRAFT"
    };
    setTapCalibrationPasses(nextPasses);
    setTaps(sortedTaps);
    setReviewedAnchors(sortedAnchors);
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

  const createCategory = (label: string) => {
    const id = slugify(label);
    if (!id) {
      showToast("Category needs a name.");
      return false;
    }
    if (categories.some(category => category.id === id)) {
      showToast("Category already exists.");
      return false;
    }
    const nextCategories = [...categories, { id, label: label.trim() }].sort((a, b) => a.label.localeCompare(b.label));
    setCategories(nextCategories);
    saveVocabulary("/api/categories", { schemaVersion: "1.0", categories: nextCategories }, "Category saved.");
    return true;
  };

  const createTag = (label: string) => {
    const id = slugify(label);
    if (!id) {
      showToast("Tag needs a name.");
      return false;
    }
    if (tags.some(tag => tag.id === id)) {
      showToast("Tag already exists.");
      return false;
    }
    const nextTags = [...tags, { id, label: label.trim() }].sort((a, b) => a.label.localeCompare(b.label));
    setTags(nextTags);
    saveVocabulary("/api/tags", { schemaVersion: "1.0", tags: nextTags }, "Tag saved.");
    return true;
  };

  const handleAddCategory = () => {
    setVocabularyDraft("");
    setVocabularyModal("category");
  };

  const handleAddTag = () => {
    setVocabularyDraft("");
    setVocabularyModal("tag");
  };

  const handleSaveVocabularyDraft = () => {
    if (!vocabularyModal) return;
    const didSave = vocabularyModal === "category"
      ? createCategory(vocabularyDraft)
      : createTag(vocabularyDraft);
    if (!didSave) return;
    setVocabularyModal(null);
    setVocabularyDraft("");
  };

  const playMetronomeClick = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.09);
    } catch (err) {
      console.warn(err);
    }
  };

  const startMetronomeCalibration = () => {
    if (metronomeTimerRef.current) {
      window.clearInterval(metronomeTimerRef.current);
    }
    setMetronomeSamples([]);
    setMetronomeBeat(0);
    setMetronomeActive(true);
    const tick = () => {
      metronomeBeatTimeRef.current = performance.now();
      setMetronomeBeat(value => value + 1);
      playMetronomeClick();
    };
    tick();
    metronomeTimerRef.current = window.setInterval(tick, METRONOME_INTERVAL_MS);
  };

  const stopMetronomeCalibration = () => {
    if (metronomeTimerRef.current) {
      window.clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
    setMetronomeActive(false);
    if (metronomeSamples.length === 0) return;
    const average = metronomeSamples.reduce((sum, value) => sum + value, 0) / metronomeSamples.length;
    const variance = metronomeSamples.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / metronomeSamples.length;
    const calibration = {
      inputLatencyMs: Math.round(average),
      consistencyMs: Math.round(Math.sqrt(variance)),
      createdAt: new Date().toISOString()
    };
    setDeviceCalibration(calibration);
    window.localStorage.setItem(DEVICE_CALIBRATION_KEY, JSON.stringify(calibration));
    showToast(`Device calibration saved: ${calibration.inputLatencyMs}ms.`);
  };

  useEffect(() => {
    return () => {
      if (metronomeTimerRef.current) {
        window.clearInterval(metronomeTimerRef.current);
      }
      if (anchorLoopTimerRef.current) {
        window.clearInterval(anchorLoopTimerRef.current);
      }
    };
  }, []);

  const ensureActivePass = () => {
    if (activePassId) return { passId: activePassId, passes: tapCalibrationPasses };
    return createTapPass();
  };

  const createTapPass = () => {
    const pass = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      inputLatencyMs: deviceCalibration?.inputLatencyMs || 0
    };
    const nextPasses = [...tapCalibrationPasses, pass];
    setTapCalibrationPasses(nextPasses);
    setActivePassId(pass.id);
    return { passId: pass.id, passes: nextPasses };
  };

  const suggestedCountForTap = (timeMs: number, passId: string, anchorSource = reviewedAnchors, tapSource = taps) => {
    const existingAnchors = [...anchorSource]
      .filter(anchor => tapSource.find((tap: any) => tap.id === anchor.tapId)?.passId !== passId)
      .sort((a, b) => a.timeMs - b.timeMs);
    const nearest = existingAnchors.reduce((best: any, anchor: any) => {
      if (!best || Math.abs(anchor.timeMs - timeMs) < Math.abs(best.timeMs - timeMs)) return anchor;
      return best;
    }, null);
    if (nearest && Math.abs(nearest.timeMs - timeMs) <= 800) return nearest.count;

    const previous = existingAnchors.filter(anchor => anchor.timeMs < timeMs).at(-1);
    if (!previous) return countCycle[0];
    const index = countCycle.indexOf(previous.count);
    return countCycle[(index + 1) % countCycle.length] || countCycle[0];
  };

  const buildRetapReviewedAnchors = (passId: string, region: any, nextTaps: any[], anchorSource: any[]) => {
    const tapLookup = new Map(nextTaps.map((tap: any) => [tap.id, tap]));
    const regionTaps = nextTaps
      .filter((tap: any) => tap.passId === passId && tap.correctedTimeMs >= region.startTimeMs && tap.correctedTimeMs <= region.endTimeMs)
      .sort((a: any, b: any) => a.correctedTimeMs - b.correctedTimeMs);
    const seedAnchors = anchorSource
      .filter(anchor => {
        const tap = tapLookup.get(anchor.tapId) as any;
        return tap?.passId !== passId && anchor.timeMs >= region.startTimeMs - 900 && anchor.timeMs <= region.endTimeMs + 900;
      })
      .sort((a, b) => a.timeMs - b.timeMs);
    const preservedAnchors = anchorSource.filter(anchor => {
      const tap = tapLookup.get(anchor.tapId) as any;
      const isRetapCandidate = tap?.passId === passId && !anchor.reviewed && anchor.timeMs >= region.startTimeMs && anchor.timeMs <= region.endTimeMs;
      return !isRetapCandidate;
    });
    if (regionTaps.length === 0) return preservedAnchors;

    const clusters = seedAnchors.map(anchor => ({
      seedTimeMs: anchor.timeMs,
      seedCount: anchor.count,
      taps: [] as any[]
    }));

    regionTaps.forEach((tap: any) => {
      const nearestCluster = clusters.reduce((best: any, cluster: any) => {
        const clusterTime = cluster.taps.length ? median(cluster.taps.map((sample: any) => sample.correctedTimeMs)) : cluster.seedTimeMs;
        const distance = Math.abs(clusterTime - tap.correctedTimeMs);
        if (!best || distance < best.distance) return { cluster, distance };
        return best;
      }, null);
      if (nearestCluster && nearestCluster.distance <= 900) {
        nearestCluster.cluster.taps.push(tap);
      } else {
        clusters.push({
          seedTimeMs: tap.correctedTimeMs,
          seedCount: null,
          taps: [tap]
        });
      }
    });

    const sortedClusters = clusters
      .filter(cluster => cluster.taps.length > 0)
      .map(cluster => ({
        ...cluster,
        timeMs: Math.round(median(cluster.taps.map((tap: any) => tap.correctedTimeMs)))
      }))
      .sort((a, b) => a.timeMs - b.timeMs);
    const previousAnchor = preservedAnchors
      .filter(anchor => anchor.timeMs < region.startTimeMs)
      .sort((a, b) => b.timeMs - a.timeMs)[0];
    const firstCount = previousAnchor ? expectedNextCount(previousAnchor.count) : countCycle[0];
    const firstCountIndex = Math.max(0, countCycle.indexOf(firstCount));

    const clusterAnchors = sortedClusters
      .map((cluster, index) => {
        const sampleTimes = cluster.taps.map((tap: any) => tap.correctedTimeMs);
        const clusterTimeMs = cluster.timeMs;
        const representativeTap = cluster.taps.reduce((best: any, tap: any) => {
          if (!best || Math.abs(tap.correctedTimeMs - clusterTimeMs) < Math.abs(best.correctedTimeMs - clusterTimeMs)) return tap;
          return best;
        }, null);
        return {
          id: crypto.randomUUID(),
          tapId: representativeTap.id,
          timeMs: clusterTimeMs,
          count: countCycle[(firstCountIndex + index) % countCycle.length],
          confidence: "suggested",
          reviewed: false
        };
      });

    const recalibratedAnchors = preservedAnchors.filter(anchor => {
      const tap = tapLookup.get(anchor.tapId) as any;
      const isReplacedCandidate = tap?.passId !== passId && !anchor.reviewed && anchor.timeMs >= region.startTimeMs && anchor.timeMs <= region.endTimeMs && clusterAnchors.some(clusterAnchor => Math.abs(clusterAnchor.timeMs - anchor.timeMs) <= 900);
      return !isReplacedCandidate;
    });

    return [...recalibratedAnchors, ...clusterAnchors];
  };

  const handleTap = () => {
    if (metronomeActive) {
      if (metronomeBeatTimeRef.current === null) return;
      const sample = Math.round(performance.now() - metronomeBeatTimeRef.current);
      setMetronomeSamples(current => [...current, sample]);
      setTapFlash(true);
      setTimeout(() => setTapFlash(false), 80);
      return;
    }

    if (!player) return;
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    const inputLatencyMs = deviceCalibration?.inputLatencyMs || 0;
    const rawTimeMs = Math.round(currentTime * 1000);
    const correctedTimeMs = Math.max(0, rawTimeMs - inputLatencyMs);
    if (correctedTimeMs > duration * 1000) return;
    if (activeRetapRegion && (correctedTimeMs < activeRetapRegion.startTimeMs || correctedTimeMs > activeRetapRegion.endTimeMs)) {
      showToast("Tap inside the active retap region.");
      return;
    }

    const passState = ensureActivePass();
    const tooCloseToTap = taps.some((tap: any) => tap.passId === passState.passId && Math.abs(tap.correctedTimeMs - correctedTimeMs) < 120);
    if (tooCloseToTap) {
      showToast("Tap is too close to an existing mark.");
      return;
    }

    const tap = {
      id: crypto.randomUUID(),
      timeMs: rawTimeMs,
      correctedTimeMs,
      passId: passState.passId,
      source: "manual"
    };
    const anchor = {
      id: crypto.randomUUID(),
      tapId: tap.id,
      timeMs: correctedTimeMs,
      count: suggestedCountForTap(correctedTimeMs, passState.passId),
      confidence: "suggested",
      reviewed: false
    };
    const nextTaps = [...taps, tap];
    const nextAnchors = activeRetapRegion
      ? buildRetapReviewedAnchors(passState.passId, activeRetapRegion, nextTaps, [...reviewedAnchors, anchor])
      : [...reviewedAnchors, anchor];
    updateTapCalibrationState(passState.passes, nextTaps, nextAnchors, true);
  };

  const handleUpdateReviewedAnchor = (anchorId: string, patch: any, triggerAutoSave = false) => {
    const nextAnchors = reviewedAnchors.map(anchor => {
      if (anchor.id !== anchorId) return anchor;
      return {
        ...anchor,
        ...patch,
        reviewed: patch.reviewed ?? true,
        confidence: patch.confidence || "confirmed"
      };
    });
    updateTapCalibrationState(tapCalibrationPasses, taps, nextAnchors, triggerAutoSave);
  };

  const anchorSampleCount = (anchor: any) => {
    const tap = tapById.get(anchor.tapId) as any;
    if (!tap) return 0;
    return taps.filter((sample: any) => sample.passId === tap.passId && Math.abs(sample.correctedTimeMs - anchor.timeMs) <= 900).length;
  };

  const handleAcceptGroup = (group: any) => {
    const groupAnchorIds = new Set(group.anchors.map((anchor: any) => anchor.id));
    const nextAnchors = reviewedAnchors.map(anchor => groupAnchorIds.has(anchor.id)
      ? { ...anchor, reviewed: true, confidence: "confirmed" }
      : anchor
    );
    updateTapCalibrationState(tapCalibrationPasses, taps, nextAnchors, true);
  };

  const handleMarkGroupUncertain = (group: any) => {
    const groupAnchorIds = new Set(group.anchors.map((anchor: any) => anchor.id));
    const nextAnchors = reviewedAnchors.map(anchor => groupAnchorIds.has(anchor.id)
      ? { ...anchor, reviewed: true, confidence: "uncertain" }
      : anchor
    );
    updateTapCalibrationState(tapCalibrationPasses, taps, nextAnchors, true);
  };

  const handleNudgeReviewedAnchor = (anchorId: string, deltaMs: number) => {
    const anchor = reviewedAnchors.find(item => item.id === anchorId);
    if (!anchor) return;
    handleUpdateReviewedAnchor(anchorId, { timeMs: Math.max(0, anchor.timeMs + deltaMs) }, true);
  };

  const handleDeleteRawTap = (tapId: string) => {
    const nextTaps = taps.filter(tap => tap.id !== tapId);
    const nextAnchors = reviewedAnchors.filter(anchor => anchor.tapId !== tapId);
    updateTapCalibrationState(tapCalibrationPasses, nextTaps, nextAnchors, true);
  };

  const handleLoopReviewedAnchor = (timeMs: number) => {
    const startSec = Math.max(0, (timeMs - 2000) / 1000);
    const endSec = Math.min(duration, (timeMs + 2000) / 1000);
    if (anchorLoopTimerRef.current) {
      window.clearInterval(anchorLoopTimerRef.current);
    }
    throttledSeek(startSec, true);
    try {
      player?.playVideo?.();
    } catch (err) {
      console.warn(err);
    }
    anchorLoopTimerRef.current = window.setInterval(() => {
      try {
        if (player?.getCurrentTime?.() >= endSec) {
          throttledSeek(startSec, true);
        }
      } catch (err) {
        console.warn(err);
      }
    }, 150);
    window.setTimeout(() => {
      if (anchorLoopTimerRef.current) {
        window.clearInterval(anchorLoopTimerRef.current);
        anchorLoopTimerRef.current = null;
      }
    }, 12000);
  };

  const handleLoopRegion = (startTimeMs: number, endTimeMs: number) => {
    const startSec = Math.max(0, (startTimeMs - 2000) / 1000);
    const endSec = Math.min(duration, (endTimeMs + 2000) / 1000);
    if (anchorLoopTimerRef.current) {
      window.clearInterval(anchorLoopTimerRef.current);
    }
    throttledSeek(startSec, true);
    try {
      player?.playVideo?.();
    } catch (err) {
      console.warn(err);
    }
    anchorLoopTimerRef.current = window.setInterval(() => {
      try {
        if (player?.getCurrentTime?.() >= endSec) {
          throttledSeek(startSec, true);
        }
      } catch (err) {
        console.warn(err);
      }
    }, 150);
  };

  const handleVerifyGroup = (group: any) => {
    setVerificationGroupId(group.id);
    handleLoopRegion(group.startTimeMs, group.endTimeMs);
  };

  const handleStopVerification = () => {
    setVerificationGroupId(null);
    if (anchorLoopTimerRef.current) {
      window.clearInterval(anchorLoopTimerRef.current);
      anchorLoopTimerRef.current = null;
    }
    showToast("Verification stopped.");
  };

  const handleVerifyLooksRight = () => {
    if (!verificationGroup) return;
    handleAcceptGroup(verificationGroup);
    setVerificationGroupId(null);
    if (anchorLoopTimerRef.current) {
      window.clearInterval(anchorLoopTimerRef.current);
      anchorLoopTimerRef.current = null;
    }
    showToast("Group accepted.");
  };

  const handleVerifyFeelsOff = () => {
    if (!verificationGroup) return;
    handleMarkGroupUncertain(verificationGroup);
    showToast("Group marked uncertain.");
  };

  const handleVerifyRetapAgain = () => {
    if (!verificationGroup) return;
    handleStartRetapRegion(verificationGroup);
    setVerificationGroupId(verificationGroup.id);
  };

  const handleStartRetapRegion = (group: any) => {
    const passState = createTapPass();
    const startTimeMs = Math.max(0, group.startTimeMs - 2000);
    const endTimeMs = Math.min(Math.round(duration * 1000), group.endTimeMs + 2000);
    setActiveRetapRegion({
      id: group.id,
      passId: passState.passId,
      startTimeMs,
      endTimeMs
    });
    setVerificationGroupId(group.id);
    handleLoopRegion(group.startTimeMs, group.endTimeMs);
    showToast("Retap region armed.");
  };

  const handleStopRetapRegion = () => {
    setActiveRetapRegion(null);
    setActivePassId(null);
    setVerificationGroupId(null);
    if (anchorLoopTimerRef.current) {
      window.clearInterval(anchorLoopTimerRef.current);
      anchorLoopTimerRef.current = null;
    }
    showToast("Retap region stopped.");
  };

  const handleUpdateSectionTimes = (id: string, field: "startTimeMs" | "endTimeMs", valueMs: number) => {
    const numericVal = Math.round(valueMs);
    const secIdx = editorSections.findIndex(s => s.id === id);
    if (secIdx === -1) return false;
    if (!Number.isFinite(numericVal) || numericVal < 0) {
      showToast("Enter a valid time.");
      return false;
    }

    const N = editorSections.length;
    if (N === 0) return false;

    const maxDurationMs = Math.round(duration * 1000);
    const boundaryIdx = field === "startTimeMs" ? secIdx : secIdx + 1;
    if (boundaryIdx === 0) {
      showToast("That song edge is fixed.");
      return false;
    }
    const minDurMs = 100;

    if (field === "endTimeMs" && secIdx === N - 1) {
      const section = editorSections[secIdx];
      if (numericVal <= section.startTimeMs + minDurMs || numericVal > maxDurationMs) {
        showToast("Time would make a section too short.");
        return false;
      }
      if (numericVal === section.endTimeMs) return true;
      const updated = editorSections.map((sec, i) => {
        if (i === secIdx) return { ...sec, endTimeMs: numericVal };
        return sec;
      });
      if (numericVal < maxDurationMs - minDurMs) {
        updated.push({
          id: crypto.randomUUID(),
          category: "",
          tags: [],
          startTimeMs: numericVal,
          endTimeMs: maxDurationMs
        });
      } else if (numericVal !== maxDurationMs) {
        showToast("Remaining section would be too short.");
        return false;
      }
      updateSectionsState(updated, true);
      throttledSeek(numericVal / 1000, false);
      showToast(numericVal < maxDurationMs - minDurMs ? "Remaining song section created." : "Section boundary saved.");
      return true;
    }

    if (boundaryIdx >= N) {
      showToast("That song edge is fixed.");
      return false;
    }
    const leftSection = editorSections[boundaryIdx - 1];
    const rightSection = editorSections[boundaryIdx];

    if (numericVal <= leftSection.startTimeMs + minDurMs || numericVal >= rightSection.endTimeMs - minDurMs || numericVal > maxDurationMs) {
      showToast("Time would make a section too short.");
      return false;
    }

    const updated = editorSections.map((sec, i) => {
      if (i === boundaryIdx - 1) return { ...sec, endTimeMs: numericVal };
      if (i === boundaryIdx) return { ...sec, startTimeMs: numericVal };
      return sec;
    });

    updateSectionsState(updated, true);
    throttledSeek(numericVal / 1000, false);
    showToast("Section boundary saved.");
    return true;
  };

  const handleUpdateSectionField = (id: string, field: string, value: any) => {
    const updated = editorSections.map(s => {
      if (s.id === id) {
        return { ...s, [field]: value };
      }
      return s;
    });
    updateSectionsState(updated, true);
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
    updateSectionsState(updated, true);
  };

  const handleAddNewSection = () => {
    const playheadMs = Math.round(getEditorCurrentTime() * 1000);
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
    if (idx === -1) return;
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
    const scopedSection = eventTimelineScope === "section"
      ? editorSections.find(section => section.id === focusedSectionId)
      : null;
    const rawStartTimeMs = Math.round(getEditorCurrentTime() * 1000);
    const songEndMs = Math.round(duration * 1000);
    const rangeStartMs = scopedSection ? scopedSection.startTimeMs : 0;
    const rangeEndMs = scopedSection && rawStartTimeMs >= scopedSection.startTimeMs && rawStartTimeMs < scopedSection.endTimeMs
      ? scopedSection.endTimeMs
      : songEndMs;
    const startTimeMs = Math.max(rangeStartMs, Math.min(Math.max(rangeStartMs, rangeEndMs - 1000), rawStartTimeMs));
    const defaultDurationMs = Math.min(3000, Math.max(1000, rangeEndMs - startTimeMs));
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
    updateEventsState(events, true);
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
    updateEventsState(events, true);
  };

  const handleUpdateEventTimes = (eventIndex: number, field: "startTimeMs" | "endTimeMs", valueMs: number) => {
    const events = [...(latestSongDataRef.current?.events || [])];
    const event = events[eventIndex];
    if (!event) return false;
    if (!Number.isFinite(valueMs) || valueMs < 0) {
      showToast("Enter a valid event time.");
      return false;
    }

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

    if (nextEndMs - nextStartMs < minDurMs) {
      showToast("Event range is too short.");
      return false;
    }

    events[eventIndex] = {
      ...event,
      startTimeMs: nextStartMs,
      endTimeMs: nextEndMs
    };
    updateEventsState(events, true);
    throttledSeek((field === "startTimeMs" ? nextStartMs : nextEndMs) / 1000, false);
    showToast("Event range saved.");
    return true;
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
  }, [currentTime, editorSections, taps, player, duration, activeTab, metronomeActive, metronomeSamples, reviewedAnchors, activePassId, tapCalibrationPasses, deviceCalibration]);

  const seekTimelineFromClientX = (clientX: number, immediate: boolean) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    throttledSeek((visibleTimeline.startTimeMs + ratio * visibleDurationMs) / 1000, immediate);
  };

  const timeFromTimelineClientX = (clientX: number) => {
    if (!timelineRef.current) return visibleTimeline.startTimeMs;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return visibleTimeline.startTimeMs + ratio * visibleDurationMs;
  };

  const zoomTimelineToRange = (startTimeMs: number, endTimeMs: number, paddingMs = 2500) => {
    const songEndMs = Math.round(duration * 1000);
    const paddedStart = Math.max(0, startTimeMs - paddingMs);
    const paddedEnd = Math.min(songEndMs, endTimeMs + paddingMs);
    setTimelineZoom({ startTimeMs: paddedStart, endTimeMs: Math.max(paddedStart + 1000, paddedEnd) });
  };

  const showWholeEventTimeline = () => {
    setEventTimelineScope("song");
    setFocusedSectionId(null);
    setTimelineZoom(null);
  };

  const showSectionEventTimeline = (section = editorSections.find(sec => sec.id === focusedSectionId) || editorSections.find(sec => liveDisplayTime * 1000 >= sec.startTimeMs && liveDisplayTime * 1000 <= sec.endTimeMs) || editorSections[0]) => {
    if (!section) return;
    setEventTimelineScope("section");
    setFocusedSectionId(section.id);
    zoomTimelineToRange(section.startTimeMs, section.endTimeMs, 1000);
  };

  const zoomTimelineBy = (factor: number) => {
    const songEndMs = Math.round(duration * 1000);
    const currentWindow = visibleTimeline.endTimeMs - visibleTimeline.startTimeMs;
    const nextWindow = Math.max(5000, Math.min(songEndMs, currentWindow * factor));
    const center = Math.max(0, Math.min(songEndMs, liveDisplayTime * 1000 || visibleTimeline.startTimeMs + currentWindow / 2));
    const startTimeMs = Math.max(0, Math.min(songEndMs - nextWindow, center - nextWindow / 2));
    setTimelineZoom({ startTimeMs, endTimeMs: startTimeMs + nextWindow });
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

  const sortedEvents = latestSongDataRef.current?.events || calibratedSongData?.events || songData?.events || [];
  const activeEventSection = activeTab === 2 && eventTimelineScope === "section"
    ? editorSections.find(section => section.id === focusedSectionId)
    : null;
  const activeEventSectionDurationMs = activeEventSection ? activeEventSection.endTimeMs - activeEventSection.startTimeMs : 0;
  const activeEventSectionTimeMs = activeEventSection
    ? Math.max(0, Math.min(activeEventSectionDurationMs, liveDisplayTime * 1000 - activeEventSection.startTimeMs))
    : 0;
  const eventDraftRangeStartMs = activeEventSection ? activeEventSection.startTimeMs : 0;
  const eventDraftRangeEndMs = activeEventSection ? activeEventSection.endTimeMs : Math.round(duration * 1000);
  const defaultEventDraftStartMs = Math.max(
    eventDraftRangeStartMs,
    Math.min(Math.max(eventDraftRangeStartMs, eventDraftRangeEndMs - 1000), Math.round(liveDisplayTime * 1000))
  );
  const defaultEventDraftEndMs = Math.min(eventDraftRangeEndMs, defaultEventDraftStartMs + 3000);
  const timelineStatusText = activeEventSection
    ? `${getCategoryLabel(activeEventSection.category)} · ${(activeEventSectionTimeMs / 1000).toFixed(2)}s / ${(activeEventSectionDurationMs / 1000).toFixed(2)}s · section 0.0-${(activeEventSectionDurationMs / 1000).toFixed(1)}s`
    : `${liveDisplayTime.toFixed(2)}s / ${duration.toFixed(2)}s · ${(visibleTimeline.startTimeMs / 1000).toFixed(1)}-${(visibleTimeline.endTimeMs / 1000).toFixed(1)}s`;
  const zoomedPlayheadPct = timelinePct(liveDisplayTime * 1000);
  const sectionLane = timelineView === "sections" ? { top: 0, height: 104 } : { top: 0, height: 36 };
  const eventLane = { top: 38, height: 22 };
  const rawTapLane = { top: 64, height: 16 };
  const reviewedLane = { top: 83, height: 17 };

  return (
    <>
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
          const isLocked = tabNum === 2 && !sectionStructureReady;
          
          return (
            <button
              key={tabNum}
              onClick={() => {
                if (isLocked) {
                  showToast("Add at least Intro + Rest sections before event calibration.");
                  return;
                }
                setActiveTab(tabNum);
              }}
              disabled={isLocked}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #ffffff" : "2px solid transparent",
                color: isLocked ? "#52525b" : isActive ? "#ffffff" : "#9ca3af",
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: "bold",
                cursor: isLocked ? "not-allowed" : "pointer",
                opacity: isLocked ? 0.55 : 1,
                transition: "all 0.2s ease"
              }}
            >
              {tabName}{isLocked ? " Locked" : ""}
            </button>
          );
        })}
      </div>

      {!sectionStructureReady && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "8px", border: "1px solid rgba(251,191,36,0.18)", background: "rgba(251,191,36,0.06)", color: "#fbbf24", fontSize: "0.72rem", fontWeight: 800 }}>
          <span>Events unlock after the song has at least an Intro section plus one later section covering the full song.</span>
        </div>
      )}

      {activeTab === 3 && (
        <div className={tapFlash ? "active-flash" : ""} style={{
          padding: "20px 16px",
          background: "rgba(255,255,255,0.02)",
          border: `2px solid ${tapFlash ? "#ffffff" : "#27272a"}`,
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          boxShadow: tapFlash ? "0 0 36px rgba(255,255,255,0.35)" : "none",
          transition: "all 0.08s ease"
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", background: "rgba(0,0,0,0.16)" }}>
              <span style={{ fontSize: "0.76rem", color: "#fff", fontWeight: 900, textTransform: "uppercase" }}>Device Metronome</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: metronomeActive && metronomeBeat % 2 === 1 ? "#ffffff" : "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", boxShadow: metronomeActive && metronomeBeat % 2 === 1 ? "0 0 24px rgba(255,255,255,0.65)" : "none" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", color: "#a1a1aa", fontSize: "0.72rem" }}>
                  <span>Latency: <strong style={{ color: "#fff" }}>{deviceCalibration ? `${deviceCalibration.inputLatencyMs}ms` : "none"}</strong></span>
                  <span>Consistency: <strong style={{ color: "#fff" }}>{deviceCalibration ? `${deviceCalibration.consistencyMs}ms` : "none"}</strong></span>
                  <span>Samples: <strong style={{ color: "#fff" }}>{metronomeSamples.length}</strong></span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={metronomeActive ? stopMetronomeCalibration : startMetronomeCalibration} style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: metronomeActive ? "#ffffff" : "rgba(255,255,255,0.05)", color: metronomeActive ? "#000" : "#fff", fontWeight: 900, cursor: "pointer" }}>
                  {metronomeActive ? "Save Calibration" : "Start Metronome"}
                </button>
                {metronomeActive && (
                  <button onClick={handleTap} style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>
                    Tap Sample
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", background: "rgba(0,0,0,0.16)" }}>
              <span style={{ fontSize: "0.76rem", color: "#fff", fontWeight: 900, textTransform: "uppercase" }}>Song Anchors</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", color: "#a1a1aa", fontSize: "0.72rem" }}>
                <span>Raw taps: <strong style={{ color: "#fff" }}>{taps.length}</strong></span>
                <span>Reviewed: <strong style={{ color: "#fff" }}>{reviewedAnchors.filter(anchor => anchor.reviewed).length}</strong></span>
                <span>Passes: <strong style={{ color: "#fff" }}>{tapCalibrationPasses.length}</strong></span>
                <span>Groups: <strong style={{ color: "#fff" }}>{tapGroups.length}</strong></span>
              </div>
              {activeRetapRegion && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fbbf24", fontSize: "0.7rem", fontWeight: 800 }}>
                  <span>{(activeRetapRegion.startTimeMs / 1000).toFixed(1)}s-{(activeRetapRegion.endTimeMs / 1000).toFixed(1)}s</span>
                  <button onClick={handleStopRetapRegion} style={{ padding: "2px 7px", borderRadius: "6px", border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", cursor: "pointer", fontWeight: 900 }}>Stop</button>
                </div>
              )}
              <button
                onClick={handleTap}
                disabled={metronomeActive}
                style={{
                  width: "100%",
                  height: "62px",
                  borderRadius: "8px",
                  border: `2px solid ${tapFlash ? "#ffffff" : "#3f3f46"}`,
                  background: tapFlash ? "#ffffff" : "rgba(255,255,255,0.04)",
                  cursor: metronomeActive ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                  opacity: metronomeActive ? 0.5 : 1
                }}
              >
                <span style={{ fontSize: "1rem", fontWeight: 900, color: tapFlash ? "#000" : "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Tap Anchor
                </span>
                <span style={{ fontSize: "0.66rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#71717a" }}>
                  Click or press <kbd style={{ background: "rgba(255,255,255,0.12)", borderRadius: "3px", padding: "0 3px" }}>T</kbd>
                </span>
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
            {tapGroups.map((group: any) => {
              const expanded = expandedGroups[group.id];
              const confidenceColor = group.confidence === "high" ? "#34d399" : group.confidence === "medium" ? "#fbbf24" : "#fca5a5";
              return (
                <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: group.confidence === "low" ? "rgba(248,113,113,0.08)" : group.confidence === "medium" ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.06)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ color: "#fff", fontSize: "0.76rem", fontWeight: 900 }}>Group {group.index + 1}: {(group.startTimeMs / 1000).toFixed(2)}s-{(group.endTimeMs / 1000).toFixed(2)}s</span>
                      <span style={{ color: "#a1a1aa", fontSize: "0.68rem" }}>{group.anchors.length} anchors · {group.pattern} · median gap {(group.medianGapMs / 1000 || 0).toFixed(2)}s · {group.reasons.join(", ")}</span>
                    </div>
                    <span style={{ color: confidenceColor, fontSize: "0.72rem", fontWeight: 900, textTransform: "uppercase" }}>{group.confidence}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => handleAcceptGroup(group)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.08)", color: "#34d399", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Accept Group</button>
                    <button onClick={() => handleMarkGroupUncertain(group)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Mark Uncertain</button>
                    <button onClick={() => handleStartRetapRegion(group)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(96,165,250,0.35)", background: "rgba(96,165,250,0.08)", color: "#93c5fd", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Retap Region</button>
                    <button onClick={() => handleVerifyGroup(group)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(244,114,182,0.35)", background: verificationGroup?.id === group.id ? "rgba(244,114,182,0.22)" : "rgba(244,114,182,0.08)", color: "#f9a8d4", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Verify Loop</button>
                    <button onClick={() => handleLoopRegion(group.startTimeMs, group.endTimeMs)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Loop Region</button>
                    <button onClick={() => setExpandedGroups(current => ({ ...current, [group.id]: !expanded }))} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>{expanded ? "Hide Details" : "Review Details"}</button>
                  </div>
                  {expanded && group.anchors.map((anchor: any) => {
                    const rawTap = taps.find((tap: any) => tap.id === anchor.tapId);
                    const sampleCount = anchorSampleCount(anchor);
                    return (
                      <div key={anchor.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: "8px", padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", background: anchor.reviewed ? "rgba(255,255,255,0.04)" : "rgba(251,191,36,0.08)" }}>
                        <span style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.72rem", fontWeight: 800 }}>{(anchor.timeMs / 1000).toFixed(2)}s</span>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                          {sampleCount > 1 && (
                            <span style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.08)", color: "#93c5fd", fontSize: "0.66rem", fontWeight: 900 }}>{sampleCount} samples</span>
                          )}
                          {reviewedAnchorOptions.map(option => (
                            <button key={option.count} onClick={() => handleUpdateReviewedAnchor(anchor.id, { count: option.count, reviewed: true, confidence: "confirmed" }, true)} style={{ padding: "3px 9px", borderRadius: "999px", border: `1px solid ${anchor.count === option.count ? "#ffffff" : "rgba(255,255,255,0.12)"}`, background: anchor.count === option.count ? "#ffffff" : "transparent", color: anchor.count === option.count ? "#000" : "#a1a1aa", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>
                              {option.label}
                            </button>
                          ))}
                          <button onClick={() => handleNudgeReviewedAnchor(anchor.id, -50)} style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer" }}>-50</button>
                          <button onClick={() => handleNudgeReviewedAnchor(anchor.id, 50)} style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer" }}>+50</button>
                          <button onClick={() => handleUpdateReviewedAnchor(anchor.id, { confidence: "uncertain", reviewed: true }, true)} style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", cursor: "pointer" }}>Uncertain</button>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => handleLoopReviewedAnchor(anchor.timeMs)} style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}>Loop</button>
                          <button onClick={() => rawTap && handleDeleteRawTap(rawTap.id)} style={{ padding: "3px 7px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5", cursor: "pointer" }}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {tapGroups.length === 0 && (
              <div style={{ padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", color: "#71717a", fontSize: "0.76rem", textAlign: "center" }}>No anchor taps yet.</div>
            )}
          </div>
        </div>
      )}

      <div className="dev-widescreen-top-row" style={{
        gridTemplateColumns: activeTab === 1 || activeTab === 2 ? "1.15fr 0.85fr" : "1fr"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: activeTab === 1 || activeTab === 2 ? "100%" : "800px", margin: activeTab === 1 || activeTab === 2 ? "0" : "0 auto", width: "100%" }}>
          <div style={{ position: "relative" }}>
            {videoElement}
            {activeTab === 3 && verificationGroup && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: "12px" }}>
                <div style={{ position: "absolute", top: "12px", left: "12px", right: "12px", display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{ padding: "7px 10px", borderRadius: "8px", background: "rgba(0,0,0,0.68)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: "0.72rem", fontWeight: 900 }}>
                    Verify {((verificationGroup.startTimeMs) / 1000).toFixed(2)}s-{((verificationGroup.endTimeMs) / 1000).toFixed(2)}s
                  </div>
                  {nextVerificationAnchor && (
                    <div style={{ padding: "7px 10px", borderRadius: "8px", background: "rgba(0,0,0,0.68)", border: "1px solid rgba(255,255,255,0.14)", color: "#d4d4d8", fontSize: "0.72rem", fontWeight: 900, textAlign: "right" }}>
                      Next {anchorLabel(nextVerificationAnchor.count)} in {Math.max(0, (nextVerificationAnchor.timeMs / 1000) - liveDisplayTime).toFixed(2)}s
                    </div>
                  )}
                </div>
                {currentVerificationAnchor && (
                  <div key={`${currentVerificationAnchor.id}-${Math.round(liveDisplayTime * 10)}`} style={{
                    width: "148px",
                    height: "148px",
                    borderRadius: "50%",
                    border: `5px solid ${REVIEWED_ANCHOR_COLORS[currentVerificationAnchor.count] || "#fff"}`,
                    background: currentVerificationAnchor.confidence === "uncertain" ? "rgba(251,191,36,0.16)" : currentVerificationAnchor.reviewed ? "rgba(255,255,255,0.12)" : "rgba(96,165,250,0.12)",
                    boxShadow: `0 0 ${currentVerificationAnchor.reviewed ? 54 : 32}px ${REVIEWED_ANCHOR_COLORS[currentVerificationAnchor.count] || "#fff"}aa`,
                    opacity: currentVerificationAnchor.confidence === "uncertain" ? 0.72 : currentVerificationAnchor.reviewed ? 0.96 : 0.62,
                    transform: "scale(1.08)",
                    transition: "transform 90ms ease, opacity 90ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <span style={{ color: "#fff", fontSize: currentVerificationAnchor.count === 4 || currentVerificationAnchor.count === 8 ? "1.45rem" : "3rem", fontWeight: 1000, textShadow: "0 2px 18px rgba(0,0,0,0.75)" }}>
                      {anchorLabel(currentVerificationAnchor.count)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {activeTab === 1 && (
          <DevCalibrationPanel
            editorSections={editorSections}
            categories={categories}
            tags={tags}
            onUpdateSectionField={handleUpdateSectionField}
            onUpdateSectionTime={handleUpdateSectionTimes}
            onToggleSectionTag={handleToggleSectionTag}
            onRemoveSection={handleDeleteSection}
            onAddCategory={handleAddCategory}
            onAddTag={handleAddTag}
            validationErrors={validationErrors}
          />
        )}
        {activeTab === 2 && (
          <div className="glass-panel dev-panel right-workspace-column" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px" }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                🎭 Event Ranges
              </span>
            </div>
            <EventAnnotationPanel
              events={sortedEvents}
              selectedEventIndex={focusedEventIndex}
              categories={categories}
              tags={tags}
              onSelectEvent={setFocusedEventIndex}
              onUpdateEvent={handleUpdateEventField}
              onUpdateEventTime={handleUpdateEventTimes}
              onToggleTag={handleToggleEventTag}
              onAddCategory={handleAddCategory}
              onAddTag={handleAddTag}
              onRemoveEvent={handleRemoveEvent}
              onAddEvent={handleAddEvent}
              defaultStartTimeMs={defaultEventDraftStartMs}
              defaultEndTimeMs={defaultEventDraftEndMs}
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
            {activeTab === 2 ? (
              <>
                <button onClick={showWholeEventTimeline} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: eventTimelineScope === "song" ? "#fff" : "transparent", color: eventTimelineScope === "song" ? "#000" : "#71717a", cursor: "pointer", fontWeight: 800 }}>Whole Song</button>
                <button onClick={() => showSectionEventTimeline()} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: eventTimelineScope === "section" ? "#fff" : "transparent", color: eventTimelineScope === "section" ? "#000" : "#71717a", cursor: "pointer", fontWeight: 800 }}>Loop Section</button>
              </>
            ) : (
              <>
                {(["sections", "events", "taps", "all"] as const).map(view => (
                  <button
                    key={view}
                    onClick={() => setTimelineView(view)}
                    style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: timelineView === view ? "#fff" : "transparent", color: timelineView === view ? "#000" : "#71717a", cursor: "pointer", textTransform: "capitalize", fontWeight: 800 }}
                  >
                    {view}
                  </button>
                ))}
                {timelineView === "all" && Object.entries(timelineLayers).map(([layer, visible]) => (
                  <button
                    key={layer}
                    onClick={() => setTimelineLayers(current => ({ ...current, [layer]: !visible }))}
                    style={{ fontSize: "0.65rem", padding: "3px 7px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: visible ? "rgba(255,255,255,0.9)" : "transparent", color: visible ? "#000" : "#71717a", cursor: "pointer", textTransform: "capitalize" }}
                  >
                    {layer}
                  </button>
                ))}
              </>
            )}
            <button onClick={() => activeTab === 2 ? showWholeEventTimeline() : setTimelineZoom(null)} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: timelineZoom ? "transparent" : "rgba(255,255,255,0.9)", color: timelineZoom ? "#a1a1aa" : "#000", cursor: "pointer", fontWeight: 800 }}>Fit Song</button>
            <button onClick={() => zoomTimelineBy(0.55)} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#a1a1aa", cursor: "pointer", fontWeight: 800 }}>Zoom In</button>
            <button onClick={() => zoomTimelineBy(1.8)} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#a1a1aa", cursor: "pointer", fontWeight: 800 }}>Zoom Out</button>
            <button onClick={() => setFollowPlayhead(current => !current)} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)", background: followPlayhead ? "#fff" : "transparent", color: followPlayhead ? "#000" : "#71717a", cursor: "pointer", fontWeight: 800 }}>Follow</button>
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#ffffff", fontWeight: 600 }}>
              {timelineStatusText}
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

        {activeTab === 3 && verificationGroup && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "center", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(244,114,182,0.25)", background: "rgba(244,114,182,0.08)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#fff", fontSize: "0.76rem", fontWeight: 900 }}>Verifying Group {verificationGroup.index + 1}</span>
                <span style={{ color: "#f9a8d4", fontSize: "0.7rem", fontWeight: 800 }}>{(verificationGroup.startTimeMs / 1000).toFixed(2)}s-{(verificationGroup.endTimeMs / 1000).toFixed(2)}s</span>
                <span style={{ color: verificationGroup.confidence === "high" ? "#34d399" : verificationGroup.confidence === "medium" ? "#fbbf24" : "#fca5a5", fontSize: "0.68rem", fontWeight: 900, textTransform: "uppercase" }}>{verificationGroup.confidence}</span>
                <span style={{ color: "#a1a1aa", fontSize: "0.68rem" }}>{verificationGroup.reasons.join(", ")}</span>
              </div>
              <div style={{ display: "flex", gap: "5px", alignItems: "center", overflowX: "auto", paddingBottom: "1px" }}>
                {verificationAnchors.map((anchor: any) => {
                  const isCurrent = currentVerificationAnchor?.id === anchor.id;
                  const color = REVIEWED_ANCHOR_COLORS[anchor.count] || "#ffffff";
                  return (
                    <span key={anchor.id} style={{ flex: "0 0 auto", minWidth: "34px", textAlign: "center", padding: "3px 7px", borderRadius: "999px", border: `1px solid ${isCurrent ? "#ffffff" : `${color}66`}`, background: isCurrent ? color : "rgba(0,0,0,0.18)", color: isCurrent ? "#000" : color, opacity: anchor.confidence === "uncertain" ? 0.65 : anchor.reviewed ? 1 : 0.58, fontSize: "0.66rem", fontWeight: 900 }}>
                      {anchorLabel(anchor.count)}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={handleVerifyLooksRight} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.1)", color: "#34d399", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Looks Right</button>
              <button onClick={handleVerifyFeelsOff} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Feels Off</button>
              <button onClick={handleVerifyRetapAgain} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid rgba(96,165,250,0.35)", background: "rgba(96,165,250,0.1)", color: "#93c5fd", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Retap Again</button>
              <button onClick={handleStopVerification} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}>Stop</button>
            </div>
          </div>
        )}

        <div style={{ position: "relative", padding: "8px 0" }}>
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            style={{
              position: "relative",
              height: "104px",
              borderRadius: "10px",
              background: "#0c0c0e",
              cursor: "crosshair",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "visible"
            }}
          >
            <div style={{ position: "absolute", inset: 0, borderRadius: "9px", overflow: "hidden" }}>
              {activeTab === 3 && verificationGroup && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${timelinePct(clampVisibleTime(verificationGroup.startTimeMs))}%`,
                  width: `${Math.max(timelineWidthPct(clampVisibleTime(verificationGroup.startTimeMs), clampVisibleTime(verificationGroup.endTimeMs)), 0.35)}%`,
                  background: "rgba(244,114,182,0.12)",
                  borderLeft: "1px solid rgba(244,114,182,0.7)",
                  borderRight: "1px solid rgba(244,114,182,0.7)",
                  zIndex: 6,
                  pointerEvents: "none"
                }} />
              )}
              {timelineModeShowsSections && editorSections.filter(sec => timelineRangeVisible(sec.startTimeMs, sec.endTimeMs)).map((sec, idx) => {
                const widthPct = timelineWidthPct(clampVisibleTime(sec.startTimeMs), clampVisibleTime(sec.endTimeMs));
                const leftPct = timelinePct(clampVisibleTime(sec.startTimeMs));
                const color = SECTION_PALETTE[idx % SECTION_PALETTE.length];
                const isActive = sec.id === focusedSectionId;

                return (
                  <div
                    key={sec.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedSectionId(sec.id);
                      if (activeTab === 2) {
                        showSectionEventTimeline(sec);
                      }
                    }}
                    style={{
                      position: "absolute",
                      top: `${sectionLane.top}px`,
                      height: `${sectionLane.height}px`,
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.35)}%`,
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
                  />
                );
              })}

              {timelineModeShowsEvents && sortedEvents.map((event: any, index: number) => {
                if (!timelineRangeVisible(event.startTimeMs, event.endTimeMs)) return null;
                const leftPct = timelinePct(clampVisibleTime(event.startTimeMs));
                const widthPct = timelineWidthPct(clampVisibleTime(event.startTimeMs), clampVisibleTime(event.endTimeMs));
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
                      top: `${eventLane.top}px`,
                      height: `${eventLane.height}px`,
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

              {timelineModeShowsRawTaps && taps.filter((tap: any) => tap.correctedTimeMs >= visibleTimeline.startTimeMs && tap.correctedTimeMs <= visibleTimeline.endTimeMs).map((tap: any) => (
                <div key={tap.id} title={`Raw anchor ${(tap.correctedTimeMs / 1000).toFixed(2)}s`} style={{ position: "absolute", top: `${rawTapLane.top}px`, height: `${rawTapLane.height}px`, left: `${timelinePct(tap.correctedTimeMs)}%`, width: "2px", background: "#a1a1aa", opacity: 0.72, zIndex: 8, pointerEvents: "none" }} />
              ))}

              {timelineModeShowsReviewed && reviewedAnchors.filter((anchor: any) => anchor.timeMs >= visibleTimeline.startTimeMs && anchor.timeMs <= visibleTimeline.endTimeMs).map((anchor: any) => {
                const color = REVIEWED_ANCHOR_COLORS[anchor.count] || "#ffffff";
                const top = anchor.count === 1 ? reviewedLane.top : anchor.count === 4 ? reviewedLane.top + 4 : anchor.count === 5 ? reviewedLane.top + 8 : reviewedLane.top + 12;
                return (
                  <div key={anchor.id} title={`Reviewed ${anchor.count} ${(anchor.timeMs / 1000).toFixed(2)}s`} style={{ position: "absolute", top: `${top}px`, height: "12px", left: `${timelinePct(anchor.timeMs)}%`, width: "3px", background: color, opacity: anchor.reviewed ? 0.95 : 0.55, zIndex: 9, pointerEvents: "none", boxShadow: anchor.reviewed ? `0 0 9px ${color}aa` : "none" }} />
                );
              })}

              {activeTab === 3 && verificationGroup && verificationAnchors.filter((anchor: any) => anchor.timeMs >= visibleTimeline.startTimeMs && anchor.timeMs <= visibleTimeline.endTimeMs).map((anchor: any) => {
                const color = REVIEWED_ANCHOR_COLORS[anchor.count] || "#ffffff";
                const isCurrent = currentVerificationAnchor?.id === anchor.id;
                return (
                  <div key={`verify-${anchor.id}`} title={`Verify ${anchorLabel(anchor.count)} ${(anchor.timeMs / 1000).toFixed(2)}s`} style={{
                    position: "absolute",
                    top: isCurrent ? "59px" : "66px",
                    height: isCurrent ? "40px" : "28px",
                    left: `${timelinePct(anchor.timeMs)}%`,
                    width: isCurrent ? "6px" : "4px",
                    transform: "translateX(-50%)",
                    borderRadius: "999px",
                    background: color,
                    opacity: anchor.confidence === "uncertain" ? 0.65 : anchor.reviewed ? 1 : 0.58,
                    zIndex: 14,
                    pointerEvents: "none",
                    boxShadow: isCurrent ? `0 0 16px ${color}` : `0 0 7px ${color}88`
                  }} />
                );
              })}

              <div style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${zoomedPlayheadPct}%`,
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
              if (sec.endTimeMs < visibleTimeline.startTimeMs || sec.endTimeMs > visibleTimeline.endTimeMs) return null;
              const leftPct = timelinePct(sec.endTimeMs);

              return (
                <div
                  key={`handle-${sec.id}`}
                  onMouseDown={(e) => {
                    if (activeTab !== 1) return;
                    e.stopPropagation();
                    e.preventDefault();
                    const handleMouseMove = (moveEvt: MouseEvent) => {
                      handleUpdateSectionTimes(sec.id, "endTimeMs", timeFromTimelineClientX(moveEvt.clientX));
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
                    top: "-6px",
                    width: "12px",
                    height: "116px",
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

            {activeTab === 2 && sortedEvents.flatMap((event: any, index: number) => {
              if (!timelineRangeVisible(event.startTimeMs, event.endTimeMs)) return [];
              const startPct = timelinePct(clampVisibleTime(event.startTimeMs));
              const endPct = timelinePct(clampVisibleTime(event.endTimeMs));
              return [
                <div
                  key={`event-start-handle-${event.id}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setFocusedEventIndex(index);
                    const handleMouseMove = (moveEvt: MouseEvent) => {
                      handleUpdateEventTimes(index, "startTimeMs", timeFromTimelineClientX(moveEvt.clientX));
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                      autoSaveSongMap(latestSongDataRef.current);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                  style={{ position: "absolute", left: `${startPct}%`, top: `${eventLane.top - 6}px`, width: "12px", height: `${eventLane.height + 12}px`, transform: "translateX(-50%)", cursor: "col-resize", zIndex: 22, display: "flex", alignItems: "center", justifyContent: "center" }}
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
                      handleUpdateEventTimes(index, "endTimeMs", timeFromTimelineClientX(moveEvt.clientX));
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                      autoSaveSongMap(latestSongDataRef.current);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                  style={{ position: "absolute", left: `${endPct}%`, top: `${eventLane.top - 6}px`, width: "12px", height: `${eventLane.height + 12}px`, transform: "translateX(-50%)", cursor: "col-resize", zIndex: 22, display: "flex", alignItems: "center", justifyContent: "center" }}
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
                     if (!isActive) {
                       throttledSeek(sec.startTimeMs / 1000, true);
                       zoomTimelineToRange(sec.startTimeMs, sec.endTimeMs);
                     }
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

        {activeTab === 2 && editorSections.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginTop: "2px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "#71717a", fontSize: "0.66rem", fontWeight: 900, textTransform: "uppercase" }}>Sections</span>
            {editorSections.map((sec, idx) => {
               const isActive = eventTimelineScope === "section" && sec.id === focusedSectionId;
               const labelText = sec.category ? getCategoryLabel(sec.category) : `Section ${idx + 1}`;
               return (
                 <button
                   key={`event-section-chip-${sec.id}`}
                   onClick={() => {
                     throttledSeek(sec.startTimeMs / 1000, true);
                     showSectionEventTimeline(sec);
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
            <span style={{ color: "#71717a", fontSize: "0.66rem", fontWeight: 900, textTransform: "uppercase" }}>Events</span>
            {sortedEvents.map((event: any, idx: number) => {
               const isActive = idx === focusedEventIndex;
               const labelText = event.category ? getCategoryLabel(event.category) : `Event ${idx + 1}`;
               return (
                 <button
                   key={`event-chip-${event.id}`}
                   onClick={() => {
                     setFocusedEventIndex(isActive ? null : idx);
                     if (!isActive) {
                       throttledSeek(event.startTimeMs / 1000, true);
                       zoomTimelineToRange(event.startTimeMs, event.endTimeMs);
                     }
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
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", padding: "1px 4px", color: "#fff", marginRight: "4px" }}>T</kbd> Tap Anchor</span>
        </div>
      </div>
    </div>
    {vocabularyModal && (
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.62)",
        padding: "20px"
      }}>
        <div style={{
          width: "min(420px, 100%)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#09090b",
          padding: "18px",
          boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }}>
          <span style={{ color: "#fff", fontSize: "1rem", fontWeight: 900 }}>{vocabularyModalTitle}</span>
          <input
            autoFocus
            value={vocabularyDraft}
            onChange={(event) => setVocabularyDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSaveVocabularyDraft();
              if (event.key === "Escape") setVocabularyModal(null);
            }}
            placeholder={vocabularyModal === "category" ? "Example: chorus" : "Example: hide downbeats"}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 800
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              onClick={() => {
                setVocabularyModal(null);
                setVocabularyDraft("");
              }}
              style={{ padding: "7px 12px", borderRadius: "7px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#d4d4d8", fontWeight: 800, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveVocabularyDraft}
              style={{ padding: "7px 12px", borderRadius: "7px", border: "1px solid rgba(96,165,250,0.45)", background: "rgba(96,165,250,0.16)", color: "#93c5fd", fontWeight: 900, cursor: "pointer" }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
