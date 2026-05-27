import os
import json
import librosa
import numpy as np

def main():
    audio_path = "/home/judithsanchez/dev/armada-movement/POBRE DIABLO  Ronald Borjas ( VIDEO OFICIAL ).mp3"
    output_dir = "/home/judithsanchez/dev/armada-movement/public/songs"
    
    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found at: {audio_path}")
        return
        
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "66HCBysrJS8.json")
    
    print("[EXTRACTOR] Loading audio and running Librosa beat tracker...")
    y, sr = librosa.load(audio_path, sr=22050)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    
    # Normalize tempo to float
    if hasattr(tempo, 'item'):
        tempo = tempo.item()
    elif isinstance(tempo, (list, tuple, np.ndarray)) and len(tempo) > 0:
        tempo = tempo[0]
        
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    print(f"[EXTRACTOR] Found {len(beat_times)} beats at {tempo:.2f} BPM.")
    
    # 8-count cycle constructor:
    # Salsa beats are mapped continuously as 1, 2, 3, 4, 5, 6, 7, 8.
    beats_list = []
    for idx, t in enumerate(beat_times):
        # 1-indexed modulo 8
        beat_count = (idx % 8) + 1
        beats_list.append({
            "timestamp": round(float(t), 3),
            "beat": beat_count
        })
        
    # Standard Salsa section structure definitions (estimated based on Ronald Borjas arrangement):
    # Introduction, Verse, Chorus, Montuno (cowbell enters), Mambo, ending.
    sections = [
        {
            "name": "Intro",
            "startTimestamp": 0.000,
            "focus": "brass",
            "emoji": "🎺"
        },
        {
            "name": "Verse (Tema)",
            "startTimestamp": 15.000,
            "focus": "bongo",
            "emoji": "🪘"
        },
        {
            "name": "Chorus (Coro)",
            "startTimestamp": 47.000,
            "focus": "conga",
            "emoji": "🪘"
        },
        {
            "name": "Montuno",
            "startTimestamp": 95.000,
            "focus": "cowbell",
            "emoji": "🔔"
        },
        {
            "name": "Mambo (Brass Solo)",
            "startTimestamp": 156.000,
            "focus": "brass",
            "emoji": "🎺"
        },
        {
            "name": "Soneo / Moña",
            "startTimestamp": 188.000,
            "focus": "cowbell",
            "emoji": "🔔"
        },
        {
            "name": "Ending (Coda)",
            "startTimestamp": 260.000,
            "focus": "brass",
            "emoji": "🎺"
        }
    ]
    
    # Assemble complete schema JSON
    schema_json = {
        "id": "song-salsa-pobre-diablo",
        "schemaVersion": "1.1",
        "metadata": {
            "songTitle": "Pobre Diablo",
            "artist": "Ronald Borjas",
            "danceStyle": "salsa",
            "youtubeId": "66HCBysrJS8",
            "bpm": round(tempo, 2),
            "difficulty": "hard"
        },
        "sections": sections,
        "events": [
            {
                "type": "break",
                "startTimestamp": 218.500,
                "durationInBeats": 8,
                "description": "Silent dynamic break"
            }
        ],
        "beats": beats_list
    }
    
    # Save file
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema_json, f, indent=2, ensure_ascii=False)
        
    print(f"[SUCCESS] Exported complete beatmap JSON to: {output_path}")

if __name__ == "__main__":
    main()
