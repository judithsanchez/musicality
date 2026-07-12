# Calibration Workflow

The calibration workbench is a single flexible editor for a song timeline. Slicing, event marking, downbeat tapping, and labeling are independent tools that can be used in any order.

## Song Map Shape

Each song JSON keeps only the data the app needs:

- song identity and metadata
- genre: `SALSA` or `BACHATA`
- base BPM
- raw Librosa downbeats
- calibrated downbeats used by the player
- sections
- timeline events
- status: `DRAFT` or `READY`

Sections are time ranges. Events can be single timestamp marks or ranges. Downbeats are stored as millisecond timestamps. `rawDownbeats` is the automatic baseline from ingestion. `calibratedDownbeats` is the app-facing source of truth and can be corrected for the whole song, a selected section, or a custom range.

## Ingestion

The local ingestion script accepts a YouTube id/link flow from the app. It uses `yt-dlp` to extract audio and `librosa` to estimate BPM and beat candidates. Those candidates are saved as `rawDownbeats`, and new songs start with `calibratedDownbeats` copied from `rawDownbeats`.

Librosa is a starting point, not salsa/bachata count-1 truth. If the grid is shifted, use offset calibration. If a local section is wrong, slice/select that range and replace only that range with manual taps.

## Workbench Behavior

- The timeline can be clicked or dragged to move the playhead.
- The playhead can be dragged all the way back to `0:00`.
- Section handles resize adjacent section ranges.
- Clicking a section selects it without moving the playhead.
- Labels can be edited while slicing.
- Events can be added before or after slicing.
- Downbeat tapping does not require sections or events.
- Manual tap calibration can affect the whole song, one selected section, or a custom time range.
- Range calibration never changes `rawDownbeats` and does not disturb calibrated downbeats outside the selected range.

## Publishing

Draft songs can remain partially calibrated. Publishing marks a song as `READY` after the schema accepts the current song map.
