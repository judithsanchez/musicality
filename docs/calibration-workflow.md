# Calibration Workflow

The calibration workbench is the core tool. Section ranges, event ranges, and taps are independent tools that can be used in any order.

## Song Map Shape

Each song JSON keeps only the data the app needs:

- song identity
- genre: `SALSA` or `BACHATA`
- sections
- timeline events
- manual taps
- status: `DRAFT` or `READY`

Sections and events share the same range model: `startTimeMs`, `endTimeMs`, `category`, and `tags`. Taps are manual timestamp marks with count `1` or `5`. Categories and tags are global static JSON collections and can be reused anywhere.

## Ingestion

The local ingestion script accepts a YouTube id/link flow from the app and creates an empty calibration record. It does not infer BPM, sections, events, or taps.

## Workbench Behavior

- The timeline can be clicked or dragged to move the playhead.
- The playhead can be dragged all the way back to `0:00`.
- Section handles resize adjacent section ranges.
- Clicking a section selects it without moving the playhead.
- Events use the same start/end range model as sections.
- Tapping records only manual count-1 or count-5 marks.
- No library or automatic process generates taps or downbeats.

## Publishing

Draft songs can remain partially calibrated. Publishing marks a song as `READY` after the schema accepts the current song map.
