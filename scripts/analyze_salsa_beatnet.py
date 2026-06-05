import os
import json
import time
import argparse
import numpy as np

def main():
    parser = argparse.ArgumentParser(description="Advanced BeatNet Salsa Beat Ingest Tracker")
    parser.add_argument("--audio", required=True, help="Path to the audio file to analyze")
    parser.add_argument("--output", required=True, help="Path where output JSON beatmap should be written")
    args = parser.parse_args()

    audio_path = args.audio
    output_path = args.output
    
    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found at: {audio_path}")
        return
        
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        
    youtube_id = os.path.basename(output_path).split(".")[0]
    
    # Read existing metadata if available (ingested in previous step)
    metadata = {
        "songTitle": "Untitled Song",
        "artist": "Unknown Artist",
        "danceStyle": "salsa",
        "youtubeId": youtube_id,
        "difficulty": "medium",
        "bpm": 120.0
    }
    
    existing_id = None
    if os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                if "metadata" in existing_data and existing_data["metadata"]:
                    metadata.update(existing_data["metadata"])
                elif "title" in existing_data:
                    metadata["songTitle"] = existing_data.get("title", metadata["songTitle"])
                    metadata["artist"] = existing_data.get("artist", metadata["artist"])
                    metadata["youtubeId"] = existing_data.get("youtubeId", metadata["youtubeId"])
                    metadata["difficulty"] = existing_data.get("difficulty", metadata["difficulty"])
                    metadata["danceStyle"] = existing_data.get("danceStyle", "salsa")
                if "id" in existing_data:
                    existing_id = existing_data["id"]
        except Exception as e:
            print(f"[SALSA-AI WARNING] Could not read existing JSON: {e}")

    dance_style = metadata.get("danceStyle", "salsa").lower()
    
    print(f"[BEATNET-INGEST] Spawning BeatNet DBN model on original track: {audio_path}")
    start_time = time.time()
    
    from BeatNet.BeatNet import BeatNet
    estimator = BeatNet(1, mode='offline', inference_model='DBN', plot=[], thread=False)
    output = estimator.process(audio_path)
    
    print(f"[BEATNET-INGEST] BeatNet complete in {time.time() - start_time:.2f}s.")
    
    beat_times = output[:, 0]
    print(f"[BEATNET-INGEST] Tracked {len(beat_times)} beats.")
    
    # Calculate average BPM
    if len(beat_times) > 1:
        intervals = np.diff(beat_times)
        avg_interval = np.mean(intervals)
        tempo = 60.0 / avg_interval
    else:
        tempo = 120.0
        
    # Build beats count array
    # Salsa uses 8-counts, Bachata uses 4-counts
    cycle_size = 4 if dance_style == "bachata" else 8
    
    beats_list = []
    for idx, t in enumerate(beat_times):
        beat_count = (idx % cycle_size) + 1
        beats_list.append({
            "timestamp": round(float(t), 3),
            "beat": beat_count
        })

    # Assemble complete schema JSON matching AgnosticSong schema structure
    schema_json = {
        "id": existing_id or f"song-{metadata['youtubeId']}",
        "title": metadata["songTitle"],
        "artist": metadata["artist"],
        "youtubeId": metadata["youtubeId"],
        "youtubeUrl": f"https://www.youtube.com/watch?v={metadata['youtubeId']}",
        "difficulty": metadata["difficulty"].lower(),
        "isCalibrated": False,
        
        "rawAnalysis": {
            "estimatedBpm": round(tempo, 2),
            "rawBeats": [round(float(t), 3) for t in beat_times],
            "processedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        },
        "globalTapLog": [],
        "globalReactionDelayMs": 200,
        "calibratedBeatmap": {
            "bpm": round(tempo, 2),
            "beats": beats_list,
            "sections": []
        },
        
        # Flat compatibility fields:
        "metadata": {
            "songTitle": metadata["songTitle"],
            "artist": metadata["artist"],
            "danceStyle": dance_style,
            "youtubeId": metadata["youtubeId"],
            "bpm": round(tempo, 2),
            "difficulty": metadata["difficulty"].lower()
        },
        "sections": [],
        "beats": beats_list
    }
    
    # Save file
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema_json, f, indent=2, ensure_ascii=False)
        
    print(f"[SUCCESS] BeatNet beatmap successfully created at: {output_path}")

if __name__ == "__main__":
    main()
