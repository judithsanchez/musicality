import { useState } from "react";
import { ChevronDown, ChevronRight, AlertOctagon } from "lucide-react";
import {
  SalsaEnergyStateSchema,
  BachataEnergyStateSchema,
  SalsaInstrumentSchema,
  BachataInstrumentSchema
} from "../types/schemas";

export default function DevCalibrationPanel({
  songData,
  editorSections,
  phrases,
  userDelaySetting,
  onUserDelaySettingChange,
  onExit,
  onUpdateSectionField,
  onUpdatePhraseField,
  validationErrors,
  saving,
  onPublishSong
}) {
  const genre = songData?.genre || "SALSA";
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleCollapse = (id) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const energyStates = genre === "SALSA" 
    ? SalsaEnergyStateSchema.options
    : BachataEnergyStateSchema.options;

  const instruments = genre === "SALSA"
    ? SalsaInstrumentSchema.options
    : BachataInstrumentSchema.options;

  return (
    <div className="glass-panel dev-panel right-workspace-column" style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      maxHeight: "85vh",
      overflowY: "auto"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: "800", color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          🛠️ Creator Calibration Desk
        </span>
        <button
          onClick={onExit}
          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid #27272a", color: "#ffffff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: "700", cursor: "pointer" }}
        >
          Exit
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>Calibrated Delay Offset (ms)</span>
        <input
          type="number"
          value={userDelaySetting}
          onChange={(e) => onUserDelaySettingChange(Number(e.target.value))}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.3)",
            color: "#fff",
            fontSize: "0.8rem",
            boxSizing: "border-box"
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: "800", color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          🏷️ Song Sections & Details
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {editorSections.map((section, sIdx) => {
            const sectionPhrases = phrases.filter(p => section.phraseIds.includes(p.id));

            return (
              <div key={section.id} style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                background: "rgba(0, 0, 0, 0.15)"
              }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(section.id)}
                    style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
                  >
                    {collapsedSections[section.id] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <input
                    type="text"
                    value={section.emoji || "🎵"}
                    onChange={(e) => onUpdateSectionField(section.id, "emoji", e.target.value)}
                    style={{ width: "32px", textAlign: "center", padding: "4px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff" }}
                  />
                  <select
                    value={section.energyState}
                    onChange={(e) => onUpdateSectionField(section.id, "energyState", e.target.value)}
                    style={{ flexGrow: 1, padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    {energyStates.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {!collapsedSections[section.id] && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "0.65rem", color: "#a1a1aa" }}>Focus Instrument</span>
                      <select
                        value={section.focusInstrument || "NONE"}
                        onChange={(e) => onUpdateSectionField(section.id, "focusInstrument", e.target.value)}
                        style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: "0.75rem" }}
                      >
                        {instruments.map(inst => (
                          <option key={inst} value={inst}>{inst}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
                      <div>Start: <strong style={{ color: "#fff" }}>{(section.startTimeMs / 1000).toFixed(2)}s</strong></div>
                      <div>End: <strong style={{ color: "#fff" }}>{(section.endTimeMs / 1000).toFixed(2)}s</strong></div>
                    </div>

                    {sectionPhrases.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "6px", marginTop: "4px" }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", color: "#fff" }}>Phrases ({sectionPhrases.length})</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "120px", overflowY: "auto" }}>
                          {sectionPhrases.map(ph => (
                            <div key={ph.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "4px 6px", borderRadius: "4px", fontSize: "0.65rem" }}>
                              <span>#{ph.index} {ph.type.replace("_", " ")}</span>
                              {genre === "SALSA" && (ph.type === "STANDARD_8_COUNT" || ph.type === "HALF_PHRASE_4_COUNT") && (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <span style={{ color: ph.claveIsVerified ? "#34d399" : "#f59e0b", fontSize: "0.6rem" }}>
                                    {ph.claveDirection} ({ph.claveSource})
                                  </span>
                                  <button
                                    onClick={() => {
                                      const nextDir = ph.claveDirection === "2-3" ? "3-2" : "2-3";
                                      onUpdatePhraseField(ph.id, nextDir);
                                    }}
                                    style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "3px", color: "#fff", padding: "1px 4px", fontSize: "0.6rem", cursor: "pointer" }}
                                  >
                                    Toggle
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={onPublishSong}
        disabled={saving}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, #10b981, #059669)",
          border: "none",
          color: "#fff",
          fontWeight: "900",
          fontSize: "0.8rem",
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
          marginTop: "auto"
        }}
      >
        {saving ? "Publishing..." : "Publish Song"}
      </button>

      {validationErrors && (
        <div style={{
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "8px",
          padding: "10px",
          color: "#fca5a5"
        }}>
          <h4 style={{ margin: "0 0 6px 0", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px", fontWeight: "bold" }}>
            <AlertOctagon size={12} /> Zod Validation Failed
          </h4>
          <div style={{ fontSize: "0.65rem", maxHeight: "100px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
            {validationErrors.map((err, i) => (
              <div key={i}>
                • <strong>{err.path.join(".")}</strong>: {err.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
