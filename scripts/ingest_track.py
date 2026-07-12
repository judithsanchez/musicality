import os
import sys
import json
import argparse
import tempfile
import re
from pathlib import Path

def normalize_youtube_id(value):
    trimmed = value.strip()
    if re.fullmatch(r"[a-zA-Z0-9_-]{11}", trimmed):
        return trimmed
    patterns = [
        r"youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})",
        r"youtube\.com/embed/([a-zA-Z0-9_-]{11})",
        r"youtu\.be/([a-zA-Z0-9_-]{11})",
        r"youtube\.com/v/([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
        r"(?:/|v=|embed/|shorts/)([a-zA-Z0-9_-]{11})(?:[?&]|$)"
    ]
    for pattern in patterns:
        match = re.search(pattern, trimmed)
        if match:
            return match.group(1)
    return trimmed

def analyze_audio(audio_path):
    try:
        import librosa
        import numpy as np
    except ImportError:
        print("[WARN] librosa is not installed. Falling back to empty downbeats.")
        return None, []

    try:
        try:
            import soundfile as sf
            y, sr = sf.read(audio_path, dtype="float32")
            if getattr(y, "ndim", 1) > 1:
                y = y.mean(axis=1)
            if sr != 22050:
                y = librosa.resample(y, orig_sr=sr, target_sr=22050, res_type="soxr_hq")
                sr = 22050
        except Exception:
            y, sr = librosa.load(audio_path, sr=22050, mono=True, res_type="soxr_hq")
        try:
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
            if hasattr(tempo, "__len__"):
                tempo = float(tempo[0]) if len(tempo) else 0.0
            beat_times = beat_times[::4]
        except Exception as err:
            print(f"[WARN] librosa beat tracking failed, using onset candidates: {err.__class__.__name__}")
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units="frames")
            onset_times = librosa.frames_to_time(onset_frames, sr=sr)
            tempo_values = librosa.feature.tempo(onset_envelope=onset_env, sr=sr)
            tempo = float(tempo_values[0]) if len(tempo_values) else 0.0
            if tempo:
                downbeat_interval = 4.0 * 60.0 / tempo
                anchor = float(onset_times[0]) if len(onset_times) else 0.0
                beat_times = np.arange(anchor, len(y) / sr, downbeat_interval)
            else:
                beat_times = []
        raw_downbeats = [int(round(float(t) * 1000)) for t in beat_times]
        return float(round(tempo, 2)) if tempo else None, raw_downbeats
    except Exception as err:
        print(f"[WARN] librosa analysis failed: {err.__class__.__name__}: {err}")
        return None, []

def download_youtube_audio(youtube_id):
    try:
        import yt_dlp
    except ImportError:
        print("[WARN] yt-dlp is not installed. Falling back to empty downbeats.")
        return {"tempdir": None, "audio_path": None, "client": None, "errors": ["yt-dlp not installed"]}

    url = f"https://www.youtube.com/watch?v={youtube_id}"
    errors = []
    for client in ["default", "android", "web", "mweb", "ios"]:
        tmpdir = tempfile.TemporaryDirectory()
        output_template = str(Path(tmpdir.name) / "audio.%(ext)s")
        opts = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "noprogress": True,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav"
            }]
        }
        if client != "default":
            opts["extractor_args"] = {"youtube": {"player_client": [client]}}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            wav_files = list(Path(tmpdir.name).glob("audio.wav"))
            if not wav_files:
                errors.append(f"{client}: no wav output")
                tmpdir.cleanup()
                continue
            return {"tempdir": tmpdir, "audio_path": str(wav_files[0]), "client": client, "errors": errors}
        except Exception as err:
            errors.append(f"{client}: {err.__class__.__name__}")
            tmpdir.cleanup()
    print(f"[WARN] yt-dlp download failed for all clients: {'; '.join(errors)}")
    return {"tempdir": None, "audio_path": None, "client": None, "errors": errors}

def main():
    parser = argparse.ArgumentParser(description="Automated Ingestion Pipeline")
    parser.add_argument("--audio", required=False, help="Path to input audio file")
    parser.add_argument("--youtubeId", required=True, help="YouTube ID or URL of the song")
    parser.add_argument("--title", required=True, help="Title of the song")
    parser.add_argument("--artist", required=True, help="Artist of the song")
    parser.add_argument("--genre", choices=["SALSA", "BACHATA"], required=True, help="Song genre")
    parser.add_argument("--output", required=True, help="Path where output JSON should be written")
    parser.add_argument("--bpm", type=float, help="Base BPM of the song (optional)")
    parser.add_argument("--skipAnalysis", action="store_true", help="Skip audio analysis")
    
    args = parser.parse_args()
    youtube_id = normalize_youtube_id(args.youtubeId)
    
    if args.audio and not os.path.exists(args.audio):
        print(f"[ERROR] Audio file not found at: {args.audio}")
        sys.exit(1)
        
    print(f"\n[INGEST] Starting ingestion for: {args.title} - {args.artist} ({args.genre})")
    
    analyzed_bpm = None
    raw_downbeats = []
    temp_download = None
    audio_path = args.audio
    download_client = None
    download_errors = []
    download_succeeded = bool(args.audio)

    if not args.skipAnalysis:
        if not audio_path:
            downloaded = download_youtube_audio(youtube_id)
            download_client = downloaded["client"]
            download_errors = downloaded["errors"]
            if downloaded["audio_path"]:
                temp_download = downloaded["tempdir"]
                audio_path = downloaded["audio_path"]
                download_succeeded = True
        if audio_path and os.path.exists(audio_path):
            analyzed_bpm, raw_downbeats = analyze_audio(audio_path)

    if temp_download:
        temp_download.cleanup()

    bpm = args.bpm or analyzed_bpm or (150.0 if args.genre == "SALSA" else 120.0)
    song_map = {
        "id": f"song-{youtube_id}",
        "youtubeId": youtube_id,
        "title": args.title,
        "artist": args.artist,
        "genre": args.genre,
        "status": "DRAFT",
        "metadata": {
            "ingestion": {
                "audioSource": "local-audio" if args.audio else "youtube",
                "analysisSkipped": bool(args.skipAnalysis),
                "analyzedBpm": analyzed_bpm,
                "rawDownbeatsDetected": len(raw_downbeats),
                "usedFallbackBpm": analyzed_bpm is None and args.bpm is None,
                "downloadSucceeded": download_succeeded,
                "ytDlpClient": download_client,
                "ytDlpErrors": download_errors
            }
        },
        "baseBpm": float(round(bpm, 2)),
        "rawDownbeats": raw_downbeats,
        "calibratedDownbeats": raw_downbeats,
        "events": [],
        "schemaVersion": "2.0",
        "sections": []
      }
    
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(song_map, f, indent=2, ensure_ascii=False)
        
    print(f"[SUCCESS] Ingestion completed. JSON saved to {args.output}")

if __name__ == "__main__":
    main()
