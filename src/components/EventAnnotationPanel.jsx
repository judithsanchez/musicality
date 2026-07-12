import { useState } from "react";
import { DANCE_EVENT_TYPES } from "../utils/danceEvents";

export default function EventAnnotationPanel({ currentTime, events, onAddEvent, onRemoveEvent, disabled = false }) {
  const [type, setType] = useState("ACCENT");
  const [description, setDescription] = useState("");
  const [rangeStartSec, setRangeStartSec] = useState("");
  const [rangeEndSec, setRangeEndSec] = useState("");
  const [uiHighlight, setUiHighlight] = useState(true);

  const submitRange = () => {
    const added = onAddEvent({
      startTimeMs: Number(rangeStartSec) * 1000,
      endTimeMs: Number(rangeEndSec) * 1000,
      type,
      description,
      uiHighlight
    });
    if (added) {
      setDescription("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)" }}>
      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Timeline Event Ranges</span>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
        <select disabled={disabled} value={type} onChange={event => setType(event.target.value)} style={{ padding: "6px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }}>
          {DANCE_EVENT_TYPES.map(eventType => <option key={eventType} value={eventType}>{eventType.replaceAll("_", " ")}</option>)}
        </select>
      </div>

      <input disabled={disabled} value={description} onChange={event => setDescription(event.target.value)} placeholder="What happens here?" style={{ padding: "7px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "0.65rem", color: "#a1a1aa" }}>Start</span>
          <input disabled={disabled} type="number" min="0" step="0.01" value={rangeStartSec} onChange={event => setRangeStartSec(event.target.value)} placeholder="Start sec" style={{ padding: "7px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }} />
          <button disabled={disabled} onClick={() => setRangeStartSec(currentTime.toFixed(2))} style={{ padding: "5px", border: "1px solid #3f3f46", borderRadius: "6px", background: "transparent", color: "#d4d4d8", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" }}>
            Use playhead
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "0.65rem", color: "#a1a1aa" }}>End</span>
          <input disabled={disabled} type="number" min="0" step="0.01" value={rangeEndSec} onChange={event => setRangeEndSec(event.target.value)} placeholder="End sec" style={{ padding: "7px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }} />
          <button disabled={disabled} onClick={() => setRangeEndSec(currentTime.toFixed(2))} style={{ padding: "5px", border: "1px solid #3f3f46", borderRadius: "6px", background: "transparent", color: "#d4d4d8", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" }}>
            Use playhead
          </button>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a1a1aa", fontSize: "0.72rem" }}>
        <input disabled={disabled} type="checkbox" checked={uiHighlight} onChange={event => setUiHighlight(event.target.checked)} />
        Trigger a visual highlight
      </label>

      <button disabled={disabled} onClick={submitRange} style={{ padding: "7px", border: "none", borderRadius: "6px", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
        Add event range
      </button>

      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "180px", overflowY: "auto" }}>
          {events.map((event, eventIndex) => (
            <div key={`${eventIndex}-${event.timestampMs}`} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "6px", borderRadius: "6px", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontSize: "0.68rem" }}>
              <span>{(event.timestampMs / 1000).toFixed(2)}s–{((event.timestampMs + (event.durationMs || 0)) / 1000).toFixed(2)}s · {event.type.replaceAll("_", " ")} · {event.description}</span>
              <button disabled={disabled} onClick={() => onRemoveEvent(eventIndex)} style={{ border: "none", background: "transparent", color: "#fca5a5", cursor: disabled ? "not-allowed" : "pointer" }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
