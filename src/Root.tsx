import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { MainVideo } from "./MainVideo";
import configData from "../video-config.json";
import manifestData from "../assets-manifest.json";

type AssetManifest = { audio?: string[]; images?: string[] };
const manifest = manifestData as AssetManifest;
const scriptData: Array<{
  text: string;
  durationInSeconds?: number;
  effect?: string;
  imageFile?: string;
  /** このシーンだけ末尾に足す秒（MP3 の duration が実再生より短いとき用） */
  durationPadSeconds?: number;
  /** シーンの最低秒数（音声尺 + パッドがこれ未満なら伸ばす） */
  minDurationSeconds?: number;
}> = Array.isArray(configData) ? configData as any[] : [];

const FALLBACK_SEC = 10;
// 後半シーンの音声長取得がタイムアウトしないよう余裕を持たせる
const TIMEOUT_MS = 12000;
// ブラウザが返す長さが実再生より短いことがある（VBR MP3 等）ためデフォルトで厚めに取る
const END_BUFFER_SEC = 1.5;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={MainVideo}
      fps={30}
      width={1920}
      height={1080}
      calculateMetadata={async ({ props }) => {
        const fps = 30;

        // 同時取得だと後半シーンで timeout が起きやすいため順次取得する
        const scenes: Array<(typeof scriptData)[number] & { durationFrames: number; audioSrc: string }> = [];
        for (let i = 0; i < scriptData.length; i++) {
          const scene = scriptData[i];
          const audioRel =
            manifest.audio?.[i] && manifest.audio[i].length > 0
              ? manifest.audio[i]
              : `drop/audio/${String(i + 1).padStart(2, "0")}_scene${i + 1}.mp3`;
          const audioSrc = staticFile(audioRel);

          const padSec =
            typeof scene.durationPadSeconds === "number" && Number.isFinite(scene.durationPadSeconds)
              ? scene.durationPadSeconds
              : END_BUFFER_SEC;

          let durationSec = FALLBACK_SEC;
          try {
            durationSec = await withTimeout(getAudioDurationInSeconds(audioSrc), TIMEOUT_MS);
          } catch {
            durationSec = typeof scene.durationInSeconds === "number" ? scene.durationInSeconds : FALLBACK_SEC;
          }

          let durationFrames = Math.ceil((durationSec + padSec) * fps);
          if (typeof scene.minDurationSeconds === "number" && Number.isFinite(scene.minDurationSeconds)) {
            durationFrames = Math.max(durationFrames, Math.ceil(scene.minDurationSeconds * fps));
          }

          scenes.push({
            ...scene,
            durationFrames,
            audioSrc,
          });
        }

        const total = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

        return {
          durationInFrames: total > 0 ? total + 30 : 300,
          props: { ...props, scenes },
        };
      }}
      defaultProps={{ scenes: [] }}
    />
  );
};
