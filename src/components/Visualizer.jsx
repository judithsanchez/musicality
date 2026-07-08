

export default function Visualizer({
  danceStyle = "salsa",
  currentTime = 0,
  introEnd = 0,
  currentBeat = null,
  activeSection = null,
  activeBreak = null,
  isPlaying = false
}) {
  const isActive = 
    isPlaying &&
    currentTime >= introEnd && 
    currentBeat && 
    currentBeat.count === 1;

  let highlightStyle = {};
  if (isActive) {
    highlightStyle = {
      background: "#ffffff",
      color: "#000000",
      borderColor: "#ffffff",
      boxShadow: "0 0 28px 8px rgba(255, 255, 255, 0.95), inset 0 0 8px rgba(255, 255, 255, 0.5)",
      transform: "scale(1.15)"
    };
  }

  return (
    <div className="visualizer-wrapper">
      <div className="glass-panel visualizer-glass-panel" style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "24px" }}>
        <div 
          className="beat-circle" 
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            border: "2px solid rgba(255, 255, 255, 0.12)",
            background: "rgba(255, 255, 255, 0.02)",
            color: "rgba(255, 255, 255, 0.4)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.8rem",
            fontWeight: "900",
            transition: "all 0.1s ease",
            ...highlightStyle
          }}
        >
          <span>1</span>
          <span style={{ fontSize: "0.55rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px", opacity: isActive ? 0.8 : 0.4 }}>
            Phrase
          </span>
        </div>
      </div>
    </div>
  );
}
