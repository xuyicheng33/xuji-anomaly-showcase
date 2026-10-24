"""Check exported sizes and record the hashes that bind visible figures to files."""
import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.data import ROOT,PUBLIC,catalog
import numpy as np
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
cat=catalog()
for ds,d in cat["datasets"].items():
 for meta in d["experiments"]:
  hashes={}
  for key,info in meta["files"].items():
   p=PUBLIC/info["url"].removeprefix("/data/")
   expected=int(np.prod(info["shape"]))*np.dtype(info["dtype"]).itemsize
   assert p.stat().st_size==expected,(p,p.stat().st_size,expected)
   hashes[key]=sha(p)
  meta["exportHashes"]=hashes
  sources=[]
  if meta["id"].startswith("historical-"):
   folder=ROOT/"data/source/results/converter"/meta["model"]
   for p in sorted(folder.glob("*.npy")):sources.append({"path":str(p.relative_to(ROOT)).replace("\\","/"),"sha256":sha(p)})
  elif ds=="xuji":
   for p in sorted((ROOT/"data/source/data/xuji").glob("*.npy")):sources.append({"path":str(p.relative_to(ROOT)).replace("\\","/"),"sha256":sha(p)})
  meta["sources"]=sources
  target=PUBLIC/ds/meta["id"]/"meta.json"
  target.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
(PUBLIC/"catalog.json").write_text(json.dumps(cat,ensure_ascii=False,indent=2),encoding="utf-8")
print("Verified exported array sizes, hashes and source provenance")

