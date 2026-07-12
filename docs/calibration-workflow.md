# Calibration Workflow

The calibration workbench is a single flexible editor for a song timeline. Section slicing, section labeling, event ranges, and downbeat tapping are independent tools that can be used in any order.

## Song Map Shape

Each song JSON keeps only the data the app needs:

- song identity and metadata
- genre: `SALSA` or `BACHATA`
- base BPM
- calibrated downbeats used by the player
- raw human tap calibration takes
- sections
- timeline events
- status: `DRAFT` or `READY`

Sections and events are time ranges. Downbeats are stored as millisecond timestamps. `tapCalibrationTakes` stores three sparse human anchor passes. `calibratedDownbeats` is the app-facing source of truth used by the player.

## Ingestion

The local ingestion script accepts a YouTube id/link flow from the app and creates a clean song calibration record. New songs start with metadata, base BPM, empty sections, empty events, and empty calibrated downbeats.

The workbench reconciles three sparse human tap takes into a proposed full count-1 list. The proposal must be reviewed and approved before it replaces `calibratedDownbeats`.

## Workbench Behavior

- The timeline can be clicked or dragged to move the playhead.
- The playhead can be dragged all the way back to `0:00`.
- Section handles resize adjacent section ranges.
- Clicking a section selects it without moving the playhead.
- Section labels can be edited in the same place where slices are created.
- Events use the same start/end range model as sections and can be added before or after slicing.
- Downbeat tapping does not require sections or events.
- Downbeat tapping records sparse anchors into Take 1, Take 2, or Take 3.
- The reconciliation proposal estimates the phrase interval, flags suspicious taps, fills skipped phrases, and shows confidence before approval.

## Publishing

Draft songs can remain partially calibrated. Publishing marks a song as `READY` after the schema accepts the current song map.
