import os
import sys
import json
import argparse

def main():
    parser = argparse.ArgumentParser(description="Automated Ingestion Pipeline (Steady Fallback Grid)")
    parser.add_argument("--audio", required=True, help="Path to input audio file")
    parser.add_argument("--youtubeId", required=True, help="YouTube ID of the song")
    parser.add_argument("--title", required=True, help="Title of the song")
    parser.add_argument("--artist", required=True, help="Artist of the song")
    parser.add_argument("--genre", choices=["SALSA", "BACHATA"], required=True, help="Song genre")
    parser.add_argument("--output", required=True, help="Path where output JSON should be written")
    parser.add_argument("--bpm", type=float, help="Base BPM of the song (optional)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.audio):
      print(f"[ERROR] Audio file not found at: {args.audio}")
      sys.exit(1)
        
    print(f"\n[INGEST] Starting dependency-free ingestion for: {args.title} - {args.artist} ({args.genre})")
    
    # Set default BPM based on genre
    bpm = args.bpm if args.bpm else (150.0 if args.genre == "SALSA" else 120.0)
    beat_interval_ms = int(round(60000.0 / bpm))
    
    # Generate 10 minutes (600 seconds) of steady beats
    max_duration_ms = 600 * 1000
    beat_times_ms = list(range(0, max_duration_ms, beat_interval_ms))
    
    song_map = {
        "id": f"song-{args.youtubeId}",
        "youtubeId": args.youtubeId,
        "title": args.title,
        "artist": args.artist,
        "genre": args.genre,
        "status": "DRAFT_CUTTING",
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
