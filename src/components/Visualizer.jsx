

export default function Visualizer({
  danceStyle = "salsa",
  currentTime = 0,
  introEnd = 0,
  currentBeat = null,
  activeSection = null,
  activeBreak = null,
  isPlaying = false
}) {
  
  // Helper to map section name to CSS class
  const getContainerClass = () => {
    if (!activeSection) return "";
    const name = activeSection.name.toLowerCase();
    if (name.includes("intro")) return "active-intro";
    if (name.includes("verse") || name.includes("groove") || name.includes("derecho")) return "active-verse";
    if (name.includes("chorus") || name.includes("montuno") || name.includes("mambo") || name.includes("majao")) return "active-montuno";
    return "";
  };

  const isBachata = danceStyle.toLowerCase() === "bachata";
  const isOn2 = danceStyle.toLowerCase().includes("on2");

  return (
    <div className="visualizer-wrapper">
      


      {/* 2. Beats Pulsing Track */}
      <div className="glass-panel visualizer-glass-panel">
        <div className="beats-container">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((beatNum) => {
            let canLight;
            let isGold;

            if (isBachata) {
              canLight = true;
              isGold = beatNum === 4 || beatNum === 8;
            } else if (isOn2) {
              // Salsa On2 downbeats are 2 and 6
              canLight = beatNum !== 4 && beatNum !== 8;
              isGold = beatNum === 2 || beatNum === 6;
            } else {
              // Salsa On1 downbeats are 1 and 5
              canLight = beatNum !== 4 && beatNum !== 8;
              isGold = beatNum === 1 || beatNum === 5;
            }

            const isActive = 
              isPlaying &&
              canLight && 
              currentTime >= introEnd && 
              currentBeat && 
              currentBeat.count === beatNum;

            const isPause = !isBachata && (beatNum === 4 || beatNum === 8);

            let highlightStyle = {};
            if (isActive) {
              if (isGold) {
                // Marked downbeats (brighter, white background, black text, huge outer white glow, scaled up)
                highlightStyle = {
                  background: "#ffffff",
                  color: "#000000",
                  borderColor: "#ffffff",
                  boxShadow: "0 0 28px 8px rgba(255, 255, 255, 0.95), inset 0 0 8px rgba(255, 255, 255, 0.5)",
                  transform: "scale(1.15)",
                  transition: "all 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                };
              } else {
                // Other active counts (dimmer white background, white text, subtle glow, smaller scale)
                highlightStyle = {
                  background: "rgba(255, 255, 255, 0.25)",
                  color: "#ffffff",
                  borderColor: "rgba(255, 255, 255, 0.5)",
                  boxShadow: "0 0 14px 2px rgba(255, 255, 255, 0.35)",
                  transform: "scale(1.05)",
                  transition: "all 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                };
              }
            }

            return (
              <div
                key={beatNum}
                className={`beat-circle ${isPause ? "beat-pause" : ""}`}
                style={highlightStyle}
              >
                <span>{beatNum}</span>
                {isBachata && (beatNum === 4 || beatNum === 8) && (
                  <span 
                    className="beat-label" 
                    style={{ opacity: 0.8, color: isActive ? (isGold ? "#000000" : "rgba(255, 255, 255, 0.8)") : "rgba(255, 255, 255, 0.4)" }}
                  >
                    TAP
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
