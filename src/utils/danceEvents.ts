import type { DanceEvent, Phrase } from "../types/schemas";

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
  phrases: Phrase[];
  error?: string;
};

export function addDanceEvent(phrases: Phrase[], draft: DanceEventDraft): EventMutationResult {
  const timestampMs = Math.round(draft.startTimeMs);
  const endTimeMs = draft.endTimeMs === undefined ? undefined : Math.round(draft.endTimeMs);
  const phraseIndex = phrases.findIndex(
    phrase => timestampMs >= phrase.startTimeMs && timestampMs < phrase.endTimeMs
  );

  if (phraseIndex === -1) {
    return { phrases, error: "Move the playhead inside a calibrated phrase." };
  }

  const phrase = phrases[phraseIndex];
  if (endTimeMs !== undefined && endTimeMs <= timestampMs) {
    return { phrases, error: "The range end must be after its start." };
  }
  if (endTimeMs !== undefined && endTimeMs > phrase.endTimeMs) {
    return { phrases, error: "Event ranges must end inside the phrase where they start." };
  }

  const event: DanceEvent = {
    timestampMs,
    ...(endTimeMs === undefined ? {} : { durationMs: endTimeMs - timestampMs }),
    type: draft.type,
    description: draft.description.trim(),
    uiHighlight: draft.uiHighlight
  };

  if (!event.description) {
    return { phrases, error: "Add a short event description." };
  }

  const updatedPhrases = phrases.map((item, index) => {
    if (index !== phraseIndex) return item;
    const events = [...item.events, event].sort((a, b) => a.timestampMs - b.timestampMs);
    return { ...item, events };
  });

  return { phrases: updatedPhrases };
}

export function removeDanceEvent(phrases: Phrase[], phraseId: string, eventIndex: number): Phrase[] {
  return phrases.map(phrase => {
    if (phrase.id !== phraseId) return phrase;
    return {
      ...phrase,
      events: phrase.events.filter((_, index) => index !== eventIndex)
    };
  });
}
