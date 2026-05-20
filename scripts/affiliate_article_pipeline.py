import os
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GOOGLE_AI_STUDIO_API_KEY"])
MODEL = "gemini-2.5-pro"

def run_agent(system_prompt, user_message):
    response = client.models.generate_content(
        model=MODEL,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=8000,
        ),
        contents=user_message,
    )
    return response.text

# ①構成specialist
def step1_structure(keyword, primary_info, target, affiliate):
    return run_agent(
        system_prompt="""あなたはSEOブログの構成専門家です。
見出し構成だけを作ってください。それ以外は一切やらないこと。

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

【見出しタグの階層ルール】
・H2（##）と H3（###）のみを使う。H1（#）は記事タイトル用なので本文では使わない
・H2 には必ず対策キーワードか共起語を含める
・H2 配下に必要に応じて H3 を 2〜4 個ぶら下げる
・H4 以下は使わない

【出力の冒頭に必ず含めること】
・判定した検索意図タイプ（Know / Go / Do / Buy）と判定理由（1行）
・抽出した共起語リスト（12〜18個）
・採用した構成方針（PREP優先か共感優先か）

必ず以下を含めること：
・冒頭の結論または共感ブロック（意図に応じて選択）
・本文ブロック（情報網羅 or 手順 or 比較）
・緊急性ブロック（タイムリミット）
・体験談ブロック
・CTAへの導線ブロック
・まとめ""",
        user_message=f"""
キーワード：{keyword}
1次情報：{primary_info}
ターゲット：{target}
アフィリ商品：{affiliate}
"""
    )

# ②本文specialist
def step2_article(structure, keyword, feedback=""):
    extra = f"\n\n【改善指示】\n{feedback}" if feedback else ""
    return run_agent(
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
・不安を取り除く情報：「初めてでも安心」「強引な勧誘なし」などを自然に入れる
・社会的証明：「利用者の声」「第三者のデータ」を入れる
・緊急性：「今月中に始めれば8月には効果が出る」など具体的な月を入れる
・諦めポイント：自己処理の限界を感じた直後に救いの言葉を入れる

【NG表現：絶対に使わない】
・デメリットを隠したメリットだけの羅列
・過度な煽りや嘘の希少性
・上から目線の「〜なれるはずです」
・誇大表現や薬機法・景品表示法に抵触する表現
・タイトルと内容が乖離する構成
・選択肢を多く提示しすぎる

【外部資料の引用ルール】
・HubSpot・Nielsen Norman Group・Unbounceなど世界的権威の調査・データを根拠として使う
・引用する際は「資料名／機関名・実証内容・具体的数値」を明記する（例：Unbounceの調査では「CTAボタンのテキスト変更だけでCVRが最大90%改善」）
・効果計測や技術的な説明にはGoogle Developersなど公式リファレンスへの言及を添える
・URLは実在するものだけを使う。不明な場合はURLを省略して機関名と資料名のみ記載する

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

# ③採点specialist
def step3_score(article):
    return run_agent(
        system_prompt="""あなたはアフィリエイトブログ記事の採点専門家です。
以下の5項目で厳密に採点してください。それ以外は一切やらないこと。

【採点基準】

①共感・ターゲット設定（20点満点）
・読者の悩みが具体的に言語化されているか
・「私もそうでした」の共感表現があるか
・刺さるワードや感情的な表現があるか
・タイトルと内容が一致しているか

②緊急性・行動喚起（20点満点）
・今すぐ動くべき理由が明確か
・具体的な月の逆算スケジュールがあるか（「今月中に始めれば○月には」）
・希少性・緊急性の表現があるか
・諦めポイントでの救いの手が設置されているか

③体験談・信頼性（20点満点）
・一人称の具体的な体験談があるか
・数字や時系列の具体性があるか（○回目、○ヶ月後）
・デメリット開示とフォローがセットであるか
・社会的証明（第三者の声・データ）があるか
・NG表現（誇大表現・上から目線・嘘の希少性）がないか

④CTA・クロージング（20点満点）
・CTAボタンの色が全箇所で統一されているか
・マイクロコピーが機能しているか（「入力1分」「勧誘なし」「完全無料」）
・感情ピークの直後にCTAが配置されているか
・選択肢が1つに絞られているか
・行動した先の明るい未来がイメージできるか

⑤SEO最適化（20点満点）
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

# ④リンク設計specialist
def step4_links(article, affiliate_url, internal_urls):
    return run_agent(
        system_prompt="""あなたはアフィリエイトリンク設計の専門家です。
記事にリンクを挿入する作業だけを行ってください。それ以外は一切やらないこと。

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
        user_message=f"""
記事：
{article}

アフィリリンクURL：{affiliate_url}
内部リンクURL一覧：{internal_urls}
"""
    )

# ⑤画像プロンプトspecialist
def step5_images(article):
    return run_agent(
        system_prompt="""あなたは画像プロンプト生成の専門家です。
記事に挿入する画像の情報だけを生成してください。それ以外は一切やらないこと。

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

# ⑥タイトル案specialist
def step6_title(keyword, article, structure):
    return run_agent(
        system_prompt="""あなたはSEOタイトルとメタ情報の専門家です。
タイトルとメタ情報だけを生成してください。それ以外は一切やらないこと。

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
・文字数は32文字以内に収める（検索結果での省略を防ぐため）

出力内容：
・判定した検索意図（Know / Go / Do / Buy）と理由（1行）
・SEOタイトル案5つ（32文字以内・キーワードを前半に配置）
・推奨タイトル1つ（キーワード配置の根拠も含めて理由を説明）
・メタディスクリプション（120文字以内）
・フォーカスキーワード
・パーマリンク案（英語）""",
        user_message=f"キーワード：{keyword}\n\n構成案：\n{structure}\n\n記事内容：\n{article}"
    )

# メインパイプライン
def run_pipeline(keyword, primary_info, target, affiliate, affiliate_url, internal_urls):

    print("🔄 STEP1：構成を作成中...")
    structure = step1_structure(keyword, primary_info, target, affiliate)
    print("✅ 構成完成\n")

    print("🔄 STEP2：本文を作成中...")
    article = step2_article(structure, keyword)
    print("✅ 本文完成\n")

    # 採点ループ（最大3回）
    max_retry = 3
    for i in range(max_retry):
        print(f"🔄 STEP3：採点中...（{i+1}回目）")
        score_result = step3_score(article)
        print(f"採点結果：\n{score_result}\n")

        if "公開OK" in score_result:
            print(f"✅ 採点合格！（{i+1}回目）\n")
            break

        print(f"🔄 90点未満のためリライト中...（{i+1}回目）")
        article = step2_article(structure, keyword, feedback=score_result)

    print("🔄 STEP4：リンクを設計中...")
    article_with_links = step4_links(article, affiliate_url, internal_urls)
    print("✅ リンク設計完成\n")

    print("🔄 STEP5：画像プロンプトを生成中...")
    image_prompts = step5_images(article)
    print("✅ 画像プロンプト完成\n")

    print("🔄 STEP6：タイトル案を生成中...")
    title_info = step6_title(keyword, article, structure)
    print("✅ タイトル案完成\n")

    # 最終出力
    final_output = f"""
{'='*50}
【タイトル・メタ情報】
{title_info}

{'='*50}
【本文（リンク入り）】
{article_with_links}

{'='*50}
【画像プロンプト】
{image_prompts}
{'='*50}
"""
    return final_output


# ===実行===
result = run_pipeline(
    keyword="VIO脱毛 50代 男性",
    primary_info="風呂場の毛が落ちる、家族に言われる、夏の蒸れ",
    target="50代以上の男性",
    affiliate="メンズリゼ",
    affiliate_url="https://ここにアフィリリンク",
    internal_urls="https://内部リンク1, https://内部リンク2"
)

print(result)
