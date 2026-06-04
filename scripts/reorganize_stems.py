import os
import shutil

songs = ["66HCBysrJS8", "RWRHAVGoEiw", "IFfLjoKsHX0", "G_FuyWxTapo", "CEsip93GxdA"]
base_dir = "public/separated"

def reorganize():
    print("Reorganizing audio stems...")
    for song_id in songs:
        song_dir = os.path.join(base_dir, song_id)
        if not os.path.isdir(song_dir):
            print(f"Skipping {song_id} (no directory found)")
            continue
            
        print(f"\nProcessing song: {song_id}")
        
        # Paths for new directories
        demucs_dir = os.path.join(song_dir, "demucs")
        roformer_dir = os.path.join(song_dir, "bs_roformer")
        
        os.makedirs(demucs_dir, exist_ok=True)
        os.makedirs(roformer_dir, exist_ok=True)
        
        # Demucs mapping
        demucs_files = {
            "drums.wav": "drums.wav",
            "bass.wav": "bass.wav",
            "vocals_demucs.wav": "vocals.wav",
            "other.wav": "other.wav"
        }
        
        for old_name, new_name in demucs_files.items():
            old_path = os.path.join(song_dir, old_name)
            new_path = os.path.join(demucs_dir, new_name)
            if os.path.exists(old_path):
                print(f"  Moving {old_path} -> {new_path}")
                shutil.move(old_path, new_path)
            else:
                # check if it was already renamed/moved or if drums.wav needs to be copied if we had drums.wav in base
                print(f"  Warning: {old_name} not found in {song_dir}")
                
        # RoFormer mapping
        roformer_files = {
            "vocals_roformer.wav": "vocals.wav",
            "instrumental.wav": "instrumental.wav"
        }
        
        for old_name, new_name in roformer_files.items():
            old_path = os.path.join(song_dir, old_name)
            new_path = os.path.join(roformer_dir, new_name)
            if os.path.exists(old_path):
                print(f"  Moving {old_path} -> {new_path}")
                shutil.move(old_path, new_path)
            else:
                # If vocals_roformer.wav is missing, maybe vocals.wav in root is the roformer vocals
                v_path = os.path.join(song_dir, "vocals.wav")
                if old_name == "vocals_roformer.wav" and os.path.exists(v_path):
                    print(f"  Moving {v_path} -> {roformer_dir}/vocals.wav (fallback)")
                    shutil.move(v_path, os.path.join(roformer_dir, "vocals.wav"))
                else:
                    print(f"  Warning: {old_name} not found in {song_dir}")
                    
        # Cleanup extra files in song_dir
        for item in os.listdir(song_dir):
            item_path = os.path.join(song_dir, item)
            if os.path.isfile(item_path):
                print(f"  Removing extra file: {item_path}")
                os.remove(item_path)

if __name__ == "__main__":
    reorganize()
