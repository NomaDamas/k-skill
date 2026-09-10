"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer, UPSTREAM_URL } = require("../server");

async function withServer(options, callback) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("requires the relay bearer token", async () => {
  await withServer({ env: { EATPL_RELAY_TOKEN: "secret", BCCARD_EATPL_INST_NM: "kskill" } }, async (base) => {
    const missing = await fetch(`${base}/v1/search`, {
      method: "POST",
      body: JSON.stringify({ location: "서울 종로구" }),
      headers: { "content-type": "application/json" }
    });
    assert.equal(missing.status, 401);
    const wrong = await fetch(`${base}/v1/search`, {
      method: "POST",
      body: JSON.stringify({ location: "서울 종로구" }),
      headers: {
        authorization: "Bearer wrong",
        "content-type": "application/json"
      }
    });
    assert.equal(wrong.status, 401);
  });
});

test("forwards only allowed query fields and server-side credentials", async () => {
  let captured;
  await withServer({
    env: {
      EATPL_RELAY_TOKEN: "secret",
      BCCARD_EATPL_INST_NM: "kskill"
    },
    now: () => new Date("2026-08-30T00:00:00Z"),
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ rspCode: "00000", rspMessage: "Success", data: [] }), { status: 200 });
    }
  }, async (base) => {
    const response = await fetch(`${base}/v1/search`, {
      method: "POST",
      body: JSON.stringify({ location: "서울 종로구", merTpbuzNm: "일반한식" }),
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json"
      }
    });
    assert.equal(response.status, 200);
    const body = JSON.parse(captured.options.body);
    assert.equal(captured.url, UPSTREAM_URL);
    assert.equal(body.instNm, "kskill");
    assert.equal(body.location, "서울 종로구");
    assert.equal(body.merTpbuzNm, "일반한식");
    assert.match(body.trnsTrceNo, /^kskill20260830\d{10}$/);
  });
});

test("posts to the configured production upstream URL", async () => {
  let captured;
  await withServer({
    env: {
      EATPL_RELAY_TOKEN: "secret",
      BCCARD_EATPL_INST_NM: "kskill",
      BCCARD_EATPL_API_BASE_URL: "https://api.paybooc.ai/api/mer"
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ rspCode: "00000", data: [] }), { status: 200 });
    }
  }, async (base) => {
    const response = await fetch(`${base}/v1/search`, {
      method: "POST",
      body: JSON.stringify({ location: "서울 종로구" }),
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(captured.url, "https://api.paybooc.ai/api/mer/v1/search");
  });
});

test("rejects caller-supplied credentials and arbitrary upstream fields", async () => {
  await withServer({ env: { EATPL_RELAY_TOKEN: "secret", BCCARD_EATPL_INST_NM: "kskill" } }, async (base) => {
    const response = await fetch(`${base}/v1/search`, {
      method: "POST",
      body: JSON.stringify({ instNm: "leak", location: "서울 종로구" }),
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json"
      }
    });
    assert.equal(response.status, 400);
  });
});

test("rate limits authenticated requests", async () => {
  await withServer({
    env: {
      EATPL_RELAY_TOKEN: "secret",
      BCCARD_EATPL_INST_NM: "kskill",
      EATPL_RELAY_RATE_LIMIT_MAX: "1",
      EATPL_RELAY_RATE_LIMIT_WINDOW_MS: "60000"
    },
    fetchImpl: async () => new Response(JSON.stringify({ rspCode: "00000", data: [] }), { status: 200 })
  }, async (base) => {
    const request = () => fetch(`${base}/v1/search`, {
      method: "POST",
      body: JSON.stringify({ location: "서울 종로구" }),
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json"
      }
    });
    assert.equal((await request()).status, 200);
    assert.equal((await request()).status, 429);
  });
});
