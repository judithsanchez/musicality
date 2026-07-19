export default function EventAnnotationPanel({
  selectedEvent,
  selectedEventIndex,
  categories,
  tags,
  onUpdateEvent,
  onToggleTag,
  onAddCategory,
  onAddTag,
  onRemoveEvent,
  disabled = false
}) {
  if (!selectedEvent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)", color: "#a1a1aa", fontSize: "0.76rem", lineHeight: 1.4 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Event Ranges</span>
      </div>
    );
  }

  const startSec = selectedEvent.startTimeMs / 1000;
  const endSec = selectedEvent.endTimeMs / 1000;
  const selectedTags = selectedEvent.tags || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)" }}>
      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Selected Event</span>

      <div style={{ display: "flex", gap: "6px" }}>
        <select disabled={disabled} value={selectedEvent.category || ""} onChange={event => onUpdateEvent(selectedEventIndex, "category", event.target.value)} style={{ flex: 1, padding: "6px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }}>
          <option value="">Uncategorized</option>
          {categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
        <button disabled={disabled} onClick={onAddCategory} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
          +
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
        <div>Start: <strong style={{ color: "#fff" }}>{startSec.toFixed(2)}s</strong></div>
        <div>End: <strong style={{ color: "#fff" }}>{endSec.toFixed(2)}s</strong></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.68rem", color: "#a1a1aa", textTransform: "uppercase", fontWeight: 800 }}>Tags</span>
          <button disabled={disabled} onClick={onAddTag} style={{ padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
            Add
          </button>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {tags.map(tag => {
            const active = selectedTags.includes(tag.id);
            return (
              <button key={tag.id} disabled={disabled} onClick={() => onToggleTag(selectedEventIndex, tag.id)} title={tag.label} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: "999px", border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.12)"}`, background: active ? "#ffffff" : "transparent", color: active ? "#000" : "#a1a1aa", cursor: disabled ? "not-allowed" : "pointer" }}>
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      <button disabled={disabled} onClick={() => onRemoveEvent(selectedEventIndex)} style={{ padding: "7px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
        Delete selected event
      </button>
    </div>
  );
}
