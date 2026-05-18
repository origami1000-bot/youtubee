import os
import sys
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types

st.set_page_config(
    page_title="BLOG affiliate",
    page_icon=None,
    layout="centered",
)

# ─── LP-style CSS ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
  /* ページ全体 */
  .block-container {
    padding-top: 3rem;
    padding-bottom: 4rem;
    max-width: 680px;
  }

  /* ヒーローヘッダー */
  .hero {
    text-align: center;
    padding: 2.8rem 0 2rem;
  }
  .hero-eyebrow {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #5b8dee;
    margin-bottom: 0.6rem;
  }
  .hero-title {
    font-size: 2.4rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.15;
    color: #f0f2f6;
    margin: 0 0 0.7rem;
  }
  .hero-sub {
    font-size: 0.92rem;
    color: #8b95a8;
    margin: 0;
  }

  /* セクションラベル */
  .field-label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8b95a8;
    margin-bottom: 0.35rem;
    margin-top: 1.4rem;
  }

  /* 入力欄 */
  .stTextInput input,
  .stTextArea textarea {
    font-size: 0.95rem !important;
    border-radius: 8px !important;
  }

  /* 生成ボタン */
  div[data-testid="stFormSubmitButton"] button {
    width: 100%;
    padding: 0.75rem 0;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 10px;
    margin-top: 1.6rem;
  }

  /* ステップバッジ */
  .step-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 1.2rem 0 0.4rem;
  }
  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #1e3a5f;
    color: #7eb8f7;
    font-size: 0.7rem;
    font-weight: 700;
    flex-shrink: 0;
  }
  .step-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #7eb8f7;
    letter-spacing: 0.06em;
  }

  /* 結果セクションタイトル */
  .result-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: #f0f2f6;
    margin: 2.4rem 0 0.2rem;
    letter-spacing: -0.01em;
  }
  .result-sub {
    font-size: 0.82rem;
    color: #8b95a8;
    margin-bottom: 1rem;
  }

  /* タブ */
  .stTabs [data-baseweb="tab"] {
    font-size: 0.85rem;
    font-weight: 600;
  }

  /* 区切り線 */
  hr { border-color: #262730; }
</style>
""", unsafe_allow_html=True)

# ─── Hero Header ──────────────────────────────────────────────────────────────
st.markdown("""
<div class="hero">
  <p class="hero-eyebrow">Powered by Gemini 3.1 Pro</p>
  <h1 class="hero-title">BLOG affiliate</h1>
  <p class="hero-sub">キーワードを入力するだけで、SEO最適化された<br>アフィリエイト記事を6ステップで自動生成します。</p>
</div>
""", unsafe_allow_html=True)
st.divider()

# ─── Gemini client ───────────────────────────────────────────────────────────
@st.cache_resource
def get_client():
    api_key = os.environ.get("GOOGLE_AI_STUDIO_API_KEY", "")
    if not api_key:
        st.error("GOOGLE_AI_STUDIO_API_KEY が .env に見つかりません。")
        st.stop()
    return genai.Client(api_key=api_key)

MODEL = "gemini-3.1-pro-preview"

def run_agent(client, system_prompt, user_message):
    response = client.models.generate_content(
        model=MODEL,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=8000,
        ),
        contents=user_message,
    )
    return response.text

# ─── Step functions (same prompts as pipeline) ───────────────────────────────

def step1_structure(client, keyword, primary_info, target, affiliate_url):
    return run_agent(client,
        system_prompt="""あなたはSEOブログの構成専門家です。
見出し構成だけを作ってください。それ以外は一切やらないこと。

アフィリリンクURLが渡された場合は、URLからサービス・商品名を推測して構成に反映すること。

必ず以下を含めること：
・冒頭の共感ブロック
・緊急性ブロック（タイムリミット）
・体験談ブロック
・CTAへの導線ブロック
・まとめ""",
        user_message=f"キーワード：{keyword}\n1次情報：{primary_info}\nターゲット：{target}\nアフィリリンクURL：{affiliate_url}"
    )

def step2_article(client, structure, feedback=""):
    extra = f"\n\n【改善指示】\n{feedback}" if feedback else ""
    return run_agent(client,
        system_prompt="""あなたはアフィリエイト記事の本文ライターです。
以下のルールを必ず守ること。それ以外は一切やらないこと。

【文章構造：必ずこの順序で書くこと】
・導入文：読者の悩みを言語化→「私もそうでした」で共感→記事を読むメリットを提示
・実体験：具体的な数値（○回目、○ヶ月後）、ビフォーアフターを入れる
・メリット・デメリット：必ず両方書いてデメリットには補足をセットで入れる
・まとめ：要点3〜5つ→行動した先の明るい未来をイメージさせる

【必ず入れる要素】
・ベネフィット：機能ではなく「読者がどんな未来を手に入れられるか」を伝える
・不安を取り除く情報：「初めてでも安心」「強引な勧誘なし」などを自然に入れる
・社会的証明：「利用者の声」「第三者のデータ」を入れる
・緊急性：「今月中に始めれば8月には効果が出る」など具体的な月を入れる
・諦めポイント：自己処理の限界を感じた直後に救いの言葉を入れる

【外部資料の引用ルール】
・HubSpot・Nielsen Norman Group・Unbounceなど世界的権威の調査・データを根拠として使う
・引用する際は「資料名／機関名・実証内容・具体的数値」を明記する
・URLは実在するものだけを使う。不明な場合はURLを省略して機関名と資料名のみ記載する

【NG表現：絶対に使わない】
・デメリットを隠したメリットだけの羅列
・過度な煽りや嘘の希少性
・上から目線の「〜なれるはずです」
・誇大表現や薬機法・景品表示法に抵触する表現
・選択肢を多く提示しすぎる

【文体ルール】
・必ず一人称（私）の体験談を各セクションに入れる
・口語的でテンポの良い文体
・感情的なワードを積極的に使う
・数字や時系列を必ず入れる（○回目、○ヶ月後など）
・CTAや画像プロンプトは書かない
・完璧な体験談は書かない
・「予約ボタン押すまで1ヶ月かかった」「最初マジでビビった」レベルの、情けないリアルな失敗・迷い・恥ずかしさを必ず2箇所以上入れること""",
        user_message=f"以下の構成で本文を書いてください。\n{structure}{extra}"
    )

def step3_score(client, article):
    return run_agent(client,
        system_prompt="""あなたはアフィリエイトブログ記事の採点専門家です。
以下の4項目で厳密に採点してください。それ以外は一切やらないこと。

【採点基準】
①共感・ターゲット設定（25点満点）
②緊急性・行動喚起（25点満点）
③体験談・信頼性（25点満点）
④CTA・クロージング（25点満点）

【出力形式】
・各項目の点数と理由（2行以内）
・総合点
・90点未満→改善が必要な箇所TOP3を箇条書き
・90点以上→「公開OK」と出力

※採点は厳密に行うこと。甘い採点は禁止。""",
        user_message=article
    )

def step4_links(client, article, affiliate_url, internal_urls):
    return run_agent(client,
        system_prompt="""あなたはアフィリエイトリンク設計の専門家です。
記事にリンクを挿入する作業だけを行ってください。

ルール：
・アフィリリンクは3箇所に挿入（冒頭直後・中間・まとめ前）
・中間CTAは読者が「自己処理は無理」と悟るタイミングに設置
・内部リンクは関連性の高い見出し直後に設置
・CTAボタンの文言も生成すること""",
        user_message=f"記事：\n{article}\n\nアフィリリンクURL：{affiliate_url}\n内部リンクURL一覧：{internal_urls}"
    )

def step5_images(client, article):
    return run_agent(client,
        system_prompt="""あなたは画像プロンプト生成の専門家です。
記事に挿入する画像の情報だけを生成してください。

各画像について以下を出力すること：
・挿入位置（どの見出しの前後か）
・画像生成プロンプト（日本語で詳細に）
・ALTテキスト

ルール：
・アイキャッチ含め3〜4枚
・人物は必ず日本人・40〜50代男性
・建物や風景は日本のもの
・リアルで高品質な写真風""",
        user_message=f"以下の記事に合う画像プロンプトを生成してください。\n{article}"
    )

def step6_title(client, keyword, article):
    return run_agent(client,
        system_prompt="""あなたはSEOタイトルとメタ情報の専門家です。
タイトルとメタ情報だけを生成してください。

【SEOタイトルのルール】
・狙うキーワードをタイトルの前半（できるだけ冒頭）に配置する
・キーワードは不自然にならないよう文脈に自然に溶け込ませる
・文字数は32文字以内に収める

出力内容：
・SEOタイトル案5つ（32文字以内・キーワードを前半に配置）
・推奨タイトル1つ（キーワード配置の根拠も含めて理由を説明）
・メタディスクリプション（120文字以内）
・フォーカスキーワード
・パーマリンク案（英語）""",
        user_message=f"キーワード：{keyword}\n\n記事内容：\n{article}"
    )

# ─── Input form ──────────────────────────────────────────────────────────────
with st.form("input_form"):

    st.markdown('<p class="field-label">キーワード</p>', unsafe_allow_html=True)
    keyword = st.text_input(
        "キーワード",
        placeholder="例：VIO脱毛 50代 男性",
        label_visibility="collapsed",
    )

    st.markdown('<p class="field-label">ターゲット</p>', unsafe_allow_html=True)
    target = st.text_input(
        "ターゲット",
        placeholder="例：50代以上の男性",
        label_visibility="collapsed",
    )

    st.markdown('<p class="field-label">1次情報</p>', unsafe_allow_html=True)
    primary_info = st.text_area(
        "1次情報",
        placeholder="例：風呂場の毛が落ちる、家族に言われる、夏の蒸れ、白髪リスク、3回目で効果、4ヶ月で自己処理不要に…",
        height=110,
        label_visibility="collapsed",
    )

    st.markdown('<p class="field-label">アフィリリンクURL</p>', unsafe_allow_html=True)
    affiliate_url = st.text_input(
        "アフィリリンクURL",
        placeholder="https://  （商品名はURLから自動推測されます）",
        label_visibility="collapsed",
    )

    st.markdown('<p class="field-label">内部リンクURL（カンマ区切り・任意）</p>', unsafe_allow_html=True)
    internal_urls = st.text_input(
        "内部リンクURL",
        placeholder="https://記事1, https://記事2",
        label_visibility="collapsed",
    )

    submitted = st.form_submit_button("記事を生成する", type="primary", use_container_width=True)

# ─── Pipeline execution ──────────────────────────────────────────────────────
if submitted:
    if not keyword or not primary_info or not target or not affiliate_url:
        st.warning("キーワード・1次情報・ターゲット・アフィリリンクURLは必須です。")
        st.stop()

    client = get_client()
    results = {}

    st.divider()

    def step_header(num, label):
        st.markdown(
            f'<div class="step-row"><div class="step-num">{num}</div>'
            f'<span class="step-label">{label}</span></div>',
            unsafe_allow_html=True
        )

    # STEP 1
    step_header(1, "構成を作成中...")
    with st.spinner(""):
        structure = step1_structure(client, keyword, primary_info, target, affiliate_url)
        results["structure"] = structure
    with st.expander("構成を確認する", expanded=False):
        st.markdown(structure)

    # STEP 2
    step_header(2, "本文を作成中...")
    with st.spinner(""):
        article = step2_article(client, structure)

    # STEP 3 採点ループ
    score_result = None
    max_retry = 3
    for i in range(max_retry):
        step_header(3, f"採点中... ({i+1}/{max_retry}回目)")
        with st.spinner(""):
            score_result = step3_score(client, article)

        if "公開OK" in score_result:
            st.success(f"採点合格（{i+1}回目） — 公開OK")
            break

        if i < max_retry - 1:
            step_header(2, f"リライト中... ({i+1}回目)")
            with st.spinner(""):
                article = step2_article(client, structure, feedback=score_result)
        else:
            st.warning("3回採点しましたが90点未満でした。このまま続けます。")

    results["article"] = article
    results["score"] = score_result

    with st.expander("採点結果を確認する", expanded=False):
        st.markdown(score_result)

    # STEP 4
    step_header(4, "リンクを設計中...")
    with st.spinner(""):
        article_with_links = step4_links(
            client, article,
            affiliate_url,
            internal_urls or "（内部リンクなし）"
        )
        results["article_with_links"] = article_with_links

    # STEP 5
    step_header(5, "画像プロンプトを生成中...")
    with st.spinner(""):
        image_prompts = step5_images(client, article)
        results["image_prompts"] = image_prompts

    # STEP 6
    step_header(6, "タイトル案を生成中...")
    with st.spinner(""):
        title_info = step6_title(client, keyword, article)
        results["title_info"] = title_info

    # ─── Output ──────────────────────────────────────────────────────────────
    st.divider()
    st.markdown('<p class="result-title">生成完了</p>', unsafe_allow_html=True)
    st.markdown('<p class="result-sub">以下のタブで各セクションを確認・コピーしてください。</p>', unsafe_allow_html=True)

    tab1, tab2, tab3 = st.tabs(["タイトル・メタ情報", "本文（リンク入り）", "画像プロンプト"])

    with tab1:
        st.markdown(results["title_info"])

    with tab2:
        st.markdown(results["article_with_links"])
        st.download_button(
            label="本文をダウンロード (.md)",
            data=results["article_with_links"],
            file_name=f"{keyword.replace(' ', '_')}_article.md",
            mime="text/markdown",
            use_container_width=True,
        )

    with tab3:
        st.markdown(results["image_prompts"])
