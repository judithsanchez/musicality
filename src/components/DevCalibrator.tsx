import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Play, Pause, RotateCcw, Save, Trash, Plus, Lock, Unlock, Zap, RefreshCw, VolumeX } from "lucide-react";
import { Beat, Section, BeatmapSchema } from "../types/beatmap";

interface DevCalibratorProps {
  songData: BeatmapSchema;
  originalSongData: BeatmapSchema;
  calibratedSongData: BeatmapSchema | null;
  setCalibratedSongData: (data: BeatmapSchema) => void;
  setSongData: (data: BeatmapSchema) => void;
  setOriginalSongData: (data: BeatmapSchema) => void;
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
}

interface EditorSection {
  id: string;
  name: string;
  startTimestamp: number;
  endTimestamp: number;
  focus: string;
  emoji: string;
}

interface SectionCalibrationStats {
  totalTaps: number;
  matchedTaps: number;
  outliersCount: number;
  medianDiffMs: number;
}

export default function DevCalibrator({
  songData,
  originalSongData,
  calibratedSongData,
  setCalibratedSongData,
  setSongData,
  setOriginalSongData,
  breaks,
  setBreaks,
  currentTime,
  videoDuration,
  player,
  throttledSeek,
  userDelaySetting,
  setUserDelaySetting,
  onBackToCatalog,
  showToast
}: DevCalibratorProps) {
  // Sync the local editor sections list with the song data sections
  const [editorSections, setEditorSections] = useState<EditorSection[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  
  // Section-specific tap recording buffer
  const [sectionTaps, setSectionTaps] = useState<Record<string, number[]>>({});
  
  // Localized section calibration stats
  const [localStats, setLocalStats] = useState<Record<string, SectionCalibrationStats>>({});

  // Visual animation trigger for tap button
  const [tapFlash, setTapFlash] = useState(false);

  // Load and format sections on mount / song change
  useEffect(() => {
    if (songData) {
      const sorted = [...(songData.sections || [])].sort((a, b) => a.startTimestamp - b.startTimestamp);
      const formatted = sorted.map((sec, idx) => {
        const start = sec.startTimestamp;
        const end = (idx < sorted.length - 1) ? sorted[idx + 1].startTimestamp : videoDuration;
        return {
          id: `sec-${idx}-${sec.name}`,
          name: sec.name,
          startTimestamp: start,
          endTimestamp: end,
          focus: sec.focus || "",
          emoji: sec.emoji || "🎵"
        };
      });
      setEditorSections(formatted);
    }
  }, [songData, videoDuration]);

  // Keep focus within bounds and manage auto-seek when focusing
  const handleFocusSection = (secId: string) => {
    if (focusedSectionId === secId) {
      setFocusedSectionId(null);
    } else {
      setFocusedSectionId(secId);
      const sec = editorSections.find(s => s.id === secId);
      if (sec) {
        throttledSeek(sec.startTimestamp, true);
        showToast(`🔍 Focused on ${sec.name}. Metronomes muted. Deck is listening.`);
      }
    }
  };

  // Timeline Contiguous boundary adjustments
  const handleUpdateSectionTimes = (id: string, field: "startTimestamp" | "endTimestamp", value: number) => {
    const numericVal = parseFloat(value.toFixed(2));
    
    setEditorSections(prev => {
      const list = prev.map(sec => ({ ...sec }));
      const idx = list.findIndex(sec => sec.id === id);
      if (idx === -1) return prev;
      
      if (field === "startTimestamp") {
        list[idx].startTimestamp = numericVal;
        if (idx > 0) {
          list[idx - 1].endTimestamp = numericVal;
        }
      } else if (field === "endTimestamp") {
        list[idx].endTimestamp = numericVal;
        if (idx < list.length - 1) {
          list[idx + 1].startTimestamp = numericVal;
        }
      }
      
      // Update the active songData in memory
      syncSectionsToMemory(list);
      return list;
    });

    throttledSeek(numericVal, false);
  };

  const handleUpdateSectionName = (id: string, name: string) => {
    setEditorSections(prev => {
      const updated = prev.map(sec => sec.id === id ? { ...sec, name } : sec);
      syncSectionsToMemory(updated);
      return updated;
    });
  };

  const handleUpdateSectionMetadata = (id: string, field: "focus" | "emoji", value: string) => {
    setEditorSections(prev => {
      const updated = prev.map(sec => sec.id === id ? { ...sec, [field]: value } : sec);
      syncSectionsToMemory(updated);
      return updated;
    });
  };

  const handleAddNewSection = () => {
    if (!player) return;
    const currentPlayhead = parseFloat(player.getCurrentTime().toFixed(2));
    
    const newSec: EditorSection = {
      id: `sec-new-${Date.now()}`,
      name: "New Section",
      startTimestamp: currentPlayhead,
      endTimestamp: parseFloat((currentPlayhead + 10).toFixed(2)),
      focus: "",
      emoji: "🎵"
    };
    
    const updated = [...editorSections, newSec].sort((a, b) => a.startTimestamp - b.startTimestamp);
    const contiguous = updated.map((sec, idx) => {
      const start = sec.startTimestamp;
      const end = (idx < updated.length - 1) ? updated[idx + 1].startTimestamp : videoDuration;
      return {
        ...sec,
        startTimestamp: start,
        endTimestamp: end
      };
    });
    
    setEditorSections(contiguous);
    setFocusedSectionId(newSec.id);
    syncSectionsToMemory(contiguous);
    showToast("➕ Added new section! Focus active.");
  };

  const handleDeleteSection = (id: string) => {
    const updated = editorSections.filter(sec => sec.id !== id);
    // Force contiguous boundary merge
    const contiguous = updated.map((sec, idx) => {
      const start = sec.startTimestamp;
      const end = (idx < updated.length - 1) ? updated[idx + 1].startTimestamp : videoDuration;
      return {
        ...sec,
        startTimestamp: start,
        endTimestamp: end
      };
    });
    setEditorSections(contiguous);
    if (focusedSectionId === id) setFocusedSectionId(null);
    syncSectionsToMemory(contiguous);
    showToast("🗑️ Section removed.");
  };

  const syncSectionsToMemory = (secsList: EditorSection[]) => {
    const dbSections = secsList.map(sec => ({
      name: sec.name,
      startTimestamp: parseFloat(sec.startTimestamp.toFixed(3)),
      focus: sec.focus,
      emoji: sec.emoji
    })).sort((a, b) => a.startTimestamp - b.startTimestamp);

    const activeMap = calibratedSongData || songData;
    if (activeMap) {
      const updated = {
        ...activeMap,
        sections: dbSections
      };
      setSongData(updated);
      setCalibratedSongData(updated);
    }
  };

  // TAP ON 1 Action Logger
  const handleTap = () => {
    if (!focusedSectionId) {
      showToast("⚠️ Please select and Focus a section before tapping to calibrate!");
      return;
    }

    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);

    const activeSec = editorSections.find(s => s.id === focusedSectionId);
    if (!activeSec) return;

    // Check if tap falls within active section bounds to prevent contamination
    if (currentTime < activeSec.startTimestamp || currentTime > activeSec.endTimestamp) {
      showToast("⚠️ Tap ignored: playback is outside the focused section boundaries!");
      return;
    }

    setSectionTaps(prev => {
      const currentList = prev[focusedSectionId] || [];
      const updatedList = [...currentList, currentTime].sort((a, b) => a - b);
      return {
        ...prev,
        [focusedSectionId]: updatedList
      };
    });
  };

  // Global spacebar event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && focusedSectionId) {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedSectionId, currentTime]);

  const handleClearTaps = (secId: string) => {
    setSectionTaps(prev => {
      const copy = { ...prev };
      delete copy[secId];
      return copy;
    });
    setLocalStats(prev => {
      const copy = { ...prev };
      delete copy[secId];
      return copy;
    });
    showToast("🔄 Taps cleared for this section.");
  };

  // Isolated Grid Shift Normalization
  const handleNormalizeSection = (secId: string) => {
    const sec = editorSections.find(s => s.id === secId);
    const taps = sectionTaps[secId];
    if (!sec || !taps || taps.length === 0) {
      showToast("⚠️ Record at least 1 tap inside the section to normalize!");
      return;
    }

    const baseSong = originalSongData || songData;
    if (!baseSong) return;

    const delay = userDelaySetting / 1000;
    const correctedTaps = taps.map(t => t - delay);

    // Filter beats of baseline that reside inside section boundaries
    const sectionBeats = baseSong.beats.filter(
      b => b.timestamp >= sec.startTimestamp && b.timestamp <= sec.endTimestamp
    );

    if (sectionBeats.length === 0) {
      showToast("⚠️ No beats found within section boundaries in the baseline beatmap!");
      return;
    }

    const sectionBeat1s = sectionBeats.filter(b => b.beat === 1);
    if (sectionBeat1s.length === 0) {
      showToast("⚠️ No downbeats (count 1) found in this section to align!");
      return;
    }

    // 1. Calculate local phase shift based on first tap
    const firstTap = correctedTaps[0];
    let bestBeat1 = sectionBeat1s[0];
    let minDiff = Infinity;
    for (const b1 of sectionBeat1s) {
      const diff = Math.abs(firstTap - b1.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        bestBeat1 = b1;
      }
    }
    const localShift = firstTap - bestBeat1.timestamp;

    // Shift section beats temporarily as baseline
    const shiftedSectionBeats = sectionBeats.map(b => ({
      ...b,
      timestamp: parseFloat(Math.max(sec.startTimestamp, Math.min(sec.endTimestamp, b.timestamp + localShift)).toFixed(3))
    }));

    let finalSectionBeats = shiftedSectionBeats;
    let matchedCount = 1;
    let outlierCount = 0;
    let medianDiff = localShift;

    // 2. Local piecewise-linear warping if multiple taps are registered
    if (correctedTaps.length > 1) {
      const alignedBeat1Times = shiftedSectionBeats
        .map((b, idx) => ({ ...b, sectionIndex: idx }))
        .filter(b => b.beat === 1);

      const matchedPairs: any[] = [];
      correctedTaps.forEach(ct => {
        let bestB1 = null;
        let minD = Infinity;
        for (const b1 of alignedBeat1Times) {
          const d = Math.abs(ct - b1.timestamp);
          if (d < minD) {
            minD = d;
            bestB1 = b1;
          }
        }
        if (bestB1 && minD < 0.400) {
          matchedPairs.push({
            correctedTime: ct,
            originalTime: bestB1.timestamp,
            sectionIndex: bestB1.sectionIndex,
            diff: ct - bestB1.timestamp
          });
        }
      });

      if (matchedPairs.length > 0) {
        const diffs = matchedPairs.map(p => p.diff);
        const sortedDiffs = [...diffs].sort((a, b) => a - b);
        medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)];
        
        // Filter outliers deviating by > 150ms from local median
        const cleanPairs = matchedPairs.filter(p => Math.abs(p.diff - medianDiff) <= 0.150);
        outlierCount = matchedPairs.length - cleanPairs.length;
        matchedCount = cleanPairs.length;

        if (cleanPairs.length > 0) {
          const anchorsMap: Record<number, any> = {};
          cleanPairs.forEach(p => {
            if (!anchorsMap[p.sectionIndex]) {
              anchorsMap[p.sectionIndex] = {
                sectionIndex: p.sectionIndex,
                originalTime: p.originalTime,
                tappedTimesList: []
              };
            }
            anchorsMap[p.sectionIndex].tappedTimesList.push(p.correctedTime);
          });

          const cleanAnchors = Object.values(anchorsMap).map((a: any) => {
            const avgTappedTime = a.tappedTimesList.reduce((sum: number, val: number) => sum + val, 0) / a.tappedTimesList.length;
            return {
              sectionIndex: a.sectionIndex,
              originalTime: a.originalTime,
              tappedTime: avgTappedTime
            };
          }).sort((a, b) => a.sectionIndex - b.sectionIndex);

          // Piecewise-linear warping calculations exclusively for this section
          finalSectionBeats = shiftedSectionBeats.map((b, idx) => {
            let warpedTime = b.timestamp;
            let leftAnchor = null;
            let rightAnchor = null;

            for (const a of cleanAnchors) {
              if (a.sectionIndex <= idx) {
                leftAnchor = a;
              } else if (a.sectionIndex > idx && !rightAnchor) {
                rightAnchor = a;
              }
            }

            if (leftAnchor && rightAnchor) {
              const oLeft = leftAnchor.originalTime;
              const oRight = rightAnchor.originalTime;
              const tLeft = leftAnchor.tappedTime;
              const tRight = rightAnchor.tappedTime;
              const dO = oRight - oLeft;
              const dT = tRight - tLeft;
              if (dO > 0) {
                warpedTime = tLeft + ((b.timestamp - oLeft) / dO) * dT;
              } else {
                warpedTime = tLeft;
              }
            } else if (leftAnchor) {
              const offset = leftAnchor.tappedTime - leftAnchor.originalTime;
              warpedTime = b.timestamp + offset;
            } else if (rightAnchor) {
              const offset = rightAnchor.tappedTime - rightAnchor.originalTime;
              warpedTime = b.timestamp + offset;
            }

            // Piecewise modular re-indexing inside the active section
            let newBeatNum = b.beat;
            if (leftAnchor) {
              newBeatNum = (((idx - leftAnchor.sectionIndex) % 8 + 8) % 8 + 1) as any;
            } else if (rightAnchor) {
              newBeatNum = (((idx - rightAnchor.sectionIndex) % 8 + 8) % 8 + 1) as any;
            }

            return {
              timestamp: parseFloat(Math.max(sec.startTimestamp, Math.min(sec.endTimestamp, warpedTime)).toFixed(3)),
              beat: newBeatNum
            };
          });
        }
      }
    }

    // Merge warped section beats back into main beat list (beats outside the section are untouched!)
    const activeBeats = calibratedSongData?.beats || songData.beats || [];
    const mergedBeats = activeBeats.map(b => {
      if (b.timestamp >= sec.startTimestamp && b.timestamp <= sec.endTimestamp) {
        // Find matching original beat index in sectionBeats
        const idx = sectionBeats.findIndex(sb => sb.timestamp === b.timestamp);
        if (idx !== -1) return finalSectionBeats[idx];
      }
      return b;
    }).sort((a, b) => a.timestamp - b.timestamp);

    const updatedBeatmap = {
      ...(calibratedSongData || songData),
      beats: mergedBeats
    };

    setCalibratedSongData(updatedBeatmap);
    
    // Save section calibration stats
    setLocalStats(prev => ({
      ...prev,
      [secId]: {
        totalTaps: taps.length,
        matchedTaps: matchedCount,
        outliersCount: outlierCount,
        medianDiffMs: Math.round((medianDiff + localShift) * 1000)
      }
    }));

    showToast(`✅ Normalized ${sec.name}! Isolated shift applied to ${sectionBeats.length} beats.`);
  };

  // Work-Saving Persistence
  const handleSaveSectionToDisk = (secId: string) => {
    const sec = editorSections.find(s => s.id === secId);
    if (!sec) return;

    const activeBeatmap = calibratedSongData || songData;
    const baseSong = originalSongData || songData;
    if (!activeBeatmap || !baseSong) return;

    // Local section calibration metadata logs
    const stats = localStats[secId];
    const rawSectionTaps = sectionTaps[secId] || [];

    const calibration = {
      recordedAt: new Date().toISOString(),
      sectionName: sec.name,
      sectionBounds: { start: sec.startTimestamp, end: sec.endTimestamp },
      tapCount: rawSectionTaps.length,
      rawTaps: rawSectionTaps.map(t => parseFloat(t.toFixed(3))),
      reactionDelayMs: userDelaySetting,
      stats: stats || null
    };

    const payload = {
      youtubeId: baseSong.metadata?.youtubeId || 'calibrated_song',
      activeBeatmap: {
        ...activeBeatmap,
        tapCalibration: calibration,
        breaks: breaks
      },
      originalBeatmap: {
        ...baseSong,
        breaks: breaks
      },
      calibration: calibration
    };

    showToast(`💾 Saving calibrated section ${sec.name} permanently...`);

    fetch("/api/save-beatmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("Server write failed");
        return res.json();
      })
      .then(result => {
        if (result.success) {
          setOriginalSongData(JSON.parse(JSON.stringify(activeBeatmap)));
          setSongData(JSON.parse(JSON.stringify(activeBeatmap)));
          // Clear localized active section taps to finalize focus
          setSectionTaps(prev => {
            const copy = { ...prev };
            delete copy[secId];
            return copy;
          });
          showToast(`✅ Saved ${sec.name} & committed baseline files!`);
        } else {
          throw new Error(result.error);
        }
      })
      .catch(err => {
        console.error("Save section failed:", err);
        showToast("❌ Save to disk failed. Check console.");
      });
  };

  const activeFocusedSec = editorSections.find(s => s.id === focusedSectionId);

  return (
    <div className="glass-panel dev-calibrator-workbench" style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "20px", width: "100%", border: "1px solid rgba(139, 92, 246, 0.3)", background: "rgba(10, 5, 20, 0.75)", backdropFilter: "blur(12px)", borderRadius: "20px" }}>
      
      {/* Upper control header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
        <span style={{ fontSize: "1rem", fontWeight: "900", color: "#c084fc", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" }}>
          🛠️ Downbeat Calibration Workbench
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "0.75rem", color: "#6b7280", background: "rgba(255,255,255,0.05)", padding: "4px 10px", borderRadius: "8px", fontWeight: "bold" }}>DEV CONSOLE</span>
          <button 
            onClick={onBackToCatalog}
            style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", padding: "4px 12px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: "700", cursor: "pointer", transition: "all 0.2s ease" }}
          >
            Exit Dev Mode
          </button>
        </div>
      </div>

      {/* Latency Offset Slider */}
      <div className="dev-panel" style={{ display: "flex", flexDirection: "column", gap: "8px", background: "rgba(255,255,255,0.02)", padding: "14px 18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: "800", color: "#fb923c", textTransform: "uppercase", letterSpacing: "0.5px" }}>Reaction delay compensation</span>
          <span style={{ fontSize: "0.85rem", fontWeight: "800", color: "#fb923c" }}>{userDelaySetting}ms</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="500" 
          step="10" 
          value={userDelaySetting}
          onChange={(e) => setUserDelaySetting(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: "#fb923c" }}
        />
        <span style={{ fontSize: "0.7rem", color: "#6b7280", fontStyle: "italic" }}>
          Latency delay subtracted from tap events (default 200ms reaction offset).
        </span>
      </div>

      {/* The Pure Listening Tapping Deck */}
      {focusedSectionId ? (
        <div 
          className={`glass-panel listening-tapping-deck ${tapFlash ? "active-flash" : ""}`}
          style={{
            padding: "24px",
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.03) 100%)",
            border: "2px solid rgba(139, 92, 246, 0.4)",
            borderRadius: "16px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
            boxShadow: tapFlash ? "0 0 40px rgba(139, 92, 246, 0.3)" : "none",
            transition: "all 0.1s ease"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(139, 92, 246, 0.15)", padding: "6px 14px", borderRadius: "20px", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
            <span style={{ fontSize: "1.4rem" }}>{activeFocusedSec?.emoji}</span>
            <span style={{ fontWeight: "800", color: "#fff", textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.5px" }}>
              Focusing: {activeFocusedSec?.name}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#a78bfa", marginLeft: "6px", background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: "6px" }}>
              🎧 Metronome Muted
            </span>
          </div>

          {/* TAP ON 1 Button */}
          <button
            onClick={handleTap}
            style={{
              width: "100%",
              height: "100px",
              borderRadius: "18px",
              border: "3px solid #8b5cf6",
              background: tapFlash ? "linear-gradient(135deg, #a78bfa, #8b5cf6)" : "rgba(139, 92, 246, 0.1)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              boxShadow: tapFlash ? "0 0 25px rgba(167, 139, 250, 0.4)" : "none",
              transition: "all 0.08s ease"
            }}
          >
            <span style={{ fontSize: "1.5rem", fontWeight: "900", color: tapFlash ? "#000" : "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>TAP ON "1"</span>
            <span style={{ fontSize: "0.75rem", color: tapFlash ? "rgba(0,0,0,0.6)" : "#a78bfa" }}>
              (Or press Spacebar inside focused browser tab)
            </span>
          </button>

          {/* Taps count banner */}
          <div style={{ fontSize: "0.8rem", color: "#e5e7eb", fontWeight: "600" }}>
            Taps logged in section: <strong style={{ color: "#34d399", fontSize: "0.95rem" }}>{(sectionTaps[focusedSectionId] || []).length}</strong>
          </div>
        </div>
      ) : (
        <div style={{ padding: "20px", textAlign: "center", background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "16px", color: "#6b7280", fontStyle: "italic", fontSize: "0.85rem" }}>
          💡 Click "Focus Section" on any section below to open the listening tapping deck and calibrate its downbeats securely.
        </div>
      )}

      {/* Sections Manager Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: "800", color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
          🏷️ Section Timeline Boundaries
        </span>
        <button 
          onClick={handleAddNewSection} 
          disabled={focusedSectionId !== null}
          style={{ padding: "6px 14px", fontSize: "0.75rem", fontWeight: "700", background: focusedSectionId ? "rgba(255,255,255,0.02)" : "rgba(56, 189, 248, 0.15)", border: `1px solid ${focusedSectionId ? "rgba(255,255,255,0.05)" : "rgba(56, 189, 248, 0.3)"}`, color: focusedSectionId ? "#4b5563" : "#38bdf8", cursor: focusedSectionId ? "not-allowed" : "pointer", borderRadius: "8px", transition: "all 0.2s ease" }}
        >
          ➕ Add Section
        </button>
      </div>

      {/* Sections List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {editorSections.map((sec, idx) => {
          const isFocused = focusedSectionId === sec.id;
          const isAnyFocused = focusedSectionId !== null;
          const isDimmed = isAnyFocused && !isFocused;
          
          const taps = sectionTaps[sec.id] || [];
          const stats = localStats[sec.id];

          return (
            <div 
              key={sec.id} 
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "16px",
                borderRadius: "14px",
                border: isFocused ? "2px solid #8b5cf6" : "1px solid rgba(255,255,255,0.06)",
                background: isFocused ? "rgba(139, 92, 246, 0.04)" : "rgba(255,255,255,0.02)",
                opacity: isDimmed ? 0.35 : 1,
                pointerEvents: isDimmed ? "none" : "auto",
                boxShadow: isFocused ? "0 4px 20px rgba(139, 92, 246, 0.1)" : "none",
                transition: "all 0.3s ease"
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input 
                  type="text" 
                  value={sec.emoji}
                  onChange={(e) => handleUpdateSectionMetadata(sec.id, "emoji", e.target.value)}
                  placeholder="Emoji"
                  disabled={isDimmed}
                  style={{ width: "38px", textAlign: "center", padding: "6px", fontSize: "0.9rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#fff" }}
                />
                <input 
                  type="text" 
                  value={sec.name} 
                  onChange={(e) => handleUpdateSectionName(sec.id, e.target.value)}
                  placeholder="e.g. Verse, Chorus, Montuno"
                  disabled={isDimmed}
                  style={{ flexGrow: 1, padding: "6px 12px", fontSize: "0.85rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#fff", fontWeight: "bold" }}
                />
                
                {/* Focus toggle button */}
                <button
                  onClick={() => handleFocusSection(sec.id)}
                  style={{
                    background: isFocused ? "rgba(139, 92, 246, 0.25)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${isFocused ? "rgba(139, 92, 246, 0.5)" : "rgba(255,255,255,0.1)"}`,
                    color: isFocused ? "#c084fc" : "#9ca3af",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.2s ease"
                  }}
                  title={isFocused ? "Release section focus" : "Focus on this section to calibrate"}
                >
                  {isFocused ? <Lock size={12} /> : <Unlock size={12} />}
                  <span>{isFocused ? "Focused" : "Focus"}</span>
                </button>

                {/* Delete button */}
                {!isFocused && !isAnyFocused && (
                  <button 
                    onClick={() => handleDeleteSection(sec.id)}
                    style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#f87171", padding: "6px", borderRadius: "8px", cursor: "pointer" }}
                    title="Delete section"
                  >
                    <Trash size={14} />
                  </button>
                )}
              </div>

              {/* Focus Instrument */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.75rem", color: "#9ca3af", width: "110px", flexShrink: 0 }}>Focus Instrument:</span>
                <input 
                  type="text" 
                  value={sec.focus} 
                  onChange={(e) => handleUpdateSectionMetadata(sec.id, "focus", e.target.value)}
                  placeholder="e.g. Cowbell (Campana)"
                  disabled={isDimmed}
                  style={{ flexGrow: 1, padding: "5px 10px", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)", color: "#e5e7eb" }}
                />
              </div>

              {/* Sliders for boundaries */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                {/* Start boundary */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#9ca3af" }}>
                    <span>Start Timestamp</span>
                    <strong style={{ color: "#38bdf8" }}>{sec.startTimestamp.toFixed(2)}s</strong>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input 
                      type="range" 
                      min="0" 
                      max={videoDuration || 300} 
                      step="0.05" 
                      value={sec.startTimestamp}
                      disabled={isDimmed}
                      onChange={(e) => handleUpdateSectionTimes(sec.id, "startTimestamp", parseFloat(e.target.value))}
                      style={{ flexGrow: 1, accentColor: "#38bdf8" }}
                    />
                    <button 
                      className="btn-dev-sync" 
                      disabled={isDimmed}
                      onClick={() => { if (!player) return; handleUpdateSectionTimes(sec.id, "startTimestamp", player.getCurrentTime()); }}
                      style={{ padding: "4px 8px", fontSize: "0.7rem" }}
                    >
                      Mark
                    </button>
                  </div>
                  {!isDimmed && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "startTimestamp", sec.startTimestamp - 0.5)}>-0.5s</button>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "startTimestamp", sec.startTimestamp - 0.1)}>-0.1s</button>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "startTimestamp", sec.startTimestamp + 0.1)}>+0.1s</button>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "startTimestamp", sec.startTimestamp + 0.5)}>+0.5s</button>
                    </div>
                  )}
                </div>

                {/* End boundary */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#9ca3af" }}>
                    <span>End Timestamp</span>
                    <strong style={{ color: "#f43f5e" }}>{sec.endTimestamp.toFixed(2)}s</strong>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input 
                      type="range" 
                      min="0" 
                      max={videoDuration || 300} 
                      step="0.05" 
                      value={sec.endTimestamp}
                      disabled={isDimmed}
                      onChange={(e) => handleUpdateSectionTimes(sec.id, "endTimestamp", parseFloat(e.target.value))}
                      style={{ flexGrow: 1, accentColor: "#f43f5e" }}
                    />
                    <button 
                      className="btn-dev-sync" 
                      disabled={isDimmed}
                      onClick={() => { if (!player) return; handleUpdateSectionTimes(sec.id, "endTimestamp", player.getCurrentTime()); }}
                      style={{ padding: "4px 8px", fontSize: "0.7rem" }}
                    >
                      Mark
                    </button>
                  </div>
                  {!isDimmed && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "endTimestamp", sec.endTimestamp - 0.5)}>-0.5s</button>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "endTimestamp", sec.endTimestamp - 0.1)}>-0.1s</button>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "endTimestamp", sec.endTimestamp + 0.1)}>+0.1s</button>
                      <button className="btn-step" onClick={() => handleUpdateSectionTimes(sec.id, "endTimestamp", sec.endTimestamp + 0.5)}>+0.5s</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Local Calibration Status Dashboard (only displayed if focused) */}
              {isFocused && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", marginTop: "6px" }}>
                  {stats && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "rgba(52, 211, 153, 0.05)", padding: "10px", borderRadius: "10px", border: "1px solid rgba(52, 211, 153, 0.15)", fontSize: "0.75rem" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "#9ca3af", fontSize: "0.65rem" }}>Total Section Taps</span>
                        <span style={{ fontWeight: "bold", color: "#fff" }}>{stats.totalTaps}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "#9ca3af", fontSize: "0.65rem" }}>Matched Taps</span>
                        <span style={{ fontWeight: "bold", color: "#34d399" }}>{stats.matchedTaps}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "#9ca3af", fontSize: "0.65rem" }}>Outliers Rejected</span>
                        <span style={{ fontWeight: "bold", color: "#f87171" }}>{stats.outliersCount}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "#9ca3af", fontSize: "0.65rem" }}>Local Median Offset</span>
                        <span style={{ fontWeight: "bold", color: "#60a5fa" }}>{stats.medianDiffMs}ms</span>
                      </div>
                    </div>
                  )}

                  {/* Calibration buttons */}
                  <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                    <button 
                      onClick={() => handleNormalizeSection(sec.id)}
                      disabled={taps.length === 0}
                      style={{
                        flexGrow: 2,
                        padding: "8px 12px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        background: taps.length === 0 ? "rgba(255,255,255,0.02)" : "linear-gradient(135deg, #a78bfa, #8b5cf6)",
                        color: taps.length === 0 ? "#4b5563" : "#fff",
                        cursor: taps.length === 0 ? "not-allowed" : "pointer",
                        border: "none",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: taps.length === 0 ? "none" : "0 4px 10px rgba(139, 92, 246, 0.2)",
                        transition: "all 0.2s ease"
                      }}
                    >
                      <RefreshCw size={12} className={taps.length > 0 ? "animate-spin-slow" : ""} />
                      <span>Shift Section Grid</span>
                    </button>

                    {stats && (
                      <button
                        onClick={() => handleSaveSectionToDisk(sec.id)}
                        style={{
                          flexGrow: 2,
                          padding: "8px 12px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          background: "linear-gradient(135deg, #34d399, #059669)",
                          color: "#fff",
                          cursor: "pointer",
                          border: "none",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          boxShadow: "0 4px 10px rgba(52, 211, 153, 0.2)"
                        }}
                      >
                        <Save size={12} />
                        <span>Save Section</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleClearTaps(sec.id)}
                      disabled={taps.length === 0}
                      style={{
                        width: "36px",
                        height: "32px",
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: "8px",
                        color: "#f87171",
                        cursor: taps.length === 0 ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                      title="Clear recorded taps for this section"
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {editorSections.length === 0 && (
          <span style={{ fontSize: "0.8rem", color: "#6b7280", fontStyle: "italic", textAlign: "center", padding: "12px" }}>No sections defined yet. Click "Add Section" above!</span>
        )}
      </div>
    </div>
  );
}
