import { useMemo, useState } from "react";
import { DANCE_EVENT_TYPES } from "../utils/danceEvents";

export default function EventAnnotationPanel({ currentTime, phrases, onAddEvent, onRemoveEvent }) {
  const [type, setType] = useState("ACCENT");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("point");
  const [rangeStartMs, setRangeStartMs] = useState(null);
  const [uiHighlight, setUiHighlight] = useState(true);

  const events = useMemo(
    () => phrases.flatMap(phrase => phrase.events.map((event, eventIndex) => ({ phrase, event, eventIndex }))),
    [phrases]
  );

  const submitPoint = () => {
    const added = onAddEvent({
      startTimeMs: currentTime * 1000,
      type,
      description,
      uiHighlight
    });
    if (added) setDescription("");
  };

  const finishRange = () => {
    const added = onAddEvent({
      startTimeMs: rangeStartMs,
      endTimeMs: currentTime * 1000,
      type,
      description,
      uiHighlight
    });
    if (added) {
      setDescription("");
      setRangeStartMs(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)" }}>
      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Timeline Events</span>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <select value={type} onChange={event => setType(event.target.value)} style={{ padding: "6px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }}>
          {DANCE_EVENT_TYPES.map(eventType => <option key={eventType} value={eventType}>{eventType.replaceAll("_", " ")}</option>)}
        </select>
        <select value={mode} onChange={event => { setMode(event.target.value); setRangeStartMs(null); }} style={{ padding: "6px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }}>
          <option value="point">Single mark</option>
          <option value="range">Time range</option>
        </select>
      </div>

      <input value={description} onChange={event => setDescription(event.target.value)} placeholder="What happens here?" style={{ padding: "7px", borderRadius: "6px", background: "#111", color: "#fff", border: "1px solid #27272a" }} />

      <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a1a1aa", fontSize: "0.72rem" }}>
        <input type="checkbox" checked={uiHighlight} onChange={event => setUiHighlight(event.target.checked)} />
        Trigger a visual highlight
      </label>

      {mode === "point" ? (
        <button onClick={submitPoint} style={{ padding: "7px", border: "none", borderRadius: "6px", fontWeight: 800, cursor: "pointer" }}>
          Add mark at {currentTime.toFixed(2)}s
        </button>
      ) : rangeStartMs === null ? (
        <button onClick={() => setRangeStartMs(Math.round(currentTime * 1000))} style={{ padding: "7px", border: "none", borderRadius: "6px", fontWeight: 800, cursor: "pointer" }}>
          Set range start at {currentTime.toFixed(2)}s
        </button>
      ) : (
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={finishRange} style={{ flex: 1, padding: "7px", border: "none", borderRadius: "6px", fontWeight: 800, cursor: "pointer" }}>
            Finish range at {currentTime.toFixed(2)}s
          </button>
          <button onClick={() => setRangeStartMs(null)} style={{ padding: "7px", borderRadius: "6px", border: "1px solid #3f3f46", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
        </div>
      )}

      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "180px", overflowY: "auto" }}>
          {events.map(({ phrase, event, eventIndex }) => (
            <div key={`${phrase.id}-${eventIndex}-${event.timestampMs}`} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "6px", borderRadius: "6px", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontSize: "0.68rem" }}>
              <span>{(event.timestampMs / 1000).toFixed(2)}s · {event.type.replaceAll("_", " ")}{event.durationMs ? ` · ${(event.durationMs / 1000).toFixed(2)}s` : ""} · {event.description}</span>
              <button onClick={() => onRemoveEvent(phrase.id, eventIndex)} style={{ border: "none", background: "transparent", color: "#fca5a5", cursor: "pointer" }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
