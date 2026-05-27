import os
import sys
import json
import time

def check_imports():
    print("==================================================")
    print(f"Python Version: {sys.version}")
    print(f"Working Directory: {os.getcwd()}")
    print("==================================================")

    libraries = ['numpy', 'scipy', 'librosa', 'aubio']
    available = {}

    for lib in libraries:
        try:
            __import__(lib)
            available[lib] = True
            print(f"[SUCCESS] {lib} is successfully installed!")
        except ImportError as e:
            available[lib] = False
            print(f"[FAILED] {lib} is NOT installed. Error: {e}")

    print("==================================================")
    return available

def analyze_audio_librosa(audio_path):
    import librosa
    print(f"\n[LIBROSA] Starting analysis on: {os.path.basename(audio_path)}")
    start_time = time.time()
    
    # 1. Load audio file
    print("[LIBROSA] Loading audio file (downsampled to 22050Hz)...")
    y, sr = librosa.load(audio_path, sr=22050)
    print(f"[LIBROSA] Loaded in {time.time() - start_time:.2f}s. Duration: {librosa.get_duration(y=y, sr=sr):.2f}s")
    
    # 2. Run beat tracker
    print("[LIBROSA] Running standard beat tracking algorithm...")
    beat_start = time.time()
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    
    # In Librosa v0.10+, tempo is returned as a float/array. We handle float conversion.
    if hasattr(tempo, 'item'):
        tempo = tempo.item()
    elif isinstance(tempo, (list, tuple, np.ndarray)) and len(tempo) > 0:
        tempo = tempo[0]
        
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    print(f"[LIBROSA] Beat tracking completed in {time.time() - beat_start:.2f}s.")
    print(f"[LIBROSA] Estimated Tempo: {tempo:.2f} BPM")
    print(f"[LIBROSA] Total beats found: {len(beat_times)}")
    print(f"[LIBROSA] First 10 beat timestamps (seconds): {[round(x, 3) for x in beat_times[:10]]}")
    return tempo, beat_times

def analyze_audio_aubio(audio_path):
    import aubio
    import numpy as np
    print(f"\n[AUBIO] Starting analysis on: {os.path.basename(audio_path)}")
    start_time = time.time()
    
    # Setup source and tempo tracker
    win_s = 1024                 # FFT window size
    hop_s = 512                  # Hop size
    samplerate = 44100
    
    src = aubio.source(audio_path, samplerate, hop_s)
    samplerate = src.samplerate
    
    o = aubio.tempo("default", win_s, hop_s, samplerate)
    
    beats = []
    total_frames = 0
    
    while True:
        samples, read = src()
        is_beat = o(samples)
        if is_beat:
            this_beat = o.get_last_s()
            beats.append(this_beat)
        total_frames += read
        if read < hop_s:
            break
            
    print(f"[AUBIO] Beat tracking completed in {time.time() - start_time:.2f}s.")
    print(f"[AUBIO] Total beats found: {len(beats)}")
    print(f"[AUBIO] Estimated Tempo (average): {o.get_bpm():.2f} BPM")
    print(f"[AUBIO] First 10 beat timestamps (seconds): {[round(x, 3) for x in beats[:10]]}")
    return o.get_bpm(), beats

def main():
    available = check_imports()
    if not (available.get('librosa') and available.get('aubio')):
        print("[ERROR] Required libraries are missing. Cannot run audio analysis.")
        return
        
    # File to analyze
    audio_file = "/home/judithsanchez/dev/armada-movement/POBRE DIABLO  Ronald Borjas ( VIDEO OFICIAL ).mp3"
    
    if not os.path.exists(audio_file):
        print(f"[ERROR] Audio file not found at: {audio_file}")
        return
        
    # Run analysis
    try:
        librosa_bpm, librosa_beats = analyze_audio_librosa(audio_file)
    except Exception as e:
        print(f"[LIBROSA FAILED] Error: {e}")
        librosa_bpm, librosa_beats = None, []
        
    try:
        aubio_bpm, aubio_beats = analyze_audio_aubio(audio_file)
    except Exception as e:
        print(f"[AUBIO FAILED] Error: {e}")
        aubio_bpm, aubio_beats = None, []
        
    # Brief comparative report
    print("\n================== COMPARATIVE REPORT ==================")
    if librosa_bpm and aubio_bpm:
        print(f"Librosa Estimated Tempo : {librosa_bpm:.2f} BPM")
        print(f"Aubio Estimated Tempo   : {aubio_bpm:.2f} BPM")
        print(f"Librosa Total Beats     : {len(librosa_beats)}")
        print(f"Aubio Total Beats       : {len(aubio_beats)}")
        
        # Compare first beat
        if len(librosa_beats) > 0 and len(aubio_beats) > 0:
            print(f"Librosa First Beat Time : {librosa_beats[0]:.3f}s")
            print(f"Aubio First Beat Time   : {aubio_beats[0]:.3f}s")
            
        print("\n[ANALYSIS NOTE]")
        print("Salsa tempo is typically around 170-190 BPM (or half that in Rekordbox/DJ grids: 85-95 BPM).")
        print("Standard transient detection maps the heavy conga slaps or brass hits.")
        print("Because Salsa has syncopations (anticipated bass on 4), standard algorithms might struggle on the downbeat '1'.")
        print("We will evaluate these beats against visual pulses to select our baseline schema.")
    print("========================================================\n")

if __name__ == "__main__":
    main()
