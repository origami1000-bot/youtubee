#!/usr/bin/env node
/**
 * ブラウザが使えないとき用: 前作データを HTTP なしで消去する
 *   npm run reset-project はい
 *   node scripts/reset-project.js はい
 */
const path = require("path");
const { resetForNewVideoProject } = require("./lib/project-reset");

const root = path.join(__dirname, "..");
const phrase = (process.argv[2] || "").trim();

if (phrase !== "はい" && phrase !== "はい！") {
  console.error("使い方: npm run reset-project はい");
  console.error("（または「はい！」）— 前作の台本・音声・画像・書き出し・辞書・テロップ設定をすべて初期化します。");
  process.exit(1);
}

try {
  const cleared = resetForNewVideoProject(root);
  console.log("完了:\n" + cleared.join("\n"));
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
