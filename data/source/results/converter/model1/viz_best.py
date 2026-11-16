# viz/viz_best.py  —— 复现 nohup_ep15.log 的“最好结果”并做可视化
# 数据来源：regen_viz_data.py 用 checkpoints/DTAAD_converter/model.ckpt
#           在 processed/converter 测试集上重算的损失（对应日志 490 异常、阈值 0.03153）
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import (precision_score, recall_score, f1_score,
                             confusion_matrix, roc_auc_score, roc_curve)

# ============== 配置（路径相对于本文件，可在任意目录运行） ==============
BASE      = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE, "data")
OUT_DIR   = os.path.join(BASE, "figures")
THRESHOLD = 0.03153185243407894       # 日志里 PA-F1 最高的那个阈值
os.makedirs(OUT_DIR, exist_ok=True)

# ============== 读数据（全部同源，来自同一次运行） ==============
score       = np.load(os.path.join(DATA_DIR, "lossFinal.npy")).reshape(-1)
labels      = np.load(os.path.join(DATA_DIR, "labels.npy")).reshape(-1).astype(int)
lossPerFeat = np.load(os.path.join(DATA_DIR, "lossPerFeat.npy"))   # (T, C)
recon       = np.load(os.path.join(DATA_DIR, "recon.npy"))         # (T, C)
testRaw     = np.load(os.path.join(DATA_DIR, "testRaw.npy"))       # (T, C)
T = len(score)
print(f"score:{score.shape} labels:{labels.shape} 异常={labels.sum()} 异常率={labels.mean():.3f}")

# ============== 点调整 (point-adjust)，与 src/pot.py 完全一致 ==============
def point_adjust(score, label, threshold):
    predict = (score > threshold).copy()
    actual = label > 0.1
    anomaly_state = False
    for i in range(len(score)):
        if actual[i] and predict[i] and not anomaly_state:
            anomaly_state = True
            for j in range(i, 0, -1):
                if not actual[j]:
                    break
                if not predict[j]:
                    predict[j] = True
        elif not actual[i]:
            anomaly_state = False
        if anomaly_state:
            predict[i] = True
    return predict.astype(int)

pred_pw = (score > THRESHOLD).astype(int)          # 纯逐点
pred_pa = point_adjust(score, labels, THRESHOLD)   # 点调整（日志里的“最好结果”）

def metrics(actual, pred, tag):
    tn, fp, fn, tp = confusion_matrix(actual, pred).ravel()
    p = tp/(tp+fp+1e-9); r = tp/(tp+fn+1e-9); f1 = 2*p*r/(p+r+1e-9)
    print(f"[{tag:12s}] TP={tp} TN={tn} FP={fp} FN={fn}  P={p:.4f} R={r:.4f} F1={f1:.4f}")
    return tn, fp, fn, tp, p, r, f1

tn1,fp1,fn1,tp1,p1,r1,f1_pw = metrics(labels, pred_pw, "point-wise")
tn2,fp2,fn2,tp2,p2,r2,f1_pa = metrics(labels, pred_pa, "point-adjust")

# ============== 1) 分数分布直方图 ==============
normal_scores   = score[labels == 0]
abnormal_scores = score[labels == 1]
plt.figure(figsize=(10, 5))
plt.hist(normal_scores,   bins=100, alpha=0.6, label="Normal",   color="tab:blue", density=True)
plt.hist(abnormal_scores, bins=100, alpha=0.6, label="Abnormal", color="tab:red",  density=True)
plt.axvline(THRESHOLD, color="k", linestyle="--", linewidth=1.5, label=f"Threshold = {THRESHOLD:.4f}")
plt.xlabel("Anomaly Score (mean reconstruction loss)"); plt.ylabel("Density")
plt.title("Score Distribution: Normal vs Abnormal")
plt.legend(); plt.tight_layout()
plt.savefig(os.path.join(OUT_DIR, "01_score_hist.png"), dpi=200); plt.close()
print("[saved] 01_score_hist.png")

# ============== 2) ROC 曲线 ==============
fpr, tpr, _ = roc_curve(labels, score)
auc = roc_auc_score(labels, score)
plt.figure(figsize=(6, 6))
plt.plot(fpr, tpr, label=f"ROC (AUC = {auc:.4f})")
plt.plot([0, 1], [0, 1], "k--", linewidth=1)
plt.xlabel("False Positive Rate"); plt.ylabel("True Positive Rate")
plt.title("ROC Curve"); plt.legend(loc="lower right"); plt.tight_layout()
plt.savefig(os.path.join(OUT_DIR, "02_roc.png"), dpi=200); plt.close()
print(f"[saved] 02_roc.png  AUC={auc:.4f}")

# ============== 3) 混淆矩阵（逐点 vs 点调整 并排） ==============
cm_pw = np.array([[tn1, fp1], [fn1, tp1]])
cm_pa = np.array([[tn2, fp2], [fn2, tp2]])
fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
for ax, cm, title, f1v in [(axes[0], cm_pw, "Point-wise", f1_pw),
                           (axes[1], cm_pa, "Point-adjust (best)", f1_pa)]:
    ax.imshow(cm, cmap="Blues")
    ax.set_title(f"{title}  F1={f1v:.4f}")
    ax.set_xticks([0, 1]); ax.set_xticklabels(["Pred Normal", "Pred Abnormal"])
    ax.set_yticks([0, 1]); ax.set_yticklabels(["True Normal", "True Abnormal"])
    for i in range(2):
        for j in range(2):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max()/2 else "black", fontsize=14)
fig.suptitle(f"Confusion Matrix (thr={THRESHOLD:.4f})", y=1.02)
plt.tight_layout()
plt.savefig(os.path.join(OUT_DIR, "03_confusion_matrix.png"), dpi=200, bbox_inches="tight"); plt.close()
print("[saved] 03_confusion_matrix.png")

# ============== 4) 分数时间序列 + 真值/预测(点调整)高亮 ==============
x = np.arange(T)
fig, axes = plt.subplots(3, 1, figsize=(16, 8), sharex=True,
                         gridspec_kw={"height_ratios": [3, 1, 1]})
axes[0].plot(x, score, color="tab:blue", linewidth=0.9, label="Anomaly Score")
axes[0].axhline(THRESHOLD, color="k", linestyle="--", linewidth=1, label="Threshold")
axes[0].fill_between(x, 0, score.max()*1.05, where=labels == 1,
                     color="red", alpha=0.12, label="Ground-truth anomaly")
axes[0].set_ylabel("Score"); axes[0].legend(loc="upper right")
axes[0].set_title("Anomaly score over time  (point-adjust best result)")
axes[1].imshow(labels.reshape(1, -1), cmap="Reds", aspect="auto", extent=[0, T, 0, 1])
axes[1].set_yticks([]); axes[1].set_title("Ground-truth labels")
axes[2].imshow(pred_pa.reshape(1, -1), cmap="Blues", aspect="auto", extent=[0, T, 0, 1])
axes[2].set_yticks([]); axes[2].set_title("Predicted labels (point-adjust)")
axes[2].set_xlabel("Timestamp")
plt.tight_layout(); plt.savefig(os.path.join(OUT_DIR, "04_score_timeline.png"), dpi=200); plt.close()
print("[saved] 04_score_timeline.png")

# ============== 5) 逐特征损失热力图 ==============
plt.figure(figsize=(14, 6))
vmax = np.percentile(lossPerFeat, 99)
im = plt.imshow(lossPerFeat.T, aspect="auto", cmap="hot", vmin=0, vmax=vmax,
                extent=[0, T, lossPerFeat.shape[1], 0])
plt.colorbar(im, label="Reconstruction loss")
plt.xlabel("Timestamp"); plt.ylabel("Feature dim")
plt.title("Per-feature reconstruction loss (heatmap)")
for i in np.where(labels == 1)[0]:
    plt.axvline(i, color="cyan", alpha=0.20, linewidth=0.5)
plt.tight_layout(); plt.savefig(os.path.join(OUT_DIR, "05_feature_heatmap.png"), dpi=200); plt.close()
print("[saved] 05_feature_heatmap.png")

# ============== 6) 重建曲线（前若干维） ==============
C = testRaw.shape[1]
for d in range(min(C, 6)):
    fig, axes = plt.subplots(2, 1, figsize=(16, 6), sharex=True,
                             gridspec_kw={"height_ratios": [3, 1]})
    axes[0].plot(testRaw[:, d], color="black", linewidth=0.8, label="Original")
    axes[0].plot(recon[:, d], color="tab:red", linewidth=0.8, alpha=0.7, label="Reconstructed")
    for i in np.where(labels == 1)[0]:
        axes[0].axvspan(i-0.5, i+0.5, color="red", alpha=0.10)
    axes[0].set_ylabel(f"Dim {d}"); axes[0].legend(loc="upper right")
    axes[0].set_title(f"Original vs Reconstructed — feature {d}")
    err_d = (testRaw[:, d] - recon[:, d]) ** 2
    axes[1].plot(err_d, color="tab:green", linewidth=0.8)
    axes[1].set_ylabel("Squared error"); axes[1].set_xlabel("Timestamp")
    for i in np.where(labels == 1)[0]:
        axes[1].axvspan(i-0.5, i+0.5, color="red", alpha=0.10)
    plt.tight_layout(); plt.savefig(os.path.join(OUT_DIR, f"06_recon_dim{d}.png"), dpi=200); plt.close()
print("[saved] 06_recon_dim*.png")

# ============== 7) 局部放大 ==============
def zoom_plot(start, end, name="07_zoom.png"):
    start = max(0, start); end = min(T, end); xs = np.arange(start, end)
    plt.figure(figsize=(16, 5))
    plt.plot(xs, score[start:end], color="tab:blue", label="Score")
    plt.axhline(THRESHOLD, color="k", linestyle="--", linewidth=1, label="Threshold")
    for i in xs:
        if labels[i] == 1:
            plt.axvspan(i-0.5, i+0.5, color="red", alpha=0.15)
        if pred_pa[i] == 1:
            plt.plot(i, score[i], "r.", markersize=3)
    plt.xlabel("Timestamp"); plt.ylabel("Score")
    plt.title(f"Zoom [{start}:{end}]  (red band=GT anomaly, red dot=predicted)")
    plt.legend(); plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, name), dpi=200); plt.close()
    print(f"[saved] {name}")
zoom_plot(0, min(T, 600))

print("\n==== 汇总 ====")
print(f"阈值            : {THRESHOLD:.6f}")
print(f"逐点  F1        : {f1_pw:.4f}  (P={p1:.4f} R={r1:.4f})")
print(f"点调整 F1(最佳) : {f1_pa:.4f}  (P={p2:.4f} R={r2:.4f})")
print(f"ROC/AUC         : {auc:.4f}")
print(f"图片已保存到 {OUT_DIR}/")
