const fs = require('fs');
const https = require('https');
const googleTTS = require('google-tts-api');

async function downloadAudio(text, filepath) {
    // google-tts-api provides base64 for longer text (max 200 chars).
    // We split text and concatenate.
    const results = await googleTTS.getAllAudioBase64(text, {
        lang: 'ja',
        slow: false,
        host: 'https://translate.google.com',
        splitPunct: '、。！？\n'
    });

    const buffers = results.map(res => Buffer.from(res.base64, 'base64'));
    const finalBuffer = Buffer.concat(buffers);
    fs.writeFileSync(filepath, finalBuffer);
}

async function generate() {
    const script = JSON.parse(fs.readFileSync('public/script.json', 'utf-8'));
    for (const scene of script) {
        console.log(`Generating audio for ${scene.id}...`);
        const outPath = `public/${scene.id}.mp3`;
        if (fs.existsSync(outPath)) {
            console.log(`Exists: ${outPath}, skipping.`);
            continue;
        }
        
        try {
            await downloadAudio(scene.text, outPath);
            console.log(`Saved ${outPath}`);
        } catch (e) {
            console.error(`Failed ${scene.id}:`, e);
        }
    }
}

generate().catch(console.error);
