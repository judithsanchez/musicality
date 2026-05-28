

export default function AudioShield({ onPlayToggle }) {
  return (
    <div 
      className="touch-shield" 
      onClick={onPlayToggle} 
      title="Accidental clicks shielded. Click to toggle Play/Pause."
    />
  );
}
