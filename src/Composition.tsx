import React from "react";
import { AbsoluteFill, Audio, Series, useCurrentFrame, staticFile } from "remotion";

const MAX_CHARS_PER_LINE = 22;

function splitIntoChunks(raw: string): string[] {
  // 句読点で分割し末尾の句読点を除去
  const parts = (raw.match(/[^。！？、]+[。！？、]?/g) || [raw])
    .map((s) => s.replace(/[。、]$/u, "").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= MAX_CHARS_PER_LINE) {
      chunks.push(part);
    } else {
      // 長い文はMAX_CHARS_PER_LINE文字ごとに折る
      for (let i = 0; i < part.length; i += MAX_CHARS_PER_LINE) {
        chunks.push(part.slice(i, i + MAX_CHARS_PER_LINE));
      }
    }
  }
  return chunks.length > 0 ? chunks : [raw];
}

const Telop: React.FC<{ text: string, durationFrames: number }> = ({ text, durationFrames }) => {
  const frame = useCurrentFrame();
  const chunks = splitIntoChunks(text);

  const totalChars = chunks.reduce((acc, s) => acc + s.length, 0);

  let currentAccumulatedFrames = 0;
  let activeIndex = chunks.length - 1;

  for (let i = 0; i < chunks.length; i++) {
    const sentenceFrames = (chunks[i].length / totalChars) * durationFrames;
    const next = currentAccumulatedFrames + sentenceFrames;
    if (frame >= currentAccumulatedFrames && frame < next) {
      activeIndex = i;
      break;
    }
    currentAccumulatedFrames = next;
  }

  return (
    <p style={{
      fontSize: '75px',
      fontWeight: 'bold',
      lineHeight: '1.45',
      textAlign: 'center',
      color: 'white',
      margin: 0,
      textShadow: '2px 2px 6px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.6)',
      whiteSpace: 'nowrap',
    }}>
      {chunks[activeIndex]}
    </p>
  );
};

// --- スライド用コンポーネント ---
const BreakEvenTable = () => (
  <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5E1', padding: '100px', borderRadius: '40px', margin: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
    <h2 style={{ fontSize: '90px', color: '#c0392b', fontWeight: 'bold', marginBottom: '40px' }}>受給開始年齢別の損益分岐点・早見表</h2>
    <div style={{ display: 'flex', fontSize: '70px', width: '90%', justifyContent: 'space-between', borderBottom: '6px solid #ccc', paddingBottom: '20px', fontWeight: 'bold' }}>
      <span style={{ color: '#2980b9' }}>受給開始年齢</span>
      <span style={{ color: '#c0392b' }}>損益分岐点（追い抜く年齢）</span>
    </div>
    <div style={{ display: 'flex', fontSize: '70px', width: '90%', justifyContent: 'space-between', marginTop: '30px' }}>
      <span>60歳 (繰り上げ)</span>
      <span style={{ fontWeight: 'bold' }}>80歳10ヶ月</span>
    </div>
    <div style={{ display: 'flex', fontSize: '70px', width: '90%', justifyContent: 'space-between', marginTop: '30px' }}>
      <span>65歳 (原則)</span>
      <span style={{ fontWeight: 'bold' }}>-</span>
    </div>
    <div style={{ display: 'flex', fontSize: '70px', width: '90%', justifyContent: 'space-between', marginTop: '30px' }}>
      <span>70歳 (繰り下げ)</span>
      <span style={{ fontWeight: 'bold' }}>81歳11ヶ月</span>
    </div>
    <div style={{ display: 'flex', fontSize: '70px', width: '90%', justifyContent: 'space-between', marginTop: '30px' }}>
      <span>75歳 (繰り下げ)</span>
      <span style={{ fontWeight: 'bold' }}>86歳11ヶ月</span>
    </div>
  </AbsoluteFill>
);

const TaxTrap = () => (
  <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEBEB', padding: '100px', borderRadius: '40px', margin: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
    <h2 style={{ fontSize: '110px', color: '#c0392b', fontWeight: 'bold', marginBottom: '60px' }}>隠れた罠：税金と社会保険料</h2>
    <div style={{ fontSize: '180px' }}>💸 💸 💸</div>
    <h3 style={{ fontSize: '80px', fontWeight: 'bold', minWidth: '80%', textAlign: 'center', marginTop: '40px', backgroundColor: 'white', padding: '40px', borderRadius: '30px', border: '8px solid #e74c3c' }}>
      ❌ 所得税 <br />
      ❌ 住民税 <br />
      ❌ 健康保険・介護保険
    </h3>
    <p style={{ fontSize: '70px', marginTop: '40px', fontWeight: 'bold', color: '#333' }}>額面が42%増えても、手取りは30%増！？</p>
  </AbsoluteFill>
);

// 新しい Illustration コンポーネント。各シーンの背景画像（または assets-manifest の任意パス）を表示するか、特定シーンではスライドを表示する
const Illustration: React.FC<{ sceneId: string; backgroundSrc?: string }> = ({
  sceneId,
  backgroundSrc,
}) => {
  // 解説スライドを復元するシーン
  if (sceneId === "scene6" || sceneId === "scene7") {
    return <BreakEvenTable />;
  }
  if (sceneId === "scene11") {
    return <TaxTrap />;
  }

  // それ以外のシーンは生成したイラスト・背景を表示（backgroundSrc があればファイル名の自由指定）
  const bgSrc = backgroundSrc ?? staticFile(`${sceneId}_bg.png`);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <img 
        src={bgSrc} 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover' // 幅広になるため、上下が少しクロップされてフル画面表示されます
        }} 
      />
    </AbsoluteFill>
  );
};

export const MyVideo: React.FC<{
  scenes: any[];
}> = ({ scenes }) => {
  if (!scenes || scenes.length === 0) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: "#E5E5E5", color: "#333", fontFamily: "'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif" }}>
      <Series>
        {scenes.map((scene) => {
          return (
            <Series.Sequence key={scene.id} durationInFrames={scene.durationFrames}>
              <AbsoluteFill>
                <Audio src={scene.audioSrc} />
                
                {/* 画面の上75%にAI生成のイラスト、または解説スライドを表示 */}
                <AbsoluteFill style={{ bottom: '25%', height: '75%' }}>
                  <Illustration sceneId={scene.id} backgroundSrc={scene.backgroundSrc} />
                </AbsoluteFill>

                {/* 画面の下25%にテロップを表示（背景透明・黄色ボーダーなし） */}
                <AbsoluteFill style={{
                  top: '75%',
                  height: '25%',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '40px 80px',
                  backgroundColor: 'transparent',
                }}>
                  <Telop text={scene.text} durationFrames={scene.durationFrames} />
                </AbsoluteFill>

              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
