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
    if out["floor"] is not None:
        floor = str(out["floor"]).replace(".0", "")
        top = str(out["top_floor"]).replace(".0", "") if out["top_floor"] else "?"
        out["floor_label"] = f"{floor}층/{top}층"
    out["json_ld"] = out["json_ld"][:3]
    return out


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
