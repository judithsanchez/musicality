import os
import shutil
from audio_separator.separator import Separator

songs = [
    {
        "youtube_id": "66HCBysrJS8",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/POBRE DIABLO  Ronald Borjas ( VIDEO OFICIAL ).mp4"
    },
    {
        "youtube_id": "RWRHAVGoEiw",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/Adicto - Eduardo Moreno & Okocán (Canal Oficial).mp4"
    },
    {
        "youtube_id": "IFfLjoKsHX0",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/GRUPO EXTRA  QUE MAL TE HICE YO (OFFICIAL VIDEO)  BACHATA HIT    URBAN LATIN.mp4"
    },
    {
        "youtube_id": "G_FuyWxTapo",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/Jean & Alex, Pinto Picasso - Chacha (Official Video).mp4"
    },
    {
        "youtube_id": "CEsip93GxdA",
        "audio_path": "/Users/yuyi/Desktop/dev/musicality/songs/Leoni Torres, Eddy K - El Amor Que Espere (Video Oficial) - Leoni Torres.mp3"
    }
]

def main():
    print("Initializing MDX-Net Vocal Separator (Third Library)...")
    temp_out_dir = os.path.abspath("separated_stems/temp_mdx")
    os.makedirs(temp_out_dir, exist_ok=True)
    
    separator = Separator(output_dir=temp_out_dir, output_format='WAV')
    
    # Load the Vocal Fine-Tuned MDX-Net model
    model_name = "UVR-MDX-NET-Voc_FT.onnx"
    print(f"Loading model: {model_name}...")
    separator.load_model(model_filename=model_name)
    
    for song in songs:
        yid = song["youtube_id"]
        audio = song["audio_path"]
        
        if not os.path.exists(audio):
            continue
            
        dest_dir = os.path.join("public", "separated", yid, "mdxnet")
        if os.path.exists(os.path.join(dest_dir, "vocals.wav")) and \
           os.path.exists(os.path.join(dest_dir, "instrumental.wav")):
            print(f"MDX-Net stems already exist for {yid}, skipping.")
            continue
            
        print(f"\n=====================================")
        print(f"SEPARATING MDX-NET VOCALS FOR: {os.path.basename(audio)}")
        print(f"=====================================")
        
        output_files = separator.separate(audio)
        
        public_dest_dir = os.path.join("public", "separated", yid, "mdxnet")
        os.makedirs(public_dest_dir, exist_ok=True)
        
        for out_file in output_files:
            file_path = os.path.join(temp_out_dir, out_file)
            if not os.path.exists(file_path):
                continue
                
            if "(vocals)" in out_file.lower():
                dest = os.path.join(public_dest_dir, "vocals.wav")
                print(f"   Moving MDX-Net vocals to: {dest}")
                shutil.move(file_path, dest)
            elif "(instrumental)" in out_file.lower():
                dest = os.path.join(public_dest_dir, "instrumental.wav")
                print(f"   Moving MDX-Net instrumental to: {dest}")
                shutil.move(file_path, dest)
                
        for f in os.listdir(temp_out_dir):
            os.remove(os.path.join(temp_out_dir, f))
            
    print("\n[SUCCESS] MDX-Net Vocal Separation complete!")

if __name__ == "__main__":
    main()
