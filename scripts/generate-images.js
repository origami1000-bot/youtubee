const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. dotenvを使い、ルートの .env から GOOGLE_AI_STUDIO_API_KEY を読み込む
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;

if (!API_KEY || API_KEY === "ここにAPIキーを貼り付け") {
  console.error("エラー: GOOGLE_AI_STUDIO_API_KEY が .env に正しく設定されていません。");
  process.exit(1);
}

// video-config.json のパス
const configPath = path.join(__dirname, '../video-config.json');
let config = [];

try {
  const content = fs.readFileSync(configPath, 'utf8');
  if (content.trim() === '') {
    console.log("ℹ️ video-config.json が空です。スクリプトを終了します。");
    process.exit(0);
  }
  config = JSON.parse(content);
} catch (err) {
  console.error("❌ エラー: video-config.json の読み込みまたはパースに失敗しました。", err);
  process.exit(1);
}

// 3. 画像の保存先 (public/images) ディレクトリを作成
const imagesDir = path.join(__dirname, '../public/images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

async function generateImage(prompt, index) {
  //  Gemini API (Imagen 4.0 など適宜指定の画像生成APIエンドポイント) を叩く雛形
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
  
  // Imagen の場合は、意図せぬ文字が描画されないようネガティブプロンプト的な指定を追加するのも推奨
  const safePrompt = `${prompt}
IMPORTANT: DO NOT generate any text, letters, or words in the image. Pure visual illustration.`;

  const payload = {
    instances: [
      { prompt: safePrompt }
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
      const errorText = await response.text();
      console.error(`❌ APIエラー (scene-${index}):`, errorText);
      return false;
    }

    const data = await response.json();
    if (data.predictions && data.predictions.length > 0) {
      const base64Image = data.predictions[0].bytesBase64Encoded;
      const buffer = Buffer.from(base64Image, 'base64');
      
      const outputPath = path.join(imagesDir, `scene-${index}.png`);
      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ 画像を保存しました: public/images/scene-${index}.png`);
      return true;
    } else {
      console.error(`❌ 予期しないレスポンス形式です (scene-${index})`, data);
      return false;
    }
  } catch (error) {
    console.error(`❌ リクエスト失敗 (scene-${index}):`, error);
    return false;
  }
}

async function main() {
  if (config.length === 0) {
    console.log("ℹ️ 設定ファイルの中にシーンが登録されていません。");
    return;
  }

  console.log(`全 ${config.length} シーンの画像生成を開始します...`);

  // 2. video-config.json を配列順にループし、imagePrompt のテキストを使用
  for (let i = 0; i < config.length; i++) {
    const scene = config[i];
    const index = i + 1; // 1-based index (scene-1.png, scene-2.png...)

    if (!scene.imagePrompt) {
      console.log(`⏭️ スキップ: scene-${index} には imagePrompt がありません。`);
      continue;
    }

    const outputPath = path.join(imagesDir, `scene-${index}.png`);
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️ スキップ: scene-${index}.png は既に存在します`);
      continue;
    }

    console.log(`🎨 画像生成中: scene-${index}...`);
    await generateImage(scene.imagePrompt, index);
    
    // APIレートリミットを考慮した待機時間
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("🎉 すべての画像生成が完了しました！");
}

main();
