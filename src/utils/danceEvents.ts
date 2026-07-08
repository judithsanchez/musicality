import type { DanceEvent, Section } from "../types/schemas";

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
  endTimeMs?: number;
};

export type EventMutationResult = {
  events: DanceEvent[];
  error?: string;
};

export function addDanceEvent(sections: Section[], events: DanceEvent[], draft: DanceEventDraft): EventMutationResult {
  const timestampMs = Math.round(draft.startTimeMs);
  const endTimeMs = draft.endTimeMs === undefined ? undefined : Math.round(draft.endTimeMs);
  const section = sections.find(
    item => timestampMs >= item.startTimeMs && timestampMs < item.endTimeMs
  );

  if (!section) {
    return { events, error: "Move the playhead inside a sliced section." };
  }

  if (endTimeMs !== undefined && endTimeMs <= timestampMs) {
    return { events, error: "The range end must be after its start." };
  }
  if (endTimeMs !== undefined && endTimeMs > section.endTimeMs) {
    return { events, error: "Event ranges must end inside the section where they start." };
  }

  const event: DanceEvent = {
    timestampMs,
    ...(endTimeMs === undefined ? {} : { durationMs: endTimeMs - timestampMs }),
    type: draft.type,
    description: draft.description.trim(),
    uiHighlight: draft.uiHighlight
  };

  if (!event.description) {
    return { events, error: "Add a short event description." };
  }

  return { events: [...events, event].sort((a, b) => a.timestampMs - b.timestampMs) };
}

export function removeDanceEvent(events: DanceEvent[], eventIndex: number): DanceEvent[] {
  return events.filter((_, index) => index !== eventIndex);
}
