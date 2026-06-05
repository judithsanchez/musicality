import os
import sys
import argparse
import numpy as np

try:
    import librosa
except ImportError:
    print("[ERROR] librosa is required. Install it using 'pnpm install' or 'pip install librosa'.")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Single Phrase Raw Audio Clave Inference Engine")
    parser.add_argument("--audio", required=True, help="Path to raw audio file (MP3/MP4)")
    parser.add_argument("--startTimeMs", type=int, required=True, help="Start time of the phrase in milliseconds")
    parser.add_argument("--endTimeMs", type=int, required=True, help="End time of the phrase in milliseconds")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.audio):
        print("2-3")
        sys.exit(0)
        
    start_sec = float(args.startTimeMs) / 1000.0
    end_sec = float(args.endTimeMs) / 1000.0
    duration_sec = end_sec - start_sec
    
    if duration_sec <= 0:
        print("2-3")
        sys.exit(0)
        
    try:
        y, sr = librosa.load(args.audio, sr=22050, offset=start_sec, duration=duration_sec)
        combined_onset = librosa.onset.onset_strength(y=y, sr=sr)
        
        template_32 = np.zeros(16)
        template_32[[1, 3, 6, 9, 12]] = 1.0
        
        template_23 = np.zeros(16)
        template_23[[2, 4, 8, 11, 14]] = 1.0
        
        sampled_onset = []
        bin_edges = np.linspace(0, len(combined_onset) - 1, 17)
        for i in range(16):
            start_idx = int(np.floor(bin_edges[i]))
            end_idx = int(np.ceil(bin_edges[i+1]))
            end_idx = max(end_idx, start_idx + 1)
            sampled_onset.append(np.max(combined_onset[start_idx:end_idx]))
            
        sampled_onset = np.array(sampled_onset)
        onset_max = np.max(sampled_onset)
        if onset_max > 0:
            sampled_onset = sampled_onset / onset_max
            
        score_23 = np.dot(sampled_onset, template_23)
        score_32 = np.dot(sampled_onset, template_32)
        
        inferred = "2-3" if score_23 >= score_32 else "3-2"
        print(inferred)
        
    except Exception as e:
        print("2-3")

if __name__ == "__main__":
    main()
