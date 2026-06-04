import os
import json
import time
import argparse
import numpy as np

def main():
    parser = argparse.ArgumentParser(description="BeatNet AI Beat Tracker")
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
        # Extract YouTube ID from output filename, e.g., 66HCBysrJS8_beatnet.json -> 66HCBysrJS8
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

    print(f"[BEATNET] Loading BeatNet and processing audio: {audio_path} (ID: {youtube_id}, Title: {title})")
    start_time = time.time()
    
    # Import inside main to make sure it's loaded only when run
    from BeatNet.BeatNet import BeatNet
    
    # Model 1 is for offline analysis with DBN inference
    estimator = BeatNet(1, mode='offline', inference_model='DBN', plot=[], thread=False)
    
    # process returns an array of shape (N, 2) where column 0 is timestamp and column 1 is beat number
    output = estimator.process(audio_path)
    print(f"[BEATNET] Processing completed in {time.time() - start_time:.2f}s.")
    
    beat_times = output[:, 0]
    print(f"[BEATNET] Found {len(beat_times)} beats.")
    
    # Calculate average BPM based on average beat interval
    if len(beat_times) > 1:
        intervals = np.diff(beat_times)
        avg_interval = np.mean(intervals)
        bpm = 60.0 / avg_interval
    else:
        bpm = 120.0
        
    beats_list = []
    for idx, t in enumerate(beat_times):
        beats_list.append({
            "timestamp": round(float(t), 3),
            "beat": (idx % 8) + 1
        })
        
    tracker_display = "BeatNet"
    stem_display = ""
    id_suffix = "beatnet"
    if "_drums_" in output_path:
        stem_display = "Drums - "
        id_suffix = "drums-beatnet"
    elif "_bass_" in output_path:
        stem_display = "Bass - "
        id_suffix = "bass-beatnet"
        
    display_title = f"{title} ({stem_display}{tracker_display})"

    schema_json = {
        "id": f"song-{youtube_id}-{id_suffix}",
        "title": display_title,
        "artist": artist,
        "youtubeId": youtube_id,
        "difficulty": "medium",
        "bpm": round(float(bpm), 2),
        "isCalibrated": False,
        "beats": beats_list,
        "metadata": {
            "songTitle": display_title,
            "artist": artist,
            "danceStyle": dance_style,
            "youtubeId": youtube_id,
            "bpm": round(float(bpm), 2),
            "difficulty": "medium"
        }
    }
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema_json, f, indent=2, ensure_ascii=False)
    print(f"[SUCCESS] Exported BeatNet beatmap to {output_path}")

if __name__ == "__main__":
    main()
