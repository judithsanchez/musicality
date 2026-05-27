import os
import json
import time
import numpy as np
import librosa
import librosa.segment

def main():
    audio_path = "/home/judithsanchez/dev/armada-movement/POBRE DIABLO  Ronald Borjas ( VIDEO OFICIAL ).mp3"
    output_dir = "/home/judithsanchez/dev/armada-movement/public/songs"
    
    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found at: {audio_path}")
        return
        
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "66HCBysrJS8.json")
    
    print("[SALSA-AI] Loading audio file...")
    start_time = time.time()
    y, sr = librosa.load(audio_path, sr=22050)
    duration = librosa.get_duration(y=y, sr=sr)
    print(f"[SALSA-AI] Loaded in {time.time() - start_time:.2f}s. Duration: {duration:.2f}s")
    
    # 1. Harmonic-Percussive Source Separation (HPSS)
    print("[SALSA-AI] Separating percussive transients from harmonic vocals/brass...")
    hpss_start = time.time()
    y_harm, y_perc = librosa.effects.hpss(y)
    print(f"[SALSA-AI] HPSS completed in {time.time() - hpss_start:.2f}s.")
    
    # 2. Beat Tracking on Isolated Percussive signal
    print("[SALSA-AI] Running beat tracking on isolated percussive track...")
    beat_start = time.time()
    tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr)
    
    if hasattr(tempo, 'item'):
        tempo = tempo.item()
    elif isinstance(tempo, (list, tuple, np.ndarray)) and len(tempo) > 0:
        tempo = tempo[0]
        
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    print(f"[SALSA-AI] Beat tracking completed. BPM: {tempo:.2f}. Beats found: {len(beat_times)}")
    
    # 3. Structural Segmentation (Agglomerative Clustering)
    # We will segment the song into ~7 structural segments based on harmonic & rhythmic similarities
    print("[SALSA-AI] Analyzing song structure and segment boundaries...")
    try:
        # Extract features
        chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr)
        
        # Sync features to beat frames to analyze beat-by-beat changes
        chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
        
        # Create a connectivity matrix (constrain segments to be contiguous in time)
        n_beats = chroma_sync.shape[1]
        import scipy.sparse
        grid = scipy.sparse.eye(n_beats, n_beats, k=1) + scipy.sparse.eye(n_beats, n_beats, k=-1)
        
        # Perform Agglomerative Clustering into 7 clusters natively via scikit-learn to force contiguous time segments
        n_clusters = 7
        from sklearn.cluster import AgglomerativeClustering
        model = AgglomerativeClustering(n_clusters=n_clusters, connectivity=grid)
        segmenter = model.fit_predict(chroma_sync.T)
        
        # Find boundaries where cluster index changes
        boundaries = [0]
        for i in range(1, len(segmenter)):
            if segmenter[i] != segmenter[i-1]:
                boundaries.append(i)
        boundaries.append(len(beat_times) - 1)
        
        # Map boundaries to timestamps and build sections
        sections = []
        cluster_names = {
            0: "Section Alpha",
            1: "Section Beta",
            2: "Section Gamma",
            3: "Section Delta",
            4: "Section Epsilon",
            5: "Section Zeta",
            6: "Section Eta"
        }
        
        print(f"[SALSA-AI] Successfully detected {len(boundaries) - 1} structural transitions:")
        
        for b_idx in range(len(boundaries) - 1):
            start_beat = boundaries[b_idx]
            end_beat = boundaries[b_idx + 1]
            start_time_sec = beat_times[start_beat]
            cluster_id = int(segmenter[start_beat])
            
            # Analyze harmonic vs percussive energy ratio in this section to guess focus
            sec_y_harm = y_harm[int(start_time_sec*sr) : int(beat_times[end_beat]*sr)]
            sec_y_perc = y_perc[int(start_time_sec*sr) : int(beat_times[end_beat]*sr)]
            
            harm_energy = np.sum(sec_y_harm ** 2) if len(sec_y_harm) > 0 else 0
            perc_energy = np.sum(sec_y_perc ** 2) if len(sec_y_perc) > 0 else 0
            
            # Guess instrument focus based on energy ratio
            # High percussive energy -> Percussion/Congas
            # High harmonic energy -> Brass/Piano
            if perc_energy > harm_energy * 1.2:
                focus = "conga"
                emoji = "🪘"
                guess_name = f"Percussive Groove {b_idx + 1}"
            elif harm_energy > perc_energy * 1.2:
                focus = "brass"
                emoji = "🎺"
                guess_name = f"Brass/Melodic Section {b_idx + 1}"
            else:
                # Leave empty/neutral if not sure
                focus = ""
                emoji = ""
                guess_name = ""
                
            sections.append({
                "name": guess_name,
                "startTimestamp": round(float(start_time_sec), 3),
                "focus": focus,
                "emoji": emoji
            })
            print(f"  * Section at {start_time_sec:.2f}s -> {guess_name} (Focus: {focus if focus else 'Neutral'})")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[SALSA-AI WARNING] Structure analysis encountered an issue: {e}. Falling back to default section.")
        sections = [
            {
                "name": "Full Song Grid",
                "startTimestamp": 0.000,
                "focus": "conga",
                "emoji": "🪘"
            }
        ]
        
    # 4. Construct 8-Count Cycle Beats list
    beats_list = []
    for idx, t in enumerate(beat_times):
        beat_count = (idx % 8) + 1
        beats_list.append({
            "timestamp": round(float(t), 3),
            "beat": beat_count
        })
        
    # Assemble complete schema JSON
    schema_json = {
        "id": "song-salsa-pobre-diablo",
        "schemaVersion": "1.1",
        "metadata": {
            "songTitle": "Pobre Diablo",
            "artist": "Ronald Borjas",
            "danceStyle": "salsa",
            "youtubeId": "66HCBysrJS8",
            "bpm": round(tempo, 2),
            "difficulty": "hard"
        },
        "sections": sections,
        "events": [],
        "beats": beats_list
    }
    
    # Save file
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema_json, f, indent=2, ensure_ascii=False)
        
    print(f"\n[SUCCESS] Advanced Salsa Beatmap successfully created at: {output_path}")

if __name__ == "__main__":
    main()
