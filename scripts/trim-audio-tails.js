#!/usr/bin/env node
/**
 * シーン音声の末尾を ffmpeg で切り落とすユーティリティ。
 *
 * 「シーン切り替え時にラスト単語を 2 回言う」事象が個別 MP3 自体に含まれている場合に使う。
 * 既存ファイルは .bak として退避し、上書きする。
 *
 * 使い方:
 *   node scripts/trim-audio-tails.js --analyze              # 全シーン解析（変更なし）
 *   node scripts/trim-audio-tails.js --auto                 # 異常な末尾を自動検出してトリム
 *   node scripts/trim-audio-tails.js --auto --tail-max 1.5  # tail > 1.5s の超過分をトリム
 *   node scripts/trim-audio-tails.js --scenes 3,7,12 --sec 0.4  # 指定シーンを 0.4s トリム
 *   node scripts/trim-audio-tails.js --scenes 4 --sec 1.5
 *   node scripts/trim-audio-tails.js --restore              # .bak から全件復元
 *   node scripts/trim-audio-tails.js --restore --scenes 4   # 指定シーンだけ復元
 *   node scripts/trim-audio-tails.js --dry-run              # 何もせず予定だけ表示
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const audioDir = path.join(root, "public", "drop", "audio");

/** .env から TTS_SPEED / ELEVENLABS_API_SPEED を読む */
function readEnvSpeed() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return 1;
  const src = fs.readFileSync(envPath, "utf8");
  const lines = src.split(/\r?\n/);
  let ttsSpeed = NaN;
  let apiSpeed = NaN;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    const key = k.trim();
    const value = parseFloat(rest.join("=").trim());
    if (!Number.isFinite(value)) continue;
    if (key === "TTS_SPEED") ttsSpeed = value;
    else if (key === "ELEVENLABS_API_SPEED") apiSpeed = value;
  }
  // 両方が設定されていれば積で扱う（ElevenLabs API 速度 × ffmpeg 後処理速度）
  const t = Number.isFinite(ttsSpeed) && ttsSpeed > 0 ? ttsSpeed : 1;
  const a = Number.isFinite(apiSpeed) && apiSpeed > 0 ? apiSpeed : 1;
  return t * a;
}

function parseArgs(argv) {
  const out = {
    sec: 0.2,
    scenes: null,
    restore: false,
    dryRun: false,
    analyze: false,
    auto: false,
    tailMax: 1.5,
    noise: -40,
    minSilence: 0.15,
    speed: null, // null なら .env から自動取得
    minExcess: 1.5, // --auto でこの秒数以上の超過のみトリム（保守的に）
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sec") out.sec = parseFloat(argv[++i]);
    else if (a === "--scenes") {
      out.scenes = String(argv[++i] || "")
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else if (a === "--restore") out.restore = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--analyze") out.analyze = true;
    else if (a === "--auto") out.auto = true;
    else if (a === "--tail-max") out.tailMax = parseFloat(argv[++i]);
    else if (a === "--noise") out.noise = parseFloat(argv[++i]);
    else if (a === "--min-silence") out.minSilence = parseFloat(argv[++i]);
    else if (a === "--speed") out.speed = parseFloat(argv[++i]);
    else if (a === "--min-excess") out.minExcess = parseFloat(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 19).join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function listSceneFiles() {
  if (!fs.existsSync(audioDir)) return [];
  return fs
    .readdirSync(audioDir)
    .filter((f) => /^\d+_scene\d+\.(mp3|wav)$/i.test(f))
    .map((f) => {
      const m = f.match(/^(\d+)_scene(\d+)\.(mp3|wav)$/i);
      return { file: f, idx: parseInt(m[1], 10), scene: parseInt(m[2], 10), ext: m[3].toLowerCase() };
    })
    .sort((a, b) => a.idx - b.idx);
}

function ffprobeDuration(file) {
  const r = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const v = parseFloat((r.stdout || "").trim());
  return Number.isFinite(v) ? v : null;
}

/** ffmpeg silencedetect で最後の有音 → 終端までの「テール長」を取得 */
function detectTail(file, noiseDb, minSilenceSec) {
  const dur = ffprobeDuration(file);
  if (dur == null) return null;
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      file,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minSilenceSec}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" }
  );
  const text = (r.stderr || "") + "\n" + (r.stdout || "");
  let lastSilenceEnd = 0;
  const re = /silence_end:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v)) lastSilenceEnd = v;
  }
  const tail = Math.max(0, dur - lastSilenceEnd);
  return { duration: dur, lastSilenceEnd, tail };
}

function ffmpegTrim(input, output, trimSec) {
  const dur = ffprobeDuration(input);
  if (dur == null) {
    console.warn(`  ! ffprobe 失敗: ${path.basename(input)}`);
    return false;
  }
  const targetDur = Math.max(0.1, dur - trimSec);
  const ext = path.extname(input).toLowerCase();
  const args =
    ext === ".wav"
      ? [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          input,
          "-t",
          String(targetDur.toFixed(3)),
          "-c:a",
          "pcm_s16le",
          output,
        ]
      : [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          input,
          "-t",
          String(targetDur.toFixed(3)),
          "-c:a",
          "libmp3lame",
          "-q:a",
          "3",
          output,
        ];
  const r = spawnSync("ffmpeg", args);
  if (r.status !== 0) {
    console.warn(`  ! ffmpeg 失敗: ${path.basename(input)} (${(r.stderr || "").toString().slice(0, 200)})`);
    return false;
  }
  console.log(`  ✓ ${path.basename(input)}: ${dur.toFixed(3)}s → ${targetDur.toFixed(3)}s (-${trimSec}s)`);
  return true;
}

function loadConfig() {
  const p = path.join(root, "video-config.json");
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/** シーン番号(=エントリー位置)に対応する text を取得 */
function getSceneText(config, idx) {
  const entry = config[idx - 1];
  if (!entry) return "";
  return String(entry.speech_text || entry.text || "").trim();
}

/** 末尾フレーズの想定長を推定（カンマ含む末尾区切り以降の語/文字数ベース・speed 補正あり） */
function estimateTailDurationSec(text, speed = 1) {
  if (!text) return 1.2 / speed;
  // 角括弧（[laughs] 等のオーディオタグ）は除外
  const cleaned = text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return 1.2 / speed;
  // 文末/節末記号で最後の区切りを探す（最終位置を除外して 2文字目から）
  const breakers = [".", "!", "?", ",", "—", "、", "。", "！", "？"];
  let lastBreak = -1;
  for (const ch of breakers) {
    const idx = cleaned.lastIndexOf(ch, cleaned.length - 2);
    if (idx > lastBreak) lastBreak = idx;
  }
  const tailPhrase = lastBreak >= 0 ? cleaned.slice(lastBreak + 1).trim() : cleaned;
  if (!tailPhrase) return 1.2 / speed;

  // 日本語文字を含むかで推定方法を切替
  const hasJa = /[\u3040-\u30ff\u4e00-\u9fff]/.test(tailPhrase);
  let base;
  if (hasJa) {
    const jaChars = (tailPhrase.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
    base = jaChars * 0.13;
  } else {
    const wordCount = tailPhrase.split(/\s+/).filter(Boolean).length;
    base = wordCount * 0.38;
  }
  return Math.max(0.4 / speed, Math.min(6 / speed, base / speed));
}

function main() {
  const args = parseArgs(process.argv);
  const all = listSceneFiles();
  if (all.length === 0) {
    console.error(`音声ファイルが見つかりません: ${audioDir}`);
    process.exit(1);
  }

  const target = args.scenes ? all.filter((x) => args.scenes.includes(x.idx)) : all;
  if (target.length === 0) {
    console.error("対象ファイルが 0 件です。 --scenes の指定を確認してください。");
    process.exit(1);
  }

  if (args.analyze || args.auto) {
    const config = loadConfig();
    const speed = args.speed != null && Number.isFinite(args.speed) && args.speed > 0
      ? args.speed
      : readEnvSpeed();
    const report = target.map((t) => {
      const cur = path.join(audioDir, t.file);
      const info = detectTail(cur, args.noise, args.minSilence) || {
        duration: 0,
        lastSilenceEnd: 0,
        tail: 0,
      };
      const text = getSceneText(config, t.idx);
      const expected = estimateTailDurationSec(text, speed);
      // 0.9 倍速だと安全マージンも伸ばす
      const safetyBuffer = 0.6 / speed;
      const excess = Math.max(0, info.tail - expected - safetyBuffer);
      const suspicious = excess >= args.minExcess;
      return { ...t, ...info, text, expected, excess, suspicious };
    });

    console.log(
      `[analyze] speed=${speed.toFixed(2)}x  noise=${args.noise}dB  d>=${args.minSilence}s  min-excess=${args.minExcess}s / ${target.length} 件`
    );
    console.log("idx\tfile\t\tdur\ttail\texpected\texcess\tsuspect");
    for (const r of report) {
      console.log(
        `${r.idx}\t${r.file}\t${r.duration.toFixed(2)}\t${r.tail.toFixed(2)}\t${r.expected.toFixed(2)}\t\t${r.excess.toFixed(2)}\t${r.suspicious ? "★" : ""}`
      );
    }

    if (!args.auto) return;

    const toFix = report.filter((r) => r.suspicious);
    if (toFix.length === 0) {
      console.log(`\nmin-excess ${args.minExcess}s 以上の疑いシーンはありませんでした。`);
      return;
    }
    console.log(`\n[auto] ${toFix.length} 件をトリムします（超過分のみ、最大 tail-0.3s まで）`);

    for (const r of toFix) {
      const cur = path.join(audioDir, r.file);
      const trimSec = Math.min(r.excess, Math.max(0, r.tail - 0.3));
      if (trimSec <= 0.15) {
        console.log(`  - skip (trim<=0.15s): ${r.file}`);
        continue;
      }
      if (args.dryRun) {
        console.log(`  (dry) ${r.file}: -${trimSec.toFixed(2)}s (${r.duration.toFixed(2)} → ${(r.duration - trimSec).toFixed(2)})`);
        continue;
      }
      const bak = cur + ".bak";
      if (!fs.existsSync(bak)) fs.copyFileSync(cur, bak);
      const tmp = cur + ".tmp" + path.extname(cur);
      const ok = ffmpegTrim(bak, tmp, trimSec);
      if (ok) {
        fs.renameSync(tmp, cur);
      } else if (fs.existsSync(tmp)) {
        fs.unlinkSync(tmp);
      }
    }
    console.log("完了。問題があれば `--restore` で戻せます。");
    return;
  }

  if (args.restore) {
    console.log(`[restore] ${target.length} 件の .bak から復元します`);
    for (const t of target) {
      const cur = path.join(audioDir, t.file);
      const bak = cur + ".bak";
      if (!fs.existsSync(bak)) {
        console.warn(`  - skip (no backup): ${t.file}`);
        continue;
      }
      if (args.dryRun) {
        console.log(`  (dry) restore: ${bak} → ${cur}`);
      } else {
        fs.copyFileSync(bak, cur);
        console.log(`  ✓ restored: ${t.file}`);
      }
    }
    return;
  }

  if (!Number.isFinite(args.sec) || args.sec <= 0) {
    console.error(`--sec は正の数値で指定してください (got: ${args.sec})`);
    process.exit(1);
  }

  console.log(`[trim] ${target.length} 件の末尾を ${args.sec}s ずつトリムします`);
  for (const t of target) {
    const cur = path.join(audioDir, t.file);
    const bak = cur + ".bak";
    if (args.dryRun) {
      const dur = ffprobeDuration(cur);
      console.log(`  (dry) ${t.file}: ${dur != null ? dur.toFixed(3) + "s" : "?"} → ${(dur != null ? (dur - args.sec).toFixed(3) + "s" : "?")}`);
      continue;
    }
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(cur, bak);
    }
    const tmp = cur + ".tmp" + path.extname(cur);
    const ok = ffmpegTrim(bak, tmp, args.sec);
    if (ok) {
      fs.renameSync(tmp, cur);
    } else if (fs.existsSync(tmp)) {
      fs.unlinkSync(tmp);
    }
  }
  console.log("完了。確認後に問題があれば `--restore` で元に戻せます。");
}

main();
