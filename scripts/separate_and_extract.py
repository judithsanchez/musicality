import os
import sys
import json
import shutil
import subprocess
import argparse
import numpy as np
import scipy.signal as signal
import librosa

def run_demucs(input_audio, temp_dir, output_dir):
    print(f"[SEPARATION] Running Demucs on: {input_audio}")
    demucs_path = "/Users/yuyi/Library/Python/3.9/bin/demucs"
    
    cmd = [
        demucs_path,
        "-o", temp_dir,
        input_audio
    ]
    
    print(f"[SEPARATION] Executing command: {' '.join(cmd)}")
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print("[SEPARATION] Error running Demucs:")
        print(result.stderr)
        raise RuntimeError(f"Demucs failed with exit code {result.returncode}")
        
    print("[SEPARATION] Demucs finished successfully.")
    
    # Locate generated stems in the temp output folder and copy them to the demucs destination
    demucs_dest = os.path.join(output_dir, "demucs")
    os.makedirs(demucs_dest, exist_ok=True)
    
    stems_found = {}
    for root, _, files in os.walk(temp_dir):
        for file in files:
            if file.endswith(".wav"):
                file_lower = file.lower()
                src_path = os.path.join(root, file)
                if "vocals" in file_lower:
                    stems_found["vocals"] = src_path
                elif "drums" in file_lower:
                    stems_found["drums"] = src_path
                elif "bass" in file_lower:
                    stems_found["bass"] = src_path
                elif "other" in file_lower:
                    stems_found["other"] = src_path
                    
    required_stems = ["vocals", "drums", "bass", "other"]
    for stem in required_stems:
        if stem not in stems_found:
            raise FileNotFoundError(f"Required Demucs stem '{stem}' was not found in outputs.")
            
        dest_path = os.path.join(demucs_dest, f"{stem}.wav")
        print(f"[SEPARATION] Copying stem: {stems_found[stem]} -> {dest_path}")
        shutil.copyfile(stems_found[stem], dest_path)
        
    return {
        "vocals": os.path.join(demucs_dest, "vocals.wav"),
        "drums": os.path.join(demucs_dest, "drums.wav"),
        "bass": os.path.join(demucs_dest, "bass.wav"),
        "other": os.path.join(demucs_dest, "other.wav")
    }

def get_activity_mask(y, sr, threshold_db=-30, min_active_duration=1.0, min_silent_duration=2.0):
    # Compute RMS energy in 0.5-second windows (hop_length = 0.25 seconds)
    hop_length = int(0.25 * sr)
    frame_length = int(0.5 * sr)
    
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    if np.max(rms) == 0:
        return []
    
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    
    # Thresholding
    is_active = rms_db > threshold_db
    
    # Identify active segments
    intervals = []
    active_start = None
    
    for i, active in enumerate(is_active):
        t = float(times[i])
        if active:
            if active_start is None:
                active_start = t
        else:
            if active_start is not None:
                intervals.append([active_start, t])
                active_start = None
                
    if active_start is not None:
        intervals.append([active_start, float(times[-1])])
        
    # Merge intervals that have very small silence gaps
    merged = []
    for interval in intervals:
        if not merged:
            merged.append(interval)
        else:
            last = merged[-1]
            if interval[0] - last[1] < min_silent_duration:
                last[1] = interval[1]
            else:
                merged.append(interval)
                
    # Filter out intervals shorter than min_active_duration
    filtered = [[round(start, 2), round(end, 2)] for start, end in merged if end - start >= min_active_duration]
    return filtered

def estimate_clave_direction(y_high, sr, beats):
    print("[CLAVE-DIRECTION] Estimating default clave direction (3-2 vs 2-3)...")
    # Compute onset envelope
    onset_env = librosa.onset.onset_strength(y=y_high, sr=sr)
    if len(onset_env) == 0:
        return "3-2"
        
    onset_times = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr)
    
    def get_onset_at(t):
        idx = np.searchsorted(onset_times, t)
        idx = min(max(0, idx), len(onset_env) - 1)
        return onset_env[idx]
        
    score_3_2 = 0
    score_2_3 = 0
    count = 0
    
    # We group beats into 8-beat cycles
    for i in range(0, len(beats) - 8, 8):
        cycle_beats = beats[i:i+8]
        t_beats = [b["timestamp"] for b in cycle_beats]
        
        t_1 = t_beats[0]
        t_2 = t_beats[1]
        t_3 = t_beats[2]
        t_4 = t_beats[3]
        t_5 = t_beats[4]
        t_6 = t_beats[5]
        t_7 = t_beats[6]
        t_8 = t_beats[7]
        
        t_2_5 = (t_2 + t_3) / 2.0
        t_6_5 = (t_6 + t_7) / 2.0
        
        # 3-2 hits: 1, 2.5, 4, 6, 7
        hits_3_2 = [t_1, t_2_5, t_4, t_6, t_7]
        # 2-3 hits: 2, 3, 5, 6.5, 8
        hits_2_3 = [t_2, t_3, t_5, t_6_5, t_8]
        
        val_3_2 = sum(get_onset_at(t) for t in hits_3_2)
        val_2_3 = sum(get_onset_at(t) for t in hits_2_3)
        
        score_3_2 += val_3_2
        score_2_3 += val_2_3
        count += 1
        
    print(f"[CLAVE-DIRECTION] Score 3-2: {score_3_2:.2f} | Score 2-3: {score_2_3:.2f}")
    if count == 0:
        return "3-2"
        
    return "3-2" if score_3_2 >= score_2_3 else "2-3"

def main():
    parser = argparse.ArgumentParser(description="Automated Salsa Source Separation & Activity Mask Extraction")
    parser.add_argument("--audio", required=True, help="Path to original audio file")
    parser.add_argument("--output_dir", required=True, help="Output directory under public/separated/{youtubeId}")
    parser.add_argument("--youtube_id", help="YouTube ID of the song")
    args = parser.parse_args()
    
    audio_path = args.audio
    out_dir = args.output_dir
    youtube_id = args.youtube_id
    
    if not youtube_id:
        youtube_id = os.path.basename(out_dir)
        
    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found at: {audio_path}")
        sys.exit(1)
        
    temp_dir = os.path.join(out_dir, "temp_demucs")
    os.makedirs(temp_dir, exist_ok=True)
    
    beatmap_path = f"public/songs/{youtube_id}.json"
    if not os.path.exists(beatmap_path):
        print(f"[ERROR] Beatmap file not found at: {beatmap_path}. Run analyze_salsa_beatnet.py first.")
        sys.exit(1)
        
    try:
        # Step 1: Run Demucs separation
        stems = run_demucs(audio_path, temp_dir, out_dir)
        
        # Load stems in memory for activity detection
        print("[DSP] Loading separated stems into memory for analysis...")
        y_vocals, sr_vocals = librosa.load(stems["vocals"], sr=None)
        y_drums, sr_drums = librosa.load(stems["drums"], sr=None)
        
        # Lowpass filter @ 350 Hz to extract Conga frequencies
        nyq = 0.5 * sr_drums
        b_conga, a_conga = signal.butter(4, 350 / nyq, btype='low')
        y_congas = signal.filtfilt(b_conga, a_conga, y_drums)
        
        # Highpass filter @ 3000 Hz to extract high frequency percussion (cowbell/clave)
        b_high, a_high = signal.butter(4, 3000 / nyq, btype='high')
        y_high = signal.filtfilt(b_high, a_high, y_drums)
        
        # Step 2: Compute Activity Masks
        print("[DSP] Extracting activity masks...")
        vocals_mask = get_activity_mask(y_vocals, sr_vocals, threshold_db=-30)
        congas_mask = get_activity_mask(y_congas, sr_drums, threshold_db=-30)
        cowbell_mask = get_activity_mask(y_high, sr_drums, threshold_db=-32)
        clave_mask = get_activity_mask(y_high, sr_drums, threshold_db=-35) # slightly more sensitive
        
        total_duration = librosa.get_duration(y=y_vocals, sr=sr_vocals)
        
        # Step 3: Estimate Clave Direction
        with open(beatmap_path, "r", encoding="utf-8") as f:
            beatmap = json.load(f)
            
        beats = beatmap.get("beats", [])
        clave_dir = estimate_clave_direction(y_high, sr_drums, beats)
        
        # Step 4: Update JSON Beatmap
        print("[JSON] Updating JSON beatmap with activity masks and default section...")
        
        default_section = {
            "id": "sec-full",
            "name": "Full Mix",
            "emoji": "🎵",
            "startTimestamp": 0.0,
            "endTimestamp": round(total_duration, 3),
            "localOffsetMs": 0,
            "claveDirection": clave_dir,
            "rhythms": {
                "congas": "tumbao",
                "cowbell": "martillo"
            }
        }
        
        beatmap["sections"] = [default_section]
        if "calibratedBeatmap" in beatmap:
            beatmap["calibratedBeatmap"]["sections"] = [default_section]
            
        beatmap["activityMasks"] = {
            "vocals": vocals_mask,
            "congas": congas_mask,
            "clave": clave_mask,
            "cowbell": cowbell_mask
        }
        
        with open(beatmap_path, "w", encoding="utf-8") as f:
            json.dump(beatmap, f, indent=2, ensure_ascii=False)
            
        print(f"[SUCCESS] Updated beatmap saved to: {beatmap_path}")
        
    except Exception as e:
        print(f"[ERROR] Process failed: {e}")
        sys.exit(1)
    finally:
        # Cleanup temp directory and all separated .wav files
        if os.path.exists(temp_dir):
            print(f"[CLEANUP] Removing temp folder: {temp_dir}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            
        # Delete demucs and dsp folders containing wav files
        demucs_dir = os.path.join(out_dir, "demucs")
        if os.path.exists(demucs_dir):
            print(f"[CLEANUP] Removing demucs stems: {demucs_dir}")
            shutil.rmtree(demucs_dir, ignore_errors=True)
            
        dsp_dir = os.path.join(out_dir, "dsp")
        if os.path.exists(dsp_dir):
            print(f"[CLEANUP] Removing dsp files: {dsp_dir}")
            shutil.rmtree(dsp_dir, ignore_errors=True)
            
        # Remove empty parent directory if empty
        try:
            if os.path.exists(out_dir) and not os.listdir(out_dir):
                print(f"[CLEANUP] Removing empty output directory: {out_dir}")
                os.rmdir(out_dir)
        except Exception as e:
            print(f"[CLEANUP] Note: {e}")

if __name__ == "__main__":
    main()
