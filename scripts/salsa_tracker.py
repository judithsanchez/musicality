import os
import sys
import json
import uuid
from enum import Enum
import numpy as np
import scipy.signal
import scipy.ndimage
import librosa
import soundfile as sf
from BeatNet.BeatNet import BeatNet

class SalsaRhythmRole(Enum):
    DOWNBEAT_PAUSE = "DOWNBEAT_PAUSE"
    CONGA_SLAP = "CONGA_SLAP"
    BASS_BOMBO = "BASS_BOMBO"
    BASS_PONCHE = "BASS_PONCHE"
    CONGA_OPEN = "CONGA_OPEN"
    UNCLASSIFIED = "UNCLASSIFIED"

class SalsaDSP:
    def __init__(self, audio_path, output_dir=None, youtube_id=None, sr=22050):
        self.audio_path = audio_path
        self.sr = sr
        self.y, self.sr = librosa.load(audio_path, sr=self.sr)
        self.output_dir = output_dir
        self.youtube_id = youtube_id
        
        D = librosa.stft(self.y)
        S = np.abs(D)
        H = scipy.ndimage.median_filter(S, size=(1, 51))
        P = scipy.ndimage.median_filter(S, size=(17, 1))
        
        H3 = (1.5 * H) ** 3
        P3 = P ** 3
        denom = H3 + P3 + 1e-10
        mask_h = H3 / denom
        mask_p = P3 / denom
        
        n_samples = len(self.y)
        self.y_harmonic = librosa.istft(D * mask_h)[:n_samples]
        self.y_percussive = librosa.istft(D * mask_p)[:n_samples]
        
    def butter_bandpass_sos(self, lowcut, highcut, fs, order=6):
        nyq = 0.5 * fs
        low = max(1.0, lowcut) / nyq
        high = min(nyq - 1.0, highcut) / nyq
        sos = scipy.signal.butter(order, [low, high], btype='band', output='sos')
        return sos

    def get_onsets(self):
        sos_conga = self.butter_bandpass_sos(200, 900, self.sr)
        y_conga = scipy.signal.sosfiltfilt(sos_conga, self.y_percussive)
        
        window_size = int(0.015 * self.sr)
        kernel = np.ones(window_size) / window_size
        envelope_conga = scipy.signal.convolve(np.abs(y_conga), kernel, mode='same')
        
        peak_conga = np.max(envelope_conga)
        if peak_conga > 0:
            threshold_conga = 0.10 * peak_conga
            gain_conga = np.where(envelope_conga < threshold_conga, 0.05 + 0.95 * (envelope_conga / threshold_conga), 1.0)
            y_conga = y_conga * gain_conga
            
        onset_conga = librosa.onset.onset_strength(y=y_conga, sr=self.sr)
        
        sos_bass = self.butter_bandpass_sos(50, 120, self.sr)
        y_bass = scipy.signal.sosfiltfilt(sos_bass, self.y_harmonic)
        onset_bass = librosa.onset.onset_strength(y=y_bass, sr=self.sr)
        
        if self.output_dir and self.youtube_id:
            def save_stem(name, y_sig):
                p = os.path.join(self.output_dir, f"{self.youtube_id}_{name}.wav")
                m = np.max(np.abs(y_sig))
                if m > 0:
                    y_sig = y_sig / m
                sf.write(p, y_sig, self.sr)
            save_stem("harmonic", self.y_harmonic)
            save_stem("percussive", self.y_percussive)
            save_stem("conga", y_conga)
            save_stem("bass", y_bass)

        def normalize(x):
            m = np.max(x)
            return x / m if m > 0 else x
            
        return normalize(onset_conga), normalize(onset_bass)

class SalsaTracker:
    def __init__(self, beat_times, onset_conga, onset_bass, sr=22050, hop_length=512):
        self.beat_times = beat_times
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
        
        g_vals = np.array([self.get_onset_val(self.onset_conga, t) for t in t_subs])
        b_vals = np.array([self.get_onset_val(self.onset_bass, t) for t in t_subs])
        
        if num_beats == 8:
            score = np.dot(g_vals, self.conga_template) + np.dot(b_vals, self.bass_template)
            return score
        else:
            score = np.dot(g_vals[:8], self.conga_template[:8]) + np.dot(b_vals[:8], self.bass_template[:8])
            return score

    def track(self):
        N = len(self.beat_times)
        dp = np.full(N, -np.inf)
        parent = np.full(N, -1, dtype=int)
        phrase_type = np.full(N, 0, dtype=int)
        
        for s in range(min(8, N)):
            dp[s] = 0.0
            
        penalty = 2.5
        
        for i in range(N):
            if dp[i] == -np.inf:
                continue
            if i + 8 < N:
                score = self.score_phrase(i, 8)
                val = dp[i] + score
                if val > dp[i + 8]:
                    dp[i + 8] = val
                    parent[i + 8] = i
                    phrase_type[i + 8] = 8
            if i + 4 < N:
                score = self.score_phrase(i, 4)
                val = dp[i] + score - penalty
                if val > dp[i + 4]:
                    dp[i + 4] = val
                    parent[i + 4] = i
                    phrase_type[i + 4] = 4
                    
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
                "type": phrase_type[curr]
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
    
    youtube_id = "66HCBysrJS8"
    dsp = SalsaDSP(audio_path, output_dir=os.path.dirname(output_path), youtube_id=youtube_id)
    onset_conga, onset_bass = dsp.get_onsets()
    
    tracker = SalsaTracker(beat_times, onset_conga, onset_bass)
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
            "claveDirection": "NOT_SET",
            "claveIsVerified": False,
            "claveSource": "DEFAULT",
            "events": []
        })
        phrase_index += 1
        beat_times_ms = [0] + beat_times_ms
        index_offset = 1
    else:
        index_offset = 0
        
    for p in tracked_phrases:
        p_id = str(uuid.uuid4())
        s_idx = p["start_idx"] + index_offset
        e_idx = p["end_idx"] + index_offset
        p_type = "STANDARD_8_COUNT" if p["type"] == 8 else "HALF_PHRASE_4_COUNT"
        
        final_phrases.append({
            "id": p_id,
            "index": phrase_index,
            "startTimeMs": beat_times_ms[s_idx],
            "endTimeMs": beat_times_ms[e_idx],
            "type": p_type,
            "genre": "SALSA",
            "claveDirection": "NOT_SET",
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
            "claveDirection": "NOT_SET",
            "claveIsVerified": False,
            "claveSource": "DEFAULT",
            "events": []
        })
        
    default_clave = "NOT_SET"
    
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

    conga_peaks, _ = scipy.signal.find_peaks(onset_conga, height=0.15, distance=6)
    conga_peak_times = librosa.frames_to_time(conga_peaks, sr=22050, hop_length=512)
    
    bass_peaks, _ = scipy.signal.find_peaks(onset_bass, height=0.15, distance=6)
    bass_peak_times = librosa.frames_to_time(bass_peaks, sr=22050, hop_length=512)
    
    analysis_path = os.path.join(os.path.dirname(output_path), f"{youtube_id}_analysis.txt")
    with open(analysis_path, 'w', encoding='utf-8') as f:
        f.write("=== Salsa Rhythm Role Analysis ===\n")
        f.write(f"Song ID: {youtube_id}\n")
        f.write(f"BPM: {bpm:.2f}\n\n")
        
        for p in tracked_phrases:
            if p["type"] != 8:
                continue
            s_idx = p["start_idx"]
            t_subs = tracker.get_subdivision_times(beat_times, s_idx, 8)
            f.write(f"Phrase starting at beat index {s_idx} ({t_subs[0]:.2f}s - {t_subs[-1]:.2f}s):\n")
            
            for j in range(16):
                t_target = t_subs[j]
                beat_num = 1.0 + j * 0.5
                
                c_close = conga_peak_times[np.abs(conga_peak_times - t_target) < 0.10]
                b_close = bass_peak_times[np.abs(bass_peak_times - t_target) < 0.10]
                
                events = []
                if j in [2, 10]:
                    role = SalsaRhythmRole.CONGA_SLAP
                    if len(c_close) > 0:
                        diff = (c_close[0] - t_target) * 1000
                        events.append(f"{role.value} (Peak at {c_close[0]:.2f}s, diff {diff:+.1f}ms)")
                    else:
                        events.append(f"{role.value} (MISSING PEAK)")
                elif j in [6, 7, 14, 15]:
                    role = SalsaRhythmRole.CONGA_OPEN
                    if len(c_close) > 0:
                        diff = (c_close[0] - t_target) * 1000
                        events.append(f"{role.value} (Peak at {c_close[0]:.2f}s, diff {diff:+.1f}ms)")
                
                if j in [3, 11]:
                    role = SalsaRhythmRole.BASS_BOMBO
                    if len(b_close) > 0:
                        diff = (b_close[0] - t_target) * 1000
                        events.append(f"{role.value} (Peak at {b_close[0]:.2f}s, diff {diff:+.1f}ms)")
                    else:
                        events.append(f"{role.value} (MISSING PEAK)")
                elif j in [6, 14]:
                    role = SalsaRhythmRole.BASS_PONCHE
                    if len(b_close) > 0:
                        diff = (b_close[0] - t_target) * 1000
                        events.append(f"{role.value} (Peak at {b_close[0]:.2f}s, diff {diff:+.1f}ms)")
                    else:
                        events.append(f"{role.value} (MISSING PEAK)")
                elif j in [0, 8]:
                    role = SalsaRhythmRole.DOWNBEAT_PAUSE
                    if len(b_close) > 0:
                        diff = (b_close[0] - t_target) * 1000
                        events.append(f"BASS_ON_DOWNBEAT_DEVIATION (Peak at {b_close[0]:.2f}s, diff {diff:+.1f}ms)")
                    else:
                        events.append(f"{role.value} (Silence observed)")
                
                if not events:
                    if len(c_close) > 0:
                        events.append(f"CONGA_TOUCH (Peak at {c_close[0]:.2f}s)")
                    if len(b_close) > 0:
                        events.append(f"BASS_EXTRA (Peak at {b_close[0]:.2f}s)")
                        
                event_str = ", ".join(events) if events else "SILENT_OR_TOUCH"
                f.write(f"  Beat {beat_num:.1f} ({t_target:.2f}s): {event_str}\n")
            f.write("\n")
            
    print(f"Generated rhythm analysis at {analysis_path}")

if __name__ == "__main__":
    main()
