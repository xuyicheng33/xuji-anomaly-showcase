# viz/regen_viz_data.py
# 作用：用 checkpoints/DTAAD_converter/model.ckpt 在 processed/converter 测试集上
#       重新前向推理，生成 viz/data/ 下可视化所需的数组。
# 说明：训练日志只存了训练损失(trainLoss.npy)，没存测试损失，所以这里按
#       save_score.py / newMain17.py 相同的逻辑重算测试分数。
import os
import sys
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

# 路径：本文件在 viz/ 下，项目根目录是其上一级
BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE)
sys.path.insert(0, PROJECT_ROOT)      # 让 import src / adaptive_mask 能找到

torch.set_num_threads(8)              # 机器核多，限制线程避免超订变慢
import src.models
from adaptive_mask import get_periods_and_masking

DATASET   = "converter"
CKPT      = os.path.join(PROJECT_ROOT, f"checkpoints/DTAAD_{DATASET}/model.ckpt")
TEST_PATH = os.path.join(PROJECT_ROOT, f"processed/{DATASET}/{DATASET}_test.npy")    # (2397,125)
LAB_PATH  = os.path.join(PROJECT_ROOT, f"processed/{DATASET}/{DATASET}_labels.npy")  # (2397,125)
OUT_DIR   = os.path.join(BASE, "data")
K_MASK    = 5
os.makedirs(OUT_DIR, exist_ok=True)

# ---------- 读数据 ----------
test_np   = np.load(TEST_PATH)
labels_np = np.load(LAB_PATH)
print("test", test_np.shape, "labels", labels_np.shape,
      "异常", int((labels_np.sum(1) >= 1).sum()))

# ---------- 加载模型 ----------
model = getattr(src.models, "DTAAD")(labels_np.shape[1]).double()
ckpt = torch.load(CKPT, map_location="cpu")
model.load_state_dict(ckpt["model_state_dict"])
model.eval()

# ---------- 构造滑窗 ----------
def convert_to_windows(data, model):
    windows = []
    w = model.n_window
    for i in range(len(data)):
        win = data[i - w:i] if i >= w else torch.cat([data[0].repeat(w - i, 1), data[0:i]])
        windows.append(win)
    return torch.stack(windows)

testO = torch.DoubleTensor(test_np)
testD = convert_to_windows(testO, model)                 # (T, n_window, C)
maskedTestD, _ = get_periods_and_masking(testD.numpy(), K_MASK)
maskedTestD = torch.from_numpy(maskedTestD)

# ---------- 前向推理，算逐窗口损失 ----------
dl = DataLoader(TensorDataset(testD, maskedTestD), batch_size=int(testD.shape[0] / 10))
loss_list, pred_list = [], []
with torch.no_grad():
    for d, dm in dl:
        # model.forward 期望输入 (B, L, C)，内部已自行 permute；
        # 与训练脚本一致应直接传入 d/dm，不能再 permute(0,2,1)。
        z = model(d, dm)
        loss_list.append(nn.MSELoss(reduction="none")(z, d).numpy())
        pred_list.append(z.numpy())
loss = np.concatenate(loss_list, 0)    # (T, n_window, C)
pred = np.concatenate(pred_list, 0)    # (T, n_window, C)

# ---------- 滑窗重叠平均（等价 calculate_finalLoss） ----------
def calc_final(a, nw):
    num = a.shape[0]
    cnt = np.full(num, nw)
    cnt[:nw] = np.arange(1, nw + 1)
    cnt[num - nw:] = np.arange(nw, 0, -1)
    cnt = cnt[:, None]
    out = np.zeros((num, a.shape[2]))
    for i in range(nw - 1, num):
        out[i + 1 - nw:i + 1] += a[i]
    return out / cnt

lossFeat = calc_final(loss, loss.shape[1])   # (T, C) 逐特征损失
recon    = calc_final(pred, pred.shape[1])   # (T, C) 重建值
score    = np.mean(lossFeat, axis=1)         # (T,)   最终分数

# ---------- 保存 ----------
np.save(os.path.join(OUT_DIR, "lossFinal.npy"), score)
np.save(os.path.join(OUT_DIR, "lossPerFeat.npy"), lossFeat)
np.save(os.path.join(OUT_DIR, "recon.npy"), recon)
np.save(os.path.join(OUT_DIR, "labels.npy"), (labels_np.sum(1) >= 1).astype(int))
np.save(os.path.join(OUT_DIR, "testRaw.npy"), test_np)
print("saved viz/data/  score", score.shape, "feat", lossFeat.shape,
      "recon", recon.shape, "异常", int((labels_np.sum(1) >= 1).sum()))
