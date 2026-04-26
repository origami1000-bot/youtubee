# youtubee

Remotion ベースの動画制作プロジェクト（ローカルアプリ・TTS・画像生成スクリプト付き）。

## セットアップ

```bash
npm install
cp .env.example .env
# .env に API キーを記入
```

## よく使うコマンド

| コマンド | 説明 |
|----------|------|
| `npm run start` | Remotion Studio |
| `npm run app` | ローカル Web アプリ（既定ポート 3847） |
| `npm run sync-assets` | `public/drop` からアセット同期 |
| `npm run build` | 動画レンダー |

`public/drop/` は Git 管理外です。素材はドロップ後に `npm run sync-assets` を実行してください。

## ライセンス

リポジトリ所有者に従います。
