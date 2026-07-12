# Calibration Workflow

The calibration workbench is a single flexible editor for a song timeline. Slicing, event marking, downbeat tapping, and labeling are independent tools that can be used in any order.

## Song Map Shape

Each song JSON keeps only the data the app needs:

- song identity and metadata
- genre: `SALSA` or `BACHATA`
- base BPM
- sections
- timeline events
- downbeat tap sessions
- consensus downbeats
- status: `DRAFT` or `READY`

Sections are time ranges. Events can be single timestamp marks or ranges. Downbeats are stored as millisecond timestamps.

## Workbench Behavior

- The timeline can be clicked or dragged to move the playhead.
- The playhead can be dragged all the way back to `0:00`.
- Section handles resize adjacent section ranges.
- Clicking a section selects it without moving the playhead.
- Labels can be edited while slicing.
- Events can be added before or after slicing.
- Downbeat tapping does not require sections or events.

## Publishing

Draft songs can remain partially calibrated. Publishing marks a song as `READY` after the schema accepts the current song map.
