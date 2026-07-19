import { AlertOctagon, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function DevCalibrationPanel({
  editorSections,
  categories,
  tags,
  onExit,
  onUpdateSectionField,
  onToggleSectionTag,
  onAddCategory,
  onAddTag,
  validationErrors,
  saving,
  onPublishSong
}) {
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleCollapse = (id) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
            <button onClick={onAddCategory} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: "pointer" }}>
              Category
            </button>
            <button onClick={onAddTag} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: "pointer" }}>
              Tag
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {editorSections.map((section, sectionIndex) => {
            const selectedTags = section.tags || [];
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

                {!collapsedSections[section.id] && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
                      <div>Start: <strong style={{ color: "#fff" }}>{(section.startTimeMs / 1000).toFixed(2)}s</strong></div>
                      <div>End: <strong style={{ color: "#fff" }}>{(section.endTimeMs / 1000).toFixed(2)}s</strong></div>
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

      <button
        onClick={onPublishSong}
        disabled={saving}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "8px",
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
            {validationErrors.map((err, index) => (
              <div key={index}>
                • <strong>{err.path.join(".")}</strong>: {err.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
