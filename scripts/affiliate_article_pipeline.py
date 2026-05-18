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

必ず以下を含めること：
・冒頭の共感ブロック
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
def step2_article(structure, feedback=""):
    extra = f"\n\n【改善指示】\n{feedback}" if feedback else ""
    return run_agent(
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
・「予約ボタン押すまで1ヶ月かかった」「最初マジでビビった」レベルの、情けないリアルな失敗・迷い・恥ずかしさを必ず2箇所以上入れること""",
        user_message=f"以下の構成で本文を書いてください。\n{structure}{extra}"
    )

# ③採点specialist
def step3_score(article):
    return run_agent(
        system_prompt="""あなたはアフィリエイトブログ記事の採点専門家です。
以下の4項目で厳密に採点してください。それ以外は一切やらないこと。

【採点基準】

①共感・ターゲット設定（25点満点）
・読者の悩みが具体的に言語化されているか
・「私もそうでした」の共感表現があるか
・刺さるワードや感情的な表現があるか
・タイトルと内容が一致しているか

②緊急性・行動喚起（25点満点）
・今すぐ動くべき理由が明確か
・具体的な月の逆算スケジュールがあるか（「今月中に始めれば○月には」）
・希少性・緊急性の表現があるか
・諦めポイントでの救いの手が設置されているか

③体験談・信頼性（25点満点）
・一人称の具体的な体験談があるか
・数字や時系列の具体性があるか（○回目、○ヶ月後）
・デメリット開示とフォローがセットであるか
・社会的証明（第三者の声・データ）があるか
・NG表現（誇大表現・上から目線・嘘の希少性）がないか

④CTA・クロージング（25点満点）
・CTAボタンの色が全箇所で統一されているか
・マイクロコピーが機能しているか（「入力1分」「勧誘なし」「完全無料」）
・感情ピークの直後にCTAが配置されているか
・選択肢が1つに絞られているか
・行動した先の明るい未来がイメージできるか

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
・CTAボタンの文言も生成すること""",
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
def step6_title(keyword, article):
    return run_agent(
        system_prompt="""あなたはSEOタイトルとメタ情報の専門家です。
タイトルとメタ情報だけを生成してください。それ以外は一切やらないこと。

【SEOタイトルのルール】
・狙うキーワードをタイトルの前半（できるだけ冒頭）に配置する
・キーワードは不自然にならないよう文脈に自然に溶け込ませる
・文字数は32文字以内に収める（検索結果での省略を防ぐため）

出力内容：
・SEOタイトル案5つ（32文字以内・キーワードを前半に配置）
・推奨タイトル1つ（キーワード配置の根拠も含めて理由を説明）
・メタディスクリプション（120文字以内）
・フォーカスキーワード
・パーマリンク案（英語）""",
        user_message=f"キーワード：{keyword}\n\n記事内容：\n{article}"
    )

# メインパイプライン
def run_pipeline(keyword, primary_info, target, affiliate, affiliate_url, internal_urls):

    print("🔄 STEP1：構成を作成中...")
    structure = step1_structure(keyword, primary_info, target, affiliate)
    print("✅ 構成完成\n")

    print("🔄 STEP2：本文を作成中...")
    article = step2_article(structure)
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
        article = step2_article(structure, feedback=score_result)

    print("🔄 STEP4：リンクを設計中...")
    article_with_links = step4_links(article, affiliate_url, internal_urls)
    print("✅ リンク設計完成\n")

    print("🔄 STEP5：画像プロンプトを生成中...")
    image_prompts = step5_images(article)
    print("✅ 画像プロンプト完成\n")

    print("🔄 STEP6：タイトル案を生成中...")
    title_info = step6_title(keyword, article)
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
