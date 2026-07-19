import { AlertOctagon, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function DevCalibrationPanel({
  editorSections,
  lockedSectionTimes,
  categories,
  tags,
  onExit,
  onUpdateSectionField,
  onUpdateSectionTime,
  onToggleSectionTag,
  onAddSection,
  onRemoveSection,
  onToggleSectionTimeLock,
  onAddCategory,
  onAddTag,
  validationErrors
}) {
  const [expandedSections, setExpandedSections] = useState({});
  const [sectionPendingDelete, setSectionPendingDelete] = useState(null);
  const [draftTimes, setDraftTimes] = useState({});

  const toggleCollapse = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const draftKey = (id, field) => `${id}:${field}`;

  const timeValue = (section, field) => {
    const key = draftKey(section.id, field);
    return draftTimes[key] ?? (section[field] / 1000).toFixed(2);
  };

  const updateDraftTime = (section, field, value) => {
    setDraftTimes(current => ({ ...current, [draftKey(section.id, field)]: value }));
  };

  const commitDraftTime = (section, field) => {
    const key = draftKey(section.id, field);
    const value = draftTimes[key];
    if (value === undefined || value === "") return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onUpdateSectionTime(section.id, field, parsed * 1000);
    setDraftTimes(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const pendingDeleteIndex = sectionPendingDelete ? editorSections.findIndex(section => section.id === sectionPendingDelete.id) : -1;
  const pendingDeleteLabel = sectionPendingDelete
    ? categories.find(category => category.id === sectionPendingDelete.category)?.label || sectionPendingDelete.category || `Section ${pendingDeleteIndex + 1}`
    : "";

  return (
    <div className="glass-panel dev-panel right-workspace-column" style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      maxHeight: "520px",
      overflow: "hidden"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: "800", color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Calibration Desk
        </span>
        <button
          onClick={onExit}
          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid #27272a", color: "#ffffff", padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: "700", cursor: "pointer" }}
        >
          Exit
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: "800", color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Sections
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={onAddSection} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(96,165,250,0.35)", background: "rgba(96,165,250,0.08)", color: "#93c5fd", fontSize: "0.68rem", fontWeight: 800, cursor: "pointer" }}>
              Section
            </button>
            <button onClick={onAddCategory} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: "pointer" }}>
              Category
            </button>
            <button onClick={onAddTag} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: "pointer" }}>
              Tag
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto", paddingRight: "3px" }}>
          {editorSections.map((section, sectionIndex) => {
            const selectedTags = section.tags || [];
            const isExpanded = !!expandedSections[section.id];
            const isLocked = !!lockedSectionTimes[section.id];
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
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span style={{ width: "24px", color: "#71717a", fontSize: "0.72rem", fontWeight: 800 }}>{sectionIndex + 1}</span>
                  <select
                    value={section.category || ""}
                    onChange={(event) => onUpdateSectionField(section.id, "category", event.target.value)}
                    style={{ flexGrow: 1, padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </div>

                {isExpanded && (
                  <>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => onToggleSectionTimeLock(section.id)}
                        style={{ padding: "5px 9px", borderRadius: "6px", border: `1px solid ${isLocked ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.12)"}`, background: isLocked ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.04)", color: isLocked ? "#93c5fd" : "#d4d4d8", fontSize: "0.68rem", fontWeight: 900, cursor: "pointer" }}
                      >
                        {isLocked ? "Times Locked" : "Lock Times"}
                      </button>
                      <button
                        type="button"
                        disabled={editorSections.length <= 1 || isLocked}
                        onClick={() => setSectionPendingDelete(section)}
                        style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5", fontSize: "0.68rem", fontWeight: 800, cursor: editorSections.length <= 1 || isLocked ? "not-allowed" : "pointer", opacity: editorSections.length <= 1 || isLocked ? 0.45 : 1 }}
                      >
                        Remove
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontWeight: 800 }}>
                        Start
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={sectionIndex === 0 || isLocked}
                          value={timeValue(section, "startTimeMs")}
                          onChange={(event) => updateDraftTime(section, "startTimeMs", event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitDraftTime(section, "startTimeMs");
                          }}
                          style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.28)", color: "#fff", fontWeight: 900, opacity: sectionIndex === 0 || isLocked ? 0.5 : 1 }}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontWeight: 800 }}>
                        End
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={sectionIndex === editorSections.length - 1 || isLocked}
                          value={timeValue(section, "endTimeMs")}
                          onChange={(event) => updateDraftTime(section, "endTimeMs", event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitDraftTime(section, "endTimeMs");
                          }}
                          style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.28)", color: "#fff", fontWeight: 900, opacity: sectionIndex === editorSections.length - 1 || isLocked ? 0.5 : 1 }}
                        />
                      </label>
                    </div>
                    <div style={{ color: "#71717a", fontSize: "0.64rem", lineHeight: 1.35 }}>
                      Type freely, then press Enter to apply. Boundary edits keep neighboring sections aligned unless a section is locked.
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {tags.map(tag => {
                        const active = selectedTags.includes(tag.id);
                        return (
                          <button key={tag.id} onClick={() => onToggleSectionTag(section.id, tag.id)} title={tag.label} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: "999px", border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.12)"}`, background: active ? "#ffffff" : "transparent", color: active ? "#000" : "#a1a1aa", cursor: "pointer" }}>
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
            {validationErrors.map((err, index) => (
              <div key={index}>
                • <strong>{err.path.join(".")}</strong>: {err.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {sectionPendingDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ width: "min(420px, 100%)", display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "8px", border: "1px solid rgba(248,113,113,0.28)", background: "#09090b", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
            <span style={{ color: "#fff", fontSize: "0.9rem", fontWeight: 900 }}>Delete Section {pendingDeleteIndex + 1}?</span>
            <span style={{ color: "#a1a1aa", fontSize: "0.74rem", lineHeight: 1.45 }}>
              This will remove {pendingDeleteLabel} from {(sectionPendingDelete.startTimeMs / 1000).toFixed(2)}s to {(sectionPendingDelete.endTimeMs / 1000).toFixed(2)}s and merge the time into a neighboring section.
            </span>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setSectionPendingDelete(null)} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => {
                onRemoveSection(sectionPendingDelete.id);
                setSectionPendingDelete(null);
              }} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.12)", color: "#fca5a5", fontWeight: 900, cursor: "pointer" }}>
                Delete Section
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
