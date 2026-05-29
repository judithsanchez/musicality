import { useState, useEffect, useRef } from "react";

export default function GameCanvas({
  songData,
  currentTime,
  isPlaying,
  onPlayToggle
}) {
  // Gameplay metrics
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  
  // Scored beat indices to prevent mashing same beat
  const [scoredBeats, setScoredBeats] = useState(new Set());
  
  // visual feedback
  const [feedback, setFeedback] = useState(null); // { type: 'perfect'|'good'|'miss', text: '' }
  const [isFlashing, setIsFlashing] = useState(false); // Miss red flash indicator

  const prevTimeRef = useRef(currentTime);
  const feedbackTimeoutRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  // Clear feedback & flash timeouts on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // Monitor seeks/rewinds to reset play session
  useEffect(() => {
    if (currentTime < prevTimeRef.current - 1) {
      setScoredBeats(new Set());
      setScore(0);
      setCombo(0);
      setMultiplier(1);
      setFeedback({ type: "miss", text: "Session Reset! 🔄" });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 1000);
    }
    prevTimeRef.current = currentTime;
  }, [currentTime]);



  const triggerHit = (type, diffMs) => {
    const isPerfect = type === "Perfect";
    const points = (isPerfect ? 200 : 100) * multiplier;
    
    setScore(prev => prev + points);
    
    setCombo(prev => {
      const nextCombo = prev + 1;
      if (nextCombo > maxCombo) setMaxCombo(nextCombo);
      
      // Update multiplier: increases by 1x for every 10 combo steps, up to 4x max
      const nextMultiplier = Math.min(4, Math.floor(nextCombo / 10) + 1);
      setMultiplier(nextMultiplier);
      
      return nextCombo;
    });

    setFeedback({
      type: type.toLowerCase(),
      text: `${type}! ${isPerfect ? "⭐" : "⚡"} (${Math.round(diffMs)}ms)`
    });

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 600);
  };

  const triggerMiss = (reason = "Miss") => {
    setCombo(0);
    setMultiplier(1);
    setIsFlashing(true);
    
    // Mobile vibration penalty
    if (navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch {
        // Ignore vibration errors
      }
    }

    setFeedback({
      type: "miss",
      text: `${reason}! ❌`
    });

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 600);

    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setIsFlashing(false), 200);
  };

  const handleTap = (e) => {
    e.preventDefault();

    if (!isPlaying) {
      onPlayToggle();
      return;
    }

    const tapTime = currentTime;
    const beats = songData?.beats || [];
    if (beats.length === 0) return;

    // Find the closest beat
    let closestIndex = -1;
    let minDiff = Infinity;

    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const diff = Math.abs(tapTime - b.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    if (closestIndex === -1) return;

    const diffMs = Math.abs(minDiff * 1000);

    // Anti-spam mashing protection: beat already hit
    if (scoredBeats.has(closestIndex)) {
      triggerMiss("Spam Penalty");
      return;
    }

    // Register beat index as scored
    setScoredBeats(prev => {
      const next = new Set(prev);
      next.add(closestIndex);
      return next;
    });

    // Timing window evaluation
    if (diffMs <= 60) {
      triggerHit("Perfect", diffMs);
    } else if (diffMs <= 120) {
      triggerHit("Good", diffMs);
    } else {
      triggerMiss();
    }
  };

  return (
    <div className="practice-mode-wrapper" style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", position: "relative" }}>
      
      {/* Violent red flash overlay for misses */}
      <div className={`miss-flash-overlay ${isFlashing ? "flash-active" : ""}`} />

      {/* 1. Scoreboard overlay panel */}
      <div className="glass-panel game-score-panel" style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", textAlign: "center" }}>
        
        {/* Score Card */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px" }}>Score</span>
          <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#ffffff", fontFamily: "monospace" }}>{score.toString().padStart(6, "0")}</span>
        </div>

        {/* Combo Card */}
        <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.08)", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px" }}>Combo</span>
          <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#ffffff" }}>
            {combo}
            <span style={{ fontSize: "0.65rem", color: "#6b7280", fontWeight: 400, marginLeft: "4px" }}>
              (Max {maxCombo})
            </span>
          </span>
        </div>

        {/* Multiplier Card */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px" }}>Multiplier</span>
          <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#ffffff", textShadow: multiplier > 1 ? "0 0 10px rgba(255, 255, 255, 0.4)" : "none" }}>
            {multiplier}x
          </span>
        </div>

      </div>

      {/* 2. Main Blind Tapping Zone */}
      <div 
        className="glass-panel tapping-deck-container"
        onTouchStart={handleTap}
        onMouseDown={handleTap}
        style={{
          height: "280px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          position: "relative",
          margin: 0,
          background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(9,9,11,0.85) 100%)",
          border: "1.5px dashed #27272a",
          borderRadius: "24px",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
      >
        
        {/* Glowing Ambient Pad Ring */}
        <div 
          className="tapping-pad-glowing-ring"
          style={{
            width: "160px",
            height: "160px",
            borderRadius: "50%",
            border: "4px solid #27272a",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: combo > 0 
              ? `0 0 ${Math.min(40, 10 + combo)}px rgba(255, 255, 255, 0.35)`
              : "0 0 15px rgba(255, 255, 255, 0.05)",
            background: "rgba(0, 0, 0, 0.4)",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", letterSpacing: "1px" }}>TAP HERE</span>
          <span style={{ fontSize: "0.6rem", color: "#a1a1aa", marginTop: "4px", textTransform: "uppercase" }}>Blind Rhythm Mode</span>
        </div>

        {/* Real-time Hit feedback Popups */}
        {feedback && (
          <div 
            className={`hit-feedback-popup hit-${feedback.type}`}
            style={{
              position: "absolute",
              top: "25px",
              fontSize: "1.1rem",
              fontWeight: 800,
              padding: "6px 16px",
              borderRadius: "20px",
              animation: "popup-bounce 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
            }}
          >
            {feedback.text}
          </div>
        )}

      </div>
    </div>
  );
}
