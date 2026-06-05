import os
import numpy as np
import scipy.signal as signal
import soundfile as sf
import librosa

songs = ["66HCBysrJS8", "RWRHAVGoEiw", "IFfLjoKsHX0", "G_FuyWxTapo", "CEsip93GxdA"]
base_dir = "public/separated"

def process_song(song_id):
    song_dir = os.path.join(base_dir, song_id)
    drums_path = os.path.join(song_dir, "demucs", "drums.wav")
    
    if not os.path.exists(drums_path):
        print(f"Skipping {song_id} (drums.wav not found)")
        return
        
    print(f"\nProcessing percussion extraction for song: {song_id}")
    y, sr = librosa.load(drums_path, sr=None)
    
    dsp_dir = os.path.join(song_dir, "dsp")
    os.makedirs(dsp_dir, exist_ok=True)
    
    # ----------------------------------------------------
    # 1. ISOLATE LA CLAVE (Wood Click / Woodblock)
    # Bandpass 1200 Hz - 2600 Hz + Threshold Gate
    # ----------------------------------------------------
    nyq = 0.5 * sr
    b_clave, a_clave = signal.butter(4, [1200 / nyq, 2600 / nyq], btype='band')
    filtered_clave = signal.filtfilt(b_clave, a_clave, y)
    
    # Envelope gating for clean clicks
    envelope = np.abs(filtered_clave)
    win_len = int(0.015 * sr)
    smoothed_envelope = np.convolve(envelope, np.ones(win_len)/win_len, mode='same')
    
    threshold = 0.12 * np.max(smoothed_envelope)
    gated_clave = np.copy(filtered_clave)
    gated_clave[smoothed_envelope < threshold] = 0
    
    if np.max(np.abs(gated_clave)) > 0:
        gated_clave = gated_clave / np.max(np.abs(gated_clave)) * 0.8
    sf.write(os.path.join(dsp_dir, "clave.wav"), gated_clave, sr)
    print("  Isolated Clave extracted.")
    
    # ----------------------------------------------------
    # 2. ISOLATE CONGAS (Low Percussion / Tumbao)
    # Lowpass filter @ 350 Hz
    # ----------------------------------------------------
    b_conga, a_conga = signal.butter(4, 350 / nyq, btype='low')
    filtered_conga = signal.filtfilt(b_conga, a_conga, y)
    
    if np.max(np.abs(filtered_conga)) > 0:
        filtered_conga = filtered_conga / np.max(np.abs(filtered_conga)) * 0.8
    sf.write(os.path.join(dsp_dir, "congas.wav"), filtered_conga, sr)
    print("  Isolated Congas (low) extracted.")
    
    # ----------------------------------------------------
    # 3. ISOLATE HIGH PERCUSSION (Timbales shell / Cowbell / Shaker)
    # Highpass filter @ 3000 Hz
    # ----------------------------------------------------
    b_high, a_high = signal.butter(4, 3000 / nyq, btype='high')
    filtered_high = signal.filtfilt(b_high, a_high, y)
    
    if np.max(np.abs(filtered_high)) > 0:
        filtered_high = filtered_high / np.max(np.abs(filtered_high)) * 0.8
    sf.write(os.path.join(dsp_dir, "high_percussion.wav"), filtered_high, sr)
    print("  Isolated High Metallic Percussion extracted.")

def main():
    print("Starting automatic Salsa percussion isolation...")
    for song_id in songs:
        process_song(song_id)
    print("\n[SUCCESS] All salsa percussion isolations completed successfully!")

if __name__ == "__main__":
    main()
