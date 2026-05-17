// ---- ユーティリティ ----
async function safeFetch(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      `サーバーが JSON ではなく HTML を返しました（HTTP ${r.status}）。別アプリが ${r.url} にいるか、古い npm run app が動いています。\n` +
        "対処①: すべての「npm run app」ウィンドウを閉じ、プロジェクトフォルダで改めて npm run app。\n" +
        "対処②（確実）: ターミナルで npm run reset-project はい（ブラウザ不要）"
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("不正なレスポンス: " + text.slice(0, 120));
  }
}

// ---- ① 台本 ----
async function loadConfig() {
  try {
    const d = await safeFetch("/api/config");
    if (d.ok) {
      document.getElementById("script").value = d.content || "";
      try {
        const scenes = JSON.parse(d.content || "[]");
        if (Array.isArray(scenes)) { buildTtsPanel(scenes); buildTelopPanel(scenes); }
      } catch {}
    }
  } catch {}
}

document.getElementById("saveScript").addEventListener("click", async () => {
  const el = document.getElementById("scriptStatus");
  try {
    const d = await safeFetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: document.getElementById("script").value }),
    });
    el.textContent = d.ok ? "保存しました" : d.error || "失敗";
    el.style.color = d.ok ? "#15803d" : "#b91c1c";
    if (d.ok) {
      try {
        const scenes = JSON.parse(document.getElementById("script").value || "[]");
        if (Array.isArray(scenes)) { buildTtsPanel(scenes); buildTelopPanel(scenes); }
      } catch {}
    }
  } catch (e) {
    el.textContent = String(e.message || e); el.style.color = "#b91c1c";
  }
});

// ---- ② 画像 ----
document.getElementById("imgFiles").addEventListener("change", async () => {
  const st = document.getElementById("uploadStatus");
  st.textContent = "アップロード中…";
  try {
    const input = document.getElementById("imgFiles");
    const fd = new FormData();
    for (let i = 0; i < input.files.length; i++) fd.append("files", input.files[i]);
    const d = await safeFetch("/api/upload/images", { method: "POST", body: fd });
    st.textContent = d.ok ? d.message || "画像を保存しました" : d.error || "失敗";
  } catch (e) { st.textContent = String(e.message || e); }
  document.getElementById("imgFiles").value = "";
});

document.getElementById("syncAssets").addEventListener("click", async () => {
  const st = document.getElementById("uploadStatus");
  st.textContent = "更新中…";
  try {
    const d = await safeFetch("/api/sync-assets", { method: "POST" });
    if (d.ok && d.manifest) {
      st.textContent = `更新済み（音声 ${d.manifest.audio?.length || 0} / 画像 ${d.manifest.images?.length || 0}）`;
    } else { st.textContent = d.ok ? "更新しました" : d.error || "失敗"; }
  } catch (e) { st.textContent = String(e.message || e); }
});

document.getElementById("openImagesFolder").addEventListener("click", async () => {
  try {
    await safeFetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "images" }),
    });
  } catch (e) { alert("フォルダを開けませんでした: " + String(e.message || e)); }
});

// ---- ③ 音声生成 ----
let currentProvider = "elevenlabs";

// プロバイダータブの切替
document.querySelectorAll(".provider-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    currentProvider = btn.dataset.provider;
    document.querySelectorAll(".provider-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("elevenlabsForm").style.display = currentProvider === "elevenlabs" ? "" : "none";
    document.getElementById("openaiForm").style.display = currentProvider === "openai"  ? "" : "none";
    document.getElementById("aivisForm").style.display  = currentProvider === "aivis"   ? "" : "none";
    document.getElementById("geminiForm").style.display = currentProvider === "gemini"  ? "" : "none";
    document.getElementById("xaiForm").style.display     = currentProvider === "xai"     ? "" : "none";
  });
});

async function loadTtsSettings() {
  try {
    const d = await safeFetch("/api/tts/settings");
    if (d.ok) {
      if (d.openaiApiKey)      document.getElementById("openaiApiKey").value   = d.openaiApiKey;
      if (d.openaiVoice)       document.getElementById("openaiVoice").value    = d.openaiVoice;
      if (d.openaiModel)       document.getElementById("openaiModel").value    = d.openaiModel;
      if (d.aivisApiKey)       document.getElementById("aivisApiKey").value     = d.aivisApiKey;
      if (d.aivisModelUuid)    document.getElementById("aivisModelUuid").value  = d.aivisModelUuid;
      if (d.ttsSpeed != null) {
        const slider = document.getElementById("ttsSpeed");
        if (slider) { slider.value = d.ttsSpeed; updateSpeedLabel(d.ttsSpeed); }
      }
      if (d.geminiApiKey)      document.getElementById("geminiApiKey").value    = d.geminiApiKey;
      if (d.geminiModel)       document.getElementById("geminiModel").value     = d.geminiModel;
      if (d.geminiVoice)       document.getElementById("geminiVoice").value     = d.geminiVoice;
      if (d.geminiInstruction) document.getElementById("geminiInstruction").value = d.geminiInstruction;
      if (d.xaiApiKey)       document.getElementById("xaiApiKey").value       = d.xaiApiKey;
      if (d.xaiVoice)        document.getElementById("xaiVoice").value        = d.xaiVoice;
      if (d.xaiLanguage)     document.getElementById("xaiLanguage").value     = d.xaiLanguage;
      if (d.elevenlabsApiKey) document.getElementById("elevenlabsApiKey").value = d.elevenlabsApiKey;
      if (d.elevenlabsVoiceId) document.getElementById("elevenlabsVoiceId").value = d.elevenlabsVoiceId;
      if (d.elevenlabsVoiceIdB) document.getElementById("elevenlabsVoiceIdB").value = d.elevenlabsVoiceIdB;
      if (d.elevenlabsModel) document.getElementById("elevenlabsModel").value = d.elevenlabsModel;
      if (d.elevenlabsLanguage) document.getElementById("elevenlabsLanguage").value = d.elevenlabsLanguage;
      if (d.elevenlabsApiKey) {
        currentProvider = "elevenlabs";
        document.querySelectorAll(".provider-tab").forEach((b) => {
          b.classList.toggle("active", b.dataset.provider === "elevenlabs");
        });
        document.getElementById("elevenlabsForm").style.display = "";
        document.getElementById("openaiForm").style.display = "none";
        document.getElementById("aivisForm").style.display = "none";
        document.getElementById("geminiForm").style.display = "none";
        document.getElementById("xaiForm").style.display = "none";
      }
    }
  } catch {}
}

function getTtsParams() {
  const isGemini = currentProvider === "gemini";
  const isOpenai = currentProvider === "openai";
  const isAivis  = currentProvider === "aivis";
  const isXai    = currentProvider === "xai";
  const isElevenlabs = currentProvider === "elevenlabs";
  return {
    provider: currentProvider,
    apiKey: isElevenlabs
      ? document.getElementById("elevenlabsApiKey").value.trim()
      : isGemini
      ? document.getElementById("geminiApiKey").value.trim()
      : isOpenai
      ? document.getElementById("openaiApiKey").value.trim()
      : isAivis
      ? document.getElementById("aivisApiKey").value.trim()
      : isXai
      ? document.getElementById("xaiApiKey").value.trim()
      : "",
    voiceId: isElevenlabs
      ? document.getElementById("elevenlabsVoiceId").value.trim()
      : isGemini
      ? document.getElementById("geminiVoice").value
      : isOpenai
      ? document.getElementById("openaiVoice").value
      : isAivis
      ? document.getElementById("aivisModelUuid").value.trim()
      : isXai
      ? document.getElementById("xaiVoice").value
      : "",
    voiceIdB: isElevenlabs
      ? document.getElementById("elevenlabsVoiceIdB").value.trim()
      : "",
    instruction: isGemini
      ? document.getElementById("geminiInstruction").value.trim()
      : "",
    model: isElevenlabs
      ? document.getElementById("elevenlabsModel").value
      : isGemini
      ? document.getElementById("geminiModel").value
      : isOpenai
      ? document.getElementById("openaiModel").value
      : "",
    ttsLanguage: isElevenlabs
      ? document.getElementById("elevenlabsLanguage").value.trim()
      : isXai
      ? document.getElementById("xaiLanguage").value
      : "",
    speed: parseFloat(document.getElementById("ttsSpeed")?.value || "1.0"),
  };
}

document.getElementById("generateAudio").addEventListener("click", async () => {
  const st = document.getElementById("audioStatus");
  const log = document.getElementById("audioLog");
  const params = getTtsParams();

  if (!params.apiKey) {
    st.textContent = "API キーを入力してください";
    st.style.color = "#b91c1c"; return;
  }

  st.textContent = "生成中…（シーン数によっては数分かかります）";
  st.style.color = "#92400e";
  log.style.display = "none";

  try {
    const d = await safeFetch("/api/tts/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const note = d.ok
      ? (d.note || "完了") + "\n\n⚠️ プレビューの「停止」→「起動」を押すと音声が反映されます"
      : d.note || "エラー";
    st.textContent = note;
    st.style.color = d.ok ? "#15803d" : "#b91c1c";
    log.style.display = "block";
    log.textContent = (d.results || []).map((r) =>
      r.skipped ? `scene${r.scene}: スキップ` :
      r.ok ? `scene${r.scene}: ✓ ${r.file}${r.tag ? " " + r.tag : ""}` :
      `scene${r.scene}: ✗ ${r.error}`
    ).join("\n");
  } catch (e) {
    st.textContent = String(e.message || e); st.style.color = "#b91c1c";
  }
});

// ---- ③-2 読み上げ修正パネル ----
function buildTtsPanel(scenes) {
  const panel = document.getElementById("ttsPanel");
  if (!scenes || scenes.length === 0) {
    panel.innerHTML = '<p class="muted-text">台本を保存すると自動で一覧が表示されます。</p>';
    return;
  }

  const rows = scenes.map((s, i) => {
    const speechPh = (s.speech_text || "")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    const tts = (s.ttsText || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const sp = String(s.speaker || "a").trim().toLowerCase();
    const selA = (sp === "a" || sp === "1" || sp === "speaker1" || sp === "host1") ? "selected" : "";
    const selB = (sp === "b" || sp === "2" || sp === "speaker2" || sp === "host2" || sp === "guest") ? "selected" : "";
    return `
      <tr>
        <td class="tts-num">${i + 1}</td>
        <td class="tts-telop">${(s.text || "").replace(/</g, "&lt;")}</td>
        <td style="padding:4px 6px;vertical-align:middle;white-space:nowrap">
          <select class="tts-speaker" data-index="${i}" title="話者（ElevenLabs 用）"
            style="font-size:0.82em;padding:2px 4px;border:1px solid #cbd5e1;border-radius:4px;background:#f8fafc">
            <option value="a" ${selA}>話者 A</option>
            <option value="b" ${selB}>話者 B</option>
          </select>
        </td>
        <td class="tts-input-cell">
          <input type="text" class="tts-input" data-index="${i}"
            value="${tts}" placeholder="${speechPh}" />
        </td>
        <td class="tts-action">
          <button type="button" class="btn tts-regen" data-index="${i}" title="このシーンだけ再生成">🔄</button>
          <span class="tts-scene-status" id="ttsScene${i}"></span>
        </td>
      </tr>`;
  }).join("");

  panel.innerHTML = `
    <table class="tts-table">
      <thead>
        <tr>
          <th>#</th>
          <th>テロップ（表示）</th>
          <th style="white-space:nowrap">話者</th>
          <th>読み上げ（空欄 = 台本 JSON の speech_text と同じ）</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  panel.querySelectorAll(".tts-regen").forEach((btn) => {
    btn.addEventListener("click", () => regenScene(Number(btn.dataset.index)));
  });
}

async function regenScene(index) {
  const st = document.getElementById(`ttsScene${index}`);
  const params = getTtsParams();
  if (!params.apiKey) {
    st.textContent = "API キーを入力してください";
    st.style.color = "#b91c1c"; return;
  }
  st.textContent = "生成中…"; st.style.color = "#92400e";
  try {
    const d = await safeFetch("/api/tts/generate-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sceneIndex: index }),
    });
    st.textContent = d.ok
      ? `✓ ${d.file}${d.note ? " " + d.note : ""}`
      : `✗ ${d.error}`;
    st.style.color = d.ok ? "#15803d" : "#b91c1c";
  } catch (e) {
    st.textContent = String(e.message || e); st.style.color = "#b91c1c";
  }
}

document.getElementById("saveTtsText").addEventListener("click", async () => {
  const st = document.getElementById("ttsStatus");
  st.textContent = "保存中…"; st.style.color = "#92400e";
  try {
    const d = await safeFetch("/api/config");
    if (!d.ok) throw new Error(d.error || "台本の読み込みに失敗");
    let config = JSON.parse(d.content || "[]");
    if (!Array.isArray(config)) throw new Error("台本が配列ではありません");

    document.querySelectorAll(".tts-input").forEach((input) => {
      const i = Number(input.dataset.index);
      if (config[i]) {
        const val = input.value.trim();
        if (val) {
          config[i].ttsText = val;
        } else {
          delete config[i].ttsText;
        }
      }
    });

    document.querySelectorAll(".tts-speaker").forEach((sel) => {
      const i = Number(sel.dataset.index);
      if (config[i]) {
        config[i].speaker = sel.value;
      }
    });

    const d2 = await safeFetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: JSON.stringify(config, null, 2) }),
    });
    st.textContent = d2.ok ? "保存しました" : d2.error || "失敗";
    st.style.color = d2.ok ? "#15803d" : "#b91c1c";
    // テキストエリアも更新
    document.getElementById("script").value = JSON.stringify(config, null, 2);
  } catch (e) {
    st.textContent = String(e.message || e); st.style.color = "#b91c1c";
  }
});

// ---- ③-3 読み上げ辞書 ----
let currentDict = [];

async function loadDictionary() {
  try {
    const d = await safeFetch("/api/dictionary");
    if (d.ok) {
      currentDict = d.dictionary || [];
      renderDictTable();
    }
  } catch {}
}

function renderDictTable() {
  const tbody = document.getElementById("dictBody");
  tbody.innerHTML = currentDict.map((d, i) => `
    <tr>
      <td><input type="text" class="tts-input dict-from" value="${d.from || ""}" placeholder="名刺" /></td>
      <td><input type="text" class="tts-input dict-to" value="${d.to || ""}" placeholder="めいし" /></td>
      <td class="tts-action">
        <button type="button" class="btn tts-regen remove-dict" data-index="${i}" title="削除" style="color: #ef4444;">×</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".remove-dict").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentDict.splice(Number(btn.dataset.index), 1);
      renderDictTable();
    });
  });
}

document.getElementById("addDictRow").addEventListener("click", () => {
  currentDict.push({ from: "", to: "" });
  renderDictTable();
});

document.getElementById("saveDict").addEventListener("click", async () => {
  const st = document.getElementById("dictStatus");
  st.textContent = "保存して台本に適用中…"; st.style.color = "#92400e";

  // テーブルから最新の辞書を取得
  const newDict = [];
  document.querySelectorAll("#dictBody tr").forEach(tr => {
    const from = tr.querySelector(".dict-from").value.trim();
    const to = tr.querySelector(".dict-to").value.trim();
    if (from && to) newDict.push({ from, to });
  });
  currentDict = newDict;

  try {
    // 辞書を保存
    await safeFetch("/api/dictionary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dictionary: currentDict }),
    });

    // 台本を取得して辞書を適用
    const d = await safeFetch("/api/config");
    if (!d.ok) throw new Error("台本の読み込みに失敗");
    let config = JSON.parse(d.content || "[]");

    if (Array.isArray(config)) {
      config.forEach(scene => {
        const baseRead = ((scene.speech_text || "").trim() || (scene.text || "").trim());
        let appliedText = baseRead;
        currentDict.forEach(rule => {
          appliedText = appliedText.split(rule.from).join(rule.to);
        });
        if (appliedText !== baseRead) {
          scene.ttsText = appliedText;
        } else {
          delete scene.ttsText;
        }
      });

      // 適用した台本を保存
      await safeFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(config, null, 2) }),
      });

      // 画面上のテキストエリアと上の読み上げパネルを更新
      document.getElementById("script").value = JSON.stringify(config, null, 2);
      buildTtsPanel(config);
    }

    st.textContent = "適用完了しました。③-1で音声を再生成してください";
    st.style.color = "#15803d";
    renderDictTable(); // 空行を消すために再描画
  } catch (e) {
    st.textContent = String(e.message || e); st.style.color = "#b91c1c";
  }
});

// ---- ④ テロップスタイル ----
async function loadStyle() {
  try {
    const d = await safeFetch("/api/telop-style");
    if (!d.ok || !d.style) return;
    const s = d.style;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    set("stFontSize", s.fontSize);
    set("stColor", s.color ? (s.color.startsWith("#") ? s.color : colorNameToHex(s.color)) : "#ffffff");
    set("stFont", s.fontFamily);
    set("stWeight", s.fontWeight);
    set("stBg", s.background);
    set("stPosition", s.position);
    set("stShadow", String(s.shadow));
    set("stMaxChars", s.maxCharsPerLine);
  } catch {}
}

function colorNameToHex(name) {
  const map = { white: "#ffffff", black: "#000000", yellow: "#ffff00", red: "#ff0000" };
  return map[name] || "#ffffff";
}

document.getElementById("saveStyle").addEventListener("click", async () => {
  const el = document.getElementById("styleStatus");
  const style = {
    fontSize: Number(document.getElementById("stFontSize").value) || 75,
    color: document.getElementById("stColor").value,
    fontFamily: document.getElementById("stFont").value,
    fontWeight: document.getElementById("stWeight").value,
    background: document.getElementById("stBg").value,
    position: document.getElementById("stPosition").value,
    shadow: document.getElementById("stShadow").value === "true",
    maxCharsPerLine: Number(document.getElementById("stMaxChars").value) || 22,
  };
  try {
    const d = await safeFetch("/api/telop-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style }),
    });
    el.textContent = d.ok ? "保存しました（プレビューを再読み込みで反映）" : d.error || "失敗";
    el.style.color = d.ok ? "#15803d" : "#b91c1c";
  } catch (e) { el.textContent = String(e.message || e); el.style.color = "#b91c1c"; }
});

// ---- ⑤ エクスポート ----
async function doExport(kind, label) {
  const el = document.getElementById("exportStatus");
  el.textContent = label + "…（完了まで待機。進捗は npm run app のターミナルを見てください）";
  el.style.color = "#475569";
  try {
    const d = await safeFetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    el.style.color = d.ok ? "#15803d" : "#b91c1c";
    el.textContent = d.ok
      ? "完了\n" + (d.files || []).join("\n") + (d.note ? "\n\n" + d.note : "")
      : "エラー: " + (d.error || "不明");
  } catch (e) { el.textContent = String(e.message || e); el.style.color = "#b91c1c"; }
}

document.getElementById("exMp4").addEventListener("click", () => doExport("mp4", "MP4 レンダー"));
document.getElementById("exSrt").addEventListener("click", () => doExport("srt", "SRT 出力"));
document.getElementById("exSplit").addEventListener("click", () => doExport("split", "分離レンダー"));
document.getElementById("exBundle").addEventListener("click", () => doExport("bundle", "バラバラ一括"));

// ---- ⑥ プレビュー ----
const previewFrame = document.getElementById("previewFrame");
const previewPlaceholder = document.getElementById("iframePlaceholder");
const previewStatusEl = document.getElementById("previewStatus");
let pollTimer = null;

function showPreview(url) {
  if (previewFrame.src !== url) previewFrame.src = url;
  previewFrame.style.display = "block";
  previewPlaceholder.style.display = "none";
}

function hidePreview() {
  previewFrame.src = "";
  previewFrame.style.display = "none";
  previewPlaceholder.style.display = "flex";
}

async function checkPreviewStatus() {
  try {
    const d = await safeFetch("/api/preview/status");
    if (d.running && d.ready) {
      previewStatusEl.textContent = "起動中"; previewStatusEl.style.color = "#15803d";
      showPreview(d.url); stopPolling();
    } else if (d.running) {
      previewStatusEl.textContent = "ビルド中…"; previewStatusEl.style.color = "#92400e";
    } else {
      previewStatusEl.textContent = ""; hidePreview(); stopPolling();
    }
  } catch {}
}

function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function startPolling() { stopPolling(); pollTimer = setInterval(checkPreviewStatus, 3000); }

document.getElementById("startPreview").addEventListener("click", async () => {
  previewStatusEl.textContent = "起動中…（ビルドに20〜40秒かかります）";
  previewStatusEl.style.color = "#92400e";
  previewPlaceholder.textContent = "ビルド中です。しばらくお待ちください…";
  try {
    const d = await safeFetch("/api/preview/start", { method: "POST" });
    if (d.ok) startPolling();
    else { previewStatusEl.textContent = d.error || "失敗"; previewStatusEl.style.color = "#b91c1c"; }
  } catch (e) { previewStatusEl.textContent = String(e.message || e); previewStatusEl.style.color = "#b91c1c"; }
});

document.getElementById("stopPreview").addEventListener("click", async () => {
  stopPolling();
  await safeFetch("/api/preview/stop", { method: "POST" }).catch(() => {});
  previewStatusEl.textContent = "停止しました"; previewStatusEl.style.color = "#64748b";
  hidePreview();
  previewPlaceholder.textContent = "「起動」を押すと Remotion Studio がここに表示されます";
});

// ---- ⑥ テロップ直接編集パネル ----
const telopDebounceMap = {};

function buildTelopPanel(scenes) {
  const panel = document.getElementById("telopPanel");
  if (!scenes || scenes.length === 0) {
    panel.innerHTML = '<p class="muted-text">台本を保存すると自動で一覧が表示されます。</p>';
    return;
  }

  // テーブル骨格だけ innerHTML で作成（ユーザーデータは含めない）
  panel.innerHTML = `
    <table class="telop-table">
      <thead>
        <tr>
          <th style="width:52px">#</th>
          <th>テロップテキスト（編集すると自動保存）</th>
        </tr>
      </thead>
      <tbody id="telopTbody"></tbody>
    </table>`;

  const tbody = panel.querySelector("#telopTbody");

  scenes.forEach((s, i) => {
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.className = "telop-num";
    tdNum.textContent = String(i + 1);

    const tdCell = document.createElement("td");
    tdCell.className = "telop-edit-cell";

    const ta = document.createElement("textarea");
    ta.className = "telop-textarea";
    ta.dataset.index = String(i);
    ta.value = s.text || "";        // .value なら HTML エスケープ不要

    const st = document.createElement("span");
    st.className = "telop-scene-status";
    st.id = `telopScene${i}`;

    tdCell.appendChild(ta);
    tdCell.appendChild(st);
    tr.appendChild(tdNum);
    tr.appendChild(tdCell);
    tbody.appendChild(tr);

    autoResizeTextarea(ta);

    ta.addEventListener("input", () => {
      autoResizeTextarea(ta);
      st.textContent = "…";
      st.style.color = "#92400e";
      clearTimeout(telopDebounceMap[i]);
      telopDebounceMap[i] = setTimeout(() => saveTelopScene(i, ta.value, st), 600);
    });
  });
}

function autoResizeTextarea(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

async function saveTelopScene(index, text, statusEl) {
  try {
    const d = await safeFetch("/api/config/scene", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, text }),
    });
    if (d.ok) {
      statusEl.textContent = "✓ 保存";
      statusEl.className = "telop-scene-status saved";
      // ① のテキストエリアも同期
      if (d.config) document.getElementById("script").value = JSON.stringify(d.config, null, 2);
      setTimeout(() => {
        statusEl.textContent = "";
        statusEl.className = "telop-scene-status";
      }, 2000);
    } else {
      statusEl.textContent = "✗ " + (d.error || "失敗");
      statusEl.className = "telop-scene-status error";
    }
  } catch (e) {
    if (statusEl) { statusEl.textContent = "✗ " + String(e.message || e); statusEl.className = "telop-scene-status error"; }
  }
}

// ---- ⑧ 前作データ全消去 ----
const resetModal = document.getElementById("resetModal");
const resetConfirmInput = document.getElementById("resetConfirmInput");
const resetModalStatus = document.getElementById("resetModalStatus");
const resetBanner = document.getElementById("resetBanner");

function openResetModal() {
  if (!resetModal) return;
  resetModal.classList.add("is-open");
  resetModal.setAttribute("aria-hidden", "false");
  if (resetConfirmInput) {
    resetConfirmInput.value = "";
    resetConfirmInput.focus();
  }
  if (resetModalStatus) {
    resetModalStatus.textContent = "";
    resetModalStatus.style.color = "";
  }
}

function closeResetModal() {
  if (!resetModal) return;
  resetModal.classList.remove("is-open");
  resetModal.setAttribute("aria-hidden", "true");
  if (resetConfirmInput) resetConfirmInput.value = "";
  if (resetModalStatus) {
    resetModalStatus.textContent = "";
    resetModalStatus.style.color = "";
  }
}

const openResetBtn = document.getElementById("openResetModal");
if (openResetBtn) openResetBtn.addEventListener("click", openResetModal);
const resetModalCancel = document.getElementById("resetModalCancel");
if (resetModalCancel) resetModalCancel.addEventListener("click", closeResetModal);
const resetModalBackdrop = document.getElementById("resetModalBackdrop");
if (resetModalBackdrop) resetModalBackdrop.addEventListener("click", closeResetModal);

const resetModalDo = document.getElementById("resetModalDo");
if (resetModalDo) {
  resetModalDo.addEventListener("click", async () => {
    const phrase = (resetConfirmInput && resetConfirmInput.value.trim()) || "";
    if (phrase !== "はい" && phrase !== "はい！") {
      if (resetModalStatus) {
        resetModalStatus.textContent = "「はい」または「はい！」とだけ入力してください（前後のスペースなし）。";
        resetModalStatus.style.color = "#b91c1c";
      }
      return;
    }
    if (resetModalStatus) {
      resetModalStatus.textContent = "削除・初期化を実行しています…";
      resetModalStatus.style.color = "#92400e";
    }
    try {
      const resetApi = new URL("/api/reset-new-video", window.location.href).href;
      const d = await safeFetch(resetApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase: phrase }),
      });
      if (!d.ok) {
        if (resetModalStatus) {
          resetModalStatus.textContent = d.error || "失敗";
          resetModalStatus.style.color = "#b91c1c";
        }
        return;
      }
      await safeFetch("/api/preview/stop", { method: "POST" }).catch(() => {});
      stopPolling();
      hidePreview();
      if (previewStatusEl) {
        previewStatusEl.textContent = "停止しました";
        previewStatusEl.style.color = "#64748b";
      }
      if (previewPlaceholder) {
        previewPlaceholder.textContent = "「起動」を押すと Remotion Studio がここに表示されます";
      }
      await loadConfig();
      await loadDictionary();
      await loadStyle();
      const ex = document.getElementById("exportStatus");
      if (ex) ex.textContent = "";
      const upl = document.getElementById("uploadStatus");
      if (upl) upl.textContent = "";
      const scriptSt = document.getElementById("scriptStatus");
      if (scriptSt) {
        scriptSt.textContent = "新規状態にリセットしました";
        scriptSt.style.color = "#15803d";
      }
      if (resetBanner) {
        resetBanner.hidden = false;
        resetBanner.textContent = "前作データを消去しました:\n" + (d.cleared || []).join("\n");
        resetBanner.style.color = "#065f46";
      }
      closeResetModal();
    } catch (e) {
      if (resetModalStatus) {
        resetModalStatus.textContent = String(e.message || e);
        resetModalStatus.style.color = "#b91c1c";
      }
    }
  });
}

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && resetModal && resetModal.classList.contains("is-open")) {
    closeResetModal();
  }
});

// ---- 初期ロード ----
(async () => {
  try {
    const h = await safeFetch("/health");
    if (h.ok) {
      const missing = [];
      if (!h.features?.resetProject) missing.push("前作全消去など");
      if (!h.features?.xaiTts) missing.push("Grok（xAI）TTS");
      if (!h.features?.elevenlabsTts) missing.push("ElevenLabs v3");
      if (missing.length > 0) {
        const el = document.getElementById("serverStaleBanner");
        if (el) {
          el.hidden = false;
          el.textContent =
            `※ 動画アプリのサーバーが古い可能性があります（${missing.join("・")}が使えません）。` +
            "「npm run app」のウィンドウをすべて閉じてから、プロジェクト直下でもう一度起動してください。";
        }
      }
    }
  } catch {
    /* オフライン等は無視 */
  }
})();
checkPreviewStatus();
loadConfig();
loadDictionary();
loadStyle();
loadTtsSettings();


// ---- スピードスライダー ----
function updateSpeedLabel(val) {
  const label = document.getElementById("ttsSpeedLabel");
  if (label) label.textContent = parseFloat(val).toFixed(2) + "x";
}

(function () {
  const slider = document.getElementById("ttsSpeed");
  if (slider) {
    slider.addEventListener("input", () => updateSpeedLabel(slider.value));
    updateSpeedLabel(slider.value);
  }
})();

// ---- ElevenLabs 設定を .env に保存 ----
document.getElementById("saveElevenlabsSettings")?.addEventListener("click", async () => {
  const status = document.getElementById("elevenlabsSaveStatus");
  status.textContent = "保存中…";
  status.style.color = "#64748b";
  try {
    const body = {
      elevenlabsApiKey:   document.getElementById("elevenlabsApiKey").value.trim(),
      elevenlabsVoiceId:  document.getElementById("elevenlabsVoiceId").value.trim(),
      elevenlabsVoiceIdB: document.getElementById("elevenlabsVoiceIdB").value.trim(),
      elevenlabsModel:    document.getElementById("elevenlabsModel").value,
      elevenlabsLanguage: document.getElementById("elevenlabsLanguage").value.trim(),
    };
    const d = await safeFetch("/api/tts/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (d.ok) {
      status.textContent = "✓ .env に保存しました";
      status.style.color = "#16a34a";
    } else {
      status.textContent = "エラー: " + (d.error || "不明");
      status.style.color = "#b91c1c";
    }
  } catch (e) {
    status.textContent = "エラー: " + e.message;
    status.style.color = "#b91c1c";
  }
  setTimeout(() => { status.textContent = ""; }, 4000);
});
