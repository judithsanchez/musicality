import os
import json
import time
import argparse
import numpy as np
import librosa

def main():
    parser = argparse.ArgumentParser(description="Librosa Raw HPSS Beat Tracker")
    parser.add_argument("--audio", required=True, help="Path to the audio file to analyze")
    parser.add_argument("--output", required=True, help="Path where output JSON beatmap should be written")
    parser.add_argument("--youtube-id", help="YouTube ID of the song")
    args = parser.parse_args()

    audio_path = args.audio
    output_path = args.output
    
    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found at: {audio_path}")
        return
        
    youtube_id = args.youtube_id
    if not youtube_id:
        # Extract YouTube ID from output filename, e.g., 66HCBysrJS8_librosa.json -> 66HCBysrJS8
        base = os.path.basename(output_path)
        youtube_id = base.split("_")[0].split(".")[0]

    title = "Unknown Song"
    artist = "Unknown Artist"
    dance_style = "salsa"

    catalog_path = "public/songs/catalog.json"
    if os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                catalog = json.load(f)
                for song in catalog:
                    if song.get("youtubeId") == youtube_id:
                        title = song.get("songTitle", title)
                        artist = song.get("artist", artist)
                        dance_style = song.get("danceStyle", dance_style)
                        break
        except Exception as e:
            print(f"[WARNING] Could not read catalog.json: {e}")

    print(f"[LIBROSA-RAW] Loading audio file: {audio_path} (ID: {youtube_id}, Title: {title})")
    y, sr = librosa.load(audio_path, sr=22050)
    duration = librosa.get_duration(y=y, sr=sr)
    
    print("[LIBROSA-RAW] Running HPSS separation...")
    y_harm, y_perc = librosa.effects.hpss(y)
    
    print("[LIBROSA-RAW] Beat tracking on percussive signal...")
    tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr)
    
    if hasattr(tempo, 'item'):
        tempo = tempo.item()
    elif isinstance(tempo, (list, tuple, np.ndarray)) and len(tempo) > 0:
        tempo = tempo[0]
        
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    print(f"[LIBROSA-RAW] Found {len(beat_times)} beats at {tempo:.2f} BPM.")
    
    beats_list = []
    for idx, t in enumerate(beat_times):
        beats_list.append({
            "timestamp": round(float(t), 3),
            "beat": (idx % 8) + 1
        })
        
    tracker_display = "Librosa"
    stem_display = ""
    id_suffix = "librosa"
    if "_drums_" in output_path:
        stem_display = "Drums - "
        id_suffix = "drums-librosa"
    elif "_bass_" in output_path:
        stem_display = "Bass - "
        id_suffix = "bass-librosa"
        
    display_title = f"{title} ({stem_display}{tracker_display})"

    schema_json = {
        "id": f"song-{youtube_id}-{id_suffix}",
        "title": display_title,
        "artist": artist,
        "youtubeId": youtube_id,
        "difficulty": "medium",
        "bpm": round(tempo, 2),
        "isCalibrated": False,
        "beats": beats_list,
        "metadata": {
            "songTitle": display_title,
            "artist": artist,
            "danceStyle": dance_style,
            "youtubeId": youtube_id,
            "bpm": round(tempo, 2),
            "difficulty": "medium"
        }
    }
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema_json, f, indent=2, ensure_ascii=False)
    print(f"[SUCCESS] Exported raw Librosa HPSS beatmap to {output_path}")

if __name__ == "__main__":
    main()
