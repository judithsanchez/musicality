import os

songs = ["66HCBysrJS8", "RWRHAVGoEiw", "IFfLjoKsHX0", "G_FuyWxTapo", "CEsip93GxdA"]
base_dir = "public/separated"

expected_stems = {
    "demucs": ["vocals.wav", "drums.wav", "bass.wav", "other.wav"],
    "bs_roformer": ["vocals.wav", "instrumental.wav"],
    "openunmix": ["vocals.wav", "drums.wav", "bass.wav", "other.wav"],
    "mdxnet": ["vocals.wav", "instrumental.wav"],
    "dsp": ["clave.wav", "congas.wav", "high_percussion.wav"]
}

def verify():
    print("====================================================")
    print("      VERIFYING SEPARATED STEMS FOR ALL SONGS")
    print("====================================================")
    
    all_ok = True
    
    for song_id in songs:
        song_dir = os.path.join(base_dir, song_id)
        print(f"\nSong ID: {song_id}")
        
        if not os.path.exists(song_dir):
            print(f"❌ Error: Song folder does not exist at {song_dir}")
            all_ok = False
            continue
            
        for lib, stems in expected_stems.items():
            lib_dir = os.path.join(song_dir, lib)
            print(f"  [{lib.upper()}] Directory: {lib_dir}")
            
            if not os.path.exists(lib_dir):
                print(f"    ❌ Error: Library directory {lib} does not exist!")
                all_ok = False
                continue
                
            for stem in stems:
                stem_path = os.path.join(lib_dir, stem)
                if not os.path.exists(stem_path):
                    print(f"    ❌ Error: Missing stem: {stem}")
                    all_ok = False
                else:
                    sz = os.path.getsize(stem_path)
                    sz_mb = sz / (1024 * 1024)
                    if sz == 0:
                        print(f"    ❌ Error: Stem {stem} is 0 bytes!")
                        all_ok = False
                    else:
                        print(f"    ✅ {stem:<16} - {sz_mb:.2f} MB")
                        
    print("\n====================================================")
    if all_ok:
        print("🎉 SUCCESS: All separated stems are valid and present!")
    else:
        print("❌ FAILURE: Some stems are missing or invalid.")
    print("====================================================")

if __name__ == "__main__":
    verify()
