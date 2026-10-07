#!/usr/bin/env python3
"""Builds assets/heroes_endgame/lang/en_us.json from the fragments in tools/lang/*.json (sorted by file name).

Each feature keeps its own fragment so they never conflict. A key defined twice with different text is an error.
Run from the project folder:  python3 tools/merge_lang.py
"""
import collections
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "main", "resources", "assets", "heroes_endgame", "lang", "en_us.json")


def main():
    merged = collections.OrderedDict()
    origin = {}
    errors = []
    for path in sorted(glob.glob(os.path.join(HERE, "lang", "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f, object_pairs_hook=collections.OrderedDict)
        for key, value in data.items():
            if key in merged and merged[key] != value:
                errors.append(f"{key}: '{merged[key]}' ({origin[key]}) vs '{value}' ({os.path.basename(path)})")
                continue
            merged[key] = value
            origin[key] = os.path.basename(path)
    if errors:
        print("Conflicting lang keys:\n  " + "\n  ".join(errors), file=sys.stderr)
        sys.exit(1)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(merged)} keys to {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
