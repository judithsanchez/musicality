import argparse
import importlib.util
import json
import math
import os
import shutil
import sys
from pathlib import Path

from ingest_track import analyze_audio, download_youtube_audio, normalize_youtube_id


def sorted_unique_ms(values):
    return sorted(set(int(round(value)) for value in values if isinstance(value, (int, float)) and math.isfinite(value)))


def median(values):
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def intervals(values):
    ordered = sorted_unique_ms(values)
    return [ordered[index] - ordered[index - 1] for index in range(1, len(ordered))]


def nearest(value, candidates):
    if not candidates:
        return None
    return min(candidates, key=lambda candidate: abs(candidate - value))


def comparison_stats(candidate, human):
    candidate_values = sorted_unique_ms(candidate)
    human_values = sorted_unique_ms(human)
    diffs = []
    abs_diffs = []
    for value in candidate_values:
        match = nearest(value, human_values)
        if match is not None:
            diff = value - match
            diffs.append(diff)
            abs_diffs.append(abs(diff))
    return {
        "markerCount": len(candidate_values),
        "medianIntervalMs": median(intervals(candidate_values)),
        "medianNearestHumanDiffMs": median(diffs),
        "medianNearestHumanAbsDiffMs": median(abs_diffs),
        "within100ms": sum(1 for value in abs_diffs if value <= 100),
        "within250ms": sum(1 for value in abs_diffs if value <= 250)
    }


def run_librosa(audio_path):
    bpm, downbeats = analyze_audio(audio_path)
    return {
        "baseBpm": bpm,
        "downbeats": sorted_unique_ms(downbeats),
        "available": True
    }


def load_beatnetlite(beatnetlite_path):
    module_path = Path(beatnetlite_path) / "BeatNetLite.py"
    if not module_path.exists():
        raise FileNotFoundError(f"BeatNetLite.py not found in {beatnetlite_path}")
    sys.path.insert(0, str(Path(beatnetlite_path).resolve()))
    spec = importlib.util.spec_from_file_location("BeatNetLite", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BeatNetLite


def run_beatnetlite(audio_path, beatnetlite_path):
    BeatNetLite = load_beatnetlite(beatnetlite_path)
    detector = BeatNetLite(1)
    grid = detector.process(audio_path)
    if isinstance(grid, str):
        grid = json.loads(grid)
    downbeats = []
    if isinstance(grid, dict):
        items = grid.items()
    else:
        items = grid
    for item in items:
        timestamp, beat_number = item
        if int(round(float(beat_number))) == 1:
            downbeats.append(float(timestamp) * 1000)
    return {
        "downbeats": sorted_unique_ms(downbeats),
        "available": True,
        "source": str(Path(beatnetlite_path).resolve())
    }


def mixxx_status():
    executable = shutil.which("mixxx")
    if not executable:
        return {
            "available": False,
            "reason": "Mixxx CLI not found locally"
        }
    return {
        "available": False,
        "reason": "Mixxx is installed, but no practical local CLI beatgrid export path is wired yet",
        "executable": executable
    }


def detector_payload(song, audio_path, beatnetlite_path):
    human = song.get("calibratedDownbeats", [])
    payload = {}
    try:
        librosa_result = run_librosa(audio_path)
        payload["librosaCandidateDownbeats"] = librosa_result["downbeats"]
        payload["librosa"] = {
            "available": True,
            "baseBpm": librosa_result["baseBpm"],
            "stats": comparison_stats(librosa_result["downbeats"], human)
        }
    except Exception as err:
        payload["librosa"] = {
            "available": False,
            "reason": f"{err.__class__.__name__}: {err}"
        }
    try:
        beatnet_result = run_beatnetlite(audio_path, beatnetlite_path)
        payload["beatNetLiteDownbeats"] = beatnet_result["downbeats"]
        payload["beatNetLite"] = {
            "available": True,
            "source": beatnet_result["source"],
            "stats": comparison_stats(beatnet_result["downbeats"], human)
        }
    except Exception as err:
        payload["beatNetLite"] = {
            "available": False,
            "reason": f"{err.__class__.__name__}: {err}"
        }
    payload["mixxxBeatgrid"] = mixxx_status()
    return payload


def resolve_audio(args, song):
    if args.audio:
        return args.audio, None
    youtube_id = normalize_youtube_id(args.youtube_id or song.get("youtubeId", ""))
    download = download_youtube_audio(youtube_id)
    if not download["audio_path"]:
        raise RuntimeError(f"Could not download YouTube audio: {'; '.join(download['errors'])}")
    return download["audio_path"], download["tempdir"]


def main():
    parser = argparse.ArgumentParser(description="Compare downbeat detector outputs against human calibrated taps")
    parser.add_argument("--songJson", required=True, help="Song JSON file to read")
    parser.add_argument("--audio", help="Optional local audio path")
    parser.add_argument("--youtubeId", dest="youtube_id", help="Optional YouTube ID or URL override")
    parser.add_argument("--beatNetLitePath", default="/tmp/BeatNetLite", help="Path containing BeatNetLite.py")
    parser.add_argument("--write", action="store_true", help="Write detector outputs into song metadata")
    args = parser.parse_args()

    song_path = Path(args.songJson)
    with song_path.open("r", encoding="utf-8") as file:
        song = json.load(file)

    audio_path, tempdir = resolve_audio(args, song)
    try:
        detectors = detector_payload(song, audio_path, args.beatNetLitePath)
    finally:
        if tempdir:
            tempdir.cleanup()

    if args.write:
        song["metadata"] = song.get("metadata", {})
        song["metadata"]["detectors"] = detectors
        with song_path.open("w", encoding="utf-8") as file:
            json.dump(song, file, indent=2, ensure_ascii=False)
            file.write("\n")
    print(json.dumps(detectors, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
