# Song Data Validation

The app stores song maps as static JSON files in `public/songs`. `catalog.json` holds lightweight catalog metadata, while `public/data/categories.json` and `public/data/tags.json` hold reusable calibration vocabulary.

## Validation Goals

- Keep the schema small and readable.
- Support only Salsa and Bachata.
- Store song identity, status, sections, events, and manual count-1/count-5 taps.
- Keep categories and tags generic so they can be used on sections or events.
- Allow partial drafts without requiring categories.
- Block obvious invalid data, such as ranges whose end is before their start or overlapping section ranges.

## Static And Local Modes

GitHub Pages serves the JSON files directly as read-only static assets. Local calibration can use Vite dev endpoints to save song maps, categories, and tags back to the JSON files.

Saved catalog entries include:

- id
- YouTube id
- title
- artist
- genre
- status
