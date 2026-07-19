import argparse
import json
import os
import re


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


def main():
    parser = argparse.ArgumentParser(description="Create a clean song calibration record")
    parser.add_argument("--youtubeId", required=True, help="YouTube ID or URL of the song")
    parser.add_argument("--title", required=True, help="Title of the song")
    parser.add_argument("--artist", required=True, help="Artist of the song")
    parser.add_argument("--genre", choices=["SALSA", "BACHATA"], required=True, help="Song genre")
    parser.add_argument("--output", required=True, help="Path where output JSON should be written")

    args = parser.parse_args()
    youtube_id = normalize_youtube_id(args.youtubeId)

    song_map = {
        "id": f"song-{youtube_id}",
        "youtubeId": youtube_id,
        "title": args.title,
        "artist": args.artist,
        "genre": args.genre,
        "status": "DRAFT",
        "events": [],
        "schemaVersion": "3.2",
        "sections": [],
        "tapCalibrationPasses": [],
        "taps": [],
        "reviewedAnchors": []
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as file:
        json.dump(song_map, file, indent=2, ensure_ascii=False)
        file.write("\n")

    print(f"[SUCCESS] Song calibration record saved to {args.output}")


if __name__ == "__main__":
    main()
