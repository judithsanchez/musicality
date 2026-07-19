import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function EventAnnotationPanel({
  events = [],
  selectedEventIndex,
  categories,
  tags,
  onSelectEvent,
  onAddEvent,
  onUpdateEvent,
  onUpdateEventTime,
  onToggleTag,
  onAddCategory,
  onAddTag,
  onRemoveEvent,
  defaultStartTimeMs = 0,
  defaultEndTimeMs = 3000,
  disabled = false
}) {
  const [expandedEvents, setExpandedEvents] = useState({});
  const [draftTimes, setDraftTimes] = useState({});
  const [newEventDraft, setNewEventDraft] = useState(null);

  const formatTimecode = (timeMs) => {
    const safeMs = Math.max(0, Math.round(timeMs || 0));
    const minutes = Math.floor(safeMs / 60000);
    const seconds = Math.floor((safeMs % 60000) / 1000);
    const milliseconds = safeMs % 1000;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  };

  const parseTimecode = (value) => {
    const trimmed = `${value}`.trim();
    if (!trimmed) return Number.NaN;
    if (!trimmed.includes(":")) {
      const secondsOnly = Number(trimmed);
      return Number.isFinite(secondsOnly) ? secondsOnly * 1000 : Number.NaN;
    }
    const parts = trimmed.split(":");
    if (parts.length !== 2) return Number.NaN;
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
      return Number.NaN;
    }
    return (minutes * 60 + seconds) * 1000;
  };

  const draftKey = (event, field) => `${event.id}:${field}`;

  const timeValue = (event, field) => {
    const key = draftKey(event, field);
    return draftTimes[key] ?? formatTimecode(event[field]);
  };

  const updateDraftTime = (event, field, value) => {
    setDraftTimes(current => ({ ...current, [draftKey(event, field)]: value }));
  };

  const commitDraftTime = (event, eventIndex, field) => {
    const key = draftKey(event, field);
    const value = draftTimes[key];
    if (value === undefined) return;
    const parsed = parseTimecode(value);
    const didCommit = onUpdateEventTime(eventIndex, field, parsed);
    if (!didCommit) return;
    setDraftTimes(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const toggleExpanded = (eventId, eventIndex) => {
    onSelectEvent(eventIndex);
    setExpandedEvents(current => ({ ...current, [eventId]: !current[eventId] }));
  };

  const openNewEventDraft = () => {
    setNewEventDraft({
      startTime: formatTimecode(defaultStartTimeMs),
      endTime: formatTimecode(defaultEndTimeMs),
      category: "",
      tags: []
    });
  };

  const updateNewEventDraft = (patch) => {
    setNewEventDraft(current => ({ ...current, ...patch }));
  };

  const toggleNewEventTag = (tagId) => {
    setNewEventDraft(current => {
      const currentTags = current?.tags || [];
      return {
        ...current,
        tags: currentTags.includes(tagId)
          ? currentTags.filter(value => value !== tagId)
          : [...currentTags, tagId]
      };
    });
  };

  const submitNewEventDraft = () => {
    if (!newEventDraft) return;
    const didAdd = onAddEvent({
      startTimeMs: parseTimecode(newEventDraft.startTime),
      endTimeMs: parseTimecode(newEventDraft.endTime),
      category: newEventDraft.category,
      tags: newEventDraft.tags || []
    });
    if (didAdd) setNewEventDraft(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fff", textTransform: "uppercase" }}>Event Ranges</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button disabled={disabled} onClick={openNewEventDraft} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.1)", color: "#fbbf24", fontSize: "0.68rem", fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer" }}>
            New Event
          </button>
          <button disabled={disabled} onClick={onAddCategory} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
            New Category
          </button>
          <button disabled={disabled} onClick={onAddTag} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
            New Label
          </button>
        </div>
      </div>

      {newEventDraft && (
        <div style={{ display: "flex", flexDirection: "column", gap: "9px", padding: "10px", borderRadius: "8px", border: "1px solid rgba(245,158,11,0.28)", background: "rgba(245,158,11,0.08)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ color: "#fff", fontSize: "0.76rem", fontWeight: 900 }}>Draft Event</span>
            <span style={{ color: "#fbbf24", fontSize: "0.64rem", fontWeight: 800 }}>Independent range, saved when you add it</span>
          </div>
          <select
            disabled={disabled}
            value={newEventDraft.category}
            onChange={(event) => updateNewEventDraft({ category: event.target.value })}
            style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#fff", fontWeight: "bold", fontSize: "0.8rem" }}
          >
            <option value="">Uncategorized</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontWeight: 800 }}>
              Start
              <input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={newEventDraft.startTime}
                onChange={(event) => updateNewEventDraft({ startTime: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitNewEventDraft();
                }}
                style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.28)", color: "#fff", fontWeight: 900 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontWeight: 800 }}>
              End
              <input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={newEventDraft.endTime}
                onChange={(event) => updateNewEventDraft({ endTime: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitNewEventDraft();
                }}
                style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.28)", color: "#fff", fontWeight: 900 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {tags.map(tag => {
              const active = (newEventDraft.tags || []).includes(tag.id);
              return (
                <button key={tag.id} disabled={disabled} onClick={() => toggleNewEventTag(tag.id)} title={tag.label} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: "999px", border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.12)"}`, background: active ? "#ffffff" : "transparent", color: active ? "#000" : "#a1a1aa", cursor: disabled ? "not-allowed" : "pointer" }}>
                  {tag.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button disabled={disabled} onClick={() => setNewEventDraft(null)} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#d4d4d8", fontSize: "0.68rem", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
              Cancel
            </button>
            <button disabled={disabled} onClick={submitNewEventDraft} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.16)", color: "#fbbf24", fontSize: "0.68rem", fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer" }}>
              Add Event
            </button>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.18)", color: "#a1a1aa", fontSize: "0.76rem", lineHeight: 1.4 }}>
          <span style={{ color: "#fff", fontWeight: 900 }}>No events yet</span>
          <span>Use Event Here on the timeline, then classify the event here.</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "420px", overflowY: "auto", paddingRight: "3px" }}>
        {events.map((event, eventIndex) => {
          const selectedTags = event.tags || [];
          const isExpanded = !!expandedEvents[event.id] || selectedEventIndex === eventIndex;
          const labelText = event.category
            ? categories.find(category => category.id === event.category)?.label || event.category
            : `Event ${eventIndex + 1}`;

          return (
            <div key={event.id} style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "10px",
              borderRadius: "8px",
              border: `1px solid ${selectedEventIndex === eventIndex ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.06)"}`,
              background: selectedEventIndex === eventIndex ? "rgba(245,158,11,0.08)" : "rgba(0,0,0,0.15)"
            }}>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleExpanded(event.id, eventIndex)}
                  style={{ background: "none", border: "none", color: "#a1a1aa", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", padding: 0 }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span style={{ width: "24px", color: "#71717a", fontSize: "0.72rem", fontWeight: 800 }}>{eventIndex + 1}</span>
                <select
                  disabled={disabled}
                  value={event.category || ""}
                  onFocus={() => onSelectEvent(eventIndex)}
                  onChange={(changeEvent) => onUpdateEvent(eventIndex, "category", changeEvent.target.value)}
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.7rem", color: "#a1a1aa" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontWeight: 800 }}>
                      Start
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={disabled}
                        value={timeValue(event, "startTimeMs")}
                        onFocus={() => onSelectEvent(eventIndex)}
                        onChange={(changeEvent) => updateDraftTime(event, "startTimeMs", changeEvent.target.value)}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === "Enter") commitDraftTime(event, eventIndex, "startTimeMs");
                        }}
                        style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.28)", color: "#fff", fontWeight: 900 }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "3px", fontWeight: 800 }}>
                      End
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={disabled}
                        value={timeValue(event, "endTimeMs")}
                        onFocus={() => onSelectEvent(eventIndex)}
                        onChange={(changeEvent) => updateDraftTime(event, "endTimeMs", changeEvent.target.value)}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === "Enter") commitDraftTime(event, eventIndex, "endTimeMs");
                        }}
                        style={{ padding: "5px 7px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.28)", color: "#fff", fontWeight: 900 }}
                      />
                    </label>
                  </div>

                  <div style={{ color: "#71717a", fontSize: "0.64rem", lineHeight: 1.35 }}>
                    Use m:ss.mmm, then press Enter. Event ranges are independent and can overlap.
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "0.68rem", color: "#a1a1aa", textTransform: "uppercase", fontWeight: 800 }}>Labels</span>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {tags.map(tag => {
                        const active = selectedTags.includes(tag.id);
                        return (
                          <button key={tag.id} disabled={disabled} onClick={() => onToggleTag(eventIndex, tag.id)} title={tag.label} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: "999px", border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.12)"}`, background: active ? "#ffffff" : "transparent", color: active ? "#000" : "#a1a1aa", cursor: disabled ? "not-allowed" : "pointer" }}>
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button disabled={disabled} onClick={() => onRemoveEvent(eventIndex)} style={{ padding: "7px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer" }}>
                    Delete {labelText}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
