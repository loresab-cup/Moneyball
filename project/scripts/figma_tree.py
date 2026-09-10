import sys
from pathlib import Path

import requests

TOKEN = Path(__file__).parent.joinpath("figma_token.txt").read_text().strip()
FILE = "oilEzqeMIVjHH7Jaq96B8l"


def walk(n, lvl=0, maxlvl=3):
    t = n.get("type")
    name = n.get("name")
    print("  " * lvl + f"[{t}] '{name}' #{n.get('id')}")
    if lvl < maxlvl:
        for c in n.get("children", []):
            walk(c, lvl + 1, maxlvl)


if len(sys.argv) > 2:
    r = requests.get(
        f"https://api.figma.com/v1/files/{FILE}",
        params={"node_ids": sys.argv[2], "depth": int(sys.argv[1])},
        headers={"X-Figma-Token": TOKEN},
        timeout=120,
    )
    d = r.json()
    walk(d["document"], maxlvl=int(sys.argv[1]))
else:
    r = requests.get(
        f"https://api.figma.com/v1/files/{FILE}",
        params={"depth": 2},
        headers={"X-Figma-Token": TOKEN},
        timeout=120,
    )
    d = r.json()
    for page in d["document"]["children"]:
        walk(page, maxlvl=2)
