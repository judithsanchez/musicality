import os
import sys
import json
import shutil
import argparse
import numpy as np
import soundfile as sf

def generate_click(sr, frequency=1800, duration=0.04, decay=0.005):
    t = np.arange(int(duration * sr)) / sr
    envelope = np.exp(-t / decay)
    wave = np.sin(2 * np.pi * frequency * t) * envelope
    return wave / np.max(np.abs(wave)) * 0.7

def main():
    parser = argparse.ArgumentParser(description="Regenerate Grid-Synthesized Claves from Beatmap")
    parser.add_argument("--youtube_id", required=True, help="YouTube ID of the song")
    parser.add_argument("--output_dir", required=True, help="Output directory under public/separated/{youtubeId}")
    args = parser.parse_args()

    youtube_id = args.youtube_id
    out_dir = args.output_dir
    
    beatmap_path = f"public/songs/{youtube_id}.json"
    if not os.path.exists(beatmap_path):
        print(f"[ERROR] Beatmap not found at: {beatmap_path}")
        sys.exit(1)
        
    with open(beatmap_path, "r", encoding="utf-8") as f:
        beatmap = json.load(f)
        
    beats = beatmap.get("beats", [])
    if not beats:
        print("[ERROR] No beats found in beatmap.")
        sys.exit(1)
        
    sr = 44100
    duration = beats[-1]["timestamp"] + 3.0
    audio_len = int(duration * sr)
    
    clave_3_2 = np.zeros(audio_len)
    clave_2_3 = np.zeros(audio_len)
    
    click_wave = generate_click(sr, frequency=1800, duration=0.05, decay=0.006)
    click_len = len(click_wave)
    
    for i in range(len(beats)):
        current_beat = beats[i]
        b_num = current_beat["beat"]
        t_curr = current_beat["timestamp"]
        
        t_next = None
        if i + 1 < len(beats):
            t_next = beats[i+1]["timestamp"]
        else:
            t_next = t_curr + 0.35
            
        t_mid = (t_curr + t_next) / 2.0
        
        # 3-2 Son Clave: 1, 2.5, 4, 6, 7
        if b_num == 1:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_3_2):
                clave_3_2[idx:idx+click_len] += click_wave
        elif b_num == 2:
            idx = int(t_mid * sr)
            if idx + click_len < len(clave_3_2):
                clave_3_2[idx:idx+click_len] += click_wave
        elif b_num == 4:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_3_2):
                clave_3_2[idx:idx+click_len] += click_wave
        elif b_num == 6:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_3_2):
                clave_3_2[idx:idx+click_len] += click_wave
        elif b_num == 7:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_3_2):
                clave_3_2[idx:idx+click_len] += click_wave
                
        # 2-3 Son Clave: 2, 3, 5, 6.5, 8
        if b_num == 2:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_2_3):
                clave_2_3[idx:idx+click_len] += click_wave
        elif b_num == 3:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_2_3):
                clave_2_3[idx:idx+click_len] += click_wave
        elif b_num == 5:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_2_3):
                clave_2_3[idx:idx+click_len] += click_wave
        elif b_num == 6:
            idx = int(t_mid * sr)
            if idx + click_len < len(clave_2_3):
                clave_2_3[idx:idx+click_len] += click_wave
        elif b_num == 8:
            idx = int(t_curr * sr)
            if idx + click_len < len(clave_2_3):
                clave_2_3[idx:idx+click_len] += click_wave
                
    dsp_dir = os.path.join(out_dir, "dsp")
    os.makedirs(dsp_dir, exist_ok=True)
    
    out_3_2 = os.path.join(dsp_dir, "clave_grid_3_2.wav")
    sf.write(out_3_2, clave_3_2, sr)
    print(f"[REGEN-CLAVE] Clave 3-2 regenerated: {out_3_2}")
    
    out_2_3 = os.path.join(dsp_dir, "clave_grid_2_3.wav")
    sf.write(out_2_3, clave_2_3, sr)
    print(f"[REGEN-CLAVE] Clave 2-3 regenerated: {out_2_3}")
    
    # Backwards compatibility fallback
    default_clave = os.path.join(dsp_dir, "clave.wav")
    shutil.copyfile(out_3_2, default_clave)
    print(f"[REGEN-CLAVE] Clave fallback copied: {default_clave}")
    print("[REGEN-CLAVE] Success!")

if __name__ == "__main__":
    main()
