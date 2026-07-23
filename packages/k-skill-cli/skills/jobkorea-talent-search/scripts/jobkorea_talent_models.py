from __future__ import annotations

from dataclasses import dataclass
from typing import Final

BASE_URL: Final = "https://www.jobkorea.co.kr"
FIND_PATH: Final = "/corp/person/find"
AJAX_PATH: Final = "/corp/person/detailsearchajax"
DEFAULT_UA: Final = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


@dataclass(frozen=True, slots=True)
class Candidate:
    rno: str
    url: str
    name: str = ""
    meta: str = ""
    career: str = ""
    education: str = ""
    locations: str = ""
    salary: str = ""
    skills: str = ""
    badges: str = ""
    raw_summary: str = ""
