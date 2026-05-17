/**
 * public/drop/audio と public/drop/images に置いたファイルを読み、
 * assets-manifest.json にシーン番号キーのオブジェクトとして書き出します。
 *
 * ファイル名の先頭数字がシーン番号になります（例: 03_foo.jpg → シーン3）。
 *   01_foo.jpg, 1_foo.jpg, scene01_foo.jpg, scene1.jpg, 01foo.png など対応。
 *
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

/**
 * ファイル名の先頭から場面番号を抽出する。
 * 一致しない場合は null を返す。
 *   "01_foo.jpg"     → 1
 *   "1_foo.jpg"      → 1
 *   "scene01_foo.jpg"→ 1
 *   "scene3.jpg"     → 3
 *   "03foo.png"      → 3
 *   "foo.jpg"        → null
 */
function parseSceneNumber(filename) {
  const m = filename.match(/^(?:scene)?0*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * ディレクトリのファイルをシーン番号をキーにしたオブジェクトで返す。
 * シーン番号が読み取れないファイルは含めない（コンソールに警告）。
 * 同じシーン番号が複数ある場合は先にソートされた方を使う（後勝ちにしない）。
 */
function listFilesAsObject(dir, subRel, extRe) {
  if (!fs.existsSync(dir)) return {};

  const files = fs
    .readdirSync(dir)
    .filter((f) => extRe.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const obj = {};
  for (const f of files) {
    const n = parseSceneNumber(f);
    if (n === null) {
      console.warn(`  ⚠ シーン番号が読み取れません（スキップ）: ${f}`);
      continue;
    }
    const key = String(n);
    if (obj[key]) {
      console.warn(`  ⚠ シーン${n} の重複ファイル（後者をスキップ）: ${f}`);
      continue;
    }
    obj[key] = `${subRel}/${f}`;
  }
  return obj;
}

const audio  = listFilesAsObject(dropAudio,  "drop/audio",  AUDIO_EXT);
const images = listFilesAsObject(dropImages, "drop/images", IMAGE_EXT);

const manifest = { audio, images };

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${manifestPath}`);
console.log(`  audio:  ${Object.keys(audio).length} scene(s) → ${JSON.stringify(Object.keys(audio).sort((a,b)=>+a-+b))}`);
console.log(`  images: ${Object.keys(images).length} scene(s) → ${JSON.stringify(Object.keys(images).sort((a,b)=>+a-+b))}`);
if (Object.keys(audio).length === 0 && Object.keys(images).length === 0) {
  console.log("Hint: add files under public/drop/audio and public/drop/images, then run again.");
}
