/**
 * Cursor なしで使うローカル操作パネル。ブラウザで台本保存・素材アップロード・エクスポート。
 * 起動: npm run app  → http://127.0.0.1:3847/
 */
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn, spawnSync } = require("child_process");
const kuromoji = require("kuromoji");
const { writeSrtFile } = require("./lib/srt-from-video-config");
const { resetForNewVideoProject } = require("./lib/project-reset");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const root = path.join(__dirname, "..");
const configPath = path.join(root, "video-config.json");
const manifestPath = path.join(root, "assets-manifest.json");
const telopStylePath = path.join(root, "telop-style.json");
const dictPath = path.join(root, "dictionary.json");
const exportDir = path.join(root, "out", "export");
/** Express の sendFile は Windows で絶対パス1引数だと 404 になることがあるため root + 相対名を使う */
const appDir = path.resolve(root, "public", "app");
/** Windows の npx.cmd + shell 経由だと render が固まることがあるため、CLI を node で直接起動する */
const remotionCliJs = path.join(root, "node_modules", "@remotion", "cli", "remotion-cli.js");

// ---- kuromoji 自動よみがな変換 ----
// 辞書の読み込みに失敗しても TTS 全体が止まらないよう、reject せずフォールバックする
let _tokenizer = null;
const _tokenizerReady = new Promise((resolve) => {
  const dicPath = path.join(root, "node_modules", "kuromoji", "dict");
  kuromoji.builder({ dicPath }).build((err, built) => {
    if (err) {
      console.error("  kuromoji init error（読み仮名変換はスキップされます）:", err.message || err);
      console.error("  辞書パス:", dicPath);
      _tokenizer = null;
      resolve();
      return;
    }
    _tokenizer = built;
    console.log("  kuromoji tokenizer ready");
    resolve();
  });
});

function katakanaToHiragana(str) {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

async function convertToReading(text) {
  await _tokenizerReady;
  if (!_tokenizer) {
    return text;
  }
  try {
    const tokens = _tokenizer.tokenize(text);
    return tokens.map((t) => {
      const surface = t.surface_form;
      const reading = t.reading;
      // 純粋な漢字だけのトークンのみ読みに変換、それ以外はそのまま残す
      // （ひらがな混じり・数字・記号などは元のまま = ElevenLabs が自然に読める）
      const isPureKanji = /^[\u4e00-\u9faf\u3400-\u4dbf]+$/.test(surface);
      if (isPureKanji && reading) {
        return katakanaToHiragana(reading);
      }
      return surface;
    }).join("");
  } catch (e) {
    console.error("  kuromoji tokenize error:", e.message || e);
    return text;
  }
}

function applyDictionary(text) {
  let result = text;
  try {
    const dict = JSON.parse(fs.readFileSync(dictPath, "utf8"));
    if (!Array.isArray(dict)) return result;
    for (const rule of dict) {
      if (rule && rule.from && rule.to) result = result.split(rule.from).join(rule.to);
    }
  } catch {}
  return result;
}

/** ttsText が空のときの読み上げ元。台本 JSON の speech_text（未設定時のみ従来互換で text） */
function defaultTtsBaseFromScene(scene) {
  const speech = (scene.speech_text || "").trim();
  if (speech) return speech;
  return (scene.text || "").trim();
}

// ---- Google Gemini TTS ----
function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const dataSize = pcmBuffer.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  buf.writeUInt16LE(channels * (bitDepth / 8), 32);
  buf.writeUInt16LE(bitDepth, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buf, 44);
  return buf;
}

function geminiTtsRequest(apiKey, text, voiceName, instruction, model) {
  const modelId = model || "gemini-2.5-flash-preview-tts";
  const parsedTimeout = parseInt(process.env.GEMINI_TTS_TIMEOUT_MS || "", 10);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout >= 10000 ? parsedTimeout : 120000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
      reject(err);
    };
    const succeed = (buf) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
      resolve(buf);
    };

    const payload = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || "Kore" },
          },
        },
      },
    };
    if (instruction) {
      payload.systemInstruction = { parts: [{ text: instruction }] };
    }
    const body = JSON.stringify(payload);
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        if (settled) return;
        try {
          const raw = Buffer.concat(chunks);
          const textBody = raw.toString("utf8");
          if (res.statusCode && res.statusCode !== 200) {
            fail(new Error(`Gemini TTS HTTP ${res.statusCode}: ${textBody.slice(0, 800)}`));
            return;
          }
          const json = JSON.parse(textBody);
          if (json.error) {
            fail(new Error(`Gemini TTS error: ${json.error.message}`));
            return;
          }
          const audioB64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioB64) {
            fail(new Error("Gemini TTS: 音声データなし"));
            return;
          }
          succeed(pcmToWav(Buffer.from(audioB64, "base64")));
        } catch (e) {
          fail(e);
        }
      });
      res.on("error", fail);
    });
    req.setTimeout(timeoutMs, () => {
      fail(
        new Error(
          `Gemini TTS: ${timeoutMs}ms でタイムアウト（API が応答しません）。混雑やキー・モデル不整合の可能性があります。長い台本の場合は .env の GEMINI_TTS_TIMEOUT_MS（ミリ秒、最低 10000）で延長できます。`
        )
      );
    });
    req.on("error", fail);
    req.write(body);
    req.end();
  });
}

async function withRetry(fn, retries = 3, baseDelayMs = 5000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === retries) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`  リトライ ${attempt + 1}/${retries}（${delay}ms 待機）: ${e.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function ensureDirs() {
  [exportDir, path.join(root, "public", "drop", "audio"), path.join(root, "public", "drop", "images")].forEach(
    (d) => fs.mkdirSync(d, { recursive: true })
  );
}

// ---- アセットマニフェスト同期（インライン版・spawn 不要） ----
const AUDIO_EXT = /\.(mp3|wav|m4a|aac)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;

function parseSceneNumber(filename) {
  const m = filename.match(/^(?:scene)?0*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function syncManifestInline() {
  function listFilesAsObject(dir, subRel, extRe) {
    if (!fs.existsSync(dir)) return {};
    const files = fs
      .readdirSync(dir)
      .filter((f) => extRe.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const obj = {};
    for (const f of files) {
      const n = parseSceneNumber(f);
      if (n === null) continue;
      const key = String(n);
      if (!obj[key]) obj[key] = `${subRel}/${f}`;
    }
    return obj;
  }
  const dropAudio = path.join(root, "public", "drop", "audio");
  const dropImages = path.join(root, "public", "drop", "images");
  const manifest = {
    audio:  listFilesAsObject(dropAudio,  "drop/audio",  AUDIO_EXT),
    images: listFilesAsObject(dropImages, "drop/images", IMAGE_EXT),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

// ---- Aivis Cloud API ----
function aivisTtsRequest(apiKey, text, modelUuid) {
  return new Promise((resolve, reject) => {
    const payload = {
      model_uuid: modelUuid,
      text,
      output_format: "mp3",
      use_volume_normalizer: true,
    };
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.aivis-project.com",
      path: "/v1/tts/synthesize",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let err = "";
        res.on("data", (d) => { err += d.toString(); });
        res.on("end", () => reject(new Error(`Aivis Cloud API error ${res.statusCode}: ${err}`)));
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---- xAI Grok TTS（https://docs.x.ai/docs/guides/voice） ----
function xaiTtsRequest(apiKey, text, voiceId, language) {
  return new Promise((resolve, reject) => {
    const payload = {
      text,
      voice_id: (voiceId || "eve").toLowerCase(),
      language: language || "ja",
    };
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.x.ai",
      path: "/v1/tts",
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          let msg = buf.toString("utf8").slice(0, 800);
          try {
            const j = JSON.parse(msg);
            msg = j.error || j.message || JSON.stringify(j);
          } catch {
            /* 生テキストのまま */
          }
          reject(new Error(`xAI TTS error ${res.statusCode}: ${msg}`));
          return;
        }
        resolve(buf);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---- ElevenLabs TTS（v3 オーディオタグ対応） ----
/** テキスト末尾が文末記号で終わっていない場合に "." を補う（ElevenLabs v3 の末尾繰り返し/途切れ対策） */
function ensureEndPunctuation(text) {
  const t = (text || "").trimEnd();
  if (!t) return t;
  // 絵文字・記号系を除いた最後の文字が文末記号かどうか
  if (/[.!?…。！？~\-"]$/.test(t)) return t;
  return t + ".";
}

function elevenlabsTtsRequest(apiKey, text, voiceId, model, languageCodeOverride) {
  const voice = (voiceId || "").trim();
  if (!voice) {
    return Promise.reject(new Error("ElevenLabs の voice_id が未設定です（.env の ELEVENLABS_VOICE_ID または UI）"));
  }
  const modelId = model || process.env.ELEVENLABS_MODEL || "eleven_v3";
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const languageCode =
    (languageCodeOverride || "").trim() || process.env.ELEVENLABS_LANGUAGE || "en";
  const parsedTimeout = parseInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS || "", 10);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout >= 30000 ? parsedTimeout : 180000;

  // 末尾記号補完（繰り返し・途切れ防止）
  const safeText = ensureEndPunctuation(text);
  const payload = { text: safeText, model_id: modelId };
  if (languageCode) payload.language_code = languageCode;

  const stability = parseFloat(process.env.ELEVENLABS_STABILITY || "");
  const similarity = parseFloat(process.env.ELEVENLABS_SIMILARITY || "");
  const style = parseFloat(process.env.ELEVENLABS_STYLE || "");
  const speed = parseFloat(process.env.ELEVENLABS_API_SPEED || "");
  if (
    Number.isFinite(stability) ||
    Number.isFinite(similarity) ||
    Number.isFinite(style) ||
    Number.isFinite(speed)
  ) {
    payload.voice_settings = {};
    if (Number.isFinite(stability)) payload.voice_settings.stability = stability;
    if (Number.isFinite(similarity)) payload.voice_settings.similarity_boost = similarity;
    if (Number.isFinite(style)) payload.voice_settings.style = style;
    if (Number.isFinite(speed)) payload.voice_settings.speed = speed;
  }

  const body = JSON.stringify(payload);
  const pathStr = `/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${encodeURIComponent(outputFormat)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
      reject(err);
    };
    const succeed = (buf) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
      resolve(buf);
    };

    const options = {
      hostname: "api.elevenlabs.io",
      path: pathStr,
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Accept: "audio/mpeg",
      },
    };

    req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          let msg = buf.toString("utf8").slice(0, 800);
          try {
            const j = JSON.parse(msg);
            msg = j.detail?.message || j.detail || j.message || JSON.stringify(j);
          } catch {
            /* raw */
          }
          fail(new Error(`ElevenLabs TTS error ${res.statusCode}: ${msg}`));
          return;
        }
        succeed(buf);
      });
    });

    req.on("error", fail);
    req.setTimeout(timeoutMs, () =>
      fail(
        new Error(
          `ElevenLabs TTS: ${timeoutMs}ms でタイムアウト。v3 は長文で時間がかかることがあります。ELEVENLABS_TTS_TIMEOUT_MS で延長できます。`
        )
      )
    );
    req.write(body);
    req.end();
  });
}

/** ElevenLabs Text-to-Dialogue（2人以上の会話を1本の音声に） */
function elevenlabsDialogueRequest(apiKey, inputs, model, languageCodeOverride) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return Promise.reject(new Error("dialogue inputs が空です"));
  }
  const modelId = model || process.env.ELEVENLABS_MODEL || "eleven_v3";
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const languageCode =
    (languageCodeOverride || "").trim() || process.env.ELEVENLABS_LANGUAGE || "en";
  const parsedTimeout = parseInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS || "", 10);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout >= 30000 ? parsedTimeout : 240000;

  // dialogue の各行も末尾記号補完
  const safeInputs = inputs.map((inp) => ({
    ...inp,
    text: ensureEndPunctuation(inp.text),
  }));
  const payload = { inputs: safeInputs, model_id: modelId };
  if (languageCode) payload.language_code = languageCode;

  const stability = parseFloat(process.env.ELEVENLABS_STABILITY || "");
  if (Number.isFinite(stability)) {
    payload.settings = { stability };
  }

  const body = JSON.stringify(payload);
  const pathStr = `/v1/text-to-dialogue?output_format=${encodeURIComponent(outputFormat)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
      reject(err);
    };
    const succeed = (buf) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch (_) {
        /* ignore */
      }
      resolve(buf);
    };

    req = https.request(
      {
        hostname: "api.elevenlabs.io",
        path: pathStr,
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Accept: "audio/mpeg",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode !== 200) {
            let msg = buf.toString("utf8").slice(0, 800);
            try {
              const j = JSON.parse(msg);
              msg = j.detail?.message || j.detail || j.message || JSON.stringify(j);
            } catch {
              /* raw */
            }
            fail(new Error(`ElevenLabs Dialogue error ${res.statusCode}: ${msg}`));
            return;
          }
          succeed(buf);
        });
      }
    );

    req.on("error", fail);
    req.setTimeout(timeoutMs, () =>
      fail(new Error(`ElevenLabs Dialogue: ${timeoutMs}ms でタイムアウト`))
    );
    req.write(body);
    req.end();
  });
}

function normalizeDialogueSpeaker(raw) {
  const s = String(raw == null ? "a" : raw).trim().toLowerCase();
  if (s === "b" || s === "2" || s === "speaker2" || s === "host2" || s === "guest") return "b";
  return "a";
}

function speakerToElevenVoiceId(speaker, voiceA, voiceB) {
  const s = String(speaker == null ? "" : speaker).trim();
  // Voice ID を直接書いている場合（長い英数字文字列）はそのまま使う
  if (s.length > 10 && /^[A-Za-z0-9]+$/.test(s)) return s;
  return normalizeDialogueSpeaker(s) === "b" ? voiceB : voiceA;
}

/** A: Hello\nB: Hi 形式をパース */
function parseDialogueLines(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /^\s*(A|B|Speaker\s*1|Speaker\s*2|Host\s*1|Host\s*2)\s*[:：]\s*(.+)$/i
    );
    if (!m) continue;
    const tag = m[1].toLowerCase().replace(/\s/g, "");
    const speaker =
      tag === "b" || tag === "speaker2" || tag === "host2" ? "b" : "a";
    const t = m[2].trim();
    if (t) out.push({ speaker, text: t });
  }
  return out;
}

/** シーンから ElevenLabs 用の単独 TTS / 2人会話を判定 */
function resolveElevenlabsScene(scene, voiceA, voiceB) {
  const vA = (voiceA || "").trim();
  const vB = (voiceB || "").trim();

  const fromArray = (arr) => {
    const inputs = [];
    for (const line of arr) {
      if (!line || typeof line !== "object") continue;
      const text = applyDictionary(String(line.text || "").trim());
      if (!text) continue;
      const voice_id = (line.voice_id || "").trim() ||
        speakerToElevenVoiceId(line.speaker, vA, vB);
      if (!voice_id) continue;
      inputs.push({ text, voice_id });
    }
    return inputs;
  };

  if (Array.isArray(scene.dialogue) && scene.dialogue.length > 0) {
    const inputs = fromArray(scene.dialogue);
    if (inputs.length >= 2) return { mode: "dialogue", inputs };
    if (inputs.length === 1) {
      return { mode: "tts", text: inputs[0].text, voiceId: inputs[0].voice_id };
    }
  }

  const manualTts = (scene.ttsText || "").trim();
  const autoBase = defaultTtsBaseFromScene(scene);
  const raw = manualTts || autoBase;
  if (!raw) return { mode: "empty" };

  const parsed = parseDialogueLines(applyDictionary(raw));
  if (parsed.length >= 2) {
    const inputs = parsed.map((p) => ({
      text: p.text,
      voice_id: speakerToElevenVoiceId(p.speaker, vA, vB),
    }));
    return { mode: "dialogue", inputs };
  }

  const text = manualTts ? applyDictionary(manualTts) : applyDictionary(autoBase);
  const voiceId = speakerToElevenVoiceId(scene.speaker, vA, vB) || vA;
  return { mode: "tts", text, voiceId };
}

// ---- OpenAI TTS ----
function openaiTtsRequest(apiKey, text, voice, model) {
  return new Promise((resolve, reject) => {
    const payload = {
      model: model || "tts-1",
      input: text,
      voice: voice || "nova",
      response_format: "mp3",
    };
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.openai.com",
      path: "/v1/audio/speech",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let err = "";
        res.on("data", (d) => { err += d.toString(); });
        res.on("end", () => reject(new Error(`OpenAI TTS error ${res.statusCode}: ${err}`)));
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---- 話速（FFmpeg atempo：API の speed は効きにくい／Gemini は未対応のためここで統一） ----
let _resolvedFfmpegBin = null;
function resolveFfmpegBinary() {
  if (_resolvedFfmpegBin !== null) return _resolvedFfmpegBin;
  if (process.env.FFMPEG_PATH) {
    _resolvedFfmpegBin = process.env.FFMPEG_PATH;
    return _resolvedFfmpegBin;
  }
  try {
    const { RenderInternals } = require("@remotion/renderer");
    const bin = RenderInternals.getExecutablePath({
      type: "ffmpeg",
      indent: false,
      logLevel: "error",
      binariesDirectory: undefined,
    });
    if (bin && fs.existsSync(bin)) {
      _resolvedFfmpegBin = bin;
      return bin;
    }
  } catch {
    /* Remotion 未導入時など */
  }
  _resolvedFfmpegBin = "ffmpeg";
  return _resolvedFfmpegBin;
}

let _ffmpegProbeResult = null;
function ffmpegOnPath() {
  if (_ffmpegProbeResult !== null) return _ffmpegProbeResult;
  try {
    const bin = resolveFfmpegBinary();
    const r = spawnSync(bin, ["-hide_banner", "-version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 8000,
    });
    _ffmpegProbeResult = r.status === 0;
  } catch {
    _ffmpegProbeResult = false;
  }
  if (!_ffmpegProbeResult) {
    console.warn(
      "  ffmpeg が使えません。話速スライダーは無効です。FFMPEG_PATH を設定するか、Remotion のレンダーで一度バイナリを取得してください。"
    );
  }
  return _ffmpegProbeResult;
}

/**
 * @param {Buffer} buffer
 * @param {"wav"|"mp3"} ext
 * @param {number} speed 0.5〜1.5 想定（atempo の範囲内にクランプ）
 * @returns {Buffer}
 */
function applyPlaybackSpeedWithFfmpeg(buffer, ext, speed) {
  const s = parseFloat(speed);
  if (!Number.isFinite(s) || Math.abs(s - 1) < 0.02) return buffer;
  if (!ffmpegOnPath()) return buffer;
  const tempo = Math.min(2, Math.max(0.5, s));
  const bin = resolveFfmpegBinary();
  const args =
    ext === "wav"
      ? [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "wav",
          "-i",
          "pipe:0",
          "-filter:a",
          `atempo=${tempo}`,
          "-f",
          "wav",
          "-acodec",
          "pcm_s16le",
          "pipe:1",
        ]
      : [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          "pipe:0",
          "-filter:a",
          `atempo=${tempo}`,
          "-f",
          "mp3",
          "-c:a",
          "libmp3lame",
          "-q:a",
          "3",
          "pipe:1",
        ];
  const r = spawnSync(bin, args, {
    input: buffer,
    maxBuffer: 80 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error || r.status !== 0 || !r.stdout || r.stdout.length === 0) {
    const hint = r.stderr ? r.stderr.toString().slice(0, 300) : r.error?.message || "不明";
    console.warn("  ffmpeg 話速調整に失敗（元の音声のまま）:", hint);
    return buffer;
  }
  return r.stdout;
}

function spawnOpts(extra) {
  return Object.assign(
    {
      cwd: root,
      env: process.env,
      shell: true,
    },
    extra
  );
}

function runRemotionRender(args) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(remotionCliJs)) {
      reject(new Error(`Remotion CLI が見つかりません: ${remotionCliJs}（プロジェクト直下で npm install）`));
      return;
    }
    console.log(`\n  [export] remotion render ${args.join(" ")}\n`);
    const child = spawn(process.execPath, [remotionCliJs, "render", ...args], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else {
        const why = signal ? `シグナル ${signal}` : `終了コード ${code}`;
        reject(new Error(`remotion render が異常終了（${why}）。このウィンドウに出たログを確認してください。`));
      }
    });
  });
}

ensureDirs();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32mb" }));

const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(root, "public", "drop", "audio")),
    filename: (_req, file, cb) => cb(null, path.basename(file.originalname) || "audio.bin"),
  }),
});

const uploadImages = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(root, "public", "drop", "images")),
    filename: (_req, file, cb) => cb(null, path.basename(file.originalname) || "image.bin"),
  }),
});

app.use("/static", express.static(appDir));

function sendAppHtml(res) {
  res.sendFile("index.html", { root: appDir });
}

app.get("/", (_req, res) => sendAppHtml(res));
app.get("/index.html", (_req, res) => sendAppHtml(res));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    appDir,
    indexExists: fs.existsSync(path.join(appDir, "index.html")),
    /** クライアントが新しいサーバーか判別する用 */
    features: { resetProject: true, xaiTts: true, elevenlabsTts: true },
  });
});

app.get("/api/config", (_req, res) => {
  try {
    const t = fs.readFileSync(configPath, "utf8");
    res.json({ ok: true, content: t });
  } catch {
    res.json({ ok: true, content: "[]" });
  }
});

app.post("/api/config", (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== "string") {
    return res.status(400).json({ ok: false, error: "content が必要です" });
  }
  try {
    JSON.parse(content);
  } catch (e) {
    return res.status(400).json({ ok: false, error: "JSON として不正です: " + e.message });
  }
  fs.writeFileSync(configPath, content, "utf8");
  res.json({ ok: true });
});

app.post("/api/upload/audio", uploadAudio.array("files", 200), (_req, res) => {
  res.json({ ok: true, message: "public/drop/audio に保存しました" });
});

app.post("/api/upload/images", uploadImages.array("files", 200), (_req, res) => {
  res.json({ ok: true, message: "public/drop/images に保存しました" });
});

// ---- テロップスタイル ----
app.get("/api/telop-style", (_req, res) => {
  try {
    const t = fs.readFileSync(telopStylePath, "utf8");
    res.json({ ok: true, style: JSON.parse(t) });
  } catch {
    res.json({ ok: true, style: null });
  }
});

app.post("/api/telop-style", (req, res) => {
  const { style } = req.body || {};
  if (!style || typeof style !== "object") {
    return res.status(400).json({ ok: false, error: "style が必要です" });
  }
  fs.writeFileSync(telopStylePath, JSON.stringify(style, null, 2) + "\n", "utf8");
  res.json({ ok: true });
});

// ---- TTS 設定取得 ----
app.get("/api/tts/settings", (_req, res) => {
  res.json({
    ok: true,
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiVoice: process.env.OPENAI_TTS_VOICE || "nova",
    openaiModel: process.env.OPENAI_TTS_MODEL || "tts-1",
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY || "",
    geminiVoice: process.env.GEMINI_TTS_VOICE || "Kore",
    geminiModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
    geminiInstruction: process.env.GEMINI_TTS_INSTRUCTION || "",
    aivisApiKey: process.env.AIVIS_API_KEY || "",
    aivisModelUuid: process.env.AIVIS_MODEL_UUID || "",
    xaiApiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY || "",
    xaiVoice: process.env.XAI_TTS_VOICE || "eve",
    xaiLanguage: process.env.XAI_TTS_LANGUAGE || "ja",
    ttsSpeed: parseFloat(process.env.TTS_SPEED || "1.0"),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || "",
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "",
    elevenlabsModel: process.env.ELEVENLABS_MODEL || "eleven_v3",
    elevenlabsVoiceIdB: process.env.ELEVENLABS_VOICE_ID_B || "",
    elevenlabsLanguage: process.env.ELEVENLABS_LANGUAGE || "en",
  });
});

/** クライアントや .env 表記ゆれを吸収（未再起動の切り分けは /health の features を見る） */
function normalizeTtsProvider(p) {
  const s = String(p == null ? "" : p).trim().toLowerCase();
  if (s === "grok" || s === "xai_tts") return "xai";
  if (s === "eleven" || s === "11labs") return "elevenlabs";
  if (s === "gemini" || s === "openai" || s === "aivis" || s === "xai" || s === "elevenlabs") return s;
  return s || "openai";
}

/** Eleven v3 は [sigh] 等のオーディオタグを維持するため kuromoji 変換を行わない */
async function resolveSceneTtsText(scene, provider) {
  const manualTts = (scene.ttsText || "").trim();
  const autoBase = defaultTtsBaseFromScene(scene);
  if (!manualTts && !autoBase) return "";
  const base = manualTts || autoBase;
  const withDict = applyDictionary(base);
  if (normalizeTtsProvider(provider) === "elevenlabs") {
    return withDict;
  }
  if (manualTts) return withDict;
  return convertToReading(withDict);
}

// ---- TTS 共通ヘルパー（プロバイダー振り分け） ----
async function generateAudioBuffer(
  provider,
  apiKey,
  voiceParam,
  ttsText,
  instruction,
  model,
  ttsLanguage = "",
  elevenlabsExtra = null
) {
  const prov = normalizeTtsProvider(provider);
  if (prov === "gemini") {
    return withRetry(() => geminiTtsRequest(apiKey, ttsText, voiceParam, instruction, model));
  }
  if (prov === "openai") {
    return withRetry(() => openaiTtsRequest(apiKey, ttsText, voiceParam, model));
  }
  if (prov === "aivis") {
    return withRetry(() => aivisTtsRequest(apiKey, ttsText, voiceParam));
  }
  if (prov === "xai") {
    return withRetry(() => xaiTtsRequest(apiKey, ttsText, voiceParam, ttsLanguage));
  }
  if (prov === "elevenlabs") {
    if (elevenlabsExtra && elevenlabsExtra.mode === "dialogue") {
      console.log(`[ElevenLabs] dialogue mode: ${elevenlabsExtra.inputs.length} inputs`);
      return withRetry(() =>
        elevenlabsDialogueRequest(apiKey, elevenlabsExtra.inputs, model, ttsLanguage)
      );
    }
    const voice = (elevenlabsExtra && elevenlabsExtra.voiceId) || voiceParam;
    console.log(`[ElevenLabs] TTS voice_id="${voice}" text="${(ttsText || "").slice(0, 40)}..."`);
    return withRetry(() => elevenlabsTtsRequest(apiKey, ttsText, voice, model, ttsLanguage));
  }
  throw new Error(`未対応の TTS プロバイダー: ${provider}`);
}

function audioExt(provider) {
  return provider === "gemini" ? "wav" : "mp3";
}

// ---- TTS 音声一括生成（OpenAI / Gemini / Aivis / xAI / ElevenLabs v3） ----
app.post("/api/tts/generate", async (req, res) => {
  const provider = normalizeTtsProvider(req.body && req.body.provider);
  const isGemini = provider === "gemini";
  const isOpenai = provider === "openai";
  const isAivis = provider === "aivis";
  const isXai = provider === "xai";
  const isElevenlabs = provider === "elevenlabs";

  const apiKey = (req.body && req.body.apiKey) ||
    (isGemini ? process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY
     : isOpenai ? process.env.OPENAI_API_KEY
     : isAivis ? process.env.AIVIS_API_KEY
     : isXai ? process.env.XAI_API_KEY || process.env.GROK_API_KEY
     : isElevenlabs ? process.env.ELEVENLABS_API_KEY
     : "") || "";
  const voiceParam = (req.body && req.body.voiceId) ||
    (isGemini ? process.env.GEMINI_TTS_VOICE || "Kore"
     : isOpenai ? process.env.OPENAI_TTS_VOICE || "nova"
     : isAivis ? process.env.AIVIS_MODEL_UUID || ""
     : isXai ? process.env.XAI_TTS_VOICE || "eve"
     : isElevenlabs ? process.env.ELEVENLABS_VOICE_ID || ""
     : "") || "";
  const voiceParamB = (req.body && req.body.voiceIdB) ||
    (isElevenlabs ? process.env.ELEVENLABS_VOICE_ID_B || "" : "") || "";
  const instruction = (req.body && req.body.instruction) || process.env.GEMINI_TTS_INSTRUCTION || "";
  const model = (req.body && req.body.model) ||
    (isGemini ? process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts"
     : isElevenlabs ? process.env.ELEVENLABS_MODEL || "eleven_v3"
     : process.env.OPENAI_TTS_MODEL || "tts-1");
  const ttsLanguage = (req.body && req.body.ttsLanguage) ||
    (isXai ? process.env.XAI_TTS_LANGUAGE || "ja"
     : isElevenlabs ? process.env.ELEVENLABS_LANGUAGE || "en"
     : "");
  const speedRaw = (req.body && req.body.speed != null)
    ? parseFloat(req.body.speed)
    : parseFloat(process.env.TTS_SPEED || "1.0");
  const speed = Number.isFinite(speedRaw) ? speedRaw : 1;

  if (!apiKey) {
    return res.status(400).json({ ok: false, error: "API キーが設定されていません。" });
  }
  if (isElevenlabs && !voiceParam) {
    return res.status(400).json({ ok: false, error: "ElevenLabs の Voice ID（話者A）が未設定です。" });
  }

  let config = [];
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return res.status(400).json({ ok: false, error: "video-config.json が読み込めません。" });
  }
  if (!Array.isArray(config) || config.length === 0) {
    return res.status(400).json({ ok: false, error: "video-config.json が空です。先に台本を保存してください。" });
  }

  const audioDir = path.join(root, "public", "drop", "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const ext = audioExt(provider);

  const results = [];
  for (let i = 0; i < config.length; i++) {
    const scene = config[i];
    let ttsText = "";
    let elevenExtra = null;
    if (isElevenlabs) {
      const resolved = resolveElevenlabsScene(scene, voiceParam, voiceParamB);
      if (resolved.mode === "empty") {
        results.push({ scene: i + 1, skipped: true });
        continue;
      }
      if (resolved.mode === "dialogue") {
        if (!voiceParamB) {
          results.push({
            scene: i + 1,
            ok: false,
            error: "2人会話には Voice ID（話者B）が必要です",
          });
          continue;
        }
        elevenExtra = { mode: "dialogue", inputs: resolved.inputs };
        ttsText = resolved.inputs.map((x) => x.text).join(" ");
      } else {
        ttsText = resolved.text;
        elevenExtra = { mode: "tts", voiceId: resolved.voiceId };
      }
    } else {
      ttsText = await resolveSceneTtsText(scene, provider);
      if (!ttsText) {
        results.push({ scene: i + 1, skipped: true });
        continue;
      }
    }

    const filename = `${String(i + 1).padStart(2, "0")}_scene${i + 1}.${ext}`;
    const outPath = path.join(audioDir, filename);

    // 同じシーン番号で別拡張子のファイルを削除（mp3↔wav の混在を防ぐ）
    const scenePrefix = `${String(i + 1).padStart(2, "0")}_scene${i + 1}.`;
    try {
      fs.readdirSync(audioDir)
        .filter(f => f.startsWith(scenePrefix) && f !== filename)
        .forEach(f => fs.unlinkSync(path.join(audioDir, f)));
    } catch {}

    try {
      const rawBuf = await generateAudioBuffer(
        provider,
        apiKey,
        voiceParam,
        ttsText,
        instruction,
        model,
        ttsLanguage,
        elevenExtra
      );
      const buf = applyPlaybackSpeedWithFfmpeg(rawBuf, ext, speed);
      fs.writeFileSync(outPath, buf);
      const tag = elevenExtra && elevenExtra.mode === "dialogue" ? "（2人会話）" : "";
      results.push({ scene: i + 1, file: filename, ok: true, tag });
    } catch (e) {
      results.push({ scene: i + 1, error: e.message, ok: false });
    }

    const delayMs = isGemini ? 7000 : isElevenlabs ? 2500 : isXai ? 1200 : 800;
    await new Promise((r) => setTimeout(r, delayMs));
  }

  try { syncManifestInline(); } catch (e) { console.error("manifest sync failed:", e); }

  const failed = results.filter((r) => !r.skipped && !r.ok);
  const okCount = results.filter((r) => r.ok).length;
  const noteParts = [`生成 ${okCount}/${config.length} シーン`];
  if (isElevenlabs) {
    noteParts.push(
      "Eleven v3（英語）: 2人会話は dialogue 配列、または speech_text に A:/B: 行。話者切替は speaker: \"a\"|\"b\""
    );
  }
  if (Math.abs(speed - 1) >= 0.02) {
    if (ffmpegOnPath()) {
      noteParts.push(`話速 ${speed.toFixed(2)}x（FFmpeg atempo で反映）`);
    } else {
      noteParts.push(
        "⚠ 話速スライダー: ffmpeg を実行できません。Remotion の ffmpeg が無い場合はインストールするか、環境変数 FFMPEG_PATH で exe を指定してください（現状は 1.0x 相当のまま）。"
      );
    }
  }
  res.json({ ok: failed.length === 0, results, note: noteParts.join("\n") });
});

// ---- TTS 単シーン再生成 ----
app.post("/api/tts/generate-scene", async (req, res) => {
  const sceneIndex = req.body && typeof req.body.sceneIndex === "number" ? req.body.sceneIndex : -1;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return res.status(500).json({ ok: false, error: "台本の読み込みに失敗" });
  }

  if (!Array.isArray(config) || sceneIndex < 0 || sceneIndex >= config.length) {
    return res.status(400).json({ ok: false, error: `シーン番号が不正 (${sceneIndex})` });
  }

  const provider = normalizeTtsProvider(req.body && req.body.provider);
  const isGemini = provider === "gemini";
  const isOpenai = provider === "openai";
  const isAivis = provider === "aivis";
  const isXai = provider === "xai";
  const isElevenlabs = provider === "elevenlabs";

  const apiKey = (req.body && req.body.apiKey) ||
    (isGemini ? process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY
     : isOpenai ? process.env.OPENAI_API_KEY
     : isAivis ? process.env.AIVIS_API_KEY
     : isXai ? process.env.XAI_API_KEY || process.env.GROK_API_KEY
     : isElevenlabs ? process.env.ELEVENLABS_API_KEY
     : "") || "";
  const voiceParam = (req.body && req.body.voiceId) ||
    (isGemini ? process.env.GEMINI_TTS_VOICE || "Kore"
     : isOpenai ? process.env.OPENAI_TTS_VOICE || "nova"
     : isAivis ? process.env.AIVIS_MODEL_UUID || ""
     : isXai ? process.env.XAI_TTS_VOICE || "eve"
     : isElevenlabs ? process.env.ELEVENLABS_VOICE_ID || ""
     : "") || "";
  const voiceParamB = (req.body && req.body.voiceIdB) ||
    (isElevenlabs ? process.env.ELEVENLABS_VOICE_ID_B || "" : "") || "";
  const instruction = (req.body && req.body.instruction) || process.env.GEMINI_TTS_INSTRUCTION || "";
  const model = (req.body && req.body.model) ||
    (isGemini ? process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts"
     : isElevenlabs ? process.env.ELEVENLABS_MODEL || "eleven_v3"
     : process.env.OPENAI_TTS_MODEL || "tts-1");
  const ttsLanguage = (req.body && req.body.ttsLanguage) ||
    (isXai ? process.env.XAI_TTS_LANGUAGE || "ja"
     : isElevenlabs ? process.env.ELEVENLABS_LANGUAGE || "en"
     : "");
  const speedRaw = (req.body && req.body.speed != null)
    ? parseFloat(req.body.speed)
    : parseFloat(process.env.TTS_SPEED || "1.0");
  const speed = Number.isFinite(speedRaw) ? speedRaw : 1;

  if (!apiKey) return res.status(400).json({ ok: false, error: "API キーが未設定" });
  if (isElevenlabs && !voiceParam) {
    return res.status(400).json({ ok: false, error: "ElevenLabs の Voice ID（話者A）が未設定です。" });
  }

  const scene = config[sceneIndex];
  let ttsText = "";
  let elevenExtra = null;
  if (isElevenlabs) {
    const resolved = resolveElevenlabsScene(scene, voiceParam, voiceParamB);
    if (resolved.mode === "empty") {
      return res.status(400).json({
        ok: false,
        error: "読み上げ元が空です。speech_text / dialogue / ttsText を設定してください。",
      });
    }
    if (resolved.mode === "dialogue") {
      if (!voiceParamB) {
        return res.status(400).json({ ok: false, error: "2人会話には Voice ID（話者B）が必要です。" });
      }
      elevenExtra = { mode: "dialogue", inputs: resolved.inputs };
      ttsText = resolved.inputs.map((x) => x.text).join(" ");
    } else {
      ttsText = resolved.text;
      elevenExtra = { mode: "tts", voiceId: resolved.voiceId };
    }
  } else {
    ttsText = await resolveSceneTtsText(scene, provider);
    if (!ttsText) {
      return res.status(400).json({
        ok: false,
        error: "読み上げ元が空です。speech_text または text、または ttsText を設定してください。",
      });
    }
  }

  const audioDir = path.join(root, "public", "drop", "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const ext = audioExt(provider);
  const filename = `${String(sceneIndex + 1).padStart(2, "0")}_scene${sceneIndex + 1}.${ext}`;
  const outPath = path.join(audioDir, filename);

  const scenePrefix = `${String(sceneIndex + 1).padStart(2, "0")}_scene${sceneIndex + 1}.`;
  try {
    fs.readdirSync(audioDir)
      .filter(f => f.startsWith(scenePrefix) && f !== filename)
      .forEach(f => fs.unlinkSync(path.join(audioDir, f)));
  } catch {}

  try {
    const rawBuf = await generateAudioBuffer(
      provider,
      apiKey,
      voiceParam,
      ttsText,
      instruction,
      model,
      ttsLanguage,
      elevenExtra
    );
    const buf = applyPlaybackSpeedWithFfmpeg(rawBuf, ext, speed);
    fs.writeFileSync(outPath, buf);
    syncManifestInline();
    let note = "";
    if (elevenExtra && elevenExtra.mode === "dialogue") note = "（2人会話）";
    if (Math.abs(speed - 1) >= 0.02 && !ffmpegOnPath()) {
      note += (note ? " " : "") + "（ffmpeg なしのため話速スライダーは未適用）";
    }
    res.json({ ok: true, file: filename, scene: sceneIndex + 1, note });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- テロップ単シーン更新 ----
app.patch("/api/config/scene", (req, res) => {
  const { index, text } = req.body || {};
  if (typeof index !== "number" || typeof text !== "string") {
    return res.status(400).json({ ok: false, error: "index と text が必要です" });
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return res.status(500).json({ ok: false, error: "台本の読み込みに失敗" });
  }
  if (!Array.isArray(config) || index < 0 || index >= config.length) {
    return res.status(400).json({ ok: false, error: `シーン番号が不正 (${index})` });
  }
  config[index].text = text;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  res.json({ ok: true, index, text, config });
});

app.post("/api/sync-assets", (_req, res) => {
  try {
    const m = syncManifestInline();
    res.json({ ok: true, manifest: m });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---- フォルダをエクスプローラーで開く ----
app.post("/api/open-folder", (req, res) => {
  const { folder } = req.body || {};
  const allowed = {
    images: path.join(root, "public", "drop", "images"),
    audio:  path.join(root, "public", "drop", "audio"),
    export: exportDir,
  };
  const target = allowed[folder];
  if (!target) return res.status(400).json({ ok: false, error: "不正なフォルダ名" });
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  spawn("explorer", [target], { detached: true, stdio: "ignore" }).unref();
  res.json({ ok: true });
});

/**
 * 前作の台本・テロップ設定・辞書・ドロップ素材・書き出しを消し、初期状態にする。
 * 確認フレーズが完全一致したときだけ実行（.env / ソースは触らない）。
 * 短い URL も登録（プロキシや古いクライアントの切り分け用）。
 */
function postResetForNewVideo(req, res) {
  const phrase =
    req.body && req.body.confirmPhrase != null ? String(req.body.confirmPhrase).trim() : "";
  if (phrase !== "はい" && phrase !== "はい！") {
    return res.status(400).json({
      ok: false,
      error: "続けるには「はい」または「はい！」だけを入力してください（前後にスペースなし）。",
    });
  }
  try {
    const cleared = resetForNewVideoProject(root);
    res.json({ ok: true, cleared });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
app.post("/api/project/reset-for-new-video", postResetForNewVideo);
app.post("/api/reset-new-video", postResetForNewVideo);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---- 辞書設定 ----
app.get("/api/dictionary", (_req, res) => {
  try {
    const content = fs.readFileSync(dictPath, "utf8");
    res.json({ ok: true, dictionary: JSON.parse(content) });
  } catch {
    res.json({ ok: true, dictionary: [] });
  }
});

app.post("/api/dictionary", (req, res) => {
  try {
    const dict = req.body.dictionary || [];
    fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2), "utf8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/export", async (req, res) => {
  const { kind } = req.body || {};
  const comp = "MainVideo";
  const subDir = path.join(exportDir, stamp());
  fs.mkdirSync(subDir, { recursive: true });

  try {
    if (kind === "srt") {
      const out = path.join(subDir, "captions.srt");
      writeSrtFile(configPath, out);
      return res.json({ ok: true, files: [out], note: "video-config.json ベース（MainVideo 用テロップ）" });
    }

    if (kind === "mp4") {
      const out = path.join(subDir, `${comp}.mp4`);
      await runRemotionRender(["src/index.ts", comp, out, "--overwrite"]);
      return res.json({ ok: true, files: [out] });
    }

    if (kind === "split") {
      const videoOut = path.join(subDir, `${comp}_video.mp4`);
      const audioOut = path.join(subDir, `${comp}_audio.wav`);
      await runRemotionRender([
        "src/index.ts",
        comp,
        videoOut,
        "--separate-audio-to",
        audioOut,
        "--overwrite",
      ]);
      return res.json({
        ok: true,
        files: [videoOut, audioOut],
        note: "映像のみ MP4 とミックス音声（編集用）。字幕は別エクスポートの SRT を利用してください。",
      });
    }

    if (kind === "bundle") {
      const srtPath = path.join(subDir, "captions.srt");
      writeSrtFile(configPath, srtPath);
      const fullMp4 = path.join(subDir, `${comp}_full.mp4`);
      await runRemotionRender(["src/index.ts", comp, fullMp4, "--overwrite"]);
      const videoOnly = path.join(subDir, `${comp}_video_only.mp4`);
      const audioWav = path.join(subDir, `${comp}_mixed.wav`);
      await runRemotionRender([
        "src/index.ts",
        comp,
        videoOnly,
        "--separate-audio-to",
        audioWav,
        "--overwrite",
      ]);
      return res.json({
        ok: true,
        files: [srtPath, fullMp4, videoOnly, audioWav],
        note: "SRT・プレビュー用フル MP4・映像のみ・ミックス音声の4点セット（レンダー2回かかります）",
      });
    }

    return res.status(400).json({ ok: false, error: "unknown kind" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ---- Remotion preview server 管理 ----
let previewProcess = null;
let previewReady = false;
const PREVIEW_PORT = 3000;

app.post("/api/preview/start", (_req, res) => {
  if (previewProcess) {
    return res.json({ ok: true, started: true, url: `http://localhost:${PREVIEW_PORT}` });
  }
  previewReady = false;
  if (!fs.existsSync(remotionCliJs)) {
    return res.status(500).json({ ok: false, error: `Remotion CLI が見つかりません: ${remotionCliJs}` });
  }
  previewProcess = spawn(process.execPath, [remotionCliJs, "preview", "--port", String(PREVIEW_PORT)], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  previewProcess.stdout.on("data", (d) => {
    const txt = d.toString();
    if (txt.includes("Local:") || txt.includes("Built in")) {
      previewReady = true;
    }
  });
  previewProcess.stderr.on("data", (d) => {
    const txt = d.toString();
    if (txt.includes("Local:") || txt.includes("Built in")) {
      previewReady = true;
    }
  });
  previewProcess.on("error", () => { previewProcess = null; previewReady = false; });
  previewProcess.on("close", () => { previewProcess = null; previewReady = false; });
  // プロセスを起動したことだけ即座に返す（クライアントがポーリングで ready を確認）
  res.json({ ok: true, started: true, url: `http://localhost:${PREVIEW_PORT}` });
});

app.post("/api/preview/stop", (_req, res) => {
  if (!previewProcess) {
    return res.json({ ok: true });
  }
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(previewProcess.pid), "/f", "/t"], spawnOpts({ stdio: "ignore" }));
    } else {
      previewProcess.kill("SIGTERM");
    }
  } catch {}
  previewProcess = null;
  previewReady = false;
  res.json({ ok: true });
});

app.get("/api/preview/status", (_req, res) => {
  res.json({ running: !!previewProcess, ready: previewReady, url: `http://localhost:${PREVIEW_PORT}` });
});

// ---- 未定義ルートは JSON の 404（古いサーバー起動時の切り分け用） ----
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `API が見つかりません (${req.method} ${req.path})。npm run app を一度止めてから再起動し、最新の local-app.js が動いているか確認してください。`,
  });
});

// ---- 全ルートで JSON エラーを返す（HTML エラーページを出さない） ----
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || String(err) });
});

// ---- 起動 ----
const PORT = Number(process.env.PORT) || 3847;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  ローカル操作パネル: http://127.0.0.1:${PORT}/`);
  console.log(`  TTS: openai / aivis / gemini / xai / elevenlabs（v3）… タブで選べます。未対応と出る場合は npm run app を再起動してください。`);
  console.log(`  前作全消去 API: POST /api/reset-new-video または /api/project/reset-for-new-video`);
  console.log(`  CLI: npm run reset-project はい\n`);
});
server.timeout = 3 * 60 * 60 * 1000;
