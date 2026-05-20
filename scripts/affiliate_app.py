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

【最初に必ず判定すること：検索意図】
キーワードを以下の4タイプから判定し、構成の方針を切り替える：
・Know型（〜とは／〜の効果／〜の方法）→ 情報網羅型。悩み共感→解説→CTA
・Go型（特定の場所・サイトに行きたい）→ 場所案内型。最短で目的情報＋CTA
・Do型（〜やり方／〜始め方）→ 手順説明型。PREP法で結論先出し→手順→CTA
・Buy型（〜比較／〜おすすめ／商品名）→ 購入決定型。PREP法で結論最上部→比較表→CTA早期配置

※Buy/Do型では冒頭の共感ブロックを最小化し、結論・推奨商品・比較情報を上部に置くこと。

【最初に必ず実行すること：共起語・サジェスト抽出】
構成を作る前に、対策キーワードと一緒に検索されやすい共起語・サジェストキーワードを
12〜18個リストアップし、見出しや小見出しに自然に振り分けて織り込むこと。
（例：「VIO脱毛 50代 男性」なら「痛み」「回数」「料金」「効果」「白髪」「クリニック」「自宅」「メンズリゼ」など）

【見出しタグの階層ルール】
・H2（##）と H3（###）のみを使う。H1（#）は記事タイトル用なので本文では使わない
・H2 には必ず対策キーワードか共起語を含める
・H2 配下に必要に応じて H3 を 2〜4 個ぶら下げる
・H4 以下は使わない（クローラ評価が分散するため）

【出力の冒頭に必ず含めること】
・判定した検索意図タイプ（Know / Go / Do / Buy）と判定理由（1行）
・抽出した共起語リスト（12〜18個）
・採用した構成方針（PREP優先か共感優先か）

【構成に必ず含めること（検索意図でブロック順序を変える）】
・冒頭の結論または共感ブロック（意図に応じて選択）
・本文ブロック（情報網羅 or 手順 or 比較）
・体験談ブロック
・緊急性ブロック（タイムリミット）
・CTAへの導線ブロック
・まとめ""",
        user_message=f"キーワード：{keyword}\n1次情報：{primary_info}\nターゲット：{target}\nアフィリリンクURL：{affiliate_url}"
    )

def step2_article(client, structure, keyword, feedback=""):
    extra = f"\n\n【改善指示】\n{feedback}" if feedback else ""
    return run_agent(client,
        system_prompt="""あなたはアフィリエイト記事の本文ライターです。
以下のルールを必ず守ること。それ以外は一切やらないこと。

【検索意図に応じた構成可変ルール（最重要）】
・構成案の先頭にある検索意図（Know / Go / Do / Buy）を読み取り、本文構成を最適化すること
・Buy / Do 型では PREP 法で結論を最上部に置く（前置きを短くする）
・Know / Go 型では網羅性と分かりやすさを優先し、必要十分な共感導入を置く

【見出し構造ルール（厳守）】
・本文で使う見出しは H2（##）と H3（###）のみ
・H4 以下は禁止
・すべての H2 に「対策キーワード」または重要共起語を含める
・少なくとも1つの H2 には対策キーワード完全一致を含める
・H2 配下の H3 は 2〜4 個を目安に、検索意図に沿って整理する

【必ず入れる要素】
・共起語・サジェストキーワードを 12〜18 語、本文と見出しに自然に分散して織り込む
・ベネフィット：機能ではなく「読者がどんな未来を手に入れられるか」を伝える
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
・「予約ボタン押すまで1ヶ月かかった」「最初マジでビビった」レベルの、情けないリアルな失敗・迷い・恥ずかしさを必ず2箇所以上入れること

【出力末尾に必ず付けること】
・「使用した共起語・サジェスト語チェックリスト」を箇条書きで出し、記事内での登場箇所を簡潔に示すこと""",
        user_message=f"対策キーワード：{keyword}\n\n以下の構成で本文を書いてください。\n{structure}{extra}"
    )

def step3_score(client, article):
    return run_agent(client,
        system_prompt="""あなたはアフィリエイトブログ記事の採点専門家です。
以下の5項目で厳密に採点してください。それ以外は一切やらないこと。

【採点基準】
①共感・ターゲット設定（20点満点）
②緊急性・行動喚起（20点満点）
③体験談・信頼性（20点満点）
④CTA・クロージング（20点満点）
⑤SEO最適化（20点満点）

⑤SEO最適化では必ず以下を評価する：
・共起語・サジェスト語が自然に網羅されているか
・見出し構造が H2/H3 の階層ルールを守っているか（H4以下がないか）
・H2 にキーワード/重要共起語が含まれているか
・タイトルと本文内容・検索意図が一致しているか

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
・CTAボタン文言は 13〜15 文字にすること（短く一瞬で意味が伝わる文）
・各 CTA ごとに、ボタンの上に置くマイクロコピー（不安を下げる短文）を1つ生成
・各 CTA ごとに、ボタンの下に置くマイクロコピー（安心感を補強する短文）を1つ生成
・マイクロコピーには「クレジットカード不要」「1分で完了」「しつこい勧誘なし」など心理障壁を下げる要素を優先して盛り込む

出力形式：
【CTA1（冒頭直後）】
・上マイクロコピー：
・ボタン文言（13〜15文字）：
・下マイクロコピー：
・リンク：

【CTA2（中間）】
...

【CTA3（まとめ前）】
...""",
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

def step6_title(client, keyword, article, structure):
    return run_agent(client,
        system_prompt="""あなたはSEOタイトルとメタ情報の専門家です。
タイトルとメタ情報だけを生成してください。

【最初に必ず行うこと】
・渡された構成案から検索意図（Know / Go / Do / Buy）を読み取る
・検索意図に合うタイトル型を選ぶ

【検索意図別タイトル型】
・Know：悩み解決・情報収集型（「〜とは」「〜の原因」「〜の対策」）
・Go：到達先案内型（「公式」「店舗」「どこで」など目的地を明確化）
・Do：実践手順型（「やり方」「始め方」「手順」「失敗しない」）
・Buy：比較・購入決定型（「比較」「おすすめ」「ランキング」「選び方」）

※Buy/Do では結論性の高い語を前半配置し、クリック後の期待値と本文内容を一致させること。

【SEOタイトルのルール】
・狙うキーワードをタイトルの前半（できるだけ冒頭）に配置する
・キーワードは不自然にならないよう文脈に自然に溶け込ませる
・文字数は32文字以内に収める

出力内容：
・判定した検索意図（Know / Go / Do / Buy）と理由（1行）
・SEOタイトル案5つ（32文字以内・キーワードを前半に配置）
・推奨タイトル1つ（キーワード配置の根拠も含めて理由を説明）
・メタディスクリプション（120文字以内）
・フォーカスキーワード
・パーマリンク案（英語）""",
        user_message=f"キーワード：{keyword}\n\n構成案：\n{structure}\n\n記事内容：\n{article}"
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
        article = step2_article(client, structure, keyword)

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
                article = step2_article(client, structure, keyword, feedback=score_result)
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
        title_info = step6_title(client, keyword, article, structure)
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
