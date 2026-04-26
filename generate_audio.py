import json
import os
import subprocess

with open('public/script.json', 'r', encoding='utf-8') as f:
    scenes = json.load(f)

# Install edge-tts if not present
try:
    import edge_tts
except ImportError:
    print("edge-tts not found, installing...")
    subprocess.run(["pip", "install", "edge-tts"], check=True)

# Generate audio for each scene using Japanese female voice
for scene in scenes:
    scene_id = scene['id']
    text = scene['text']
    output_path = f"public/{scene_id}.mp3"
    
    if not os.path.exists(output_path):
        print(f"Generating audio for {scene_id}...")
        # "--voice", "ja-JP-MayuNeural" or "ja-JP-NanamiNeural" or "ja-JP-ShioriNeural" (40s female matching)
        # We will use ShioriNeural or MayuNeural
        cmd = ["edge-tts", "--voice", "ja-JP-NanamiNeural", "--text", text, "--write-media", output_path]
        subprocess.run(cmd, check=True)
        print(f"Saved {output_path}")
    else:
        print(f"{output_path} already exists")
