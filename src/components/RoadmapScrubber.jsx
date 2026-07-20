export default function RoadmapScrubber({
  currentTime,
  videoDuration,
  introStart,
  introEnd,
  nextSection,
  timeToNextSection,
  sectionsList,
  breaks,
  events = [],
  onSeek
}) {
  const duration = videoDuration || 1;
  const sectionTheme = {
    intro: { icon: "✨", color: "#a1a1aa", label: "Intro" },
    chorus: { icon: "🎤", color: "#34d399", label: "Chorus" },
    soneo: { icon: "🗣️", color: "#2dd4bf", label: "Soneo" },
    descarga: { icon: "🔥", color: "#60a5fa", label: "Descarga" },
    verse: { icon: "🎶", color: "#93c5fd", label: "Verse" },
    montuno: { icon: "🎹", color: "#fbbf24", label: "Montuno" },
    outro: { icon: "🌙", color: "#a1a1aa", label: "Outro" }
  };
  const eventTheme = {
    break: { icon: "⛔", label: "Break" },
    accent: { icon: "💥", label: "Accent" },
    fill: { icon: "🥁", label: "Fill" },
    "vocal-cue": { icon: "🎙️", label: "Vocal Cue" },
    "energy-drop": { icon: "⬇️", label: "Energy Drop" },
    "build-up": { icon: "⬆️", label: "Build Up" },
    "instrument-entry": { icon: "🎺", label: "Instrument Entry" }
  };
  const formatTime = (time) => `${Math.floor(time / 60)}:${(Math.floor(time % 60)).toString().padStart(2, "0")}`;
  const normalizedSections = (sectionsList || []).map((sec, idx) => {
    const startMs = Number.isFinite(sec.startTimeMs) ? sec.startTimeMs : (sec.startTimestamp || 0) * 1000;
    const endMs = Number.isFinite(sec.endTimeMs) ? sec.endTimeMs : (sec.endTimestamp || duration) * 1000;
    return {
      ...sec,
      start: startMs / 1000,
      end: endMs / 1000,
      category: sec.category || sec.name || `section-${idx + 1}`
    };
  });
  const normalizedEvents = [...(events || []), ...(breaks || [])].map((event) => ({
    ...event,
    start: (Number.isFinite(event.startTimeMs) ? event.startTimeMs : (event.startTimestamp || 0) * 1000) / 1000,
    end: (Number.isFinite(event.endTimeMs) ? event.endTimeMs : (event.endTimestamp || 0) * 1000) / 1000,
    category: event.category || "break"
  }));
  const activeSection = normalizedSections.find((sec) => currentTime >= sec.start && currentTime < sec.end);

  return (
    <div className="glass-panel roadmap-scrubber-glass-panel">
      <div className="roadmap-header">
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          Song Roadmap
          {activeSection && (
            <span className="roadmap-current-section">
              {(sectionTheme[activeSection.category]?.icon || "🎵")} {sectionTheme[activeSection.category]?.label || activeSection.category}
            </span>
          )}
          {nextSection && timeToNextSection <= 10 && (
            <span style={{ fontSize: "0.65rem", color: "#ffffff", marginLeft: "8px", fontWeight: "bold" }}>
              ➡️ Next section in {timeToNextSection.toFixed(1)}s
            </span>
          )}
        </span>
        <span style={{ color: "#ffffff" }}>
          {formatTime(currentTime)} / {formatTime(videoDuration)}
        </span>
      </div>

      <div
        className="roadmap-scrubber-wrapper"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickPercent = (e.clientX - rect.left) / rect.width;
          onSeek(clickPercent * duration, true);
        }}
      >
        <div
          className="roadmap-scrubber-track roadmap-section-track"
        >
          {introEnd > introStart && (
            <div
              className="roadmap-segment segment-intro"
              style={{
                left: `${(introStart / duration) * 100}%`,
                width: `${((introEnd - introStart) / duration) * 100}%`
              }}
              title="Song Intro Region"
            />
          )}

          {normalizedSections.map((sec, idx) => {
            const theme = sectionTheme[sec.category] || { icon: "🎵", color: "#d4d4d8", label: sec.category };
            const left = Math.max(0, (sec.start / duration) * 100);
            const width = Math.max(0.35, ((sec.end - sec.start) / duration) * 100);
            return (
              <div
                key={sec.id || `${sec.category}-${idx}`}
                className="roadmap-section-range"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  "--section-color": theme.color
                }}
                title={`${theme.label} · ${formatTime(sec.start)}-${formatTime(sec.end)}`}
              >
                <span className="roadmap-section-emoji">{theme.icon}</span>
                <span className="roadmap-section-label">{theme.label}</span>
              </div>
            );
          })}
          <div
            className="roadmap-playhead"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
        <div className="roadmap-scrubber-track roadmap-event-track">
          {normalizedEvents.length === 0 && (
            <span className="roadmap-empty-event-lane">No events</span>
          )}
          {normalizedEvents.map((event, idx) => {
            const theme = eventTheme[event.category] || { icon: "◆", label: event.category };
            return (
              <div
                key={event.id || `event-${idx}`}
                className="roadmap-event-range"
                style={{
                  left: `${Math.max(0, (event.start / duration) * 100)}%`,
                  width: `${Math.max(0.55, ((event.end - event.start) / duration) * 100)}%`
                }}
                title={`${theme.label} · ${formatTime(event.start)}-${formatTime(event.end)}`}
              >
                <span>{theme.icon}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
