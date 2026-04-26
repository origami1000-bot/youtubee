/**
 * 新規動画用にプロジェクトデータを初期化（HTTP 経由でも CLI でも同じ処理）
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_TELOP_STYLE = {
  fontSize: 75,
  color: "#ffffff",
  fontFamily: "Yu Gothic",
  fontWeight: "bold",
  background: "dark",
  position: "bottom",
  shadow: true,
  maxCharsPerLine: 22,
};

function assertInsideProject(projRoot, absPath) {
  const proj = path.resolve(projRoot);
  const target = path.resolve(absPath);
  const norm = (p) => p.replace(/\\/g, "/").toLowerCase();
  const np = norm(target);
  const nr = norm(proj);
  if (np !== nr && !np.startsWith(nr + "/")) {
    throw new Error(`安全のため中止: プロジェクト外パス ${target}`);
  }
}

function emptyDirectory(projRoot, dir) {
  assertInsideProject(projRoot, dir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function wipeLooseMediaInOutRoot(projRoot) {
  const outRootDir = path.join(projRoot, "out");
  const cleared = [];
  if (!fs.existsSync(outRootDir)) return cleared;
  assertInsideProject(projRoot, outRootDir);
  for (const name of fs.readdirSync(outRootDir)) {
    if (name === "export") continue;
    const p = path.join(outRootDir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (/\.(mp4|webm|mov|mkv|wav|mp3|m4a|gif)$/i.test(name)) {
      fs.unlinkSync(p);
      cleared.push(`out/${name}`);
    }
  }
  return cleared;
}

/**
 * @param {string} projRoot プロジェクトルート（package.json があるディレクトリ）
 * @returns {string[]} 人間向けの処理内容ログ
 */
function resetForNewVideoProject(projRoot) {
  const root = path.resolve(projRoot);
  const configPath = path.join(root, "video-config.json");
  const manifestPath = path.join(root, "assets-manifest.json");
  const telopStylePath = path.join(root, "telop-style.json");
  const dictPath = path.join(root, "dictionary.json");
  const exportDir = path.join(root, "out", "export");
  const dropAudioDir = path.join(root, "public", "drop", "audio");
  const dropImagesDir = path.join(root, "public", "drop", "images");

  const cleared = [];

  emptyDirectory(root, dropAudioDir);
  cleared.push("public/drop/audio（全ファイル）");
  emptyDirectory(root, dropImagesDir);
  cleared.push("public/drop/images（全ファイル）");

  emptyDirectory(root, exportDir);
  fs.mkdirSync(exportDir, { recursive: true });
  cleared.push("out/export（過去の書き出しフォルダ・ファイルすべて）");

  cleared.push(...wipeLooseMediaInOutRoot(root));

  fs.writeFileSync(configPath, "[]\n", "utf8");
  cleared.push("video-config.json → 空の台本 []");

  fs.writeFileSync(telopStylePath, JSON.stringify(DEFAULT_TELOP_STYLE, null, 2) + "\n", "utf8");
  cleared.push("telop-style.json → 初期スタイル");

  fs.writeFileSync(dictPath, "[]\n", "utf8");
  cleared.push("dictionary.json → 空");

  const manifest = { audio: [], images: [] };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  cleared.push("assets-manifest.json → 音声0・画像0 に更新");

  return cleared;
}

module.exports = {
  resetForNewVideoProject,
  DEFAULT_TELOP_STYLE,
};
