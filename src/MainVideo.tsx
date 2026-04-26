import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';
import configData from '../video-config.json';
import telopStyleData from '../telop-style.json';
import manifestData from '../assets-manifest.json';

type AssetManifest = { audio?: string[]; images?: string[] };
const manifest = manifestData as AssetManifest;

interface TelopStyle {
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: string;
  shadow: boolean;
  background: string;
  position: string;
  maxCharsPerLine: number;
}

const style: TelopStyle = telopStyleData as TelopStyle;

interface SceneConfig {
  text: string;
  durationInSeconds: number;
  effect?: 'zoom-in' | 'zoom-out' | 'pan-right' | 'pan-left' | string;
  imageFile?: string;
}

const sequences: SceneConfig[] = Array.isArray(configData) ? configData as SceneConfig[] : [];

// ---- テロップ用テキスト分割（最大2行/カード、自然な区切り） ----
function buildDisplayCards(raw: string, maxChars: number): string[] {
  // まず \n で段落ごとに分割（台本の意図的な改行を尊重）
  const paragraphs = raw.split(/\n/).map(s => s.trim()).filter(Boolean);

  const cards: string[] = [];

  for (const para of paragraphs) {
    // 段落内を句読点で自然な断片に分割し、末尾の句読点を除去
    const frags = (para.match(/[^。！？、]+[。！？、]?/g) || [para])
      .map((s) => s.replace(/[。、]$/u, '').trim())
      .filter(Boolean);

    // maxChars を超える断片をさらに折り返す
    const lines: string[] = [];
    for (const frag of frags) {
      if (frag.length <= maxChars) {
        lines.push(frag);
      } else {
        for (let i = 0; i < frag.length; i += maxChars) {
          lines.push(frag.slice(i, i + maxChars));
        }
      }
    }

    // 段落内で2行ずつグループ化して1カードにする（段落をまたがないようにする）
    for (let i = 0; i < lines.length; i += 2) {
      if (i + 1 < lines.length) {
        cards.push(lines[i] + '\n' + lines[i + 1]);
      } else {
        cards.push(lines[i]);
      }
    }
  }

  return cards.length > 0 ? cards : [raw];
}

// ---- テロップコンポーネント ----
const Telop: React.FC<{ text: string; durationFrames: number }> = ({ text, durationFrames }) => {
  const frame = useCurrentFrame();
  const maxChars = style.maxCharsPerLine || 22;
  const chunks = buildDisplayCards(text, maxChars);
  // カードの文字数合計（\n を除く）で時間を比例配分
  const totalChars = chunks.reduce((a, s) => a + s.replace(/\n/g, '').length, 0);

  let accumulated = 0;
  let activeIndex = chunks.length - 1;
  for (let i = 0; i < chunks.length; i++) {
    const charCount = chunks[i].replace(/\n/g, '').length;
    const frames = (charCount / totalChars) * durationFrames;
    if (frame >= accumulated && frame < accumulated + frames) {
      activeIndex = i;
      break;
    }
    accumulated += frames;
  }

  const shadowStr = style.shadow
    ? '2px 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.7)'
    : 'none';

  let bgStyle: React.CSSProperties = {};
  if (style.background === 'dark') {
    bgStyle = { backgroundColor: 'rgba(0,0,0,0.65)', padding: '20px 48px', borderRadius: '12px' };
  } else if (style.background === 'light') {
    bgStyle = { backgroundColor: 'rgba(255,255,255,0.85)', padding: '20px 48px', borderRadius: '12px' };
  }

  const vertAlign = style.position === 'top' ? 'flex-start'
    : style.position === 'center' ? 'center'
    : 'flex-end';

  return (
    <AbsoluteFill style={{
      justifyContent: vertAlign,
      alignItems: 'center',
      paddingBottom: style.position === 'bottom' ? '72px' : '0',
      paddingTop: style.position === 'top' ? '72px' : '0',
    }}>
      <div style={bgStyle}>
        <p style={{
          fontSize: `${style.fontSize}px`,
          fontWeight: style.fontWeight || 'bold',
          color: style.color || 'white',
          fontFamily: `"${style.fontFamily}", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`,
          textShadow: shadowStr,
          margin: 0,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.55,
          textAlign: 'center',
        }}>
          {chunks[activeIndex]}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ---- シーンコンポーネント ----
const SceneItem: React.FC<{
  data: SceneConfig;
  index: number;
  durationFrames: number;
  audioSrc?: string;
}> = ({ data, index, durationFrames, audioSrc }) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  let transform = 'scale(1)';
  if (data.effect === 'zoom-in') {
    transform = `scale(${interpolate(progress, [0, 1], [1, 1.1])})`;
  } else if (data.effect === 'zoom-out') {
    transform = `scale(${interpolate(progress, [0, 1], [1.1, 1])})`;
  } else if (data.effect === 'pan-right') {
    transform = `translateX(${interpolate(progress, [0, 1], [0, -5])}%) scale(1.1)`;
  } else if (data.effect === 'pan-left') {
    transform = `translateX(${interpolate(progress, [0, 1], [-5, 0])}%) scale(1.1)`;
  }

  // manifest があればそちらを優先、なければ images/scene-N.png
  const imgRel =
    manifest.images?.[index] && manifest.images[index].length > 0
      ? manifest.images[index]
      : data.imageFile && data.imageFile.length > 0
      ? data.imageFile
      : `images/scene-${index + 1}.png`;

  const audRel =
    manifest.audio?.[index] && manifest.audio[index].length > 0
      ? manifest.audio[index]
      : `drop/audio/scene${index + 1}.mp3`;

  const imgSrc = staticFile(imgRel);
  const resolvedAudioSrc = audioSrc || staticFile(audRel);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: 'black' }}>
      <img
        src={imgSrc}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
          transformOrigin: 'center center',
        }}
      />
      <Audio src={resolvedAudioSrc} />
      <Telop text={data.text} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};

// ---- メインコンポーネント（props 経由で尺と音声パスを受け取る） ----
interface SceneWithDuration extends SceneConfig {
  durationFrames: number;
  audioSrc: string;
}

export const MainVideo: React.FC<{ scenes?: SceneWithDuration[] }> = ({ scenes }) => {
  const { fps } = useVideoConfig();

  // scenes prop がある（calculateMetadata 経由）ならそちらを使う
  const resolvedScenes: Array<SceneConfig & { durationFrames: number; audioSrc?: string }> = scenes && scenes.length > 0
    ? scenes
    : sequences.map((s, i) => {
        const dur = typeof s.durationInSeconds === 'number' ? s.durationInSeconds : 5;
        return { ...s, durationFrames: Math.max(1, Math.round(dur * fps)) };
      });

  if (resolvedScenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
        <h1 style={{ color: 'white' }}>video-config.json にシーン情報がありません</h1>
      </AbsoluteFill>
    );
  }

  let cumulativeFrame = 0;
  return (
    <AbsoluteFill>
      {resolvedScenes.map((scene, index) => {
        const startFrame = cumulativeFrame;
        cumulativeFrame += scene.durationFrames;
        return (
          <Sequence key={index} from={startFrame} durationInFrames={scene.durationFrames}>
            <SceneItem
              data={scene}
              index={index}
              durationFrames={scene.durationFrames}
              audioSrc={scene.audioSrc}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
