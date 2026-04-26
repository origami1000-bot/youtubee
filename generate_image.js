const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// .env ファイルを読み込む
dotenv.config();

const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;

if (!API_KEY || API_KEY === "AIzaSyCTQm1HIH1dWshAdyn-4PhRtMQbK0NcWs") {
  console.error("エラー: .env ファイルに GOOGLE_AI_STUDIO_API_KEY が正しく設定されていません。");
  process.exit(1);
}

// -------------------------------------------------------------
// 画像生成のプロンプト（必要に応じて変更してください）
// -------------------------------------------------------------
const prompt = "A beautiful and aesthetic background of a small shop, highly detailed, anime style, 4k resolution";

async function generateImage() {
  // AI Studio の Imagen 3 モデルのエンドポイント
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;

  const payload = {
    instances: [
      { prompt: prompt }
    ],
    parameters: {
      sampleCount: 1,
      // 16:9 のアスペクト比
      aspectRatio: "16:9",
      outputOptions: { mimeType: "image/png" }
    }
  };

  try {
    console.log("Gemini API (Imagen 3) で画像を生成中...");

    // Node.js 18以降に組み込みの fetch を使用
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`APIエラー (${response.status}):`, errorText);
      return;
    }

    const data = await response.json();

    // レスポンスから画像データを取得
    if (data.predictions && data.predictions.length > 0) {
      const base64Image = data.predictions[0].bytesBase64Encoded;
      const buffer = Buffer.from(base64Image, 'base64');

      // 保存先のフォルダ（public）
      const outputDir = path.join(__dirname, 'public');

      // public フォルダが存在しない場合は作成
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 画像を shop-bg.png として保存
      const outputPath = path.join(outputDir, 'shop-bg.png');
      fs.writeFileSync(outputPath, buffer);

      console.log(`✨ 成功: 画像データを保存しました -> ${outputPath}`);
    } else {
      console.error("エラー: 予期しないレスポンスフォーマットでした。", data);
    }
  } catch (error) {
    console.error("リクエストの実行中にエラーが発生しました:", error);
  }
}

// スクリプトの実行
generateImage();
