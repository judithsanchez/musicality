import type { DanceEvent } from "../types/schemas";

export const DANCE_EVENT_TYPES: DanceEvent["type"][] = [
  "ACCENT",
  "FILL",
  "VOCAL_CUE",
  "INSTRUMENT_ENTRY",
  "BUILD_UP",
  "ENERGY_DROP"
];

export type DanceEventDraft = Omit<DanceEvent, "timestampMs" | "durationMs"> & {
  startTimeMs: number;
  endTimeMs: number;
};

export type EventMutationResult = {
  events: DanceEvent[];
  error?: string;
};

export function addDanceEvent(events: DanceEvent[], draft: DanceEventDraft, songEndTimeMs?: number): EventMutationResult {
  const timestampMs = Math.round(draft.startTimeMs);
  const endTimeMs = Math.round(draft.endTimeMs);

  if (!Number.isFinite(timestampMs) || timestampMs < 0 || (songEndTimeMs !== undefined && timestampMs > songEndTimeMs)) {
    return { events, error: "Move the playhead inside the song timeline." };
  }

  if (!Number.isFinite(endTimeMs)) {
    return { events, error: "Add an event range end time." };
  }
  if (endTimeMs <= timestampMs) {
    return { events, error: "The range end must be after its start." };
  }
  if (songEndTimeMs !== undefined && endTimeMs > songEndTimeMs) {
    return { events, error: "Event ranges must end inside the song timeline." };
  }

  const event: DanceEvent = {
    timestampMs,
    durationMs: endTimeMs - timestampMs,
    type: draft.type,
    description: draft.description.trim(),
    uiHighlight: draft.uiHighlight
  };

  return { events: [...events, event].sort((a, b) => a.timestampMs - b.timestampMs) };
}

export function removeDanceEvent(events: DanceEvent[], eventIndex: number): DanceEvent[] {
  return events.filter((_, index) => index !== eventIndex);
}
