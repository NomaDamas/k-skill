🌐 [한국어](README.md) | [English](README.en.md) | [中文](README.zh.md) | [日本語](README.ja.md)

> この翻訳は、外国人観光客および韓国に住む外国人の方向けです（英語・中国語・日本語のREADMEを参照してください）。表からリンクされている各スキルの詳細ドキュメントは韓国語で書かれていますので、AIエージェントに翻訳を依頼してください。韓国語の README.md が正式な情報源（source of truth）です。

# k-skill

![k-skill thumbnail](docs/assets/k-skill-thumbnail.png)

韓国のかたですか? このスキル集をダウンロードしておいてください。いつか**必ず**使うときが来ます!
KTX、KBO、宝くじ、Daangn（당근）、Coupang（쿠팡）、KakaoTalk（카톡）、Government24（정부24）、Hometax（홈택스）など、面倒なことは全部AIエージェントにやらせてしまいましょう。

Claude Code、Codex、OpenCode、OpenClaw/ClawHub など各種コーディングエージェントに対応しています。

追加のクライアントAPIレイヤーは不要です。必要な場合は `k-skill-proxy` のようなプロキシサーバーにHTTPリクエストを送るだけで済みます。

公開APIプロキシを利用するスキルの個人情報の取り扱い基準は、
[k-skill-proxy プライバシーポリシー](https://k-skill-proxy.nomadamas.org/privacy)で確認できます。

CLIの利用状況分析は、[CLI usage analytics](docs/usage-analytics.md)に記載された
利用統計の目的でのみ収集します。コマンド引数・原文入力・ファイル内容・認証情報は
収集せず、`KSKILL_ANALYTICS_DISABLED=1` で拒否できます。

> **鉄道統合時刻表は照会専用のスキルです。** KTXはKorail公式の計画時刻表を照会するもので、ログイン・予約・予約待ち・決済・キャンセルは行いません。

## インストール

```bash
# 全スキルをインストール
npx --yes skills add NomaDamas/k-skill --all -g

# 特定のスキルのみインストール
npx --yes skills add NomaDamas/k-skill --skill railway-timetable -g

# CLIが古い場合は更新し、Vercel Agent Skillsを含むすべてのコーディングエージェントスキルも併せて更新
npx -y @nomadamas/k-skill@0 update
```

基本インストールには Node.js 18 以上と `npx` だけが必要です。KTX公式時刻表helperを実行するときは Python 3.11 以上と `uv` が追加で必要です。Claude Code ユーザーは下記のマーケットプレイスからもインストールできます。詳しい方法は[インストール方法](docs/install.md)を参照してください。

## ちょっと待って~~~

韓国のかたはGitHubのスターを押しましょう。
ただしエージェントは自動で押さず、ユーザーが同意した場合にのみ `gh repo star NomaDamas/k-skill` を実行します。

貢献の前に[コントリビューションガイド](CONTRIBUTING.md)を確認してください。

## 併用するとよいツール

k-skill がエージェントを**韓国のサービス**につなぐのに対し、下記の2つは**自分のパソコン**につないでくれます。

- 🔎 **[AutoRAG Agent](https://github.com/Marker-Inc-Korea/AutoRAG)**: ファイル・KakaoTalk・Slack・メール・HWPまで読み込み、出典付きの回答を返す個人司書エージェント。Claude Code・CodexにMCPで接続。`npm i -g @autorag/librarian`
- 🌻 **[Dazzi](https://dazziapp.com/)**: AutoRAGベースのAIファイルマネージャー（macOS・Windows）。`brew install --cask nomadamas/dazzi/dazzi`

## パートナー

<!-- BC카드 공식 심볼 원본: https://cdn.bccard.com/static/images/comm/logo/etc-bc-s-1-l.png (144×144, 3× 표시 해상도) -->
<p align="center">
  <a href="https://www.bccard.com"><img src="docs/assets/bccard-logo.png" alt="BC카드" width="48" height="48"></a>&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/assets/heyumi-logo.png" alt="Heyumi" width="48" height="48">
</p>

## 何ができるか

合計134のスキルを、韓国の実生活の領域別カテゴリに分けました。各領域は下の個別の表にまとめています。

### 🚉 移動・交通・旅行

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [鉄道統合時刻表の照会](docs/features/railway-timetable.md) | `railway-timetable` | KTXのKorail公式公開時刻表の照会専用です |
| [高速バスの予約](docs/features/express-bus-booking.md) | `express-bus-booking` | KOBUSの配車・座席・運賃・仮押さえを照会し、予約を支援します |
| [市外バスの予約](docs/features/intercity-bus-booking.md) | `intercity-bus-booking` | T-money（티머니）の配車・座席・運賃・仮押さえを照会し、予約を支援します |
| [航空券価格の照会](docs/features/flight-ticket-search.md) | `flight-ticket-search` | `fast-flights` ベースの Google Flights 公開検索で、航空券候補・予約検索リンク・日付/月/年別の最安値・平均価格を比較します（照会専用、予約・決済なし） |
| [MyRealTrip（마이리얼트립）MCP検索](docs/features/myrealtrip-search.md) | `myrealtrip-search` | 公式MCPサーバーで航空券・宿泊・ツアー・チケット・アクティビティを検索し、詳細・オプションを確認します |
| [外交部の海外安全・渡航警報照会](docs/features/mofa-travel-safety.md) | `mofa-travel-safety` | 外交部0404の国・地域別公式渡航警報と警報内容を照会します（プロキシ経由） |
| [自然休養林の空室照会](docs/features/foresttrip-vacancy.md) | `foresttrip-vacancy` | 公式のSumnadeul-e（숲나들e）で空室を照会し、予約を支援します |
| [ソウル地下鉄の到着情報照会](docs/features/seoul-subway-arrival.md) | `seoul-subway-arrival` | ソウル地下鉄の駅基準でリアルタイムの到着予定列車を確認します |
| [ソウルTtareungiのリアルタイム貸出所照会](docs/features/seoul-bike.md) | `seoul-bike` | 現在の座標周辺または貸出所名基準で、Ttareungi（따릉이）の貸出可能自転車と空き駐輪枠を照会します |
| [ソウルのリアルタイム混雑度照会](docs/features/seoul-density.md) | `seoul-density` | ソウルの主要121ホットスポットのリアルタイム混雑度レベルと推定人口を照会します |
| [韓国の公共交通の経路案内](docs/features/korean-transit-route.md) | `korean-transit-route` | ODsay LIVE API + Kakao geocoding ベースで、出発地→目的地の地下鉄+バス+徒歩の経路と乗換情報を照会します |
| [Kakao Map（카카오맵）の場所・自動車経路案内](docs/features/kakao-map.md) | `kakao-map` | Kakao Local のキーワード/カテゴリ/座標↔住所変換 + Kakao Mobility の自動車経路案内（距離・所要時間・通行料・予想タクシー運賃）です |
| [高速道路の交通量・流れ・CCTV照会](docs/features/highway-traffic-status.md) | `highway-traffic-status` | 韓国道路公社・ITSの公開APIで、高速道路の区間別リアルタイム速度/交通量/渋滞等級とCCTVストリームのメタデータを照会します |
| [KOMSA沿岸旅客船情報の照会](docs/features/komsa-ferry-info.md) | `komsa-ferry-info` | KOMSA MTIS 公式APIで、沿岸旅客船の運航日程・船舶・寄港地・航路・運航状態を照会します（プロキシ経由） |
| [近くの最安ガソリンスタンド探し](docs/features/cheap-gas-nearby.md) | `cheap-gas-nearby` | 現在地基準で近くの最安ガソリンスタンドを照会します |
| [近くの公営駐車場探し](docs/features/parking-lot-search.md) | `parking-lot-search` | 現在地基準で近くの公営駐車場の位置・料金・営業時間を照会します |
| [電気自動車充電スタンドの位置・状態照会](docs/features/ev-charger-nearby.md) | `ev-charger-nearby` | 地域・充電スタンド基準でEV充電スタンド情報と充電器の現在状態を照会します（公共データポータル（공공데이터포털）15076352、プロキシ経由） |
| [地下鉄の忘れ物照会](docs/features/subway-lost-property.md) | `subway-lost-property` | 地下鉄の駅/物品名基準で公式LOST112の忘れ物検索条件と遺失物センターの入口を案内します |

### 🏠 不動産・住宅

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国の不動産実取引価格照会](docs/features/real-estate-search.md) | `real-estate-search` | マンション/オフィステル/ヴィラ/一戸建ての実取引価格・チョンセ/月払い賃料（전월세）・地域コードを照会します |
| [韓国の住宅公示価格照会](docs/features/housing-official-price.md) | `housing-official-price` | realtyprice.kr の公開ウェブデータ表面から、共同住宅・個別住宅の政府公示価格の履歴を直接照会します（公式に文書化されたOpenAPIではありません） |
| [民間住宅の請約加算点・預託金基準の照会](docs/features/housing-subscription-reference.md) | `housing-subscription-reference` | 「住宅供給に関する規則」別表1・別表2基準の請約加算点（無住宅期間・扶養家族・加入期間で84点）と、地域・面積別の請約預託金を照会します（外部CSVに依存せず、バンドルされた参考値） |
| [個別公示地価（개별공시지가）の照会](docs/features/gongsijiga-search.md) | `gongsijiga-search` | realtyprice.kr の公開APIから、地番単位の個別公示地価（ウォン/㎡）の複数年推移・前年比変動率を照会します |
| [建築物台帳 表題部の照会](docs/features/building-register-search.md) | `building-register-search` | 住所・PNU・法定洞コードと筆地で、主用途・延床面積・階数・使用承認日を照会します（公共データポータル（공공데이터포털）15134735、プロキシ経由） |
| [LH請約公告文の照会](docs/features/lh-notice-search.md) | `lh-notice-search` | 韓国土地住宅公社（LH）の賃貸/分譲/住居福祉（新婚希望タウン）/土地/商業施設の公告を地域・状態・公告類型・キーワードで照会し、締切の有無をKST基準で表示します |
| [SH請約・住宅公告文の照会](docs/features/sh-notice-search.md) | `sh-notice-search` | ソウル住宅都市開発公社（SH）の公開公告/通知掲示板を直接照会し、キーワード・公告種類別の一覧、詳細本文、添付プレビューのメタデータを確認します |
| [裁判所競売の不動産売却公告照会](docs/features/court-auction-notice-search.md) | `court-auction-notice-search` | 大法院競売情報（courtauction.go.kr）の不動産売却公告を売却期日・裁判所・期日/期間の入札条件で検索し、事件番号・用途・住所・鑑定評価額・最低売却価格を展開します。事件番号で事件情報・物件内訳・売却期日履歴を直接照会します |
| [Daangn不動産（당근부동산）検索](docs/features/daangn-realty-search.md) | `daangn-realty-search` | Daangn不動産の公開ウェブデータ表面で、地域ベースの不動産物件検索と詳細確認を行います |

### ⚖️ 法律・公共

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国の法令検索](docs/features/korean-law-search.md) | `korean-law-search` | 韓国の法令/条文/判例/有権解釈を検索し、改正条文だけを渡すと現行を取得して作成する新・旧条文対比表（韓国語（한글）の `.hwpx` として保存）です |
| [韓国の特許情報検索](docs/features/korean-patent-search.md) | `korean-patent-search` | 韓国の特許/実用新案のキーワード検索と出願番号の詳細照会です |
| [韓国のプライバシーポリシー・利用規約の自動生成](docs/features/korean-privacy-terms.md) | `korean-privacy-terms` | Next.jsプロジェクトに、個人情報保護法・約款規制法・電子商取引法に基づくプライバシーポリシー/利用規約/クッキーバナー/同意モーダルを生成する `kimlawtech/korean-privacy-terms`（Apache-2.0）のthin wrapperです |
| [登記簿謄本の自動化](docs/features/iros-registry-automation.md) | `iros-registry-automation` | インターネット登記所（IROS）で法人/不動産の登記簿謄本をカートに入れ、手動決済後に閲覧・保存する流れを補助します |
| [法人登記申請コンサルティング](docs/features/corporate-registration-consulting.md) | `corporate-registration-consulting` | 一般営利株式会社の発起設立基準で、法人名・取締役・住所などユーザーの決定事項を受け取り、標準定款、設立登記の添付書類、登録免許税・過密抑制圏域の重課チェック、rhwpベースのHWP様式の順次作成フローを参考用として案内します |
| [支払命令申請の補助](docs/features/court-payment-order-assistant.md) | `court-payment-order-assistant` | 裁判所電子訴訟の支払命令申請に必要な債権者・債務者・請求原因・証憑情報を整理し、ドラフト/チェックリストとログイン以降のブラウザhandoffを準備します |
| [国会の議案・表決照会](docs/features/assembly-bill-vote-search.md) | `assembly-bill-vote-search` | 国会情報（열린국회정보）Open APIで議案検索・詳細と国会議員の本会議表決を照会します（プロキシ経由、照会専用） |
| [公務海外出張報告書の照会](docs/features/gov-overseas-trip-report.md) | `gov-overseas-trip-report` | 選管委・権益委・情報公開ポータル・大邱/大田/京畿/慶北議会などの公開表面で海外出張/研修の報告書・現況を照会し、表にない機関は discover で能動的に探索します（ログイン壁は除外、判定ではありません） |
| [ShareNuri（공유누리）公共施設検索](docs/features/sharenuri-facility-search.md) | `sharenuri-facility-search` | ShareNuriの公開統合検索で、全国の公共開放資源（会議室・体育施設・宿泊施設・物品など）をキーワード・地域・無料有無で照会し、詳細情報・予約経路を案内します（認証キー・ログイン不要） |

### 🏢 事業・商圏・税務

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [事業者登録情報の確認](docs/features/nts-business-registration.md) | `nts-business-registration` | 国税庁の事業者登録番号の状態照会と事業者登録情報の真正性確認です（公共データポータル（공공데이터포털）API、プロキシ経由） |
| [事業者デューデリジェンス総合](docs/features/biz-health-check.md) | `biz-health-check` | 事業者登録番号を中心に、商号・地域を併せて渡すと、国税庁の状態・国民年金・滞納者リスト・金融委員会の法人概要・不正当者制裁（부정당제재）・認許可営業状態をクロス照会した実地調査レポートです（スコア・判定なしで事実のみ） |
| [国民年金加入事業所の照会](docs/features/national-pension-workplace.md) | `national-pension-workplace` | 事業所名で国民年金の加入者数・当月請求金額・月別推移を照会します（公共データポータル API、プロキシ経由） |
| [国税滞納者公表名簿検索](docs/features/nts-tax-delinquency.md) | `nts-tax-delinquency` | 商号・法人名で国税庁の高額・常習滞納者の公表名簿と照合します（認証不要の公開検索） |
| [金融委員会の企業基本情報照会](docs/features/fsc-corporate-info.md) | `fsc-corporate-info` | 法人名で代表者・設立日・業種などの法人概要を照会し、事業者番号をクロス検証します（公共データポータル API、プロキシ経由） |
| [認許可営業状態の照会](docs/features/localdata-business-status.md) | `localdata-business-status` | 商号+市郡区で町の事業所（208業種）の営業/休業/廃業・業歴・住所を照会します（LOCALDATA、認証不要） |
| [長寿店舗レーダー](docs/features/store-longevity-radar.md) | `store-longevity-radar` | 商店（商圏）情報の公開ファイル（認証不要）で業種・商号キーワードの店舗を全件抽出し、過去のスナップショットと商号+座標をマッチングして長寿店舗を抽出します |
| [韓国の事業者帳簿の自動化](docs/features/korean-jangbu-for.md) | `korean-jangbu-for` | `kimlawtech/korean-jangbu-for` ベースで、カード・銀行・レシート・税金計算書を入力 → 標準取引履歴・勘定科目・税理士提出用CSV・経営レポートを生成するthin wrapperです |
| [Popbill（팝빌）業務API](docs/features/popbill.md) | `popbill` | Popbillの電子税金計算書・電子明細書・現金領収証・SMS・KakaoTalk・FAX・休廃業/企業情報・口座照会・Hometax（홈택스）収集をローカルBYOK方式で呼び出します |
| [Naver検索広告のパフォーマンス照会](docs/features/naver-ad-performance.md) | `naver-ad-performance` | Naver検索広告のキャンペーン/広告グループ/キーワードのインプレッション数・クリック数・広告費・CTR・CPC・コンバージョン数を照会し、関連キーワード・月間検索ボリュームのツールを提供します（読み取り専用、ローカル実行専用） |

### 🏛️ 政府支援・調達

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [創業振興院K-Startup照会](docs/features/kstartup-search.md) | `kstartup-search` | 創業振興院K-Startupの統合公告事業・支援事業公告・創業コンテンツ・統計報告書を照会します（公共データポータル（공공데이터포털）15125364、プロキシ経由） |
| [政府支援の全数調査](docs/features/government-support-survey.md) | `government-support-survey` | K-Startup・企業マダン（기업마당）・NIPA・KOCCA・SMTECHの公開公告を統合照会し、ソース別の網羅性・公式リンクとともにプロジェクト適合性を保守的に検討します |
| [Nara Market（나라장터）発注計画検索](docs/features/g2b-order-plan-search.md) | `g2b-order-plan-search` | 物品・工事・役務・外資の発注計画を発注年月・掲載日時・機関・事業名の条件で照会します（公共データポータル API、プロキシ経由） |
| [不正当制裁業者の照会](docs/features/g2b-sanctioned-supplier.md) | `g2b-sanctioned-supplier` | 事業者番号でNara Marketの不正当制裁（照会時点で有効な制裁）を照会します（公共データポータル API、プロキシ経由） |
| [国防電子調達の公告照会](docs/features/d2b-notice-search.md) | `d2b-notice-search` | 国防電子調達システム（D2B）の公開入札公告画面をAside Browser優先で照会し、公告件名・公告区分・日付・G2B公告番号・発注機関の条件で検索します |
| [S2B学校市場（학교장터）公告照会](docs/features/s2b-notice-search.md) | `s2b-notice-search` | S2B学校市場の公開顧客公告/見積依頼画面をブラウザ優先で照会し、一覧・詳細のHTML fixtureをパースします |
| [Boim（보임）の業者・入札探し](docs/features/boim-business-search.md) | `boim-business-search` | 地域×業種・商号で全国の業者、品名で公共調達実績のある業者、単語で進行中の公共機関入札公告（Nara Market・国防電子調達・LH・韓国水資源公社・Nuri市場（누리장터））を一括で照会します（Boim公開検索、認証不要） |
| [電気自動車補助金の状況照会](docs/features/ev-subsidy-status.md) | `ev-subsidy-status` | 自治体別のEV民間公告・受付・出庫・出庫残台数とモデル別補助金を照会します |

### 🧑‍💼 採用・求人

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [JobKorea（잡코리아）人材検索](docs/features/jobkorea-talent-search.md) | `jobkorea-talent-search` | JobKorea企業会員のログインセッションでマスキングされた候補者情報を読み、有料閲覧前のshortlistを作成します |
| [Saramin（사람인）人材プール検索](docs/features/saramin-talent-search.md) | `saramin-talent-search` | Saramin企業会員の人材プールでマスキングされた候補者情報を読み、有料閲覧前のshortlistを作成します |
| [履歴書ベースの求人マッチング](docs/features/job-posting-match.md) | `job-posting-match` | 求職者の履歴書・希望条件をもとに、JobKorea・Saraminの公開求人を検索し、適合度と応募戦略を整理します |
| [Daangn Alba（당근알바）検索](docs/features/daangn-jobs-search.md) | `daangn-jobs-search` | Daangn Albaの公開ウェブデータ表面で、キーワード・地域ベースのアルバイト求人検索と詳細照会を行います |

### 📈 金融・投資・経済統計

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国株情報の照会](docs/features/korean-stock-search.md) | `korean-stock-search` | KRX上場銘柄の検索、基本情報、日別株価の照会です |
| [韓国債券銘柄の照会・比較](docs/features/korean-bond-search.md) | `korean-bond-search` | GS QuantのInstrument/Data構造化方式に着想を得て、韓国債券を標準Bond Instrumentフィールドに整理し、発行条件・残高・CALL/PUT・CB/EB/BWを出典・確認時刻とともに検索・比較します（ログイン・APIキー不要） |
| [金融監督院DART電子公示の照会](docs/features/k-dart.md) | `k-dart` | 公示検索、企業概況、財務諸表、配当、増資/減資、監査意見、主要事項報告書など14のendpointです |
| [国内・海外の企業分析](docs/features/company-analysis.md) | `company-analysis` | 公開公示・決算発表を突き合わせ、3大財務諸表の変化、事業・競争構図、主要スケジュールと照会時点の株価を6セクションのチャット分析で整理します（ログイン・APIキー不要） |
| [Toss Securities（토스증권）照会](docs/features/toss-investment.md) | `toss-investment` | Toss証券の公式Open API（OAuth2）で、口座・保有株式・株価・注文照会などを照会専用で行います |
| [Daishin Securities（대신증권）レポート照会](docs/features/daishin-report-search.md) | `daishin-report-search` | GitHub Pagesに公開された大信証券レポートのHTMLミラーから、最新レポートの一覧、原文、説明ページ、Rating/Target表を照会します |
| [国家データ処KOSIS統計照会](docs/features/kosis-stats.md) | `kosis-stats` | 国家データ処が運営するKOSIS（国家統計ポータル）Open APIで、統計表の検索・メタ・データ・大容量資料を照会します（照会専用） |
| [韓国銀行ECOS経済統計照会](docs/features/bok-ecos-stats.md) | `bok-ecos-stats` | 韓国銀行ECOS Open APIで、政策金利・為替レート・消費者物価指数・通貨量の時系列と100大核心指標を照会します |
| [韓米国債市場の分析](docs/features/government-bond-analysis.md) | `government-bond-analysis` | 韓国・米国の国債金利とカーブの変化、同一観測日の10年金利差、公式入札・金融政策スケジュールを検証し、固定された形式で整理します |
| [マルチアセット・モーニングブリーフィング](docs/features/multi-asset-morning-briefing.md) | `multi-asset-morning-briefing` | 米国・韓国の直近に終了したセッションを独立して確認し、グローバル株式・金利・FX・コモディティ・ボラティリティと韓国への伝播経路、今後5営業日のスケジュールを根拠リンク付きの7セクションで作成します（ログイン・APIキー不要） |
| [事象別の市場反応リサーチ](docs/features/market-event-impact.md) | `market-event-impact` | GS Quantの event_study・event_impact_analysis・CalendarAlignment 構造に着想を得て、定例・非定型の事象の核心的な変化と市場解釈、クロスアセットの伝播経路を調査し、イベントスタディは補助証拠として提示しつつ、類似事例・次のカタリストまで整理します（ログイン・APIキー不要） |

### 💊 健康・医療

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [近くの救急室の病床状況確認](docs/features/emergency-room-beds.md) | `emergency-room-beds` | 現在地基準で近くの救急室の運営・入院室/病床の運営フラグと更新時刻を照会します（正確な残病床数/稼働率は公開E-Gen nearbyリストにありません） |
| [介護保険・健康診断機関の照会](docs/features/nhis-care-checkup-search.md) | `nhis-care-checkup-search` | 国民健康保険公団の介護保険機関・健康診断機関の公開候補を照会します（公共データポータル（공공데이터포털）15059029・15154419、プロキシ経由） |
| [医薬品の安全性チェック](docs/features/mfds-drug-safety.md) | `mfds-drug-safety` | 食品医薬品安全処（식약처）のe薬はこちら（e약은요）・安全常備医薬品情報を、インタビュー優先のフローでプロキシ照会します |
| [薬学情報院の医薬品検索](docs/features/kpic-drug-search.md) | `kpic-drug-search` | 薬学情報院(KPIC)の公開医薬品名を検索し、医薬品コードで詳細な原文を照会します（APIキー・ログイン・プロキシ不要） |
| [食品の安全性チェック](docs/features/mfds-food-safety.md) | `mfds-food-safety` | 食品医薬品安全処（식약처）の不適合食品・Food Safety Korea（식품안전나라）の回収情報を、インタビュー優先のフローでプロキシ照会します |
| [動物薬局・動物用医薬品取扱薬局の照会](docs/features/animal-pharmacy-search.md) | `animal-pharmacy-search` | Hongik Medcare（홍익메디케어）の公開MCPで、地域別の動物薬局、製品検索、直近6か月の購入履歴に基づく取扱薬局を照会します |

### 🛒 ショッピング・中古取引

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [Coupang（쿠팡）商品検索](docs/features/coupang-product-search.md) | `coupang-product-search` | Coupangの商品検索、ロケット配送フィルタ、価格帯検索、比較、ベスト、ゴールドボックスの特価照会です |
| [Danawa（다나와）最安値比較](docs/features/danawa-price-search.md) | `danawa-price-search` | Danawaの公開検索/価格比較表面で、商品候補・ショッピングモール別価格・送料込みの実購入価格・カード割引価格・無利子分割を比較します |
| [Market Kurly（마켓컬리）商品照会](docs/features/market-kurly-search.md) | `market-kurly-search` | Market Kurlyの商品検索、現在価格、割引有無、品切れ有無を照会します |
| [Daiso（다이소）商品照会](docs/features/daiso-product-search.md) | `daiso-product-search` | Daisoの店舗別商品の受け取り可否を確認します（正確な店舗別在庫数量はダイソーモールのセキュリティポリシーにより2026-05-05から遮断されています） |
| [Olive Young（올리브영）検索](docs/features/olive-young-search.md) | `olive-young-search` | Olive Youngの店舗・商品・在庫照会です |
| [Today's House（오늘의집）の今日のディール照会](docs/features/ohou-today-deal.md) | `ohou-today-deal` | Today's Houseが公開する今日のディール特価商品の割引率・価格・レビュー・リンクを照会します |
| [Bunjang（번개장터）検索](docs/features/bunjang-search.md) | `bunjang-search` | Bunjangの検索、詳細照会、任意のいいね/チャット、AI TOON exportです |
| [Daangn中古取引（당근 중고거래）検索](docs/features/daangn-used-goods-search.md) | `daangn-used-goods-search` | Daangn中古取引の公開ウェブデータ表面で、キーワード・地域ベースの物件検索と詳細照会を行います |
| [Daangn中古車（당근중고차）検索](docs/features/daangn-cars-search.md) | `daangn-cars-search` | Daangn中古車の公開ウェブデータ表面で、地域・価格条件ベースの車両検索と詳細照会を行います |
| [消費者価格・リコール情報の照会](docs/features/consumer-price-safety-search.md) | `consumer-price-safety-search` | チャムガギョク（참가격、参考価格）の価格情報と消費者24（소비자24）の物品・リコール情報を照会します |
| [宅配便の配送照会](docs/features/delivery-tracking.md) | `delivery-tracking` | CJ大韓通運・郵便局の送り状番号で配送状態を照会します |

### 🍚 食べ物・酒類

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [KAMIS農水畜産物価格照会](docs/features/kamis-food-price.md) | `kamis-food-price` | KAMIS公式の農水畜産物の卸売・小売価格と期間比較値を照会します（プロキシ経由） |
| [近くの飲み屋の照会](docs/features/kakao-bar-nearby.md) | `kakao-bar-nearby` | 現在地基準で、営業状態・メニュー・座席・電話番号を含む近くの飲み屋を照会します |
| [Hola Poke駅三（올라포케 역삼）ポケ](docs/features/hola-poke-yeoksam.md) | `hola-poke-yeoksam` | Hola Poke駅三店のメニュー、店舗情報、イベント参加フローを案内します |
| [BCカードeat.plのグルメ検索](docs/features/bccard-eatpl-search.md) | `bccard-eatpl-search` | 地域・駅・町基準のグルメ・飲食店・カフェ検索です。直近1か月の決済データに基づく売上上位と詳細リンクを提供します |
| [HeyYumi（헤이유미）予約可能なグルメ検索・飲食店予約](docs/features/heyyumi.md) | `heyyumi` | Googleログイン1回（キー不要）で地域・メニュー・条件別の飲食店・カフェを検索し、予約リクエストと店舗の承認/拒否確認、リアルタイムの空席・待ち状況の問い合わせができます。外国語で質問してもかまいません |

### ⚽ スポーツ・試合

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国マラソン日程の照会](docs/features/korean-marathon-schedule.md) | `korean-marathon-schedule` | Go Running（고러닝）の公開ページと大韓トライアスロン協会の日程から、マラソン・トライアスロン大会の日程、場所、申込締切日、種目を照会します |
| [KBO試合結果の照会](docs/features/kbo-results.md) | `kbo-results` | 日付別のKBO試合日程、結果、チーム別フィルタリングです |
| [KBL試合結果の照会](docs/features/kbl-results.md) | `kbl-results` | 日付別のKBL試合日程、結果、チーム別フィルタリング、現在順位の確認です |
| [Kリーグ試合結果の照会](docs/features/kleague-results.md) | `kleague-results` | 日付別のKリーグ1/Kリーグ2の試合結果、チーム別フィルタリング、現在順位の確認です |
| [LCK試合分析](docs/features/lck-analytics.md) | `lck-analytics` | LCKの試合結果、現在順位、live turning point、バンピック、パッチメタ、チームパワーレーティングです |

### 🎭 文化・歴史・余暇

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [映画館検索](docs/features/korean-cinema-search.md) | `korean-cinema-search` | CGV・メガボックス・ロッテシネマの映画館、上映作、時間表、残席照会です |
| [公演日程・残席照会](docs/features/ticket-availability.md) | `ticket-availability` | YES24・Interparkの公演の回別日程と等級別の残席数を、単一のHTTP呼び出しで照会します（照会専用、予約・決済なし） |
| [KOPIS公演照会](docs/features/kopis-performance-search.md) | `kopis-performance-search` | KOPISの公演・施設一覧と詳細を照会します（プロキシ経由）。予約・決済は公式予約サイトで行います |
| [宝くじ（로또）の当せん確認](docs/features/lotto-results.md) | `lotto-results` | ロトの最新回、特定の回、番号の照合です |
| [朝鮮王朝実録検索](docs/features/joseon-sillok-search.md) | `joseon-sillok-search` | 朝鮮王朝実録のキーワード検索と王別/年度別フィルタ、記事抜粋の照会です |
| [国家遺産検索・行事照会](docs/features/korean-heritage-search.md) | `korean-heritage-search` | 国家遺産庁の公式Open APIで、国家遺産の一覧・詳細情報・座標と、月別の国家遺産活用行事を照会します |

### ⛪ 宗教

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [宗教施設探し](docs/features/religious-facility-search.md) | `religious-facility-search` | 町・駅名・ランドマーク基準で近くの教会・聖堂・寺刹を距離順に照会し、住所・電話・Kakao Mapリンクを整理します（ユーザーキー不要） |

### 🎓 教育・奨学・学術

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [奨学金の検索および照会](docs/features/korean-scholarship-search.md) | `korean-scholarship-search` | 韓国奨学財団・全国の大学・財団・企業の奨学公告を検索し、金額・資格・支援区間・リンクを整理し、KST基準の現在日での締切状態と条件別フィルタリングまで提供します |
| [学校給食の献立照会](docs/features/k-schoollunch-menu.md) | `k-schoollunch-menu` | 教育庁・学校名でNEISの学校検索・給食献立を照会します |
| [図書館の図書照会](docs/features/library-book-search.md) | `library-book-search` | 図書館情報ナル（도서관 정보나루）ベースの図書検索、詳細、所蔵図書館、図書館別の所蔵有無照会です |
| [KERIS/RISS学術資料検索](docs/features/keris-academic-search.md) | `keris-academic-search` | 学位論文・国内外の学術論文・単行本・研究報告書・学術誌のメタデータと原文可否表示を照会します |

### 📰 ニュース・情報・リサーチ

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [Naverニュース検索](docs/features/naver-news-search.md) | `naver-news-search` | Naver検索Open APIのニュース検索で、記事タイトル・要約・発行時刻・原文/Naverリンクを整理します |
| [Hankook Ilbo（한국일보）ニュース照会](docs/features/hankookilbo-news.md) | `hankookilbo-news` | Hankook Ilboの公式リモートMCPサーバーを認証なしで直接呼び出し、編集トップ・よく読まれた記事・じっくり読まれた記事・最新・セクション別おすすめ・トピック検索・今日の運勢を記事メタデータとして照会します |
| [Naverブログリサーチ](docs/features/naver-blog-research.md) | `naver-blog-research` | Naverブログの検索、原文の読み込み、画像ダウンロード、韓国語コンテンツのクロス検証です |
| [GeekNews照会](docs/features/geeknews-search.md) | `geeknews-search` | GeekNewsの公開RSS/Atomフィードベースの最新記事一覧、検索、詳細確認です |

### ✍️ 韓国語・ライティング

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国語のスペルチェック](docs/features/korean-spell-check.md) | `korean-spell-check` | 韓国語テキストのスペル/文法チェックと修正案の整理です |
| [韓国語AIリライト](docs/features/korean-humanizer.md) | `korean-humanizer` | AIが書いたと分かる韓国語の文章を、翻訳調・AIの決まり文句・誇張された意義・ダッシュ/絵文字などの痕跡を深刻度（S1/S2/S3）で分類し、意味は保ちつつ人の文章にリライトし、目標文字数も調整します |
| [韓国語の流行語ライティング](docs/features/korean-slang-writing.md) | `korean-slang-writing` | Namu Wiki（나무위키）の流行語ベースのキュレーションシードで韓国の流行語候補を照会し、ムード/文脈/safetyフィルタとNamu Wikiのbest-effort要約により、韓国語の文章を流行語の感じで書きます |
| [韓国中世国語風変換](docs/features/korean-middle-korean.md) | `korean-middle-korean` | 韓国語の入力文を、中世国語風の助詞・語尾・Hanjaヒント・声調点が混ざった創作向け文体へ決定論的に変換します |
| [韓国語の文字数カウント](docs/features/korean-character-count.md) | `korean-character-count` | 韓国語テキストの文字数・行数・UTF-8/NEIS byte数を決定論的に計算します |

### 🌤️ 天気・環境

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国の天気照会](docs/features/korea-weather.md) | `korea-weather` | 気象庁の短期予報・超短期予報（超短期実況）ベースの韓国天気照会です |
| [ソウル気象リスク時間帯の照会](docs/features/seoul-weather-risk.md) | `seoul-weather-risk` | ASK Seoul Marketplace の場所別の酷暑・寒波・豪雨・大雪・強風の候補予報時間帯と判定根拠を照会します（気象庁の公式特報ではありません） |
| [ユーザー位置の微細粉塵（PM10/PM2.5）照会](docs/features/fine-dust-location.md) | `fine-dust-location` | 現在位置または地域基準のPM10/PM2.5の微細粉塵を照会します |
| [漢江の水位情報照会](docs/features/han-river-water-level.md) | `han-river-water-level` | 漢江の観測所基準で、現在の水位・流量・基準水位を確認します |

### 🧺 生活・その他

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [韓国の祝日・特殊日照会](docs/features/korean-holiday-calendar.md) | `korean-holiday-calendar` | 韓国天文研究院の特殊日情報で、祝日・建国記念日・記念日・二十四節気・雑節を照会します（公共データポータル（공공데이터포털）15012690、プロキシ経由） |
| [郵便番号検索](docs/features/zipcode-search.md) | `zipcode-search` | 住所キーワードで郵便番号 + 公式英文住所を照会します |
| [生活ごみの排出情報照会](docs/features/household-waste-info.md) | `household-waste-info` | 市郡区基準で生活ごみ・生ごみ・リサイクルの排出曜日・時間・場所・管理部署を確認します |
| [近くの公衆トイレ探し](docs/features/public-restroom-nearby.md) | `public-restroom-nearby` | 現在地基準で近くの公衆トイレ/開放トイレを照会します |
| [寄付先の照会](docs/features/donation-place-search.md) | `donation-place-search` | 地域・関心分野基準で寄付先候補を照会し、公式の後援申請を支援します |
| [KakaoTalk Macアーカイブ検索](docs/features/kakaotalk-mac.md) | `kakaotalk-mac` | `katok` でmacOSのKakaoTalkローカルアーカイブを同期し、keyword/BM25/semantic検索を行います |

### 🛠️ 開発者・ドキュメントツール

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [HWP文書の照会/変換](docs/features/hwp.md) | `hwp` | `.hwp/.hwpx` → Markdown/JSON変換、文書比較、様式フィールド抽出、Markdown→HWPX逆変換です（kordocベースのread-only） |
| [HWP文書の編集](docs/features/rhwp-edit.md) | `rhwp-edit` | `.hwp` の本文テキストの挿入/削除、表の作成、セルの修正、replace-allです（`k-skill-rhwp` CLI + `@rhwp/core` WASM、HWP 5.x round-trip） |
| [HWPレイアウト・IRデバッグ](docs/features/rhwp-advanced.md) | `rhwp-advanced` | アップストリームの `rhwp` Rust CLI（`export-svg --debug-overlay`, `dump`, `dump-pages`, `ir-diff`, `thumbnail`, `convert`）で、HWPレイアウトの診断・IRダンプ・バージョン比較・サムネイル抽出・配布用文書のロック解除を行います |
| [KR WHOIS照会](docs/features/kr-whois-lookup.md) | `kr-whois-lookup` | 公共データポータルWHOISで `.kr`/`.한국` ドメイン・IP・ASの公開登録情報を照会します（15094277、プロキシ経由） |

### 🔮 運勢・命名

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [四柱推命の運勢鑑定](docs/features/saju-fortune.md) | `saju-fortune` | 生年月日時・性別・新暦/旧暦の情報をインタビューで確認したうえで、四柱八字、五行の分布、恋愛運・金運・仕事運・健康運・相性を対話形式で鑑定します |
| [命名所](docs/features/naming-house.md) | `naming-house` | 生年月日時・姓・候補名をもとに、四柱の五行、姓名学の画数、発音の流れを基準とした名前の推薦/スコアを提供します |

### ⚙️ 共通設定・管理

| できること | スキル名 | 説明 |
| --- | --- | --- |
| [K-スキル共通設定](docs/setup.md) | `k-skill-setup` | k-skill全体のインストール後にcredentialを確保し、ランタイム環境変数を確認し、任意のアップデート確認とGitHub star同意の流れを案内します |
| [K-スキルクリーナー](docs/features/k-skill-cleaner.md) | `k-skill-cleaner` | インタビューとコーディングエージェント別のトリガー回数統計を合わせて、不要なK-スキルの削除候補を推薦します |

## Claude Codeプラグインとしてインストール

[Claude Code](https://claude.com/claude-code)では、マーケットプレイスから全スキルを一括でインストールできます。

```
/plugin marketplace add NomaDamas/k-skill
/plugin install k-skill@k-skill
```

インストールすると、スキルは `/k-skill:<スキル名>` のネームスペースで呼び出されます（例: `/k-skill:lotto-results`）。個別ディレクトリを直接コピーする手動インストールや、他のエージェントへのインストールは[インストール方法](docs/install.md)を参照してください。

## はじめの手順

1. [インストール方法](docs/install.md)に従って、`k-skill` の全スキルをまずインストールします。
2. インストールが終わったら `k-skill-setup` スキルを使って、credentialの確保と環境変数の確認を進めます。
3. シークレットが空の場合は[共通設定ガイド](docs/setup.md)と[セキュリティ/シークレットポリシー](docs/security-and-secrets.md)に従って、credential resolution orderで確保します。
4. Node/Pythonパッケージがない場合は、まずグローバルインストールを基本として進めます。
5. 各機能ドキュメントを開いて、入力値、例、制限事項を確認します。

## ドキュメント

| ドキュメント | 説明 |
| --- | --- |
| [インストール方法](docs/install.md) | パッケージのインストール、選択インストール、ローカルテストの方法 |
| [コントリビューションガイド](CONTRIBUTING.md) | 外部コントリビューター向けのコミュニケーション、PR対象ブランチ、スキルドキュメント、Changesets、プロキシポリシー |
| [Manus.aiからのインポート](docs/install-manus.md) | Manus.aiで個別スキルフォルダのURLをインポートするか、`npm run build:manus-bundle` でビルドした `.skill` ファイルをドラッグ&ドロップでアップロードする方法 |
| [共通設定ガイド](docs/setup.md) | credential resolution order、デフォルトのsecretsファイルの準備 |
| [セキュリティ/シークレットポリシー](docs/security-and-secrets.md) | 認証情報の保存原則、禁止パターン、標準環境変数名 |
| [k-skillプロキシサーバーガイド](docs/features/k-skill-proxy.md) | 無料APIをプロキシサーバー経由で直接呼び出す方法 |
| [リリース/デプロイガイド](docs/releasing.md) | npm Changesets、Python release-please、trusted publishingの運用ルール |
| [ロードマップ](docs/roadmap.md) | 現在含まれる機能と次の候補 |
| [出典/参考表面](docs/sources.md) | 設計時に参考にした公開ライブラリと公式ドキュメント |

インストールの基本フローは「全スキルをインストール → `k-skill-setup` を実行 → 個別機能を使用」です。

## ライセンス

このリポジトリの基本ライセンスは [MIT](LICENSE) です。ただし、プロキシサーバー関連のディレクトリには AGPL-3.0-only が適用されます。

- `packages/k-skill-proxy/` — [AGPL-3.0-only](packages/k-skill-proxy/LICENSE)
- `infra/k-skill-proxy-dashboard/` — AGPL-3.0-only（プロキシ監視スタック）

第三者の商標およびサービス名は、機能・照会対象・互換対象を説明する目的でのみ使用しており、別段の明示がない限り、当該権利者や運営会社の公式機能・サポート・提携・承認または協働を意味しません。公開情報の照会機能は個人的・非組織的な用途にのみ使用し、大量・体系的なクローリングやアクセス制御の回避、サービスの障害・営業妨害をしてはなりません。

## コントリビューター

[![k-skill コントリビューター](https://contrib.rocks/image?repo=NomaDamas/k-skill)](https://github.com/NomaDamas/k-skill/graphs/contributors)

