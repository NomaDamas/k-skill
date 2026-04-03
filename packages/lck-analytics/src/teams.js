function normalizeToken(value) {
  return String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^0-9A-Z가-힣]+/g, "");
}

const TEAM_REGISTRY = [
  {
    canonicalId: "hle",
    teamIds: ["100205573496804586"],
    currentName: "Hanwha Life Esports",
    aliases: ["Hanwha Life Esports", "Hanwha", "HLE", "한화", "한화생명", "한화생명e스포츠"],
  },
  {
    canonicalId: "gen",
    teamIds: ["100205573495116443"],
    currentName: "Gen.G Esports",
    aliases: ["Gen.G", "Gen.G Esports", "GEN", "젠지", "젠지 e스포츠"],
  },
  {
    canonicalId: "t1",
    teamIds: ["98767991853197861"],
    currentName: "T1",
    aliases: ["T1", "SKT", "SKT T1", "SK Telecom T1", "SK텔레콤 T1"],
  },
  {
    canonicalId: "dk",
    teamIds: ["100725845018863243"],
    currentName: "Dplus KIA",
    aliases: ["Dplus KIA", "DK", "Damwon KIA", "DWG KIA", "DAMWON Gaming", "담원", "담원 기아", "디플러스 기아"],
  },
  {
    canonicalId: "kt",
    teamIds: ["99566404579461230"],
    currentName: "kt Rolster",
    aliases: ["kt Rolster", "KT", "KT Rolster", "케이티", "케이티 롤스터"],
  },
  {
    canonicalId: "ns",
    teamIds: ["102747101565183056"],
    currentName: "NONGSHIM RED FORCE",
    aliases: ["NONGSHIM RED FORCE", "Nongshim", "NS", "농심", "농심 레드포스", "Team Dynamics"],
  },
  {
    canonicalId: "bro",
    teamIds: ["105505619546859895"],
    currentName: "HANJIN BRION",
    aliases: ["HANJIN BRION", "BRION", "BRO", "OKSavingsBank BRION", "Fredit BRION", "브리온", "한진 브리온"],
  },
  {
    canonicalId: "bfx",
    teamIds: ["100725845022060229"],
    currentName: "BNK FEARX",
    aliases: ["BNK FEARX", "FEARX", "BFX", "Liiv SANDBOX", "SANDBOX Gaming", "리브 샌드박스", "샌드박스", "피어엑스"],
  },
  {
    canonicalId: "drx",
    teamIds: ["99566404585387054"],
    currentName: "KIWOOM DRX",
    aliases: ["KIWOOM DRX", "DRX", "DragonX", "Kingzone DragonX", "킹존 드래곤X", "드래곤X", "키움 DRX"],
  },
  {
    canonicalId: "dnf",
    teamIds: ["99566404581868574"],
    currentName: "DN SOOPers",
    aliases: [
      "DN SOOPers",
      "DNS",
      "DN FREECS",
      "DNF",
      "Kwangdong Freecs",
      "KDF",
      "광동 프릭스",
      "광동",
      "Afreeca Freecs",
      "아프리카 프릭스",
      "Freecs"
    ],
  },
];

const REGISTRY_BY_ID = new Map();
const REGISTRY_BY_TOKEN = new Map();

for (const entry of TEAM_REGISTRY) {
  entry.aliasTokens = new Set();

  for (const tokenSource of [entry.canonicalId, entry.currentName, ...(entry.aliases || [])]) {
    const token = normalizeToken(tokenSource);
    if (!token) {
      continue;
    }

    entry.aliasTokens.add(token);
    REGISTRY_BY_TOKEN.set(token, entry);
  }

  for (const teamId of entry.teamIds || []) {
    REGISTRY_BY_ID.set(String(teamId), entry);
  }
}

function resolveTeamQuery(query) {
  const input = String(query || "").trim();
  const token = normalizeToken(input);
  const entry = REGISTRY_BY_TOKEN.get(token);

  if (!entry) {
    return {
      input,
      token,
      canonicalId: null,
      currentName: input,
      aliasTokens: new Set(token ? [token] : []),
    };
  }

  return {
    input,
    token,
    canonicalId: entry.canonicalId,
    currentName: entry.currentName,
    aliasTokens: new Set(entry.aliasTokens),
  };
}

function resolveTeamPayload(team) {
  const teamId = String(team?.id || "");
  const entry = REGISTRY_BY_ID.get(teamId)
    || REGISTRY_BY_TOKEN.get(normalizeToken(team?.name))
    || REGISTRY_BY_TOKEN.get(normalizeToken(team?.code))
    || REGISTRY_BY_TOKEN.get(normalizeToken(team?.slug));

  if (!entry) {
    return {
      id: team?.id || null,
      slug: team?.slug || null,
      code: team?.code || null,
      name: team?.name || null,
      image: team?.image || null,
      canonicalId: null,
      currentName: team?.name || null,
      aliasTokens: new Set([
        normalizeToken(team?.id),
        normalizeToken(team?.slug),
        normalizeToken(team?.code),
        normalizeToken(team?.name),
      ].filter(Boolean)),
    };
  }

  return {
    id: team?.id || null,
    slug: team?.slug || null,
    code: team?.code || null,
    name: team?.name || entry.currentName,
    image: team?.image || null,
    canonicalId: entry.canonicalId,
    currentName: entry.currentName,
    aliasTokens: new Set([
      normalizeToken(team?.id),
      normalizeToken(team?.slug),
      normalizeToken(team?.code),
      normalizeToken(team?.name),
      ...entry.aliasTokens,
    ].filter(Boolean)),
  };
}

function stripAliasTokens(team) {
  return {
    id: team.id,
    slug: team.slug,
    code: team.code,
    name: team.name,
    image: team.image,
    canonicalId: team.canonicalId,
    currentName: team.currentName,
  };
}

module.exports = {
  TEAM_REGISTRY,
  normalizeToken,
  resolveTeamPayload,
  resolveTeamQuery,
  stripAliasTokens,
};
