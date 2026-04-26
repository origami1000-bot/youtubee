/**
 * public/drop/audio と public/drop/images に置いたファイルを名前順で読み、
 * assets-manifest.json に書き出します。シーン順はファイル名で制御（例: 01_a.mp3, 02_b.mp3）。
 * パスは public/ からの相対パスです。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "assets-manifest.json");
const dropAudio = path.join(root, "public", "drop", "audio");
const dropImages = path.join(root, "public", "drop", "images");

const AUDIO_EXT = /\.(mp3|wav|m4a|aac)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;

function listFiles(dir, subRel, extRe) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => extRe.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => `${subRel}/${f}`);
}

const audio = listFiles(dropAudio, "drop/audio", AUDIO_EXT);
const images = listFiles(dropImages, "drop/images", IMAGE_EXT);

const manifest = {
  audio,
  images,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${manifestPath}`);
console.log(`  audio:  ${audio.length} file(s)`);
console.log(`  images: ${images.length} file(s)`);
if (audio.length === 0 && images.length === 0) {
  console.log("Hint: add files under public/drop/audio and public/drop/images, then run again.");
}
