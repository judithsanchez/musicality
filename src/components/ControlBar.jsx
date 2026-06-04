
import { Play, Pause, RotateCcw } from "lucide-react";

export default function ControlBar({
  isActuallyPlaying,
  onPlayToggle,
  playbackRate,
  onSpeedChange,
  onRewind,
  activeTracker,
  onTrackerChange,
  hasMultipleTrackers
}) {
  return (
    <div className="glass-panel control-bar-glass-panel">
      <div className="controls-panel" style={{ display: "flex", flexDirection: "row", gap: "10px", alignItems: "center" }}>
        
        {/* Rewind 10s Button */}
        <button 
          className="btn-touch" 
          onClick={onRewind} 
          title="Rewind 10 seconds"
          style={{ flex: "0 0 54px", minHeight: "48px", display: "flex", justifyContent: "center", alignItems: "center" }}
        >
          <RotateCcw size={20} />
        </button>

        {/* Play / Pause Toggle Button */}
        <button className="btn-touch btn-play" onClick={onPlayToggle} style={{ flexGrow: 2 }}>
          {isActuallyPlaying ? (
            <>
              <Pause size={20} fill="currentColor" />
              <span>Pause Song</span>
            </>
          ) : (
            <>
              <Play size={20} fill="currentColor" />
              <span>Play Song</span>
            </>
          )}
        </button>

        {/* Speed Controls Selector */}
        <div className="speed-toggle-container" style={{ flex: "0 0 auto" }}>
          {[0.5, 0.75, 1.0].map((rate) => (
            <button
              key={rate}
              className={`speed-option ${playbackRate === rate ? "active" : ""}`}
              onClick={() => onSpeedChange(rate)}
              title={`Set speed to ${rate}x`}
            >
              {rate}x
            </button>
          ))}
        </div>

      </div>

      {/* Beat Tracker Selector Dropdown for multiple trackers */}
      {hasMultipleTrackers && (
        <div className="tracker-select-row" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "12px", marginTop: "4px" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: "600", color: "#9ca3af" }}>
            Beat Tracking Model
          </span>
          <select
            value={activeTracker}
            onChange={(e) => onTrackerChange(e.target.value)}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "6px",
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: "600",
              outline: "none",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <optgroup label="Default/Calibration" style={{ background: "#111827", color: "#9ca3af" }}>
              <option value="default" style={{ background: "#111827", color: "#ffffff" }}>Default (Manual Calibration)</option>
            </optgroup>
            <optgroup label="Full Mix (Raw)" style={{ background: "#111827", color: "#9ca3af" }}>
              <option value="librosa" style={{ background: "#111827", color: "#ffffff" }}>Librosa HPSS</option>
              <option value="beatnet" style={{ background: "#111827", color: "#ffffff" }}>BeatNet DBN</option>
              <option value="madmom" style={{ background: "#111827", color: "#ffffff" }}>Madmom RNN</option>
            </optgroup>
            <optgroup label="Isolated Drums Stem" style={{ background: "#111827", color: "#9ca3af" }}>
              <option value="drums_librosa" style={{ background: "#111827", color: "#ffffff" }}>Drums: Librosa HPSS</option>
              <option value="drums_beatnet" style={{ background: "#111827", color: "#ffffff" }}>Drums: BeatNet DBN</option>
              <option value="drums_madmom" style={{ background: "#111827", color: "#ffffff" }}>Drums: Madmom RNN</option>
            </optgroup>
            <optgroup label="Isolated Bass Stem" style={{ background: "#111827", color: "#9ca3af" }}>
              <option value="bass_librosa" style={{ background: "#111827", color: "#ffffff" }}>Bass: Librosa HPSS</option>
              <option value="bass_beatnet" style={{ background: "#111827", color: "#ffffff" }}>Bass: BeatNet DBN</option>
              <option value="bass_madmom" style={{ background: "#111827", color: "#ffffff" }}>Bass: Madmom RNN</option>
            </optgroup>
          </select>
        </div>
      )}
    </div>
  );
}
