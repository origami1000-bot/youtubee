const fs = require("fs");
const path = require("path");

function secToSrtTime(totalSec) {
  const ms = Math.round(totalSec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(frac, 3)}`;
}

/**
 * video-config.json（MainVideo 用）からシーン単位の SRT を生成する。
 * 各シーンの text を1キューとし、durationInSeconds で区切る。
 */
function buildSrtFromVideoConfig(config) {
  const scenes = Array.isArray(config) ? config : [];
  let t = 0;
  const lines = [];
  let cue = 1;
  for (const scene of scenes) {
    const dur =
      typeof scene.durationInSeconds === "number" ? scene.durationInSeconds : 5;
    const text = (scene.text || "").trim();
    const start = t;
    const end = t + dur;
    t = end;
    if (!text) continue;
    lines.push(String(cue++));
    lines.push(`${secToSrtTime(start)} --> ${secToSrtTime(end)}`);
    lines.push(text.replace(/\r\n/g, "\n"));
    lines.push("");
  }
  return lines.join("\n");
}

function writeSrtFile(configPath, outPath) {
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  const srt = buildSrtFromVideoConfig(config);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, srt, "utf8");
  return outPath;
}

module.exports = { buildSrtFromVideoConfig, writeSrtFile, secToSrtTime };
