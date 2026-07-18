function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const codePoint = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

function parseXmlDocument(xml) {
  const source = trimOrNull(xml);
  if (!source || !source.startsWith("<")) throw new Error("RISS upstream did not return XML.");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("RISS upstream XML contains unsupported declarations.");
  const document = { name: "#document", children: [], text: "" };
  const stack = [document];
  const tokens = source.match(/<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>|<\?[^]*?\?>|<[^>]+>|[^<]+/g);
  if (!tokens || tokens.join("") !== source) throw new Error("RISS upstream returned malformed XML.");
  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) stack.at(-1).text += token.slice(9, -3);
    else if (!token.startsWith("<")) stack.at(-1).text += decodeXmlEntities(token);
    else if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      if (stack.length === 1 || stack.at(-1).name !== name) throw new Error("RISS upstream returned malformed XML.");
      stack.pop();
    } else {
      if (token.startsWith("<!")) throw new Error("RISS upstream XML contains unsupported markup.");
      const selfClosing = /\/\s*>$/.test(token);
      const match = token.match(/^<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?\/?\s*>$/);
      if (!match) throw new Error("RISS upstream returned malformed XML.");
      const node = { name: match[1], children: [], text: "" };
      stack.at(-1).children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  if (stack.length !== 1 || document.children.length !== 1) throw new Error("RISS upstream returned malformed XML.");
  return document.children[0];
}

const children = (node, name) => node.children.filter((entry) => entry.name.toLowerCase() === name.toLowerCase());
const child = (node, name) => children(node, name)[0] || null;

function nodeText(node) {
  if (!node) return null;
  const nested = node.children.map(nodeText).filter(Boolean).join(" ");
  return trimOrNull(`${node.text}${nested ? ` ${nested}` : ""}`);
}

function normalizeMetadata(node) {
  const values = new Map();
  for (const entry of node.children) {
    const key = entry.name.replace(/^riss\./i, "").toLowerCase();
    const value = nodeText(entry);
    if (value === null) continue;
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(value);
  }
  const first = (key) => values.get(key)?.[0] ?? null;
  const author = first("author");
  const explicitAuthors = author?.split(/\s*[;,|]\s*/).filter(Boolean) || [];
  const koreanAuthors = author?.split(/\s+/).filter(Boolean) || [];
  const authors = explicitAuthors.length > 1 ? explicitAuthors
    : koreanAuthors.length > 1 && koreanAuthors.every((name) => /^[가-힣]{2,4}$/.test(name)) ? koreanAuthors
      : author ? [author] : [];
  const image = first("image")?.toUpperCase() ?? null;
  const charge = first("charge");
  const available = image === "Y" ? true : image === "N" ? false : null;
  const access = available === false ? "none" : available !== true ? "unknown"
    : charge === "1" ? "free" : charge === "0" ? "paid_or_restricted" : "available";
  return {
    resource_type: first("type"), title: first("title"), authors,
    publisher: first("publisher"), year: first("pubdate"), publication: first("stitle"),
    material_type: first("mtype"), link: first("url"), full_text_available: available,
    full_text_access: access, holdings: values.get("holdings") || []
  };
}

function invalid(message) {
  const error = new Error(message);
  error.code = "upstream_invalid_response";
  return error;
}

function parseRissXml(xml) {
  let root;
  try { root = parseXmlDocument(xml); } catch (error) { error.code = "upstream_invalid_response"; throw error; }
  if (root.name.toLowerCase() !== "record") throw invalid("RISS upstream returned an invalid response envelope.");
  const head = child(root, "head");
  if (!head) throw invalid("RISS upstream response is missing head metadata.");
  const errorCode = nodeText(child(head, "Error"));
  if (errorCode === null) throw invalid("RISS upstream response is missing status metadata.");
  const errorMessage = nodeText(child(head, "ErrorMessage")) || "Unknown RISS error";
  if (!["0", "000"].includes(errorCode)) {
    const error = new Error(errorMessage);
    error.code = ["004", "4"].includes(errorCode) || /인증|AUTH|KEY/i.test(errorMessage) ? "upstream_forbidden"
      : /쿼터|호출량|초과|QUOTA|LIMIT/i.test(errorMessage) ? "upstream_quota_exceeded" : "upstream_error";
    error.upstreamCode = errorCode;
    throw error;
  }
  const items = children(root, "metadata").map(normalizeMetadata);
  const totalCount = Number.parseInt(nodeText(child(head, "totalcount")) ?? String(items.length), 10);
  if (!Number.isFinite(totalCount) || totalCount < 0) throw invalid("RISS upstream returned invalid totalcount metadata.");
  return { totalCount, items };
}

module.exports = { parseRissXml };
