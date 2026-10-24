import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server.research import create_model
import torch
for ds,features in [("converter",125),("xuji",7)]:
 for mid in ["model1","model2","model3"]:
  p=Path("data/models")/ds/mid/"model.ckpt"
  if not p.exists():continue
  try:
   c=torch.load(p,map_location="cpu",weights_only=False)
   m=create_model(mid,features,64)
   m.load_state_dict(c["model_state_dict"],strict=True)
   print(ds,mid,"OK","memory saved",any(k.endswith(".mem") for k in c["model_state_dict"]))
  except Exception as e:print(ds,mid,type(e).__name__,e)

