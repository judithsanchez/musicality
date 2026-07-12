import { DANCE_EVENT_TYPES } from "../utils/danceEvents";

export default function EventAnnotationPanel({ selectedEvent, selectedEventIndex, onUpdateEvent, onRemoveEvent, disabled = false }) {
  if (!selectedEvent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)", color: "#a1a1aa", fontSize: "0.76rem", lineHeight: 1.4 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Timeline Event Ranges</span>
        <span>Create an event on the timeline, then select its range to label it.</span>
      </div>
    );
  }

  const startSec = selectedEvent.timestampMs / 1000;
  const endSec = (selectedEvent.timestampMs + selectedEvent.durationMs) / 1000;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)" }}>
      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Selected Event Range</span>

      <select disabled={disabled} value={selectedEvent.type} onChange={event => onUpdateEvent(selectedEventIndex, "type", event.target.value)} style={{ padding: "6px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }}>
        {DANCE_EVENT_TYPES.map(eventType => <option key={eventType} value={eventType}>{eventType.replaceAll("_", " ")}</option>)}
      </select>

      <input disabled={disabled} value={selectedEvent.description} onChange={event => onUpdateEvent(selectedEventIndex, "description", event.target.value)} placeholder="What happens here?" style={{ padding: "7px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
        <div>Start: <strong style={{ color: "#fff" }}>{startSec.toFixed(2)}s</strong></div>
        <div>End: <strong style={{ color: "#fff" }}>{endSec.toFixed(2)}s</strong></div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a1a1aa", fontSize: "0.72rem" }}>
        <input disabled={disabled} type="checkbox" checked={selectedEvent.uiHighlight} onChange={event => onUpdateEvent(selectedEventIndex, "uiHighlight", event.target.checked)} />
        Trigger a visual highlight
      </label>

      <button disabled={disabled} onClick={() => onRemoveEvent(selectedEventIndex)} style={{ padding: "7px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
        Delete selected event
      </button>
    </div>
  );
}
