import os
import sys
import json
import uuid
import numpy as np
import scipy.signal
import librosa
from BeatNet.BeatNet import BeatNet

class SalsaDSP:
    def __init__(self, audio_path, sr=22050):
        self.audio_path = audio_path
        self.sr = sr
        self.y, self.sr = librosa.load(audio_path, sr=self.sr)
        
    def butter_bandpass(self, lowcut, highcut, fs, order=4):
        nyq = 0.5 * fs
        low = max(1.0, lowcut) / nyq
        high = min(nyq - 1.0, highcut) / nyq
        b, a = scipy.signal.butter(order, [low, high], btype='band')
        return b, a

    def butter_lowpass(self, cutoff, fs, order=4):
        nyq = 0.5 * fs
        normal_cutoff = cutoff / nyq
        b, a = scipy.signal.butter(order, normal_cutoff, btype='low')
        return b, a

    def get_onsets(self):
        b_clave, a_clave = self.butter_bandpass(1000, 4000, self.sr)
        y_clave = scipy.signal.filtfilt(b_clave, a_clave, self.y)
        onset_clave = librosa.onset.onset_strength(y=y_clave, sr=self.sr)
        
        b_conga, a_conga = self.butter_bandpass(150, 500, self.sr)
        y_conga = scipy.signal.filtfilt(b_conga, a_conga, self.y)
        onset_conga = librosa.onset.onset_strength(y=y_conga, sr=self.sr)
        
        b_bass, a_bass = self.butter_lowpass(150, self.sr)
        y_bass = scipy.signal.filtfilt(b_bass, a_bass, self.y)
        onset_bass = librosa.onset.onset_strength(y=y_bass, sr=self.sr)
        
        def normalize(x):
            m = np.max(x)
            return x / m if m > 0 else x
            
        return normalize(onset_clave), normalize(onset_conga), normalize(onset_bass)

class SalsaTracker:
    def __init__(self, beat_times, onset_clave, onset_conga, onset_bass, sr=22050, hop_length=512):
        self.beat_times = beat_times
        self.onset_clave = onset_clave
        self.onset_conga = onset_conga
        self.onset_bass = onset_bass
        self.sr = sr
        self.hop_length = hop_length
        
        self.conga_template = np.zeros(16)
        self.conga_template[2] = 1.0
        self.conga_template[10] = 1.0
        self.conga_template[[6, 7, 14, 15]] = 0.5
        
        self.bass_template = np.zeros(16)
        self.bass_template[3] = 1.0
        self.bass_template[6] = 1.0
        self.bass_template[11] = 1.0
        self.bass_template[14] = 1.0
        self.bass_template[0] = -1.5
        self.bass_template[8] = -1.5
        
        self.clave_32_template = np.zeros(16)
        self.clave_32_template[[1, 3, 6, 9, 12]] = 1.0
        
        self.clave_23_template = np.zeros(16)
        self.clave_23_template[[2, 4, 8, 11, 14]] = 1.0

    def time_to_frame(self, t):
        return librosa.time_to_frames(t, sr=self.sr, hop_length=self.hop_length)

    def get_onset_val(self, envelope, t, window_sec=0.1):
        start_frame = max(0, self.time_to_frame(t - window_sec))
        end_frame = min(len(envelope), self.time_to_frame(t + window_sec) + 1)
        if start_frame >= end_frame:
            return 0.0
        return np.max(envelope[start_frame:end_frame])

    def get_subdivision_times(self, beats, start_idx, num_beats):
        times = []
        for i in range(num_beats):
            idx = start_idx + i
            t_curr = beats[idx]
            t_next = beats[idx + 1]
            times.append(t_curr)
            times.append(0.5 * (t_curr + t_next))
        return times

    def score_phrase(self, start_idx, num_beats):
        t_subs = self.get_subdivision_times(self.beat_times, start_idx, num_beats)
        
        c_vals = np.array([self.get_onset_val(self.onset_clave, t) for t in t_subs])
        g_vals = np.array([self.get_onset_val(self.onset_conga, t) for t in t_subs])
        b_vals = np.array([self.get_onset_val(self.onset_bass, t) for t in t_subs])
        
        if num_beats == 8:
            score_32 = np.dot(c_vals, self.clave_32_template) + np.dot(g_vals, self.conga_template) + np.dot(b_vals, self.bass_template)
            score_23 = np.dot(c_vals, self.clave_23_template) + np.dot(g_vals, self.conga_template) + np.dot(b_vals, self.bass_template)
            best_clave = "3-2" if score_32 >= score_23 else "2-3"
            return max(score_32, score_23), best_clave
        else:
            score_32 = np.dot(c_vals[:8], self.clave_32_template[:8]) + np.dot(g_vals[:8], self.conga_template[:8]) + np.dot(b_vals[:8], self.bass_template[:8])
            score_23 = np.dot(c_vals[:8], self.clave_23_template[:8]) + np.dot(g_vals[:8], self.conga_template[:8]) + np.dot(b_vals[:8], self.bass_template[:8])
            best_clave = "3-2" if score_32 >= score_23 else "2-3"
            return max(score_32, score_23), best_clave

    def track(self):
        N = len(self.beat_times)
        dp = np.full(N, -np.inf)
        parent = np.full(N, -1, dtype=int)
        phrase_type = np.full(N, 0, dtype=int)
        clave_dir = [None] * N
        
        for s in range(min(8, N)):
            dp[s] = 0.0
            
        penalty = 2.5
        
        for i in range(N):
            if dp[i] == -np.inf:
                continue
            if i + 8 < N:
                score, cl = self.score_phrase(i, 8)
                val = dp[i] + score
                if val > dp[i + 8]:
                    dp[i + 8] = val
                    parent[i + 8] = i
                    phrase_type[i + 8] = 8
                    clave_dir[i + 8] = cl
            if i + 4 < N:
                score, cl = self.score_phrase(i, 4)
                val = dp[i] + score - penalty
                if val > dp[i + 4]:
                    dp[i + 4] = val
                    parent[i + 4] = i
                    phrase_type[i + 4] = 4
                    clave_dir[i + 4] = cl
                    
        best_end = N - 1
        best_val = -np.inf
        for e in range(max(0, N - 8), N):
            if dp[e] > best_val:
                best_val = dp[e]
                best_end = e
                
        phrases = []
        curr = best_end
        while curr != -1:
            p = parent[curr]
            if p == -1:
                break
            phrases.append({
                "start_idx": p,
                "end_idx": curr,
                "type": phrase_type[curr],
                "clave": clave_dir[curr]
            })
            curr = p
            
        phrases.reverse()
        return phrases

def main():
    if len(sys.argv) < 3:
        print("Usage: python salsa_tracker.py <audio_path> <output_json_path>")
        sys.exit(1)
        
    audio_path = sys.argv[1]
    output_path = sys.argv[2]
    
    estimator = BeatNet(1, device='cpu')
    output = estimator.process(audio_path)
    beat_times = output[:, 0]
    
    intervals = np.diff(beat_times)
    bpm = 60.0 / np.mean(intervals) if len(intervals) > 0 else 180.0
    
    dsp = SalsaDSP(audio_path)
    onset_clave, onset_conga, onset_bass = dsp.get_onsets()
    
    tracker = SalsaTracker(beat_times, onset_clave, onset_conga, onset_bass)
    tracked_phrases = tracker.track()
    
    beat_times_ms = [int(round(float(t) * 1000)) for t in beat_times]
    
    final_phrases = []
    phrase_index = 1
    
    if len(beat_times_ms) > 0 and beat_times_ms[0] > 0:
        intro_id = str(uuid.uuid4())
        final_phrases.append({
            "id": intro_id,
            "index": phrase_index,
            "startTimeMs": 0,
            "endTimeMs": beat_times_ms[tracked_phrases[0]["start_idx"]],
            "type": "NO_COUNT",
            "genre": "SALSA",
            "claveDirection": "NONE",
            "claveIsVerified": False,
            "claveSource": "DEFAULT",
            "events": []
        })
        phrase_index += 1
        beat_times_ms = [0] + beat_times_ms
        index_offset = 1
    else:
        index_offset = 0
        
    clave_votes = []
    
    for p in tracked_phrases:
        p_id = str(uuid.uuid4())
        s_idx = p["start_idx"] + index_offset
        e_idx = p["end_idx"] + index_offset
        p_type = "STANDARD_8_COUNT" if p["type"] == 8 else "HALF_PHRASE_4_COUNT"
        clave_votes.append(p["clave"])
        
        final_phrases.append({
            "id": p_id,
            "index": phrase_index,
            "startTimeMs": beat_times_ms[s_idx],
            "endTimeMs": beat_times_ms[e_idx],
            "type": p_type,
            "genre": "SALSA",
            "claveDirection": p["clave"],
            "claveIsVerified": False,
            "claveSource": "AI",
            "events": []
        })
        phrase_index += 1
        
    if len(beat_times_ms) > 0 and beat_times_ms[-1] > final_phrases[-1]["endTimeMs"]:
        outro_id = str(uuid.uuid4())
        final_phrases.append({
            "id": outro_id,
            "index": phrase_index,
            "startTimeMs": final_phrases[-1]["endTimeMs"],
            "endTimeMs": beat_times_ms[-1],
            "type": "NO_COUNT",
            "genre": "SALSA",
            "claveDirection": "NONE",
            "claveIsVerified": False,
            "claveSource": "DEFAULT",
            "events": []
        })
        
    vote_32 = sum(1 for v in clave_votes if v == "3-2")
    vote_23 = sum(1 for v in clave_votes if v == "2-3")
    default_clave = "3-2" if vote_32 >= vote_23 else "2-3"
    
    youtube_id = "66HCBysrJS8"
    
    song_map = {
        "id": f"song-{youtube_id}",
        "youtubeId": youtube_id,
        "title": "Pobre Diablo",
        "artist": "Ronald Borjas",
        "genre": "SALSA",
        "baseBpm": float(round(bpm, 2)),
        "absoluteBeatMap": beat_times_ms,
        "schemaVersion": "2.0",
        "defaultClave": default_clave,
        "sections": [
            {
                "id": "section-main",
                "startTimeMs": 0,
                "endTimeMs": beat_times_ms[-1],
                "label": "Main Section",
                "phraseIds": [p["id"] for p in final_phrases],
                "energyState": "VERSE",
                "emoji": "🎵"
            }
        ],
        "phrases": final_phrases
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(song_map, f, indent=2, ensure_ascii=False)
        
    print(f"Generated song map at {output_path}")

if __name__ == "__main__":
    main()
