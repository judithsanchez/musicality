

export default function Visualizer({
  danceStyle = "salsa",
  currentTime = 0,
  introEnd = 0,
  currentBeat = null,
  activeSection = null,
  activeBreak = null
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
      
      {/* 1. Structural Section Reminder Banner */}
      {activeSection && (
        <div className={`section-banner ${getContainerClass()}`}>
          <span className="banner-emoji">{activeSection.emoji || "🎵"}</span>
          <span style={{ textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.5px" }}>
            {activeSection.name}
            {activeSection.focus && (
              <strong style={{ marginLeft: "8px", color: "rgba(255,255,255,0.9)" }}>
                 — Focus: {activeSection.focus}
              </strong>
            )}
          </span>
        </div>
      )}

      {/* 2. Beats Pulsing Track */}
      <div className="glass-panel" style={{ padding: "20px 10px", margin: 0 }}>
        {activeBreak ? (
          <div className="break-freeze-overlay">
            <div className="break-freeze-title">
              <span>❄️ HOLD POSE / BREAK</span>
            </div>
            <div className="break-freeze-countdown">
              Groove resumes in {Math.max(0, activeBreak.endTimestamp - currentTime).toFixed(1)}s
            </div>
          </div>
        ) : (
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
                canLight && 
                currentTime >= introEnd && 
                currentBeat && 
                currentBeat.beat === beatNum;

              const isPause = !isBachata && (beatNum === 4 || beatNum === 8);

              return (
                <div
                  key={beatNum}
                  className={`beat-circle ${isPause ? "beat-pause" : ""}${
                    isActive ? (isGold ? " accent-gold" : " accent-cyan") : ""
                  }`}
                >
                  <span>{beatNum}</span>
                  {isBachata && (beatNum === 4 || beatNum === 8) && (
                    <span 
                      className="beat-label" 
                      style={{ fontSize: "0.55rem", opacity: 0.8, color: "hsl(var(--accent-gold))" }}
                    >
                      TAP
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
