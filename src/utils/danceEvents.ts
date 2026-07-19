import type { TimelineRange } from "../types/schemas";

export type DanceEventDraft = Omit<TimelineRange, "id">;

export type EventMutationResult = {
  events: TimelineRange[];
  error?: string;
};

export function addDanceEvent(events: TimelineRange[], draft: DanceEventDraft, songEndTimeMs?: number): EventMutationResult {
  const startTimeMs = Math.round(draft.startTimeMs);
  const endTimeMs = Math.round(draft.endTimeMs);

  if (!Number.isFinite(startTimeMs) || startTimeMs < 0 || (songEndTimeMs !== undefined && startTimeMs > songEndTimeMs)) {
    return { events, error: "Move the playhead inside the song timeline." };
  }

  if (!Number.isFinite(endTimeMs)) {
    return { events, error: "Add an event range end time." };
  }
  if (endTimeMs <= startTimeMs) {
    return { events, error: "The range end must be after its start." };
  }
  if (songEndTimeMs !== undefined && endTimeMs > songEndTimeMs) {
    return { events, error: "Event ranges must end inside the song timeline." };
  }

  const event: TimelineRange = {
    id: crypto.randomUUID(),
    startTimeMs,
    endTimeMs,
    category: draft.category,
    tags: draft.tags
  };

  return { events: [...events, event].sort((a, b) => a.startTimeMs - b.startTimeMs) };
}

export function removeDanceEvent(events: TimelineRange[], eventIndex: number): TimelineRange[] {
  return events.filter((_, index) => index !== eventIndex);
}
