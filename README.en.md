🌐 [한국어](README.md) | [English](README.en.md) | [中文](README.zh.md) | [日本語](README.ja.md)
> This translation is for foreign tourists and foreigners living in Korea. The detailed per-skill docs linked from the tables below are written in Korean (ask your AI agent to translate them). The Korean [README.md](README.md) is the source of truth.

# k-skill

![k-skill thumbnail](docs/assets/k-skill-thumbnail.png)

Are you Korean? Go ahead and download this skill collection. The day will come when you'll **definitely** need it!
Hand off all the annoying stuff — KTX, KBO, the lottery, Daangn, Coupang, KakaoTalk, Government24, HomeTax, and so on — to your AI agent.

It supports all kinds of coding agents, including Claude Code, Codex, OpenCode, and OpenClaw/ClawHub.

No extra client API layer is required. When needed, you can simply send HTTP requests to a proxy server such as `k-skill-proxy`.

The privacy practices for skills that use the public API proxy can be found in the
[k-skill-proxy Privacy Policy](https://k-skill-proxy.nomadamas.org/privacy).

CLI usage analytics is collected only for the usage statistics purposes described in
[CLI usage analytics](docs/usage-analytics.md). Command arguments, raw input, file contents, and
credentials are not collected, and you can opt out with `KSKILL_ANALYTICS_DISABLED=1`.

> **The integrated railway timetable is a lookup-only skill.** KTX retrieves Korail's official planned timetable and does not perform login, reservation, waitlisting, payment, or cancellation.

## Installation

```bash
# Install all skills
npx --yes skills add NomaDamas/k-skill --all -g

# Install only a specific skill
npx --yes skills add NomaDamas/k-skill --skill railway-timetable -g

# If the CLI is out of date, update it, and update all coding agent skills including Vercel Agent Skills along with it
npx -y @nomadamas/k-skill@0 update
```

The default installation only requires Node.js 18 or higher and `npx`. Running the KTX official timetable helper additionally requires Python 3.11 or higher and `uv`. Claude Code users can also install via the marketplace below. For details, see [Installation](docs/install.md).

## Just a moment~~~

If you're Korean, let's hit the GitHub star.
However, agents must not click it automatically; they only run `gh repo star NomaDamas/k-skill` when the user consents.

Before contributing, please check the [Contributing Guide](CONTRIBUTING.md).

## Tools That Work Well Together

If k-skill connects your agent to **Korean services**, the two below connect it to **your computer**.

- 🔎 **[AutoRAG Agent](https://github.com/Marker-Inc-Korea/AutoRAG)**: A personal librarian agent that reads files, KakaoTalk, Slack, mail, and even HWP, and gives answers with citations. Connect it to Claude Code/Codex via MCP. `npm i -g @autorag/librarian`
- 🌻 **[Dazzi](https://dazziapp.com/)**: An AutoRAG-based AI file manager (macOS/Windows). `brew install --cask nomadamas/dazzi/dazzi`

## Partners

<!-- BC카드 공식 심볼 원본: https://cdn.bccard.com/static/images/comm/logo/etc-bc-s-1-l.png (144×144, 3× 표시 해상도) -->
<p align="center">
  <a href="https://www.bccard.com"><img src="docs/assets/bccard-logo.png" alt="BC카드" width="48" height="48"></a>&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/assets/heyumi-logo.png" alt="Heyumi" width="48" height="48">
</p>

## What Can It Do

We've divided a total of 133 skills into categories by area of Korean daily life. Each area is organized in its own table below.

### 🚉 Mobility, Transit & Travel

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Integrated railway timetable lookup](docs/features/railway-timetable.md) | `railway-timetable` | Lookup-only for the official public KTX/Korail timetable |
| [Express bus booking](docs/features/express-bus-booking.md) | `express-bus-booking` | KOBUS schedule, seat, fare, and temporary hold lookup with booking support |
| [Intercity bus booking](docs/features/intercity-bus-booking.md) | `intercity-bus-booking` | Tmoney schedule, seat, fare, and temporary hold lookup with booking support |
| [Flight price search](docs/features/flight-ticket-search.md) | `flight-ticket-search` | Search publicly exposed Google Flights data via `fast-flights` to compare flight candidates, booking search links, and lowest/average prices by date/month/year (lookup only, no booking or payment) |
| [MyRealTrip (마이리얼트립) MCP search](docs/features/myrealtrip-search.md) | `myrealtrip-search` | Search flights, accommodations, and tours/tickets/activities via the official MCP server, with detail and option lookup |
| [MOFA (외교부) overseas safety & travel advisory lookup](docs/features/mofa-travel-safety.md) | `mofa-travel-safety` | Look up MOFA's official 0404 travel advisories by country/region and their details (via proxy) |
| [Recreation forest vacancy lookup](docs/features/foresttrip-vacancy.md) | `foresttrip-vacancy` | Look up vacancies on the official Foresttrip (숲나들e) and support booking |
| [Seoul subway arrival info lookup](docs/features/seoul-subway-arrival.md) | `seoul-subway-arrival` | Check real-time expected arriving trains by Seoul subway station |
| [Seoul Bike real-time rental station lookup](docs/features/seoul-bike.md) | `seoul-bike` | Query available Seoul Bike (따릉이) bikes and empty docks near your current coordinates or by rental station name |
| [Seoul real-time congestion lookup](docs/features/seoul-density.md) | `seoul-density` | Real-time congestion level and estimated population for 121 major hotspots in Seoul |
| [Korean public transit directions](docs/features/korean-transit-route.md) | `korean-transit-route` | Subway + bus + walking routes and transfer info from origin to destination based on the ODsay LIVE API + Kakao geocoding |
| [Kakao Map place & driving directions](docs/features/kakao-map.md) | `kakao-map` | Kakao Local keyword/category/coordinate↔address conversion + Kakao Mobility driving directions (distance, travel time, tolls, estimated taxi fare) |
| [Expressway traffic volume, flow & CCTV lookup](docs/features/highway-traffic-status.md) | `highway-traffic-status` | Real-time speed/traffic volume/congestion grade per expressway section and CCTV stream metadata via Korea Expressway Corporation and ITS public APIs |
| [KOMSA coastal ferry info lookup](docs/features/komsa-ferry-info.md) | `komsa-ferry-info` | Look up coastal ferry schedules, vessels, ports of call, routes, and operating status via the official KOMSA MTIS API (via proxy) |
| [Find the cheapest gas station nearby](docs/features/cheap-gas-nearby.md) | `cheap-gas-nearby` | Query the cheapest gas stations nearby based on your current location |
| [Find nearby public parking lots](docs/features/parking-lot-search.md) | `parking-lot-search` | Query nearby public parking lots' location, fees, and operating hours based on your current location |
| [EV charging station location & status lookup](docs/features/ev-charger-nearby.md) | `ev-charger-nearby` | EV charging station info and current charger status by region/station (Public Data Portal 15076352, via proxy) |
| [Subway lost property lookup](docs/features/subway-lost-property.md) | `subway-lost-property` | Official LOST112 lost-item search criteria by subway station/item name, with entry points to lost-and-found centers |

### 🏠 Real Estate & Housing

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean real estate actual transaction price lookup](docs/features/real-estate-search.md) | `real-estate-search` | Actual transaction prices, jeonse/monthly rent, and region codes for apartments/officetels/villas/detached houses |
| [Korean housing officially assessed price lookup](docs/features/housing-official-price.md) | `housing-official-price` | Query the history of government officially assessed prices for multi-family and individual houses directly from realtyprice.kr's publicly exposed web data surface (not an officially documented OpenAPI) |
| [Private housing subscription points & deposit reference lookup](docs/features/housing-subscription-reference.md) | `housing-subscription-reference` | Housing subscription application points (Appendices 1 and 2 of the 「Rules on Housing Supply」: 84 points for no-home period, dependents, and subscription period) and subscription deposits by region/size (bundled reference values with no external CSV dependency) |
| [Individual officially assessed land price lookup](docs/features/gongsijiga-search.md) | `gongsijiga-search` | Multi-year trends and year-on-year change rates of individual officially assessed land prices (KRW/㎡) at parcel-number level from realtyprice.kr's public API |
| [Building register title section lookup](docs/features/building-register-search.md) | `building-register-search` | Query main use, total floor area, number of floors, and approval-for-use date by address, PNU, legal-dong code, and parcel (Public Data Portal 15134735, via proxy) |
| [LH housing subscription notice lookup](docs/features/lh-notice-search.md) | `lh-notice-search` | Query Korea Land and Housing Corporation (LH) rental/sale/housing-welfare (Newlywed Hope Town)/land/commercial notices by region, status, notice type, and keyword, and show closure status based on KST |
| [SH housing subscription & housing notice lookup](docs/features/sh-notice-search.md) | `sh-notice-search` | Directly query Seoul Housing and Urban Development Corporation (SH)'s public announcement/notice board for lists by keyword and notice type, full details, and attachment preview metadata |
| [Court auction real estate sale notice lookup](docs/features/court-auction-notice-search.md) | `court-auction-notice-search` | Search real-estate sale notices on the Supreme Court Auction Information (courtauction.go.kr) by sale date, court, and auction date/period bidding conditions, expanding case number, use, address, appraised value, and minimum sale price; query case info, property details, and sale-date history directly by case number |
| [Daangn Realty (당근부동산) search](docs/features/daangn-realty-search.md) | `daangn-realty-search` | Search region-based real-estate listings and view details via Daangn Realty (당근부동산)'s publicly exposed web data surface |

### ⚖️ Law & Public Sector

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean law search](docs/features/korean-law-search.md) | `korean-law-search` | Search Korean statutes/articles/case law/authoritative interpretations; given only amended articles, it fetches the current version and builds a new/old side-by-side comparison table (saved as a Hangul `.hwpx`) |
| [Korean patent information search](docs/features/korean-patent-search.md) | `korean-patent-search` | Keyword search of Korean patents/utility models and detail lookup by application number |
| [Korean privacy policy & terms of service auto-generation](docs/features/korean-privacy-terms.md) | `korean-privacy-terms` | Thin wrapper around `kimlawtech/korean-privacy-terms` (Apache-2.0) that generates a privacy policy/terms of service/cookie banner/consent modal in a Next.js project based on the Personal Information Protection Act, Act on the Regulation of Terms and Conditions, and Electronic Commerce Act |
| [Register certificate automation](docs/features/iros-registry-automation.md) | `iros-registry-automation` | Assists the cart and the manual payment-then-view/save flow for corporate/real-estate register certificates on the Internet Registry Office (IROS) |
| [Corporate registration filing consulting](docs/features/corporate-registration-consulting.md) | `corporate-registration-consulting` | For a standard for-profit stock company under promoter incorporation, takes user decisions such as corporate name, directors, and address, and guides (for reference) the sequential HWP form creation flow — standard articles of incorporation, incorporation registration attachments, and the registration license tax/over-concentration control region heavier-tax check — using rhwp |
| [Payment order filing assistant](docs/features/court-payment-order-assistant.md) | `court-payment-order-assistant` | Organizes the creditor, debtor, cause of claim, and evidence info needed to file a court electronic litigation payment order, and prepares a draft/checklist and a post-login browser handoff |
| [National Assembly bill & vote lookup](docs/features/assembly-bill-vote-search.md) | `assembly-bill-vote-search` | Bill search/details and lawmakers' plenary votes via the Open National Assembly Information Open API (via proxy, lookup only) |
| [Government overseas trip report lookup](docs/features/gov-overseas-trip-report.md) | `gov-overseas-trip-report` | Query overseas official travel/training reports and status from public surfaces such as the NEC, ACRC, the Information Disclosure Portal, and the Daegu/Daejeon/Gyeonggi/North Gyeongsang councils; for agencies outside the table, actively discover them (login walls excluded, not a judgment) |
| [ShareNuri (공유누리) public facility search](docs/features/sharenuri-facility-search.md) | `sharenuri-facility-search` | Search national publicly opened resources (meeting rooms, sports facilities, lodgings, goods, etc.) by keyword, region, and free/paid via ShareNuri (공유누리)'s public integrated search, with details and booking-path guidance (no API key or login required) |

### 🏢 Business, Commerce & Tax

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Business registration info verification](docs/features/nts-business-registration.md) | `nts-business-registration` | NTS (국세청) business registration number status lookup and business registration info authenticity verification (Public Data Portal API, via proxy) |
| [Comprehensive business due diligence](docs/features/biz-health-check.md) | `biz-health-check` | A due-diligence report centered on the business registration number; when the trade name and region are also given, it cross-queries NTS status, the National Pension Service, the tax-delinquency list, the FSC corporate overview, improper-bidder sanctions, and licensing/business status (facts only, no score or judgment) |
| [National Pension enrolled workplace lookup](docs/features/national-pension-workplace.md) | `national-pension-workplace` | Query National Pension participant counts, current-month billed amounts, and monthly trends by workplace name (Public Data Portal API, via proxy) |
| [NTS tax delinquency disclosure search](docs/features/nts-tax-delinquency.md) | `nts-tax-delinquency` | Match against the NTS list of disclosed high-value/habitual tax delinquents by trade or corporate name (unauthenticated public search) |
| [FSC corporate basic info lookup](docs/features/fsc-corporate-info.md) | `fsc-corporate-info` | Query corporate overview—representative, founding date, industry—by corporate name, and cross-verify the business registration number (Public Data Portal API, via proxy) |
| [Licensing business status lookup](docs/features/localdata-business-status.md) | `localdata-business-status` | Look up open/suspended/closed status, business age, and address for neighborhood businesses (208 industries) by trade name + city/county/district (LOCALDATA, unauthenticated) |
| [Long-lived store radar](docs/features/store-longevity-radar.md) | `store-longevity-radar` | From public commercial-district (상권) information files (unauthenticated), extract all stores matching an industry/trade-name keyword, then match past snapshots by trade name + coordinates to extract long-lived stores |
| [Korean business bookkeeping automation](docs/features/korean-jangbu-for.md) | `korean-jangbu-for` | Thin wrapper based on `kimlawtech/korean-jangbu-for` that takes card/bank/receipt/tax-invoice inputs and produces standardized transactions, account titles, an accountant handoff CSV, and a management report |
| [Popbill (팝빌) business API](docs/features/popbill.md) | `popbill` | Call Popbill (팝빌) e-tax invoices, electronic statements, cash receipts, SMS, KakaoTalk, fax, business-open/close and corporate info, account lookup, and HomeTax collection in a local BYOK manner |
| [Naver Search Ad performance lookup](docs/features/naver-ad-performance.md) | `naver-ad-performance` | Query Naver Search Ad campaign/ad group/keyword impressions, clicks, spend, CTR, CPC, and conversions, plus related-keyword and monthly-volume tools (read-only, local execution only) |

### 🏛️ Government Support & Procurement

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korea Institute of Startup & Entrepreneurship Development (창업진흥원) K-Startup lookup](docs/features/kstartup-search.md) | `kstartup-search` | Query the Korea Institute of Startup & Entrepreneurship Development (창업진흥원) K-Startup integrated notices: programs, support-project announcements, startup content, and statistical reports (Public Data Portal 15125364, via proxy) |
| [Full government support survey](docs/features/government-support-survey.md) | `government-support-survey` | Integrate publicly available announcements from K-Startup, Bizinfo (기업마당), NIPA, KOCCA, and SMTECH, and conservatively assess project fit along with per-source completeness and official links |
| [Nara Marketplace order plan search](docs/features/g2b-order-plan-search.md) | `g2b-order-plan-search` | Query goods/construction/services/foreign-capital order plans by order year-month, posting date-time, agency, and project name (Public Data Portal API, via proxy) |
| [Improper-bidder sanctioned supplier lookup](docs/features/g2b-sanctioned-supplier.md) | `g2b-sanctioned-supplier` | Query Nara Marketplace improper-bidder sanctions (sanctions valid as of the lookup time) by business registration number (Public Data Portal API, via proxy) |
| [Defense electronic procurement notice lookup](docs/features/d2b-notice-search.md) | `d2b-notice-search` | Query the Defense Electronic Procurement System (D2B) public bid notice screen with Aside Browser as the preferred path, searching by notice title, notice type, date, G2B notice number, and ordering agency |
| [S2B School Marketplace notice lookup](docs/features/s2b-notice-search.md) | `s2b-notice-search` | Query the S2B School Marketplace public customer notice/quote-request screen with a browser-first approach, parsing list and detail HTML fixtures |
| [Find Boim companies & bids](docs/features/boim-business-search.md) | `boim-business-search` | In one query, find national companies by region×industry/trade name, companies with public procurement track records by product name, and ongoing public-agency bid notices (Nara Marketplace, D2B, LH, Korea Water Resources Corporation, Nuri Marketplace) by keyword (Boim public search, unauthenticated) |
| [EV subsidy status lookup](docs/features/ev-subsidy-status.md) | `ev-subsidy-status` | Query local-government EV private notices, applications, deliveries, and remaining delivery counts, plus subsidies by model |

### 🧑‍💼 Hiring & Jobs

| What it can do | Skill name | Description |
| --- | --- | --- |
| [JobKorea (잡코리아) talent search](docs/features/jobkorea-talent-search.md) | `jobkorea-talent-search` | Read masked candidate info from a JobKorea (잡코리아) corporate-member login session and build a shortlist before paid viewing |
| [Saramin (사람인) talent pool search](docs/features/saramin-talent-search.md) | `saramin-talent-search` | Read masked candidate info from the Saramin (사람인) corporate-member talent pool and build a shortlist before paid viewing |
| [Resume-based job posting matching](docs/features/job-posting-match.md) | `job-posting-match` | Search public job postings on JobKorea and Saramin based on the job seeker's resume and desired conditions, and summarize fit and application strategy |
| [Daangn Alba (당근알바) search](docs/features/daangn-jobs-search.md) | `daangn-jobs-search` | Search part-time job postings by keyword/region and view details via Daangn Alba (당근알바)'s publicly exposed web data surface |

### 📈 Finance, Investment & Economic Statistics

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean stock information lookup](docs/features/korean-stock-search.md) | `korean-stock-search` | Search KRX-listed stocks, basic info, and daily quotes |
| [Korean bond issue lookup & comparison](docs/features/korean-bond-search.md) | `korean-bond-search` | Inspired by GS Quant's Instrument/Data structuring approach, organize Korean bonds into standard Bond Instrument fields, and search/compare issue terms, outstanding balance, CALL/PUT, and CB/EB/BW with sources and verification timestamps (no login or API key required) |
| [FSS (금감원) DART electronic disclosure lookup](docs/features/k-dart.md) | `k-dart` | 14 endpoints covering disclosure search, corporate overview, financial statements, dividends, capital increases/decreases, audit opinions, and major-event reports |
| [Domestic & overseas company analysis](docs/features/company-analysis.md) | `company-analysis` | Cross-check public disclosures and earnings releases to summarize changes in the three major financial statements, the business and competitive landscape, key schedule, and the share price at lookup time in a 6-section chat analysis (no login or API key required) |
| [Toss Securities (토스증권) lookup](docs/features/toss-investment.md) | `toss-investment` | Lookup-only via Toss Securities (토스증권)'s official Open API (OAuth2): accounts, holdings, quotes, order lookup, etc. |
| [Daishin Securities (대신증권) report lookup](docs/features/daishin-report-search.md) | `daishin-report-search` | Query the latest report list, full text, description pages, and Rating/Target tables from the Daishin Securities (대신증권) report HTML mirror published on GitHub Pages |
| [Statistics Korea (국가데이터처) KOSIS statistics lookup](docs/features/kosis-stats.md) | `kosis-stats` | Query statistical tables, metadata, data, and large-scale datasets via the KOSIS (Korean Statistical Information Service) Open API operated by Statistics Korea (국가데이터처) (lookup only) |
| [Bank of Korea (한국은행) ECOS economic statistics lookup](docs/features/bok-ecos-stats.md) | `bok-ecos-stats` | Query time series for the base rate, exchange rates, consumer price index, and money supply, plus 100 key indicators, via the Bank of Korea (한국은행) ECOS Open API |
| [Korea–US government bond market analysis](docs/features/government-bond-analysis.md) | `government-bond-analysis` | Verify Korean and US government bond yields and curve changes, the 10-year yield spread on the same observation date, and official auction/monetary policy schedules, and present them in a fixed format |
| [Multi-asset morning briefing](docs/features/multi-asset-morning-briefing.md) | `multi-asset-morning-briefing` | Independently verify the most recently completed US and Korean sessions, and write up 7 sections with supporting links covering global stocks, rates, FX, commodities, volatility, the Korean transmission path, and the schedule for the next 5 trading days (no login or API key required) |
| [Per-event market reaction research](docs/features/market-event-impact.md) | `market-event-impact` | Inspired by GS Quant's event_study, event_impact_analysis, and CalendarAlignment structures, investigate the key changes and market interpretation of regular and irregular events and their cross-asset transmission paths, present event studies as supporting evidence, and summarize similar cases and next catalysts (no login or API key required) |

### 💊 Health & Medical

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Check nearby ER bed status](docs/features/emergency-room-beds.md) | `emergency-room-beds` | Query nearby ER operating and inpatient-room/bed operating flags and update times based on your current location (exact remaining bed counts/utilization are not in the public E-Gen nearby list) |
| [Long-term care & health checkup institution lookup](docs/features/nhis-care-checkup-search.md) | `nhis-care-checkup-search` | Query public candidates for NHIS (국민건강보험공단) long-term care institutions and health checkup institutions (Public Data Portal 15059029·15154419, via proxy) |
| [Drug safety check](docs/features/mfds-drug-safety.md) | `mfds-drug-safety` | Proxy query of MFDS (식약처) e-Yak-Eun-Yo and safety/OTC medicine info via an interview-first flow |
| [KPIC drug search](docs/features/kpic-drug-search.md) | `kpic-drug-search` | Search KPIC (약학정보원) public drug names and retrieve original detail records by drug code (no API key, login, or proxy required) |
| [Food safety check](docs/features/mfds-food-safety.md) | `mfds-food-safety` | Proxy query of MFDS (식약처) non-compliant food and Food Safety Korea recall info via an interview-first flow |
| [Veterinary pharmacy & veterinary medicine stocking pharmacy lookup](docs/features/animal-pharmacy-search.md) | `animal-pharmacy-search` | Query veterinary pharmacies by region, search products, and find stocking pharmacies based on the last 6 months of purchase history via Hongik Medicare (홍익메디케어)'s public MCP |

### 🛒 Shopping & Second-hand Trading

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Coupang product search](docs/features/coupang-product-search.md) | `coupang-product-search` | Coupang product search, Rocket Delivery filter, price-range search, comparison, best sellers, and Goldbox deals |
| [Naver Shopping price comparison](docs/features/naver-shopping-search.md) | `naver-shopping-search` | Compare product candidates, current displayed prices, and seller links via Naver Search Open API first, with a public BFF JSON fallback |
| [Danawa (다나와) lowest price comparison](docs/features/danawa-price-search.md) | `danawa-price-search` | Compare product candidates, per-mall prices, effective purchase price including shipping, card-discounted prices, and interest-free installments via Danawa (다나와)'s public search/price-comparison surface |
| [Market Kurly (마켓컬리) product lookup](docs/features/market-kurly-search.md) | `market-kurly-search` | Market Kurly (마켓컬리) product search, current price, discount status, and sold-out status |
| [Daiso (다이소) product lookup](docs/features/daiso-product-search.md) | `daiso-product-search` | Check product pickup availability by Daiso (다이소) store (exact per-store stock quantities have been blocked since 2026-05-05 due to Daiso Mall's security policy) |
| [Olive Young (올리브영) search](docs/features/olive-young-search.md) | `olive-young-search` | Olive Young (올리브영) store, product, and stock lookup |
| [Ohou (오늘의집) Today's Deal lookup](docs/features/ohou-today-deal.md) | `ohou-today-deal` | Query the discount rate, price, reviews, and links for Today's Deal bargain products publicly available on Ohou (오늘의집) |
| [Bunjang (번개장터) search](docs/features/bunjang-search.md) | `bunjang-search` | Bunjang (번개장터) search, detail lookup, optional likes/chat, and AI TOON export |
| [Daangn (당근) second-hand trading search](docs/features/daangn-used-goods-search.md) | `daangn-used-goods-search` | Search listings by keyword/region and view details via Daangn (당근) second-hand trading's publicly exposed web data surface |
| [Daangn Used Cars (당근중고차) search](docs/features/daangn-cars-search.md) | `daangn-cars-search` | Search vehicles by region/price conditions and view details via Daangn Used Cars (당근중고차)'s publicly exposed web data surface |
| [Consumer price & recall info lookup](docs/features/consumer-price-safety-search.md) | `consumer-price-safety-search` | Query Chamgagyeok (참가격) price info and Consumer24 (소비자24) product/recall info |
| [Parcel delivery tracking](docs/features/delivery-tracking.md) | `delivery-tracking` | Track delivery status by CJ Logistics (CJ대한통운)/Korea Post (우체국) invoice number |

### 🍚 Food & Drinks

| What it can do | Skill name | Description |
| --- | --- | --- |
| [KAMIS agricultural, fisheries & livestock price lookup](docs/features/kamis-food-price.md) | `kamis-food-price` | Query official KAMIS wholesale/retail prices for agricultural, fisheries, and livestock products and period-over-period comparison values (via proxy) |
| [Nearby bar lookup](docs/features/kakao-bar-nearby.md) | `kakao-bar-nearby` | Query nearby bars based on your current location, including opening status, menu, seating, and phone number |
| [Hola Poke (올라포케) Yeoksam poke](docs/features/hola-poke-yeoksam.md) | `hola-poke-yeoksam` | Menu, store info, and event participation flow for the Hola Poke (올라포케) Yeoksam branch |
| [BC Card eat.pl restaurant search](docs/features/bccard-eatpl-search.md) | `bccard-eatpl-search` | Search restaurants/food spots/cafes by region, station, or neighborhood. Top sellers based on the last month's payment data, with detail links |
| [HeyYumi (헤이유미) bookable restaurant search & dining reservation](docs/features/heyyumi.md) | `heyyumi` | With a single Google login (no key), search restaurants/cafes by region, menu, and conditions, send booking requests and check the store's acceptance/decline, and inquire about real-time seating/waiting. You can ask in a foreign language too |

### ⚽ Sports & Games

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean marathon schedule lookup](docs/features/korean-marathon-schedule.md) | `korean-marathon-schedule` | Query marathon/triathlon race schedules, locations, registration deadlines, and events from the GoRunning (고러닝) public page and the Korea Triathlon Federation schedule |
| [KBO game results lookup](docs/features/kbo-results.md) | `kbo-results` | KBO game schedules by date, results, and team filtering |
| [KBL game results lookup](docs/features/kbl-results.md) | `kbl-results` | KBL game schedules by date, results, team filtering, and current standings |
| [K League game results lookup](docs/features/kleague-results.md) | `kleague-results` | K League 1/K League 2 game results by date, team filtering, and current standings |
| [LCK match analysis](docs/features/lck-analytics.md) | `lck-analytics` | LCK game results, current standings, live turning points, pick/ban, patch meta, and team power ratings |

### 🎭 Culture, History & Leisure

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Cinema search](docs/features/korean-cinema-search.md) | `korean-cinema-search` | CGV/Megabox/Lotte Cinema theaters, currently showing films, showtimes, and remaining seats |
| [Performance schedule & remaining seats lookup](docs/features/ticket-availability.md) | `ticket-availability` | Query per-session schedules and per-grade remaining seat counts for YES24/Interpark (인터파크) performances in a single HTTP call (lookup only, no booking or payment) |
| [KOPIS performance lookup](docs/features/kopis-performance-search.md) | `kopis-performance-search` | KOPIS performance/facility list and detail lookup (via proxy). Booking/payment is at the official ticketing site |
| [Lottery win check](docs/features/lotto-results.md) | `lotto-results` | Lottery latest draw, specific draw, and number matching |
| [Annals of the Joseon Dynasty (조선왕조실록) search](docs/features/joseon-sillok-search.md) | `joseon-sillok-search` | Keyword search of the Annals of the Joseon Dynasty (조선왕조실록) with filters by king/year, and article excerpt lookup |
| [National heritage search & event lookup](docs/features/korean-heritage-search.md) | `korean-heritage-search` | Query the national heritage list, details, and coordinates, plus monthly heritage-utilization events, via the Korea Heritage Service (국가유산청) official Open API |

### ⛪ Religion

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Find religious facilities](docs/features/religious-facility-search.md) | `religious-facility-search` | Look up nearby churches/cathedrals/temples by neighborhood, station, or landmark, sorted by distance, with address, phone, and Kakao Map links (no user key required) |

### 🎓 Education, Scholarships & Academia

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Scholarship search & lookup](docs/features/korean-scholarship-search.md) | `korean-scholarship-search` | Search scholarship announcements from the Korea Student Aid Foundation (한국장학재단), universities nationwide, foundations, and corporations, summarizing amount, eligibility, support tiers, and links, and providing current-date closure status based on KST and filtering by conditions |
| [School meal menu lookup](docs/features/k-schoollunch-menu.md) | `k-schoollunch-menu` | Search schools and query meal menus by office of education/school name via NEIS |
| [Library book lookup](docs/features/library-book-search.md) | `library-book-search` | Book search, details, holding libraries, and per-library hold status based on Library Information Naru (도서관 정보나루) |
| [KERIS/RISS academic material search](docs/features/keris-academic-search.md) | `keris-academic-search` | Query metadata and full-text availability for theses, domestic and international academic papers, monographs, research reports, and journals |

### 📰 News, Information & Research

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Naver news search](docs/features/naver-news-search.md) | `naver-news-search` | Organize article titles, summaries, publication times, and original/Naver links via Naver Search Open API news search |
| [Hankook Ilbo (한국일보) news lookup](docs/features/hankookilbo-news.md) | `hankookilbo-news` | Directly call the Hankook Ilbo (한국일보) official remote MCP server without authentication to query editor's headlines, most-viewed, closely-read, latest, per-section recommendations, topic search, and today's horoscope as article metadata |
| [Naver blog research](docs/features/naver-blog-research.md) | `naver-blog-research` | Naver blog search, full-text reading, image download, and cross-verification of Korean content |
| [GeekNews lookup](docs/features/geeknews-search.md) | `geeknews-search` | Latest post list, search, and detail lookup based on GeekNews's public RSS/Atom feed |

### ✍️ Korean Language & Writing

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean spell check](docs/features/korean-spell-check.md) | `korean-spell-check` | Korean text spelling/grammar checking and correction suggestions |
| [Korean AI polish](docs/features/korean-humanizer.md) | `korean-humanizer` | Polishes AI-sounding Korean writing into human writing while preserving meaning, classifying telltale signs (translationese, AI clichés, exaggerated significance, dashes/emoji) by severity (S1/S2/S3), and matching a target character count |
| [Korean slang writing](docs/features/korean-slang-writing.md) | `korean-slang-writing` | Query Korean slang candidates using a curation seed based on Namu Wiki slang, and write Korean text with a slang flavor using mood/context/safety filters and best-effort Namu Wiki summaries |
| [Korean Middle Korean-style conversion](docs/features/korean-middle-korean.md) | `korean-middle-korean` | Deterministically convert Korean input into a creative register mixed with Middle Korean-style particles, endings, Hanja hints, and tone marks |
| [Korean character count](docs/features/korean-character-count.md) | `korean-character-count` | Deterministically compute the character count, line count, and UTF-8/NEIS byte count of Korean text |

### 🌤️ Weather & Environment

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean weather lookup](docs/features/korea-weather.md) | `korea-weather` | Korean weather lookup based on KMA (기상청) short-term forecast and ultra-short-term forecast (nowcast) |
| [Seoul weather risk time window lookup](docs/features/seoul-weather-risk.md) | `seoul-weather-risk` | Query forecast time windows and their basis for heat waves/cold snaps/heavy rain/heavy snow/strong winds by place from the ASK Seoul Marketplace (not official KMA advisories) |
| [User-location fine dust lookup](docs/features/fine-dust-location.md) | `fine-dust-location` | Query PM10/PM2.5 fine dust based on your current location or a region |
| [Han River water level info lookup](docs/features/han-river-water-level.md) | `han-river-water-level` | Check current water level, flow rate, and reference level by Han River observation station |

### 🧺 Daily Life & Misc

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Korean public holidays & special days lookup](docs/features/korean-holiday-calendar.md) | `korean-holiday-calendar` | Query public holidays, national holidays, anniversaries, the 24 solar terms, and miscellaneous seasonal days from the Korea Astronomy and Space Science Institute (한국천문연구원) special-day info (Public Data Portal 15012690, via proxy) |
| [Postal code search](docs/features/zipcode-search.md) | `zipcode-search` | Query postal code + official English address by address keyword |
| [Household waste disposal info lookup](docs/features/household-waste-info.md) | `household-waste-info` | Check the discharge days/time/place and managing department for household waste, food waste, and recyclables by city/county/district |
| [Find nearby public restrooms](docs/features/public-restroom-nearby.md) | `public-restroom-nearby` | Query nearby public/open restrooms based on your current location |
| [Donation place lookup](docs/features/donation-place-search.md) | `donation-place-search` | Query donation-place candidates by region and field of interest, with support for official sponsorship applications |
| [KakaoTalk Mac archive search](docs/features/kakaotalk-mac.md) | `kakaotalk-mac` | Sync a local macOS KakaoTalk (카카오톡) archive with `katok` and search via keyword/BM25/semantic |

### 🛠️ Developer & Document Tools

| What it can do | Skill name | Description |
| --- | --- | --- |
| [HWP document lookup/conversion](docs/features/hwp.md) | `hwp` | Convert `.hwp/.hwpx` → Markdown/JSON, compare documents, extract form fields, and reverse-convert Markdown→HWPX (kordoc-based, read-only) |
| [HWP document editing](docs/features/rhwp-edit.md) | `rhwp-edit` | Insert/delete body text in `.hwp`, create tables, edit cells, replace-all (`k-skill-rhwp` CLI + `@rhwp/core` WASM, HWP 5.x round-trip) |
| [HWP layout & IR debugging](docs/features/rhwp-advanced.md) | `rhwp-advanced` | Diagnose HWP layout, dump IR, compare versions, extract thumbnails, and unlock distribution documents with the upstream `rhwp` Rust CLI (`export-svg --debug-overlay`, `dump`, `dump-pages`, `ir-diff`, `thumbnail`, `convert`) |
| [KR WHOIS lookup](docs/features/kr-whois-lookup.md) | `kr-whois-lookup` | Query public registration info for `.kr`/`.한국` domains, IPs, and AS via Public Data Portal WHOIS (15094277, via proxy) |

### 🔮 Fortune-telling & Naming

| What it can do | Skill name | Description |
| --- | --- | --- |
| [Saju (사주) fortune reading](docs/features/saju-fortune.md) | `saju-fortune` | After confirming birth date/time, gender, and solar/lunar calendar info through an interview, interpret the Four Pillars (Saju) chart, the distribution of the five elements, and love/wealth/career/health fortune and compatibility interactively |
| [Naming house](docs/features/naming-house.md) | `naming-house` | Provides name recommendations/scores based on the Saju five elements, name-studies stroke counts, and pronunciation flow, using birth date/time, surname, and candidate names |

### ⚙️ Common Setup & Management

| What it can do | Skill name | Description |
| --- | --- | --- |
| [K-skill common setup](docs/setup.md) | `k-skill-setup` | After installing all of k-skill, guides credential acquisition, runtime environment-variable checks, optional update checks, and the GitHub star consent flow |
| [K-skill cleaner](docs/features/k-skill-cleaner.md) | `k-skill-cleaner` | Combines interview and per-coding-agent trigger-count statistics to recommend unnecessary K-skills as deletion candidates |

## Install as a Claude Code Plugin

On [Claude Code](https://claude.com/claude-code), you can install all skills at once via the marketplace.

```
/plugin marketplace add NomaDamas/k-skill
/plugin install k-skill@k-skill
```

Once installed, skills are invoked under the `/k-skill:<skill name>` namespace (e.g. `/k-skill:lotto-results`). For manual installation by copying individual directories or installation on other agents, see [Installation](docs/install.md).

## Getting Started Order

1. Follow [Installation](docs/install.md) to first install all `k-skill` skills.
2. Once installation is done, use the `k-skill-setup` skill to acquire credentials and check environment variables.
3. If secrets are empty, obtain them via the credential resolution order described in [Common Setup Guide](docs/setup.md) and [Security/Secrets Policy](docs/security-and-secrets.md).
4. If Node/Python packages are missing, first proceed with a global installation by default.
5. Open each feature doc to check inputs, examples, and limitations.

## Documentation

| Document | Description |
| --- | --- |
| [Installation](docs/install.md) | Package installation, optional installation, and local testing |
| [Contributing Guide](CONTRIBUTING.md) | Communication with external contributors, target PR branches, skill docs, Changesets, and proxy policy |
| [Import from Manus.ai](docs/install-manus.md) | How to import an individual skill folder URL from Manus.ai, or drag-and-drop upload a `.skill` file built with `npm run build:manus-bundle` |
| [Common Setup Guide](docs/setup.md) | Credential resolution order and preparing the default secrets file |
| [Security/Secrets Policy](docs/security-and-secrets.md) | Principles for storing credentials, prohibited patterns, and standard environment-variable names |
| [k-skill Proxy Server Guide](docs/features/k-skill-proxy.md) | How to call free APIs directly through the proxy server |
| [Release/Deployment Guide](docs/releasing.md) | Operating rules for npm Changesets, Python release-please, and trusted publishing |
| [Roadmap](docs/roadmap.md) | Currently included features and next candidates |
| [Sources/Reference Surfaces](docs/sources.md) | Public libraries and official docs referenced in the design |

The default installation flow is "install all skills → run `k-skill-setup` → use individual features".

## License

The default license of this repository is [MIT](LICENSE). However, the proxy server-related directories are governed by AGPL-3.0-only.

- `packages/k-skill-proxy/` — [AGPL-3.0-only](packages/k-skill-proxy/LICENSE)
- `infra/k-skill-proxy-dashboard/` — AGPL-3.0-only (proxy monitoring stack)

Third-party trademarks and service names are used only to describe features, lookup targets, and compatibility targets, and unless otherwise stated do not imply the official feature, support, partnership, approval, or collaboration of the respective rights holder or operator. Public-information lookup features must be used only for personal and non-organizational purposes, and must not involve large-scale or systematic crawling, circumvention of access controls, or service disruption or interference with business.

## Contributors

[![k-skill contributors](https://contrib.rocks/image?repo=NomaDamas/k-skill)](https://github.com/NomaDamas/k-skill/graphs/contributors)
