const fs = require("fs");
const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const googleTTS = require("google-tts-api");

function defaultSpeechText(scene) {
  const speech = (scene.speech_text || "").trim();
  if (speech) return speech;
  return (scene.text || "").trim();
}

function normalizeSpeaker(raw) {
  const s = String(raw == null ? "a" : raw).trim().toLowerCase();
  if (s === "b" || s === "2" || s === "speaker2" || s === "host2" || s === "guest") return "b";
  return "a";
}

function parseDialogueLines(text) {
  if (!text) return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(A|B)\s*[:：]\s*(.+)$/i);
    if (m) {
      out.push({
        speaker: m[1].toUpperCase() === "B" ? "b" : "a",
        text: m[2].trim(),
      });
    }
  }
  return out;
}

function resolveScene(scene, voiceA, voiceB) {
  const vA = (voiceA || "").trim();
  const vB = (voiceB || "").trim();

  if (Array.isArray(scene.dialogue) && scene.dialogue.length >= 2) {
    const inputs = scene.dialogue
      .map((line) => {
        const text = (line.text || "").trim();
        if (!text) return null;
        const sp = normalizeSpeaker(line.speaker);
        const voice_id = (line.voice_id || "").trim() || (sp === "b" ? vB : vA);
        return { text, voice_id };
      })
      .filter(Boolean);
    if (inputs.length >= 2) return { mode: "dialogue", inputs };
  }

  const raw = defaultSpeechText(scene);
  const parsed = parseDialogueLines(raw);
  if (parsed.length >= 2) {
    return {
      mode: "dialogue",
      inputs: parsed.map((p) => ({
        text: p.text,
        voice_id: p.speaker === "b" ? vB : vA,
      })),
    };
  }

  if (!raw) return { mode: "empty" };
  const voice_id = normalizeSpeaker(scene.speaker) === "b" ? vB : vA;
  return { mode: "tts", text: raw, voice_id: voice_id || vA };
}

function elevenlabsRequest(pathStr, payload) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const modelId = process.env.ELEVENLABS_MODEL || "eleven_v3";
  const languageCode = process.env.ELEVENLABS_LANGUAGE || "en";

  const body = JSON.stringify({
    ...payload,
    model_id: modelId,
    language_code: languageCode,
  });

  const urlPath = `${pathStr}?output_format=${encodeURIComponent(outputFormat)}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.elevenlabs.io",
        path: urlPath,
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode !== 200) {
            reject(new Error(`ElevenLabs ${res.statusCode}: ${buf.toString("utf8").slice(0, 400)}`));
            return;
          }
          resolve(buf);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function downloadGoogleTts(text, filepath) {
  const results = await googleTTS.getAllAudioBase64(text, {
    lang: "en",
    slow: false,
    host: "https://translate.google.com",
    splitPunct: ".,!?\n",
  });
  const buffers = results.map((res) => Buffer.from(res.base64, "base64"));
  fs.writeFileSync(filepath, Buffer.concat(buffers));
}

async function generate() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceA = process.env.ELEVENLABS_VOICE_ID;
  const voiceB = process.env.ELEVENLABS_VOICE_ID_B;
  const useEleven = Boolean(apiKey && voiceA);
  const scriptPath = process.env.SCRIPT_JSON || "public/script.json";
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));

  for (const scene of script) {
    const id = scene.id || scene.sceneId;
    if (!id) continue;
    const resolved = useEleven ? resolveScene(scene, voiceA, voiceB) : { mode: "empty" };
    const modeLabel =
      resolved.mode === "dialogue"
        ? "ElevenLabs Dialogue (2人)"
        : useEleven
        ? "ElevenLabs v3"
        : "Google TTS";
    console.log(`Generating audio for ${id}... (${modeLabel})`);
    const outPath = `public/${id}.mp3`;
    if (fs.existsSync(outPath)) {
      console.log(`Exists: ${outPath}, skipping.`);
      continue;
    }

    if (resolved.mode === "empty" && useEleven) {
      console.log(`Skip ${id}: empty speech`);
      continue;
    }

    try {
      if (useEleven) {
        if (resolved.mode === "dialogue") {
          if (!voiceB) throw new Error("ELEVENLABS_VOICE_ID_B required for dialogue");
          const buf = await elevenlabsRequest("/v1/text-to-dialogue", { inputs: resolved.inputs });
          fs.writeFileSync(outPath, buf);
        } else {
          const voice = resolved.voice_id || voiceA;
          const buf = await elevenlabsRequest(
            `/v1/text-to-speech/${encodeURIComponent(voice)}`,
            { text: resolved.text }
          );
          fs.writeFileSync(outPath, buf);
        }
      } else {
        const text = defaultSpeechText(scene);
        if (!text) {
          console.log(`Skip ${id}: empty`);
          continue;
        }
        await downloadGoogleTts(text, outPath);
      }
      console.log(`Saved ${outPath}`);
    } catch (e) {
      console.error(`Failed ${id}:`, e);
    }
  }
}

generate().catch(console.error);
