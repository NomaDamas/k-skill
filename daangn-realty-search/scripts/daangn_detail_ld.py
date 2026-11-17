import json
import re


def parse_detail(url, fetch_text):
    html = fetch_text(url)
    out = {
        "source": url,
        "title": None,
        "address": None,
        "floor": None,
        "top_floor": None,
        "floor_label": None,
        "nearby_subway": None,
        "release_date": None,
        "json_ld": [],
    }
    scripts = re.findall(
        r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", html, re.S
    )
    for script in scripts:
        try:
            document = json.loads(script)
        except json.JSONDecodeError:
            continue
        out["json_ld"].append(document)
        for node in _json_ld_nodes(document):
            _apply_node(out, node)
    out["floor_label"] = floor_label(out["floor"], out["top_floor"])
    out["json_ld"] = out["json_ld"][:3]
    return out


def floor_label(floor, top_floor):
    """("8.0", "10") / ("8층", "10층") → "8층/10층". floor 가 없으면 None."""
    if floor is None:
        return None
    top = _floor_text(top_floor) if top_floor else "?층"
    return f"{_floor_text(floor)}/{top}"


def _floor_text(value):
    """"8.0" / "8" / "8층" → "8층". "반지하" 같은 비숫자 값은 그대로."""
    text = str(value).strip()
    number = text[:-1] if text.endswith("층") else text
    if re.fullmatch(r"B?-?\d+(?:\.0+)?", number):
        return f"{number.split('.')[0]}층"
    return text


def _json_ld_nodes(document):
    if isinstance(document, list):
        return document
    if not isinstance(document, dict):
        return []
    graph = document.get("@graph")
    if isinstance(graph, list):
        return graph
    if isinstance(graph, dict):
        return [graph]
    return [document]


def _apply_node(out, node):
    if not isinstance(node, dict):
        return
    if node.get("@type") == "Product":
        if not out["title"]:
            out["title"] = node.get("name")
        if not out["release_date"]:
            out["release_date"] = node.get("releaseDate")
    if node.get("@type") == "Place" and not out["address"]:
        out["address"] = node.get("name")
    for prop in _properties(node.get("additionalProperty")):
        name = prop.get("name")
        value = prop.get("value")
        if name == "floor":
            out["floor"] = value
        elif name == "topFloor":
            out["top_floor"] = value
        elif name == "nearbySubwayStation":
            out["nearby_subway"] = value


def _properties(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [value]
    return []
