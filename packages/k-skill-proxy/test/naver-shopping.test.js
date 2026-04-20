const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNaverShoppingSearchUrl,
  normalizeNaverShoppingOpenApiPayload,
  normalizeNaverShoppingSearchQuery,
  parseNaverShoppingSearchPayload,
  parseNaverShoppingSearchHtml
} = require("../src/naver-shopping");
const { buildServer } = require("../src/server");

function nextDataHtml(payload) {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}

test("parseNaverShoppingSearchHtml extracts normalized products from embedded JSON", () => {
  const html = nextDataHtml({
    props: {
      pageProps: {
        initialState: {
          products: {
            list: [
              {
                item: {
                  productId: "1234567890",
                  productName: "애플 정품 20W USB-C 전원 어댑터",
                  lowPrice: "23,900",
                  mallName: "Apple 공식스토어",
                  productUrl: "/catalog/1234567890?query=%EC%96%B4%EB%8C%91%ED%84%B0",
                  imageUrl: "//shop-phinf.pstatic.net/main_1234567890.jpg",
                  category1Name: "디지털/가전",
                  category2Name: "휴대폰액세서리",
                  reviewCount: "1,234",
                  purchaseCnt: "56",
                  scoreInfo: "4.8"
                }
              }
            ]
          }
        }
      }
    }
  });

  const result = parseNaverShoppingSearchHtml(html, { query: "애플 어댑터", limit: 10 });

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    rank: 1,
    product_id: "1234567890",
    title: "애플 정품 20W USB-C 전원 어댑터",
    price: 23900,
    price_text: "23,900원",
    mall_name: "Apple 공식스토어",
    url: "https://search.shopping.naver.com/catalog/1234567890?query=%EC%96%B4%EB%8C%91%ED%84%B0",
    image_url: "https://shop-phinf.pstatic.net/main_1234567890.jpg",
    category: ["디지털/가전", "휴대폰액세서리"],
    review_count: 1234,
    purchase_count: 56,
    score: 4.8,
    is_ad: false,
    source: "embedded-json"
  });
  assert.equal(result.meta.extraction, "embedded-json");
});

test("parseNaverShoppingSearchHtml falls back to lightweight HTML card extraction", () => {
  const html = `<!doctype html>
    <html><body>
      <div class="basicList_item__abc product_card" data-testid="product-card">
        <a class="basicList_link__def product_title" href="https://smartstore.naver.com/acme/products/1">무선 충전기 스탠드</a>
        <img src="//shop-phinf.pstatic.net/charger.jpg" alt="무선 충전기 스탠드">
        <span class="price">18,500원</span>
        <span class="mall">ACME스토어</span>
      </div>
    </body></html>`;

  const result = parseNaverShoppingSearchHtml(html, { query: "무선 충전기", limit: 5 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "무선 충전기 스탠드");
  assert.equal(result.items[0].price, 18500);
  assert.equal(result.items[0].price_text, "18,500원");
  assert.equal(result.items[0].mall_name, "ACME스토어");
  assert.equal(result.items[0].url, "https://smartstore.naver.com/acme/products/1");
  assert.equal(result.items[0].image_url, "https://shop-phinf.pstatic.net/charger.jpg");
  assert.equal(result.items[0].source, "html-card");
  assert.equal(result.meta.extraction, "html-card");
});

test("normalizeNaverShoppingSearchQuery validates q/query and clamps limit", () => {
  assert.throws(() => normalizeNaverShoppingSearchQuery({}), /Provide q\/query/);
  assert.throws(() => normalizeNaverShoppingSearchQuery({ q: "a" }), /at least 2/);

  assert.deepEqual(normalizeNaverShoppingSearchQuery({ query: "  아이폰 케이스  ", limit: "99", page: "0", sort: "price_asc" }), {
    query: "아이폰 케이스",
    limit: 40,
    page: 1,
    sort: "price_asc"
  });

  const url = buildNaverShoppingSearchUrl({ query: "아이폰 케이스", limit: 40, page: 1, sort: "price_asc" });
  assert.equal(url.hostname, "ns-portal.shopping.naver.com");
  assert.equal(url.pathname, "/api/v2/shopping-paged-slot");
  assert.equal(url.searchParams.get("query"), "아이폰 케이스");
  assert.equal(url.searchParams.get("source"), "shp_gui");

  const pageUrl = buildNaverShoppingSearchUrl({ query: "아이폰 케이스", limit: 3, page: 2, sort: "price_asc" });
  assert.equal(pageUrl.searchParams.get("page"), "2");
  assert.equal(pageUrl.searchParams.has("sort"), false);
});

test("parseNaverShoppingSearchPayload maps public BFF shopping-paged-slot cards", () => {
  const result = parseNaverShoppingSearchPayload({
    data: [
      {
        page: 1,
        pageSize: 8,
        slots: [
          {
            slotType: "CARD",
            data: {
              rank: 1,
              nvMid: 89011025048,
              productNameOrg: "애플 <mark>에어팟</mark> 4세대 ANC",
              productUrl: {
                pcUrl: "https://smartstore.naver.com/main/products/11466514676",
                mobileUrl: "https://m.smartstore.naver.com/main/products/11466514676"
              },
              productClickUrl: {
                pcUrl: "https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=89011025048"
              },
              images: [
                {
                  imageUrl: "https://shopping-phinf.pstatic.net/main_8901102/89011025048.jpg",
                  width: 1000,
                  height: 1000
                }
              ],
              mallName: "오렌지스펙트럼",
              salePrice: 269000,
              discountedSalePrice: 254900,
              totalReviewCount: 820,
              purchaseCount: 1214,
              averageReviewScore: 4.91,
              isBrandStore: true
            }
          }
        ]
      }
    ]
  }, { query: "에어팟", limit: 10 });

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    rank: 1,
    product_id: "89011025048",
    title: "애플 에어팟 4세대 ANC",
    price: 254900,
    high_price: 269000,
    price_text: "254,900원",
    mall_name: "오렌지스펙트럼",
    url: "https://smartstore.naver.com/main/products/11466514676",
    image_url: "https://shopping-phinf.pstatic.net/main_8901102/89011025048.jpg",
    review_count: 820,
    purchase_count: 1214,
    score: 4.91,
    is_ad: false,
    is_brand_store: true,
    source: "bff-json"
  });
  assert.equal(result.meta.extraction, "bff-json");
  assert.equal(result.meta.item_count, 1);
});

test("parseNaverShoppingSearchPayload selects requested BFF page and locally sorts comparable cards", () => {
  const payload = {
    data: [
      {
        page: 1,
        pageSize: 2,
        slots: [
          {
            data: {
              nvMid: "page1-expensive",
              productNameOrg: "1페이지 비싼 상품",
              salePrice: 30000,
              mallName: "첫페이지몰"
            }
          },
          {
            data: {
              nvMid: "page1-cheap",
              productNameOrg: "1페이지 싼 상품",
              salePrice: 10000,
              mallName: "첫페이지몰"
            }
          }
        ]
      },
      {
        page: 2,
        pageSize: 3,
        slots: [
          {
            data: {
              nvMid: "page2-mid",
              productNameOrg: "2페이지 중간 상품",
              salePrice: 50000,
              totalReviewCount: 4,
              mallName: "둘째페이지몰"
            }
          },
          {
            data: {
              nvMid: "page2-cheap",
              productNameOrg: "2페이지 싼 상품",
              salePrice: 20000,
              totalReviewCount: 9,
              mallName: "둘째페이지몰"
            }
          },
          {
            data: {
              nvMid: "page2-reviewed",
              productNameOrg: "2페이지 리뷰 많은 상품",
              salePrice: 70000,
              totalReviewCount: 50,
              mallName: "둘째페이지몰"
            }
          }
        ]
      }
    ]
  };

  const priceAscending = parseNaverShoppingSearchPayload(payload, {
    query: "테스트 상품",
    limit: 3,
    page: 2,
    sort: "price_asc"
  });
  assert.deepEqual(priceAscending.items.map((item) => item.product_id), ["page2-cheap", "page2-mid", "page2-reviewed"]);
  assert.equal(priceAscending.meta.page, 2);
  assert.equal(priceAscending.meta.page_size, 3);
  assert.equal(priceAscending.meta.sort, "price_asc");
  assert.equal(priceAscending.meta.sort_applied, "local");

  const reviewDescending = parseNaverShoppingSearchPayload(payload, {
    query: "테스트 상품",
    limit: 2,
    page: 2,
    sort: "review"
  });
  assert.deepEqual(reviewDescending.items.map((item) => item.product_id), ["page2-reviewed", "page2-cheap"]);
  assert.equal(reviewDescending.meta.item_count, 2);
});


test("normalizeNaverShoppingOpenApiPayload maps official Search API shopping results", () => {
  const result = normalizeNaverShoppingOpenApiPayload({
    lastBuildDate: "Sat, 18 Apr 2026 20:30:00 +0900",
    total: 123,
    start: 1,
    display: 1,
    items: [
      {
        title: "<b>에어팟</b> 프로 2세대",
        link: "https://search.shopping.naver.com/catalog/111",
        image: "https://shopping-phinf.pstatic.net/main_111.jpg",
        lprice: "289000",
        hprice: "349000",
        mallName: "네이버",
        productId: "111",
        productType: "1",
        brand: "Apple",
        maker: "Apple",
        category1: "디지털/가전",
        category2: "음향가전"
      }
    ]
  }, { query: "에어팟", limit: 10 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "에어팟 프로 2세대");
  assert.equal(result.items[0].price, 289000);
  assert.equal(result.items[0].high_price, 349000);
  assert.equal(result.items[0].mall_name, "네이버");
  assert.equal(result.items[0].brand, "Apple");
  assert.equal(result.items[0].source, "naver-openapi");
  assert.equal(result.meta.extraction, "naver-openapi");
  assert.equal(result.meta.total, 123);
});

test("naver shopping search endpoint returns normalized comparison payload from mocked upstream", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        data: [
          {
            page: 1,
            pageSize: 8,
            slots: [
              {
                slotType: "CARD",
                data: {
                  nvMid: "987",
                  productTitle: "네이버 테스트 상품",
                  salePrice: "12,340원",
                  discountedSalePrice: "11,990원",
                  mallName: "테스트몰",
                  productUrl: {
                    pcUrl: "https://smartstore.naver.com/test/products/987"
                  },
                  images: [
                    {
                      imageUrl: "https://shop-phinf.pstatic.net/test.jpg"
                    }
                  ]
                }
              }
            ]
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const bad = await app.inject({ method: "GET", url: "/v1/naver-shopping/search" });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, "bad_request");

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-shopping/search?q=%EB%84%A4%EC%9D%B4%EB%B2%84%20%ED%85%8C%EC%8A%A4%ED%8A%B8&limit=99&sort=price_asc"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.query.q, "네이버 테스트");
  assert.equal(body.query.limit, 40);
  assert.equal(body.query.sort, "price_asc");
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, "네이버 테스트 상품");
  assert.equal(body.items[0].price, 11990);
  assert.equal(body.items[0].high_price, 12340);
  assert.equal(body.items[0].mall_name, "테스트몰");
  assert.equal(body.proxy.cache.hit, false);
  assert.equal(body.upstream.status_code, 200);
  assert.equal(body.upstream.provider, "naver-shopping-bff");
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /^https:\/\/ns-portal\.shopping\.naver\.com\/api\/v2\/shopping-paged-slot\?/);
  assert.match(fetchCalls[0].url, /source=shp_gui/);
  assert.match(fetchCalls[0].headers["user-agent"], /Mozilla\/5\.0/);
  assert.match(fetchCalls[0].headers.referer, /^https:\/\/search\.naver\.com\/search\.naver\?/);
});

test("naver shopping BFF fallback fetches requested page and applies local comparable sort", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        data: [
          {
            page: 1,
            pageSize: 2,
            slots: [
              {
                data: {
                  nvMid: "page1-first",
                  productNameOrg: "첫 페이지 상품",
                  discountedSalePrice: 99000,
                  mallName: "첫페이지몰"
                }
              }
            ]
          },
          {
            page: 2,
            pageSize: 3,
            slots: [
              {
                data: {
                  nvMid: "page2-expensive",
                  productNameOrg: "둘째 페이지 비싼 상품",
                  discountedSalePrice: 50000,
                  mallName: "둘째페이지몰"
                }
              },
              {
                data: {
                  nvMid: "page2-cheap",
                  productNameOrg: "둘째 페이지 싼 상품",
                  discountedSalePrice: 12000,
                  mallName: "둘째페이지몰"
                }
              }
            ]
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-shopping/search?q=%ED%85%8C%EC%8A%A4%ED%8A%B8%20%EC%83%81%ED%92%88&limit=2&page=2&sort=price_asc"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.items.map((item) => item.product_id), ["page2-cheap", "page2-expensive"]);
  assert.deepEqual(body.items.map((item) => item.rank), [1, 2]);
  assert.equal(body.query.page, 2);
  assert.equal(body.query.sort, "price_asc");
  assert.equal(body.meta.page, 2);
  assert.equal(body.meta.sort, "price_asc");
  assert.equal(body.meta.sort_applied, "local");
  assert.equal(fetchCalls.length, 1);
  const upstreamUrl = new URL(fetchCalls[0].url);
  assert.equal(upstreamUrl.hostname, "ns-portal.shopping.naver.com");
  assert.equal(upstreamUrl.searchParams.get("page"), "2");
  assert.equal(upstreamUrl.searchParams.has("sort"), false);
});


test("naver shopping search endpoint prefers official Search API when server keys are configured", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        lastBuildDate: "Sat, 18 Apr 2026 20:30:00 +0900",
        total: 1,
        start: 1,
        display: 1,
        items: [
          {
            title: "<b>네이버</b> 공식 API 상품",
            link: "https://search.shopping.naver.com/catalog/222",
            image: "https://shopping-phinf.pstatic.net/main_222.jpg",
            lprice: "45600",
            hprice: "49900",
            mallName: "공식몰",
            productId: "222",
            brand: "브랜드",
            category1: "생활/건강"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-shopping/search?q=%EB%84%A4%EC%9D%B4%EB%B2%84%20%EA%B3%B5%EC%8B%9D&limit=99&sort=price_asc"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.items[0].source, "naver-openapi");
  assert.equal(body.items[0].title, "네이버 공식 API 상품");
  assert.equal(body.items[0].price, 45600);
  assert.equal(body.query.limit, 40);
  assert.equal(body.meta.extraction, "naver-openapi");
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /^https:\/\/openapi\.naver\.com\/v1\/search\/shop\.json\?/);
  assert.match(fetchCalls[0].url, /display=40/);
  assert.match(fetchCalls[0].url, /sort=asc/);
  assert.equal(fetchCalls[0].headers["X-Naver-Client-Id"], "client-id");
  assert.equal(fetchCalls[0].headers["X-Naver-Client-Secret"], "client-secret");
});

test("naver shopping official Search API marks review sort as unsupported instead of silently applying relevance", async (t) => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), headers: options.headers });
    return new Response(
      JSON.stringify({
        lastBuildDate: "Sat, 18 Apr 2026 20:30:00 +0900",
        total: 2,
        start: 1,
        display: 2,
        items: [
          {
            title: "리뷰 정렬 요청 첫 번째 상품",
            link: "https://search.shopping.naver.com/catalog/333",
            image: "https://shopping-phinf.pstatic.net/main_333.jpg",
            lprice: "30000",
            mallName: "공식몰A",
            productId: "333"
          },
          {
            title: "리뷰 정렬 요청 두 번째 상품",
            link: "https://search.shopping.naver.com/catalog/444",
            image: "https://shopping-phinf.pstatic.net/main_444.jpg",
            lprice: "20000",
            mallName: "공식몰B",
            productId: "444"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };

  const app = buildServer({
    env: {
      NAVER_SEARCH_CLIENT_ID: "client-id",
      NAVER_SEARCH_CLIENT_SECRET: "client-secret",
      KSKILL_PROXY_CACHE_TTL_MS: "60000"
    }
  });

  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/naver-shopping/search?q=%EB%A6%AC%EB%B7%B0%20%EC%A0%95%EB%A0%AC&limit=5&sort=review"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.query.sort, "review");
  assert.equal(body.upstream.provider, "naver-search-api");
  assert.equal(body.meta.extraction, "naver-openapi");
  assert.equal(body.meta.sort, "review");
  assert.equal(body.meta.upstream_sort, "sim");
  assert.equal(body.meta.sort_applied, "unsupported");
  assert.deepEqual(body.items.map((item) => item.product_id), ["333", "444"]);
  assert.equal(fetchCalls.length, 1);
  const upstreamUrl = new URL(fetchCalls[0].url);
  assert.equal(upstreamUrl.hostname, "openapi.naver.com");
  assert.equal(upstreamUrl.searchParams.get("sort"), "sim");
});
