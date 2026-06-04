import os
import subprocess
import shutil

songs = [
    {
        "youtube_id": "66HCBysrJS8",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/POBRE DIABLO  Ronald Borjas ( VIDEO OFICIAL ).mp4"
    },
    {
        "youtube_id": "RWRHAVGoEiw",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/Adicto - Eduardo Moreno & Okocán (Canal Oficial).mp4"
    },
    {
        "youtube_id": "IFfLjoKsHX0",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/GRUPO EXTRA  QUE MAL TE HICE YO (OFFICIAL VIDEO)  BACHATA HIT    URBAN LATIN.mp4"
    },
    {
        "youtube_id": "G_FuyWxTapo",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/Jean & Alex, Pinto Picasso - Chacha (Official Video).mp4"
    },
    {
        "youtube_id": "CEsip93GxdA",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/Leoni Torres, Eddy K - El Amor Que Espere (Video Oficial) - Leoni Torres.mp3"
    }
]

def main():
    print("Starting OpenUnmix Source Separation (with FFMPEG conversion)...")
    umx_path = "/Users/yuyi/Library/Python/3.9/bin/umx"
    
    for song in songs:
        yid = song["youtube_id"]
        audio = song["audio_path"]
        
        if not os.path.exists(audio):
            print(f"File not found: {audio}, skipping.")
            continue
            
        dest_dir = os.path.join("public", "separated", yid, "openunmix")
        
        # Check if already processed to save time
        if os.path.exists(os.path.join(dest_dir, "vocals.wav")) and \
           os.path.exists(os.path.join(dest_dir, "drums.wav")) and \
           os.path.exists(os.path.join(dest_dir, "bass.wav")) and \
           os.path.exists(os.path.join(dest_dir, "other.wav")):
            print(f"OpenUnmix stems already exist for {yid}, skipping.")
            continue
            
        print(f"\n=====================================")
        print(f"SEPARATING OPENUNMIX FOR: {os.path.basename(audio)}")
        print(f"=====================================")
        
        # Temp dir for this song
        temp_dir = os.path.abspath(f"separated_stems/temp_umx/{yid}")
        os.makedirs(temp_dir, exist_ok=True)
        
        input_audio_path = audio
        temp_wav = None
        
        # If it's an MP4, convert to temporary WAV first
        if audio.lower().endswith(".mp4"):
            temp_wav = os.path.join(temp_dir, "temp_input.wav")
            print(f"Converting MP4 to WAV: {temp_wav}")
            conv_cmd = [
                "ffmpeg", "-y",
                "-i", audio,
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "2",
                temp_wav
            ]
            try:
                subprocess.run(conv_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                input_audio_path = temp_wav
                print("Conversion successful.")
            except subprocess.CalledProcessError as e:
                print(f"FFmpeg conversion failed: {e}")
                shutil.rmtree(temp_dir, ignore_errors=True)
                continue
        
        # Run OpenUnmix CLI
        cmd = [
            umx_path,
            input_audio_path,
            "--outdir", temp_dir
        ]
        
        print(f"Running command: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            print("OpenUnmix completed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Error executing OpenUnmix: {e}")
            print(f"Stderr: {e.stderr}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            continue
            
        os.makedirs(dest_dir, exist_ok=True)
        
        # OpenUnmix writes outputs inside a directory named after the file (without extension)
        found_any = False
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.endswith(".wav") and file != "temp_input.wav":
                    file_lower = file.lower()
                    src_file = os.path.join(root, file)
                    
                    if "vocals" in file_lower:
                        dest = os.path.join(dest_dir, "vocals.wav")
                    elif "drums" in file_lower:
                        dest = os.path.join(dest_dir, "drums.wav")
                    elif "bass" in file_lower:
                        dest = os.path.join(dest_dir, "bass.wav")
                    elif "other" in file_lower:
                        dest = os.path.join(dest_dir, "other.wav")
                    else:
                        continue
                        
                    print(f"  Moving {src_file} -> {dest}")
                    shutil.move(src_file, dest)
                    found_any = True
                    
        if not found_any:
            print(f"Warning: No WAV files found in the output directory {temp_dir}")
            
        # Clean up temp files
        shutil.rmtree(temp_dir, ignore_errors=True)
        
    print("\n[SUCCESS] OpenUnmix Source Separation complete!")

if __name__ == "__main__":
    main()
