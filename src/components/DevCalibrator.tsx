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
  const [tappedDownbeatIndices, setTappedDownbeatIndices] = useState<number[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);

  const duration = videoDuration || 300;
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!songData || duration <= 0) return;

    const activeSections = songData.sections || [];
    const sortedSections = [...activeSections].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const activePhrases = songData.phrases || [];

    if (sortedSections.length === 0) {
      const defaultSec = {
        id: "sec-default",
        startTimeMs: 0,
        endTimeMs: Math.round(duration * 1000),
        label: "Intro",
        energyState: "INTRO",
        phraseIds: [],
        emoji: "🎵"
      };
      setEditorSections([defaultSec]);
      setPhrases([]);
      setTappedDownbeatIndices([]);
    } else {
      setEditorSections(sortedSections);
      setPhrases(activePhrases);

      const restoredDownbeats: number[] = [];
      activePhrases.forEach((ph: any) => {
        if (ph.calibratedBeats && ph.calibratedBeats.length > 0) {
          const firstBeatTime = ph.calibratedBeats[0].timestampMs;
          const idx = songData.absoluteBeatMap.indexOf(firstBeatTime);
          if (idx !== -1) {
            restoredDownbeats.push(idx);
          }
        }
      });
      setTappedDownbeatIndices(restoredDownbeats);
    }
  }, [songData, duration]);

  const syncSongMapState = (sections: any[], phrasesList: any[]) => {
    const updated = {
      ...songData,
      sections,
      phrases: phrasesList
    };
    setCalibratedSongData(updated);
    setSongData(updated);
  };

  const generatePhrasesForSection = (
    section: any,
    allDownbeats: number[],
    absoluteBeatMap: number[],
    genre: string
  ) => {
    const startIdx = absoluteBeatMap.findIndex(t => t >= section.startTimeMs);
    const endIdx = absoluteBeatMap.findIndex(t => t >= section.endTimeMs);
    const actualStart = startIdx !== -1 ? startIdx : 0;
    const actualEnd = endIdx !== -1 ? endIdx : absoluteBeatMap.length - 1;

    const secDownbeats = allDownbeats.filter(d => d >= actualStart && d < actualEnd);

    const sectionPhrases: any[] = [];
    let currentIdx = actualStart;

    for (const tap of secDownbeats) {
      if (tap < currentIdx) continue;

      if (tap > currentIdx) {
        sectionPhrases.push({
          id: crypto.randomUUID(),
          index: 0,
          startTimeMs: absoluteBeatMap[currentIdx],
          endTimeMs: absoluteBeatMap[tap],
          type: "NO_COUNT",
          genre,
          events: []
        });
        currentIdx = tap;
      }

      const nextEventIdx = secDownbeats.find(t => t > tap) ?? actualEnd;
      const available = nextEventIdx - tap;

      let phraseLength = 8;
      let type = "STANDARD_8_COUNT";
      if (available >= 8) {
        phraseLength = 8;
        type = "STANDARD_8_COUNT";
      } else if (available >= 4) {
        phraseLength = 4;
        type = "HALF_PHRASE_4_COUNT";
      } else {
        phraseLength = available;
        type = "TRANSITION_BREAK";
      }

      const phraseEnd = tap + phraseLength;

      const calibratedBeats = [];
      for (let k = 0; k < phraseLength; k++) {
        const beatIdx = tap + k;
        if (beatIdx < absoluteBeatMap.length) {
          calibratedBeats.push({
            count: k + 1,
            timestampMs: absoluteBeatMap[beatIdx]
          });
        }
      }

      const claveProps = genre === "SALSA" ? {
        claveDirection: "NOT_SET",
        claveIsVerified: false,
        claveSource: "DEFAULT"
      } : {};

      sectionPhrases.push({
        id: crypto.randomUUID(),
        index: 0,
        startTimeMs: absoluteBeatMap[tap],
        endTimeMs: absoluteBeatMap[phraseEnd] ?? absoluteBeatMap[absoluteBeatMap.length - 1],
        type,
        genre,
        calibratedBeats,
        events: [],
        ...claveProps
      });

      currentIdx = phraseEnd;
    }

    if (currentIdx < actualEnd) {
      sectionPhrases.push({
        id: crypto.randomUUID(),
        index: 0,
        startTimeMs: absoluteBeatMap[currentIdx],
        endTimeMs: absoluteBeatMap[actualEnd],
        type: "NO_COUNT",
        genre,
        events: []
      });
    }

    return sectionPhrases;
  };

  const repartitionAllPhrases = (sectionsList: any[], downbeatsList: number[]) => {
    const allPhrases: any[] = [];
    const updatedSections = sectionsList.map(sec => {
      const secPhrases = generatePhrasesForSection(sec, downbeatsList, songData.absoluteBeatMap, songData.genre);
      
      const phraseIds = secPhrases.map(ph => {
        allPhrases.push(ph);
        return ph.id;
      });

      return {
        ...sec,
        phraseIds
      };
    });

    allPhrases.forEach((ph, idx) => {
      ph.index = idx + 1;
    });

    setEditorSections(updatedSections);
    setPhrases(allPhrases);
    syncSongMapState(updatedSections, allPhrases);

    if (songData.genre === "SALSA") {
      allPhrases.forEach(ph => {
        if ((ph.type === "STANDARD_8_COUNT" || ph.type === "HALF_PHRASE_4_COUNT") && ph.claveDirection === "NOT_SET") {
          fetch("/api/songs/infer-clave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              youtubeId: songData.youtubeId,
              startTimeMs: ph.startTimeMs,
              endTimeMs: ph.endTimeMs
            })
          })
          .then(res => res.json())
          .then(result => {
            if (result.success && result.claveDirection) {
              setPhrases(prevPhrases => {
                const newPhrases = prevPhrases.map(p => {
                  if (p.id === ph.id && p.claveSource === "DEFAULT") {
                    return {
                      ...p,
                      claveDirection: result.claveDirection,
                      claveIsVerified: false,
                      claveSource: "AI"
                    };
                  }
                  return p;
                });
                syncSongMapState(updatedSections, newPhrases);
                return newPhrases;
              });
            }
          })
          .catch(err => console.error(err));
        }
      });
    }
  };

  const handleTap = () => {
    if (!player || !songData?.absoluteBeatMap) return;
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    const tapTimeMs = Math.round((currentTime - (userDelaySetting / 1000)) * 1000);
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < songData.absoluteBeatMap.length; i++) {
      const diff = Math.abs(songData.absoluteBeatMap[i] - tapTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const updatedDownbeats = [...tappedDownbeatIndices, closestIdx]
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b);

    setTappedDownbeatIndices(updatedDownbeats);
    repartitionAllPhrases(editorSections, updatedDownbeats);
  };

  const handleClearTaps = () => {
    setTappedDownbeatIndices([]);
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

    repartitionAllPhrases(updated, tappedDownbeatIndices);
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
    syncSongMapState(updated, phrases);
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
        label: "Intro",
        emoji: "🎵",
        energyState: "INTRO",
        startTimeMs: playheadMs,
        endTimeMs: target.endTimeMs,
        phraseIds: []
      };

      const updated = [...editorSections];
      updated[targetIdx] = { ...target, endTimeMs: playheadMs };
      updated.splice(targetIdx + 1, 0, newSec);

      repartitionAllPhrases(updated, tappedDownbeatIndices);
      setFocusedSectionId(newSec.id);
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
    repartitionAllPhrases(updated, tappedDownbeatIndices);
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
    syncSongMapState(editorSections, updatedPhrases);
  };

  const handleSave = () => {
    const result = StrictSongMapSchema.safeParse(calibratedSongData);
    if (!result.success) {
      setValidationErrors(result.error.issues);
      showToast("❌ Validation failed!");
      return;
    }

    setValidationErrors(null);
    showToast("💾 Saving beatmap...");

    fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data)
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        showToast("🎉 Beatmap saved successfully!");
      } else {
        throw new Error(res.error || "Save failed");
      }
    })
    .catch(err => {
      console.error(err);
      showToast("❌ Save failed: " + err.message);
    });
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
        throttledSeek(Math.max(0, currentTime - 2.5), true);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        throttledSeek(Math.min(duration, currentTime + 2.5), true);
        return;
      }

      if (e.key === "m" || e.key === "M" || e.key === "Enter") {
        e.preventDefault();
        handleAddNewSection();
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, editorSections, tappedDownbeatIndices, player, duration]);

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
      <div className="dev-widescreen-top-row">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {videoElement}
          
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

            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.75rem", color: "#d1d5db" }}>
              <span>Taps logged: <strong style={{ color: "#ffffff" }}>{tappedDownbeatIndices.length}</strong></span>
              {tappedDownbeatIndices.length > 0 && (
                <button
                  onClick={handleClearTaps}
                  style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <RotateCcw size={11} /> Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <DevCalibrationPanel
          songData={songData}
          editorSections={editorSections}
          phrases={phrases}
          userDelaySetting={userDelaySetting}
          onUserDelaySettingChange={setUserDelaySetting}
          onExit={onBackToCatalog}
          onResetCalibration={handleClearTaps}
          onAddNewSection={handleAddNewSection}
          onUpdateSectionField={handleUpdateSectionField}
          onUpdateSectionTimes={handleUpdateSectionTimes}
          onDeleteSection={handleDeleteSection}
          onUpdatePhraseField={handleUpdatePhraseField}
          validationErrors={validationErrors}
          onSave={handleSave}
        />
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

                return (
                  <div
                    key={sec.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedSectionId(isActive ? null : sec.id);
                      if (!isActive) throttledSeek(startSec, true);
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      background: color.bg,
                      borderRight: `1px solid ${color.border}`,
                      outline: isActive ? `2.5px solid ${color.border}` : "none",
                      outlineOffset: "-2.5px",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      overflow: "hidden",
                      cursor: "pointer"
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: color.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {sec.emoji || "🎵"} {sec.label}
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
                    cursor: "col-resize",
                    zIndex: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <div style={{ width: "3px", height: "100%", borderRadius: "1.5px", background: "rgba(255,255,255,0.4)" }} />
                  <div style={{ position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "#ffffff", border: "1.5px solid #27272a" }} />
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
                    background: isActive ? color.bg : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isActive ? color.border : "rgba(255,255,255,0.08)"}`,
                    color: isActive ? color.text : "#9ca3af",
                    cursor: "pointer"
                  }}
                >
                  {sec.emoji || "🎵"} {sec.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
