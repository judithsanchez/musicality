import os
import sys
import json
import argparse
import numpy as np

try:
    import librosa
except ImportError:
    print("[ERROR] librosa is required. Install it using 'pnpm install' or 'pip install librosa'.")
    sys.exit(1)

def run_beatnet(audio_path, sr=22050):
    try:
        print("[INGEST-AI] Attempting BeatNet beat tracking...")
        from BeatNet.BeatNet import BeatNet
        estimator = BeatNet(1, device='cpu')
        output = estimator.process(audio_path)
        beat_times = output[:, 0]
        intervals = np.diff(beat_times)
        if len(intervals) > 0:
            avg_interval = np.mean(intervals)
            bpm = 60.0 / avg_interval
        else:
            bpm = 120.0
        print(f"[INGEST-AI] BeatNet successfully found {len(beat_times)} beats. Estimated BPM: {bpm:.2f}")
        return beat_times, bpm
    except Exception as e:
        print(f"[INGEST-AI WARNING] BeatNet failed or not installed: {e}. Falling back to constant grid beat tracking...")
        try:
            y, sr = librosa.load(audio_path, sr=sr)
            duration = librosa.get_duration(y=y, sr=sr)
            bpm = 120.0
            beat_interval = 60.0 / bpm
            beat_times = np.arange(0.0, duration, beat_interval)
            print(f"[INGEST-AI] Constant beat tracker generated {len(beat_times)} beats at {bpm} BPM.")
            return beat_times, bpm
        except Exception as err:
            print(f"[INGEST-AI ERROR] Ingest fallback failed: {err}")
            return np.array([0.0, 0.5, 1.0, 1.5, 2.0]), 120.0

def main():
    parser = argparse.ArgumentParser(description="Automated Ingestion Pipeline (BeatNet)")
    parser.add_argument("--audio", required=True, help="Path to input audio file")
    parser.add_argument("--youtubeId", required=True, help="YouTube ID of the song")
    parser.add_argument("--title", required=True, help="Title of the song")
    parser.add_argument("--artist", required=True, help="Artist of the song")
    parser.add_argument("--genre", choices=["SALSA", "BACHATA"], required=True, help="Song genre")
    parser.add_argument("--output", required=True, help="Path where output JSON should be written")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.audio):
        print(f"[ERROR] Audio file not found at: {args.audio}")
        sys.exit(1)
        
    print(f"\n[INGEST-AI] Starting ingestion for: {args.title} - {args.artist} ({args.genre})")
    
    beat_times, bpm = run_beatnet(args.audio)
    
    # Correct octave error (half-speed estimation)
    if (args.genre == "SALSA" and bpm < 110.0) or (args.genre == "BACHATA" and bpm < 90.0):
        print(f"[INGEST-AI] Detected half-speed BPM {bpm:.2f} for {args.genre}. Interpolating beats to double resolution...")
        doubled_times = []
        for i in range(len(beat_times) - 1):
            doubled_times.append(beat_times[i])
            doubled_times.append((beat_times[i] + beat_times[i+1]) / 2.0)
        if len(beat_times) > 0:
            doubled_times.append(beat_times[-1])
            avg_interval = np.mean(np.diff(beat_times)) if len(beat_times) > 1 else 0.5
            doubled_times.append(beat_times[-1] + avg_interval / 2.0)
        beat_times = np.array(doubled_times)
        bpm = bpm * 2.0
        print(f"[INGEST-AI] Resolution doubled. New estimated BPM: {bpm:.2f}")

    beat_times_ms = [int(round(float(t) * 1000)) for t in beat_times]
    
    if not beat_times_ms:
        beat_times_ms = [0, 500, 1000]
        
    song_map = {
        "id": f"song-{args.youtubeId}",
        "youtubeId": args.youtubeId,
        "title": args.title,
        "artist": args.artist,
        "genre": args.genre,
        "baseBpm": float(round(bpm, 2)),
        "absoluteBeatMap": beat_times_ms,
        "schemaVersion": "2.0",
        "sections": [],
        "phrases": []
    }
    
    if args.genre == "SALSA":
        song_map["defaultClave"] = "NOT_SET"
        
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(song_map, f, indent=2, ensure_ascii=False)
        
    print(f"[SUCCESS] Ingestion completed. JSON saved to {args.output}")

if __name__ == "__main__":
    main()
