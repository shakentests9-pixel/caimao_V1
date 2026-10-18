"""Merge messages/fragments/*.en.json into messages/en.json and report conflicting keys."""
import json, glob, sys

def merge(dst, src, path, conflicts):
    for k, v in src.items():
        p = f"{path}.{k}" if path else k
        if k not in dst:
            dst[k] = v
        elif isinstance(v, dict) and isinstance(dst[k], dict):
            merge(dst[k], v, p, conflicts)
        elif dst[k] != v:
            conflicts.append((p, dst[k], v))
            dst[k] = v  # fragments are the source of truth

out = json.load(open("messages/en.json"))
conflicts = []
for f in sorted(glob.glob("messages/fragments/*.en.json")):
    merge(out, json.load(open(f)), "", conflicts)
for c in conflicts:
    print("updated", c[0])
json.dump(out, open("messages/en.json", "w"), ensure_ascii=False, indent=2)
open("messages/en.json", "a").write("\n")
def count(d): return sum(count(v) if isinstance(v, dict) else 1 for v in d.values())
print("namespaces", len(out), "keys", count(out))

