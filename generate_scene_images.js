const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;

if (!API_KEY || API_KEY === "ここにAPIキーを貼り付け") {
  console.error("エラー: .env ファイルに GOOGLE_AI_STUDIO_API_KEY が正しく設定されていません。");
  process.exit(1);
}

// Imagen 3 用のプロンプト生成関数
function getPromptForScene(text) {
  // AIが勝手に文字（変な漢字など）を描画しないように、"No text, no letters" を強く指示します。
  // また、日本語のテキストを直接渡すと文字を描こうとするため、シーンに合わせた英単語のみを使います。
  return `A beautiful aesthetic scenery for a YouTube explainer video about Japanese retirement, pension, elderly life, and money planning. Anime style, studio ghibli inspired, highly detailed, 4k background.
IMPORTANT: NO TEXT, NO LETTERS, NO WORDS, NO CHARACTERS, NO SIGNS. ONLY VISUAL SCENERY.`;
}

async function generateImageForScene(sceneId, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
  
  const payload = {
    instances: [
      { prompt: getPromptForScene(text) }
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: "16:9",
      outputOptions: { mimeType: "image/png" }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`APIエラー (シーン ${sceneId}):`, err);
      return false;
    }

    const data = await response.json();
    if (data.predictions && data.predictions.length > 0) {
      const base64Image = data.predictions[0].bytesBase64Encoded;
      const buffer = Buffer.from(base64Image, 'base64');
      
      const outputPath = path.join(__dirname, 'public', `${sceneId}_bg.png`);
      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ 保存成功: ${outputPath}`);
      return true;
    } else {
      console.error(`レスポンス形式が不正です (シーン ${sceneId})`, data);
      return false;
    }
  } catch (err) {
    console.error(`リクエスト失敗 (シーン ${sceneId}):`, err);
    return false;
  }
}

async function main() {
  const scriptPath = path.join(__dirname, 'public', 'script.json');
  if (!fs.existsSync(scriptPath)) {
    console.error("script.json が見つかりません。");
    return;
  }

  const scriptData = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  
  console.log(`全 ${scriptData.length} シーンの画像生成を開始します...`);

  for (const scene of scriptData) {
    const outputPath = path.join(__dirname, 'public', `${scene.id}_bg.png`);
    
    // 既に画像が存在する場合はスキップ
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️ スキップ: ${scene.id}_bg.png は既に存在します`);
      continue;
    }
    
    console.log(`🎨 画像生成中: ${scene.id}...`);
    await generateImageForScene(scene.id, scene.text);
    
    // APIのレートリミットを考慮して少し待機
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("🎉 すべての画像生成が完了しました！");
}

main();
