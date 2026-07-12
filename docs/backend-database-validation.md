# Song Database Validation

The local app stores song maps as JSON files in `public/songs`, with `catalog.json` holding lightweight catalog metadata.

## Validation Goals

- Keep the schema small and readable.
- Support only Salsa and Bachata.
- Store sections, events, downbeats, and song metadata.
- Allow partial drafts without workflow completion flags.
- Block obvious invalid data, such as section ranges whose end is before their start or overlapping section ranges.

## Local Save API

The Vite dev server exposes local-only endpoints for saving song JSON and creating new draft song maps. This is intentionally simple developer tooling, not production infrastructure.

Saved catalog entries include:

- id
- YouTube id
- title
- artist
- genre
- status
- metadata
- base BPM
