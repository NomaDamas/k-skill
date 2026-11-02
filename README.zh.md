🌐 [한국어](README.md) | [English](README.en.md) | [中文](README.zh.md) | [日本語](README.ja.md)

> 本译文面向外国游客以及在韩国居住的外国人。表格中链接的各技能详细文档均以韩语撰写（可请 AI 代理帮忙翻译），韩语 README.md 为唯一权威来源。

# k-skill

![k-skill thumbnail](docs/assets/k-skill-thumbnail.png)

你是韩国人吗？请把这个技能合集下载下来吧。总有一天你**一定会**用得上！
把 KTX、KBO、彩票、Daangn (당근)、Coupang (쿠팡)、KakaoTalk (카톡)、政府24 (정부24)、Hometax (홈택스) 等麻烦事，统统交给 AI 代理去办吧。

支持 Claude Code、Codex、OpenCode、OpenClaw/ClawHub 等各种编码代理。

无需额外的客户端 API 层。如有需要，只需向 `k-skill-proxy` 之类的代理服务器发送 HTTP 请求即可。

使用公开 API 代理的技能，其个人信息处理标准可在
[k-skill-proxy 隐私政策](https://k-skill-proxy.nomadamas.org/privacy)中查看。

CLI 使用量分析仅按 [CLI usage analytics](docs/usage-analytics.md) 所述，
以使用量统计为目的进行采集。不会采集命令参数、原文输入、文件内容、认证信息，
并可通过 `KSKILL_ANALYTICS_DISABLED=1` 拒绝。

> **铁路综合时刻表是仅查询技能。** KTX 仅查询 Korail (코레일) 官方计划时刻表，不执行登录、预订、候补预订、支付、取消。

## 安装

```bash
# 安装全部技能
npx --yes skills add NomaDamas/k-skill --all -g

# 仅安装特定技能
npx --yes skills add NomaDamas/k-skill --skill railway-timetable -g

# 若 CLI 落后则更新，并一并更新包含 Vercel Agent Skills 在内的所有编码代理技能
npx -y @nomadamas/k-skill@0 update
```

基本安装只需要 Node.js 18 及以上和 `npx`。运行 KTX 官方时刻表 helper 时，还需要 Python 3.11 及以上和 `uv`。Claude Code 用户也可以通过下方的 marketplace 安装。详细方法请参考[安装方法](docs/install.md)。

## 等一下~~~

如果你是韩国人，就给 GitHub 点个 Star 吧。
不过，代理不要自动点击，只有在用户同意的情况下才执行 `gh repo star NomaDamas/k-skill`。

贡献之前，请先查看[贡献指南](CONTRIBUTING.md)。

## 搭配使用更佳的工具

如果说 k-skill 把代理连接到**韩国服务**，那么下面这两个则把代理连接到**我的电脑**。

- 🔎 **[AutoRAG Agent](https://github.com/Marker-Inc-Korea/AutoRAG)**：能读取文件、KakaoTalk (카톡)、Slack、邮件乃至 HWP，并给出带来源引用的个人图书管理员代理。通过 MCP 连接到 Claude Code、Codex。`npm i -g @autorag/librarian`
- 🌻 **[Dazzi](https://dazziapp.com/)**：基于 AutoRAG 的 AI 文件管理器（macOS、Windows）。`brew install --cask nomadamas/dazzi/dazzi`

## 合作伙伴

<!-- BC카드 공식 심볼 원본: https://cdn.bccard.com/static/images/comm/logo/etc-bc-s-1-l.png (144×144, 3× 표시 해상도) -->
<p align="center">
  <a href="https://www.bccard.com"><img src="docs/assets/bccard-logo.png" alt="BC카드" width="48" height="48"></a>&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/assets/heyumi-logo.png" alt="Heyumi" width="48" height="48">
</p>

## 能做些什么

共 133 个技能，按韩国实际生活领域分类整理。每个领域都汇总在下方各自的表格中。

### 🚉 出行·交通·旅行

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [铁路综合时刻表查询](docs/features/railway-timetable.md) | `railway-timetable` | KTX Korail (코레일) 官方公开时刻表查询专用 |
| [高速巴士预订](docs/features/express-bus-booking.md) | `express-bus-booking` | KOBUS 班次·座位·票价·临时占座查询与预订支持 |
| [市外巴士预订](docs/features/intercity-bus-booking.md) | `intercity-bus-booking` | T-money (티머니) 班次·座位·票价·临时占座查询与预订支持 |
| [机票价格查询](docs/features/flight-ticket-search.md) | `flight-ticket-search` | 基于 `fast-flights` 的 Google Flights 公开搜索，比较航班候选项、预订搜索链接，以及按日期/月/年的最低价·平均价（仅查询，不预订、不支付） |
| [MyRealTrip (마이리얼트립) MCP 搜索](docs/features/myrealtrip-search.md) | `myrealtrip-search` | 通过官方 MCP 服务器搜索机票、住宿、旅游·门票·活动，并查看详情·选项 |
| [外交部海外安全·旅行警报查询](docs/features/mofa-travel-safety.md) | `mofa-travel-safety` | 查询外交部 0404 按国家·地区的官方旅行警报与警报内容（经由代理） |
| [自然休养林空房查询](docs/features/foresttrip-vacancy.md) | `foresttrip-vacancy` | 官方 森林漫步e (숲나들e) 空房查询与预订支持 |
| [首尔地铁到站信息查询](docs/features/seoul-subway-arrival.md) | `seoul-subway-arrival` | 按首尔地铁车站查看实时预计到站列车 |
| [首尔 叮铃铃 (따릉이) 实时租借点查询](docs/features/seoul-bike.md) | `seoul-bike` | 按当前坐标附近或租借点名称，查询 叮铃铃 可租借自行车与空车桩 |
| [首尔实时拥挤度查询](docs/features/seoul-density.md) | `seoul-density` | 查询首尔主要 121 个热门地点的实时拥挤等级与估算人口 |
| [韩国公共交通路线导航](docs/features/korean-transit-route.md) | `korean-transit-route` | 基于 ODsay LIVE API + Kakao geocoding，查询起点→终点的地铁+巴士+步行路线及换乘信息 |
| [Kakao Map (카카오맵) 地点·驾车路线导航](docs/features/kakao-map.md) | `kakao-map` | Kakao Local 关键词/类别/坐标↔地址转换 + Kakao Mobility 驾车路线导航（距离·所需时间·通行费·预计出租车费） |
| [高速公路交通量·通行状况·CCTV 查询](docs/features/highway-traffic-status.md) | `highway-traffic-status` | 通过韩国道路公社·ITS 公开 API，查询高速公路各路段实时速度/交通量/拥堵等级及 CCTV 流元数据 |
| [KOMSA 沿岸客轮信息查询](docs/features/komsa-ferry-info.md) | `komsa-ferry-info` | 通过 KOMSA MTIS 官方 API 查询沿岸客轮航行日程·船舶·停靠港·航线·航行状态（经由代理） |
| [查找附近最便宜的加油站](docs/features/cheap-gas-nearby.md) | `cheap-gas-nearby` | 按当前位置查询附近最低价加油站 |
| [查找附近公共停车场](docs/features/parking-lot-search.md) | `parking-lot-search` | 按当前位置查询附近公共停车场位置·费用·运营时间 |
| [电动汽车充电站位置·状态查询](docs/features/ev-charger-nearby.md) | `ev-charger-nearby` | 按地区·充电站查询电动汽车充电站信息与充电桩当前状态（公共数据门户 15076352，经由代理） |
| [地铁遗失物品查询](docs/features/subway-lost-property.md) | `subway-lost-property` | 按地铁车站/物品名查询官方 LOST112 遗失物品检索条件与失物中心入口指引 |

### 🏠 房地产·住宅

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩国不动产实际成交价查询](docs/features/real-estate-search.md) | `real-estate-search` | 查询公寓/写字楼/联排别墅/独栋住宅的实际成交价·全租月租·地区代码 |
| [韩国住宅公示价格查询](docs/features/housing-official-price.md) | `housing-official-price` | 直接从 realtyprice.kr 公开网页数据表面查询共同住宅·个别住宅的政府公示价格历史（并非官方文档化的 OpenAPI） |
| [民营住宅认购加分·预存款标准查询](docs/features/housing-subscription-reference.md) | `housing-subscription-reference` | 依据《关于住宅供应的规则》附表 1、附表 2 查询认购加分（无房期间·抚养家属·加入期间 84 分）及按地区·面积的认购预存款（无需依赖外部 CSV，使用内置参考值） |
| [个别公示地价查询](docs/features/gongsijiga-search.md) | `gongsijiga-search` | 通过 realtyprice.kr 公开 API 查询按地号单位的个别公示地价（韩元/㎡）多年趋势及同比变动率 |
| [建筑物台账封面部查询](docs/features/building-register-search.md) | `building-register-search` | 通过地址·PNU·法定洞代码与宗地查询主用途·总建筑面积·层数·使用批准日（公共数据门户 15134735，经由代理） |
| [LH 认购公告查询](docs/features/lh-notice-search.md) | `lh-notice-search` | 按地区·状态·公告类型·关键词查询韩国土地住宅公社(LH)的租赁/销售/居住福利（新婚希望城）/土地/商铺公告，并以韩国标准时间(KST)显示是否截止 |
| [SH 认购·住宅公告查询](docs/features/sh-notice-search.md) | `sh-notice-search` | 直接查询首尔住宅城市开发公社(SH)公开公告/通知公告板，按关键词·公告种类查看列表、详情正文、附件预览元数据 |
| [法院拍卖不动产出售公告查询](docs/features/court-auction-notice-search.md) | `court-auction-notice-search` | 以出售日期·法院·期日/期间投标条件检索大法院拍卖信息(courtauction.go.kr)的不动产出售公告，展开案件编号·用途·地址·鉴定评估价·最低出售价格，并可用案件编号直接查询案件信息·标的明细·出售日期历史 |
| [Daangn 房地产 (당근부동산) 搜索](docs/features/daangn-realty-search.md) | `daangn-realty-search` | 通过 Daangn 房地产公开网页数据表面，进行基于地区的房源搜索与详情查看 |

### ⚖️ 法律·公共

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩国法令检索](docs/features/korean-law-search.md) | `korean-law-search` | 检索韩国法令/条文/判例/有权解释；只给定修订条文时，抓取现行条文生成新旧条文对照表（保存为韩文 `.hwpx`） |
| [韩国专利信息检索](docs/features/korean-patent-search.md) | `korean-patent-search` | 韩国专利/实用新型关键词检索及申请号详情查询 |
| [韩国隐私政策·使用条款自动生成](docs/features/korean-privacy-terms.md) | `korean-privacy-terms` | 为 Next.js 项目生成基于《个人信息保护法》·《条款规制法》·《电子商务法》的隐私政策/使用条款/Cookie 横幅/同意弹窗的 `kimlawtech/korean-privacy-terms`（Apache-2.0）薄封装 |
| [登记簿誊本自动化](docs/features/iros-registry-automation.md) | `iros-registry-automation` | 辅助在互联网登记所(IROS)中将法人/不动产登记簿誊本加入购物车、手动支付后查看·保存的流程 |
| [法人登记申请咨询](docs/features/corporate-registration-consulting.md) | `corporate-registration-consulting` | 以普通营利股份公司发起设立为基准，接收法人名称·董事·地址等用户决策事项，就标准章程、设立登记附件、登记许可税·过密抑制圈域加重的检查项、基于 rhwp 的 HWP 表单顺序填写流程提供参考指引 |
| [支付令申请辅助](docs/features/court-payment-order-assistant.md) | `court-payment-order-assistant` | 整理法院电子诉讼支付令申请所需的债权人·债务人·请求原因·证据信息，准备草稿/清单以及登录后的浏览器交接(handoff) |
| [国会法案·表决查询](docs/features/assembly-bill-vote-search.md) | `assembly-bill-vote-search` | 通过开放国会信息 Open API 查询法案检索·详情及国会议员全体会议表决（经由代理，仅查询） |
| [公务出国报告查询](docs/features/gov-overseas-trip-report.md) | `gov-overseas-trip-report` | 从选举管理委员会·国民权益委员会·信息公开门户·大邱/大田/京畿/庆北议会等公开表面查询出国/培训报告·现状，表格外的机构则通过 discover 主动探索（排除登录墙，非判定） |
| [ShareNuri (공유누리) 公共设施搜索](docs/features/sharenuri-facility-search.md) | `sharenuri-facility-search` | 通过 ShareNuri 公开综合搜索，按关键词·地区·是否免费查询全国公共开放资源（会议室·体育设施·住宿·物品等），并提供详情信息·预约路径指引（无需认证密钥·登录） |

### 🏢 事业·商圈·税务

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [营业执照信息确认](docs/features/nts-business-registration.md) | `nts-business-registration` | 国税厅营业执照号码状态查询与营业执照信息真伪确认（公共数据门户 API，经由代理） |
| [企业尽职调查综合](docs/features/biz-health-check.md) | `biz-health-check` | 以营业执照号码为核心，若同时提供商号·地区，则交叉查询国税厅状态·国民年金·欠税名单·金融委法人概况·不当投标制裁·许可营业状态，生成尽调报告（不评分·不判定，仅事实） |
| [国民年金参保工作单位查询](docs/features/national-pension-workplace.md) | `national-pension-workplace` | 按工作单位名称查询国民年金参保人数·当月征收金额·月度趋势（公共数据门户 API，经由代理） |
| [国税欠税名单公开检索](docs/features/nts-tax-delinquency.md) | `nts-tax-delinquency` | 按商号·法人名称对照国税厅高额·习惯性欠税者名单公开（无需认证的公开检索） |
| [金融委企业基本信息查询](docs/features/fsc-corporate-info.md) | `fsc-corporate-info` | 按法人名称查询代表人·设立日·行业等法人概况，并与营业执照号码交叉验证（公共数据门户 API，经由代理） |
| [许可营业状态查询](docs/features/localdata-business-status.md) | `localdata-business-status` | 按商号+市郡区查询社区商户（208 个行业）的营业/停业/歇业·经营年限·地址（LOCALDATA 无需认证） |
| [长寿店铺雷达](docs/features/store-longevity-radar.md) | `store-longevity-radar` | 利用商圈（商业圈）信息公开文件（无需认证）抽取行业·商号关键词的全部店铺，并与历史快照通过商号+坐标匹配，提取长寿店铺 |
| [韩国企业账簿自动化](docs/features/korean-jangbu-for.md) | `korean-jangbu-for` | 基于 `kimlawtech/korean-jangbu-for` 的银行卡·银行·收据·税务发票输入 → 生成标准交易明细·会计科目·交付税务师的 CSV·经营报告的薄封装 |
| [Popbill (팝빌) 业务 API](docs/features/popbill.md) | `popbill` | 以本地 BYOK 方式调用 Popbill 电子税务发票·电子明细单·现金收据·短信·KakaoTalk·传真·停歇业/企业信息·账户查询·Hometax 采集 |
| [Naver 搜索广告成效查询](docs/features/naver-ad-performance.md) | `naver-ad-performance` | 查询 Naver 搜索广告系列/广告组/关键词的展示数·点击数·广告费·CTR·CPC·转化数，以及相关关键词·月搜索量工具（只读，仅限本地运行） |

### 🏛️ 政府扶持·采购

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [创业振兴院 K-Startup 查询](docs/features/kstartup-search.md) | `kstartup-search` | 查询创业振兴院 K-Startup 综合公告项目·扶持项目公告·创业内容·统计报告（公共数据门户 15125364，经由代理） |
| [政府扶持全面调查](docs/features/government-support-survey.md) | `government-support-survey` | 综合查询 K-Startup·企业广场·NIPA·KOCCA·SMTECH 公开公告，并连同各来源的完整性·官方链接，保守地评估项目适配性 |
| [国家集市 (나라장터) 订货计划搜索](docs/features/g2b-order-plan-search.md) | `g2b-order-plan-search` | 按订货年月·公告日期时间·机构·项目名称条件查询物品·工程·服务·外资订货计划（公共数据门户 API，经由代理） |
| [不当投标制裁企业查询](docs/features/g2b-sanctioned-supplier.md) | `g2b-sanctioned-supplier` | 按营业执照号码查询国家集市不当投标制裁（查询时点有效的制裁）（公共数据门户 API，经由代理） |
| [国防电子采购公告查询](docs/features/d2b-notice-search.md) | `d2b-notice-search` | 优先通过 Aside Browser 查询国防电子采购系统(D2B)公开招标公告页面，并按公告名称·公告区分·日期·G2B 公告编号·订货机构条件检索 |
| [S2B 学校集市公告查询](docs/features/s2b-notice-search.md) | `s2b-notice-search` | 优先通过浏览器查询 S2B 学校集市公开客户公告/报价请求页面，并解析列表·详情 HTML fixture |
| [Boim (보임) 企业·招标查找](docs/features/boim-business-search.md) | `boim-business-search` | 按地区×行业·商号查询全国企业，按品名查询有公共采购业绩的企业，按词语一次性查询进行中的公共机构招标公告（国家集市·国防电子采购·LH·韩国水资源公社·누리장터）（Boim 公开搜索，无需认证） |
| [电动汽车补贴现状查询](docs/features/ev-subsidy-status.md) | `ev-subsidy-status` | 查询各地方自治团体的电动汽车民间公告·受理·出库·出库剩余数量及按车型的补贴 |

### 🧑‍💼 招聘·就业

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [JobKorea (잡코리아) 人才搜索](docs/features/jobkorea-talent-search.md) | `jobkorea-talent-search` | 在 JobKorea 企业会员登录会话中读取脱敏候选人信息，并在付费查看前编写候选名单 |
| [Saramin (사람인) 人才库搜索](docs/features/saramin-talent-search.md) | `saramin-talent-search` | 在 Saramin 企业会员人才库中读取脱敏候选人信息，并在付费查看前编写候选名单 |
| [基于简历的招聘公告匹配](docs/features/job-posting-match.md) | `job-posting-match` | 根据求职者的简历·期望条件，检索 JobKorea·Saramin 公开招聘公告，整理适配度与应聘策略 |
| [Daangn 兼职 (당근알바) 搜索](docs/features/daangn-jobs-search.md) | `daangn-jobs-search` | 通过 Daangn 兼职公开网页数据表面，进行基于关键词·地区的兼职公告搜索与详情查询 |

### 📈 金融·投资·经济统计

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩国股票信息查询](docs/features/korean-stock-search.md) | `korean-stock-search` | KRX 上市股票搜索、基本信息、每日行情查询 |
| [韩国债券品种查询·比较](docs/features/korean-bond-search.md) | `korean-bond-search` | 受 GS Quant 的 Instrument/Data 结构化方式启发，将韩国债券整理为标准 Bond Instrument 字段，并连同来源·确认时间检索·比较发行条件·余额·CALL/PUT·CB/EB/BW（无需登录·API 密钥） |
| [金融监督院 DART 电子公示查询](docs/features/k-dart.md) | `k-dart` | 公示检索、企业概况、财务报表、分红、增资/减资、审计意见、主要事项报告书等 14 个 endpoint |
| [国内·海外企业分析](docs/features/company-analysis.md) | `company-analysis` | 对照公开公示·业绩发布会，将三大财务报表的变化、业务·竞争格局、主要日程与查询时点股价，整理为 6 个部分的对话式分析（无需登录·API 密钥） |
| [Toss Securities (토스증권) 查询](docs/features/toss-investment.md) | `toss-investment` | 通过 Toss Securities 官方 Open API(OAuth2) 查询账户·持股·行情·订单等，仅限查询 |
| [大信证券 (대신증권) 研报查询](docs/features/daishin-report-search.md) | `daishin-report-search` | 从 GitHub Pages 上公开的大信证券研报 HTML 镜像中查询最新研报列表、原文、说明页面、Rating/Target 表 |
| [国家数据处 KOSIS 统计查询](docs/features/kosis-stats.md) | `kosis-stats` | 通过国家数据处运营的 KOSIS（国家统计门户）Open API 查询统计表检索·元数据·数据·大数据集（仅查询） |
| [韩国银行 ECOS 经济统计查询](docs/features/bok-ecos-stats.md) | `bok-ecos-stats` | 通过韩国银行 ECOS Open API 查询基准利率·汇率·消费者物价指数·货币量时间序列及 100 大核心指标 |
| [韩美国债市场分析](docs/features/government-bond-analysis.md) | `government-bond-analysis` | 验证韩国·美国国债利率与曲线变化、同一观测日的 10 年期利差、官方招标·货币政策日程，并以固定格式整理 |
| [多资产晨间简报](docs/features/multi-asset-morning-briefing.md) | `multi-asset-morning-briefing` | 独立确认美国·韩国最近已结束的交易时段，将全球股票·利率·FX·大宗商品·波动率与韩国传导路径、未来 5 个交易日日程，写成带依据链接的 7 个部分（无需登录·API 密钥） |
| [按事件的市场反应调研](docs/features/market-event-impact.md) | `market-event-impact` | 受 GS Quant 的 event_study·event_impact_analysis·CalendarAlignment 结构启发，调查定期·非典型事件的核心变化与市场解读、跨资产传导路径，将事件研究作为辅助证据呈现，并整理类似案例·下一个催化剂（无需登录·API 密钥） |

### 💊 健康·医疗

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [附近急诊室床位状态确认](docs/features/emergency-room-beds.md) | `emergency-room-beds` | 按当前位置查询附近急诊室的运营·病房/床位运营标志与更新时间（准确的剩余床位数/使用率不在公开的 E-Gen nearby 列表中） |
| [长期疗养·健康体检机构查询](docs/features/nhis-care-checkup-search.md) | `nhis-care-checkup-search` | 查询国民健康保险公团长期疗养机构·健康体检机构的公开候选（公共数据门户 15059029·15154419，经由代理） |
| [药品安全核查](docs/features/mfds-drug-safety.md) | `mfds-drug-safety` | 以访谈优先(interview-first)流程，通过代理查询食药处的 e약은요·安全常备药品信息 |
| [药学院信息院药品搜索](docs/features/kpic-drug-search.md) | `kpic-drug-search` | 搜索药学院信息院(KPIC)公开药品名称，并按药品代码查询详细原始记录（无需 API 密钥、登录或代理） |
| [食品安全核查](docs/features/mfds-food-safety.md) | `mfds-food-safety` | 以访谈优先流程，通过代理查询食药处不合格食品·食品安全国家召回信息 |
| [动物药房·经营动物用医药品的药房查询](docs/features/animal-pharmacy-search.md) | `animal-pharmacy-search` | 通过 Hongik Medicare (홍익메디케어) 公开 MCP 查询各地动物药房、产品搜索，以及基于最近 6 个月购买历史的经营药房 |

### 🛒 购物·二手交易

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [Coupang (쿠팡) 商品搜索](docs/features/coupang-product-search.md) | `coupang-product-search` | Coupang 商品搜索、Rocket Delivery (로켓배송) 筛选、价格区间搜索、比较、Best、Goldbox 特价查询 |
| [Naver 购物比价](docs/features/naver-shopping-search.md) | `naver-shopping-search` | 优先使用 Naver 搜索 Open API，以公开 BFF JSON 作为 fallback，比较商品候选·当前展示价·卖家链接 |
| [Danawa (다나와) 最低价比较](docs/features/danawa-price-search.md) | `danawa-price-search` | 通过 Danawa 公开搜索/比价表面，比较商品候选·各商城价格·含运费的实付价·银行卡折扣价·免息分期 |
| [Market Kurly (마켓컬리) 商品查询](docs/features/market-kurly-search.md) | `market-kurly-search` | Market Kurly 商品搜索、当前价格、是否折扣、是否售罄查询 |
| [Daiso (다이소) 商品查询](docs/features/daiso-product-search.md) | `daiso-product-search` | 确认 Daiso 各门店商品是否可自提（准确的各门店库存数量因 Daiso Mall 安全政策，自 2026-05-05 起被屏蔽） |
| [Olive Young (올리브영) 搜索](docs/features/olive-young-search.md) | `olive-young-search` | Olive Young 门店·商品·库存查询 |
| [今日之家 (오늘의집) 今日特惠查询](docs/features/ohou-today-deal.md) | `ohou-today-deal` | 查询今日之家公开的今日特惠特价商品的折扣率·价格·评价·链接 |
| [Bunjang (번개장터) 搜索](docs/features/bunjang-search.md) | `bunjang-search` | Bunjang 搜索、详情查询、可选收藏/聊天、AI TOON 导出 |
| [Daangn (당근) 二手交易搜索](docs/features/daangn-used-goods-search.md) | `daangn-used-goods-search` | 通过 Daangn 二手交易公开网页数据表面，进行基于关键词·地区的商品搜索与详情查询 |
| [Daangn 二手车 (당근중고차) 搜索](docs/features/daangn-cars-search.md) | `daangn-cars-search` | 通过 Daangn 二手车公开网页数据表面，进行基于地区·价格条件的车辆搜索与详情查询 |
| [消费者价格·召回信息查询](docs/features/consumer-price-safety-search.md) | `consumer-price-safety-search` | 查询真价格 (참가격) 价格信息与消费者24物品·召回信息 |
| [快递配送查询](docs/features/delivery-tracking.md) | `delivery-tracking` | 通过 CJ 大韩通运·邮政事业本部运单号查询配送状态 |

### 🍚 美食·酒类

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [KAMIS 农水畜产品价格查询](docs/features/kamis-food-price.md) | `kamis-food-price` | 查询 KAMIS 官方农水畜产品批发·零售价格及期间比较值（经由代理） |
| [附近酒吧查询](docs/features/kakao-bar-nearby.md) | `kakao-bar-nearby` | 按当前位置查询带营业状态·菜单·座位·电话号码的附近酒吧 |
| [Hola Poke (올라포케) 驿三店 Poke](docs/features/hola-poke-yeoksam.md) | `hola-poke-yeoksam` | Hola Poke 驿三店菜单、门店信息、活动参与流程指引 |
| [BC 卡 eat.pl 美食店搜索](docs/features/bccard-eatpl-search.md) | `bccard-eatpl-search` | 按地区·车站·街区搜索美食店·餐厅·咖啡馆。基于最近 1 个月支付数据的销售额排名与详情链接 |
| [HeyYumi (헤이유미) 可预约美食店搜索·餐厅预订](docs/features/heyyumi.md) | `heyyumi` | 一次 Google 登录（无需密钥）即可按地区·菜单·条件搜索餐厅·咖啡馆，发送预订请求并确认门店接受/拒绝，实时咨询空位·等位情况。也可以用外语提问 |

### ⚽ 体育·赛事

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩国马拉松赛程查询](docs/features/korean-marathon-schedule.md) | `korean-marathon-schedule` | 从 Go Running (고러닝) 公开页面与大韩铁人三项协会日程中查询马拉松·铁人三项赛事日程、地点、报名截止日、项目 |
| [KBO 比赛结果查询](docs/features/kbo-results.md) | `kbo-results` | 按日期的 KBO 比赛日程、结果、按队伍的筛选 |
| [KBL 比赛结果查询](docs/features/kbl-results.md) | `kbl-results` | 按日期的 KBL 比赛日程、结果、按队伍的筛选、当前排名确认 |
| [K 联赛比赛结果查询](docs/features/kleague-results.md) | `kleague-results` | 按日期的 K 联赛1/K 联赛2 比赛结果、按队伍的筛选、当前排名确认 |
| [LCK 比赛分析](docs/features/lck-analytics.md) | `lck-analytics` | LCK 比赛结果、当前排名、live turning point、Ban/Pick、补丁 Meta、战队实力评级 |

### 🎭 文化·历史·休闲

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [影院搜索](docs/features/korean-cinema-search.md) | `korean-cinema-search` | CGV·Megabox (메가박스)·Lotte Cinema (롯데시네마) 影院、上映影片、时刻表、剩余座位查询 |
| [演出日程·剩余座位查询](docs/features/ticket-availability.md) | `ticket-availability` | 通过单次 HTTP 调用查询 YES24·Interpark 演出的各场次日程与各等级剩余座位数（仅查询，不预订、不支付） |
| [KOPIS 演出查询](docs/features/kopis-performance-search.md) | `kopis-performance-search` | KOPIS 演出·设施列表与详情查询（经由代理）。预订·支付请至官方售票处 |
| [Lotto (로또) 中奖确认](docs/features/lotto-results.md) | `lotto-results` | Lotto 最新期、指定期、号码对照 |
| [朝鲜王朝实录检索](docs/features/joseon-sillok-search.md) | `joseon-sillok-search` | 朝鲜王朝实录关键词检索与按王/年份筛选、条目摘录查询 |
| [国家遗产检索·活动查询](docs/features/korean-heritage-search.md) | `korean-heritage-search` | 通过国家遗产厅官方 Open API 查询国家遗产列表·详情信息·坐标及每月国家遗产活用活动 |

### ⛪ 宗教

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [查找宗教设施](docs/features/religious-facility-search.md) | `religious-facility-search` | 按街区·车站名·地标查询附近教会·天主教堂·寺庙（按距离排序），并整理地址·电话·Kakao Map 链接（无需用户密钥） |

### 🎓 教育·奖学金·学术

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [奖学金搜索与查询](docs/features/korean-scholarship-search.md) | `korean-scholarship-search` | 检索韩国奖学财团·全国大学·财团·企业奖学金公告，整理金额·资格·资助区间·链接，并提供以韩国标准时间(KST)为基准的当前日期截止状态与按条件的筛选 |
| [学校供餐菜单查询](docs/features/k-schoollunch-menu.md) | `k-schoollunch-menu` | 按教育厅·学校名进行 NEIS 学校搜索·供餐菜单查询 |
| [图书馆图书查询](docs/features/library-book-search.md) | `library-book-search` | 基于 Data4Library (정보나루) 的图书搜索、详情、馆藏图书馆、各图书馆馆藏与否查询 |
| [KERIS/RISS 学术资料检索](docs/features/keris-academic-search.md) | `keris-academic-search` | 查询学位论文·国内外学术论文·专著·研究报告·学术期刊的元数据与是否可获取原文的标记 |

### 📰 新闻·信息·调研

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [Naver 新闻搜索](docs/features/naver-news-search.md) | `naver-news-search` | 通过 Naver 搜索 Open API 新闻检索，整理文章标题·摘要·发布时间·原文/Naver 链接 |
| [韩国日报 (한국일보) 新闻查询](docs/features/hankookilbo-news.md) | `hankookilbo-news` | 无需认证直接调用韩国日报官方远程 MCP 服务器，以文章元数据查询编辑头条·最多浏览·仔细阅读·最新·各版块推荐·主题搜索·今日运势 |
| [Naver 博客调研](docs/features/naver-blog-research.md) | `naver-blog-research` | Naver 博客搜索、原文阅读、图片下载、韩文内容交叉验证 |
| [GeekNews 查询](docs/features/geeknews-search.md) | `geeknews-search` | 基于 GeekNews 公开 RSS/Atom 源的最新文章列表、搜索、详情查看 |

### ✍️ 韩语·写作

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩语拼写检查](docs/features/korean-spell-check.md) | `korean-spell-check` | 韩语文本拼写/语法检查及修改建议整理 |
| [韩语 AI 润色](docs/features/korean-humanizer.md) | `korean-humanizer` | 将带明显 AI 痕迹的韩语文章，按翻译腔·AI 套话·夸大的意义·破折号/表情符号等痕迹分类严重程度(S1/S2/S3)，在保留原意的前提下润色成人类笔触，并对齐目标字数 |
| [韩语流行语写作](docs/features/korean-slang-writing.md) | `korean-slang-writing` | 以基于 Namu Wiki (나무위키) 流行语的策划种子查询韩国流行语候选，经情绪/语境/safety 筛选及 Namu Wiki 尽力而为(best-effort)摘要，把韩语文章写成流行语风格 |
| [韩语中世语风格转换](docs/features/korean-middle-korean.md) | `korean-middle-korean` | 将韩语输入文本确定性地转换为混用中世韩语风格助词·词尾·汉字词提示·声调符号的创作文体 |
| [韩语字数统计](docs/features/korean-character-count.md) | `korean-character-count` | 确定性地计算韩语文本的字数·行数·UTF-8/NEIS 字节数 |

### 🌤️ 天气·环境

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩国天气查询](docs/features/korea-weather.md) | `korea-weather` | 基于气象厅短期预报·超短期预报（超短期实况）的韩国天气查询 |
| [首尔气象风险时段查询](docs/features/seoul-weather-risk.md) | `seoul-weather-risk` | 查询 ASK 首尔 Marketplace 按地点的酷暑·寒潮·暴雨·大雪·强风候选预报时段与判定依据（非气象厅官方特报） |
| [用户位置细颗粒物查询](docs/features/fine-dust-location.md) | `fine-dust-location` | 按当前位置或地区查询 PM10/PM2.5 细颗粒物 |
| [汉江水位信息查询](docs/features/han-river-water-level.md) | `han-river-water-level` | 按汉江观测站确认当前水位·流量·基准水位 |

### 🧺 生活·其他

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [韩国公休日·特别日查询](docs/features/korean-holiday-calendar.md) | `korean-holiday-calendar` | 通过韩国天文研究院特别日信息查询公休日·国庆日·纪念日·24 节气·杂节（公共数据门户 15012690，经由代理） |
| [邮政编码搜索](docs/features/zipcode-search.md) | `zipcode-search` | 按地址关键词查询邮政编码 + 官方英文地址 |
| [生活垃圾投放信息查询](docs/features/household-waste-info.md) | `household-waste-info` | 按市郡区确认生活垃圾·厨余·可回收物的投放星期·时间·地点·管理部门 |
| [查找附近公共厕所](docs/features/public-restroom-nearby.md) | `public-restroom-nearby` | 按当前位置查询附近公共厕所/开放厕所 |
| [捐赠机构查询](docs/features/donation-place-search.md) | `donation-place-search` | 按地区·关注领域查询捐赠机构候选，并支持官方赞助申请 |
| [KakaoTalk (카카오톡) Mac 归档搜索](docs/features/kakaotalk-mac.md) | `kakaotalk-mac` | 用 `katok` 同步 macOS KakaoTalk 本地归档，并进行 keyword/BM25/semantic 搜索 |

### 🛠️ 开发者·文档工具

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [HWP 文档查看/转换](docs/features/hwp.md) | `hwp` | `.hwp/.hwpx` → Markdown/JSON 转换、文档比较、表单字段提取、Markdown→HWPX 反向转换（基于 kordoc，只读） |
| [HWP 文档编辑](docs/features/rhwp-edit.md) | `rhwp-edit` | `.hwp` 正文文本插入/删除、创建表格、修改单元格、replace-all（`k-skill-rhwp` CLI + `@rhwp/core` WASM，HWP 5.x 往返） |
| [HWP 布局·IR 调试](docs/features/rhwp-advanced.md) | `rhwp-advanced` | 用上游 `rhwp` Rust CLI（`export-svg --debug-overlay`、`dump`、`dump-pages`、`ir-diff`、`thumbnail`、`convert`）进行 HWP 布局诊断·IR 转储·版本比较·缩略图提取·分发用文档解锁 |
| [KR WHOIS 查询](docs/features/kr-whois-lookup.md) | `kr-whois-lookup` | 通过公共数据门户 WHOIS 查询 `.kr`/`.한국` 域名·IP·AS 公开注册信息（15094277，经由代理） |

### 🔮 运势·取名

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [四柱 (사주) 命理解读](docs/features/saju-fortune.md) | `saju-fortune` | 先通过访谈确认出生年月日时·性别·阳历/阴历信息，再以对话方式解读四柱八字、五行分布、恋爱运·财运·事业运·健康运·合婚 |
| [取名馆](docs/features/naming-house.md) | `naming-house` | 基于出生年月日时·姓氏·候选名字，提供以四柱五行、姓名学笔画数、读音流畅度为基准的名字推荐/评分 |

### ⚙️ 通用设置·管理

| 能做的事 | 技能名称 | 说明 |
| --- | --- | --- |
| [K-技能通用设置](docs/setup.md) | `k-skill-setup` | 在安装全部 k-skill 后，指引获取 credential、确认运行时环境变量、可选的更新检查与 GitHub star 同意流程 |
| [K-技能清理器](docs/features/k-skill-cleaner.md) | `k-skill-cleaner` | 结合访谈与各编码代理的触发次数统计，推荐可删除的多余 K-技能候选 |

## 作为 Claude Code 插件安装

在 [Claude Code](https://claude.com/claude-code)中，可以通过 marketplace 一次性安装全部技能。

```
/plugin marketplace add NomaDamas/k-skill
/plugin install k-skill@k-skill
```

安装后，技能会以 `/k-skill:<技能名称>` 命名空间调用（例如：`/k-skill:lotto-results`）。如需直接复制单个目录的手动安装或其他代理的安装方式，请参考[安装方法](docs/install.md)。

## 初次上手的步骤

1. 按照[安装方法](docs/install.md)先安装 `k-skill` 全部技能。
2. 安装完成后，使用 `k-skill-setup` 技能进行 credential 获取与环境变量确认。
3. 若 secret 为空，则按照[通用设置指南](docs/setup.md)和[安全/密钥策略](docs/security-and-secrets.md)，依 credential resolution order 获取。
4. 若缺少 Node/Python 包，先以全局安装为默认进行。
5. 打开各功能文档，确认输入值、示例、限制事项。

## 文档

| 文档 | 说明 |
| --- | --- |
| [安装方法](docs/install.md) | 包安装、可选安装、本地测试方法 |
| [贡献指南](CONTRIBUTING.md) | 面向外部贡献者的沟通、PR 目标分支、技能文档、Changesets、代理策略 |
| [从 Manus.ai 导入](docs/install-manus.md) | 从 Manus.ai 导入单个技能文件夹 URL，或将用 `npm run build:manus-bundle` 构建的 `.skill` 文件拖拽上传的方法 |
| [通用设置指南](docs/setup.md) | credential resolution order、默认 secrets 文件的准备 |
| [安全/密钥策略](docs/security-and-secrets.md) | 认证信息存储原则、禁止模式、标准环境变量名称 |
| [k-skill 代理服务器指南](docs/features/k-skill-proxy.md) | 直接通过代理服务器调用免费 API 的方法 |
| [发布/部署指南](docs/releasing.md) | npm Changesets、Python release-please、trusted publishing 的运营规则 |
| [路线图](docs/roadmap.md) | 当前包含的功能与下一步候选 |
| [来源/参考表面](docs/sources.md) | 设计时参考的公开库与官方文档 |

安装的基本流程是“安装全部技能 → 运行 `k-skill-setup` → 使用单个功能”。

## 许可

本仓库的默认许可是 [MIT](LICENSE)。但代理服务器相关目录适用 AGPL-3.0-only。

- `packages/k-skill-proxy/` — [AGPL-3.0-only](packages/k-skill-proxy/LICENSE)
- `infra/k-skill-proxy-dashboard/` — AGPL-3.0-only（代理监控栈）

第三方商标与服务名称仅用于说明功能·查询对象·兼容对象，除另有说明外，不代表相关权利人或运营方的官方功能·支持·合作·批准或协作。公开信息查询功能仅限个人、非组织性用途使用，不得进行大规模、系统性爬取，或规避访问控制，或造成服务故障、妨碍业务。

## 贡献者

[![k-skill 贡献者](https://contrib.rocks/image?repo=NomaDamas/k-skill)](https://github.com/NomaDamas/k-skill/graphs/contributors)
