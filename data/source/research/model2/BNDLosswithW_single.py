import numpy as np
import torch
import torch.nn as nn
    
# class BNDLoss(nn.Module):
#     def __init__(self, BNS, _lambda):
#         super().__init__()
#         self.BNS = BNS
#         self._lambda = _lambda
#         self.relu = nn.ReLU()
#         self.mse_loss = nn.MSELoss(reduction='none')

#     def forward(self, z, elem, labels, model):
#         # 计算损失项
#         l1 =  self.mse_loss(z, elem)
#         l1 = torch.mean(l1, dim=2)
        
#         # 处理 labels
#         labels = torch.any(labels == 1, dim=-1).long()
#         labels = torch.where(labels == 0, -1, labels).int()
        
#         # 计算最终损失
#         loss = torch.mean(self.relu(2 * self.BNS - labels * l1))
#         return loss

class BNDLoss(nn.Module):
    def __init__(self, BNS, _lambda):
        """
        BNS: 边界参数
        _lambda: 空间正则项权重
        """
        super().__init__()
        self.BNS = BNS
        self._lambda = 1.0
        self.relu = nn.ReLU()
        self.mse_loss = nn.MSELoss(reduction='none')
        self.attn_spatial = None  # 在训练前由外部赋值

    def spatial_anomaly_ratio(self, attn_spatial, labels, eps=1e-8):
        """
        计算空间正则项: 异常→正常 / 异常→异常
        attn_spatial: [B,H,C,C] 或 [B,C,C]
        labels: [B,L,C] 或 [B,C]
        """
        if attn_spatial.ndim == 4:  # [B,H,C,C]
            attn = attn_spatial.mean(dim=1)  # 平均 head
        else:
            attn = attn_spatial  # [B,C,C]

        B, C, _ = attn.shape

        # 处理 labels
        if labels.ndim == 3:  # [B,L,C]
            # 将时间维度取 max 或 any，得到每个变量是否有异常
            var_labels = torch.any(labels == 1, dim=1)  # [B,C]
        else:  # [B,C]
            var_labels = labels

        reg_loss = 0.0
        valid_batch = 0

        for b in range(B):
            anomaly_idx = var_labels[b].bool()  # [C]
            normal_idx = (~var_labels[b]).bool()  # [C]

            if anomaly_idx.sum() == 0 or normal_idx.sum() == 0:
                continue

            # 选择对应行和列
            numerator = attn[b][anomaly_idx][:, normal_idx].sum()
            denominator = attn[b][anomaly_idx][:, anomaly_idx].sum() + eps
            reg_loss += numerator / denominator
            valid_batch += 1

        if valid_batch == 0:
            return torch.tensor(0.0, device=attn.device)

        return reg_loss / valid_batch


    def forward(self, z, elem, labels, model):

        self.attn_spatial = model.attn_spatial

        # -----------------------------
        # 原 BNDLoss 重建/边界损失
        # -----------------------------
        l1 = self.mse_loss(z, elem)  # [B,L,C]
        l1 = torch.mean(l1, dim=2)   # [B,L]

        labels_proc = torch.any(labels == 1, dim=-1).long()  # [B,L]
        labels_proc = torch.where(labels_proc == 0, -1, labels_proc).int()

        loss_recon = torch.mean(self.relu(2 * self.BNS - labels_proc * l1))

        # -----------------------------
        # 空间正则项
        # -----------------------------
        if self.attn_spatial is not None:
            reg_loss = self.spatial_anomaly_ratio(self.attn_spatial, labels)
        else:
            reg_loss = torch.tensor(0.0, device=z.device)

        
        print(
            f"loss_recon={loss_recon.item():.4f}, "
            f"reg_loss={reg_loss.item():.4f}"
        )


        # -----------------------------
        # 总损失
        # -----------------------------
        loss = loss_recon + self._lambda * reg_loss
        return loss
    
# class BNDLoss(nn.Module):
#     def __init__(self, BNS, lambda_spatial):
#         super().__init__()
#         self.BNS = BNS
#         self.lambda_spatial = lambda_spatial
#         self.relu = nn.ReLU()
#         self.mse_loss = nn.MSELoss(reduction='none')

#     def forward(self, z, elem, labels, model=None):
#         """
#         z, elem: (B, L, C)
#         labels:  (B, L, C)
#         """

#         # ========= 原始 BND loss =========
#         l1 = self.mse_loss(z, elem)            # (B, L, C)
#         l1 = torch.mean(l1, dim=2)             # (B, L)

#         sample_label = torch.any(
#             torch.any(labels == 1, dim=2),
#             dim=1
#         ).long()                               # (B,)

#         sample_label = torch.where(
#             sample_label == 0,
#             torch.full_like(sample_label, -1),
#             sample_label
#         )

#         loss_bnd = torch.mean(
#             self.relu(2 * self.BNS - sample_label.unsqueeze(1) * l1)
#         )

#         # ========= 空间注意力熵正则 =========
#         loss_spatial = 0.0
#         if model is not None and hasattr(model, "attn_spatial") and model.attn_spatial is not None:
#             attn = model.attn_spatial          # (B, H, C, C)
#             attn_mean = attn.mean(dim=1)       # (B, C, C)
#             attn_mean = attn_mean / (attn_mean.sum(dim=-1, keepdim=True) + 1e-8)

#             entropy = -torch.sum(
#                 attn_mean * torch.log(attn_mean + 1e-8),
#                 dim=-1
#             )                                  # (B, C)

#             loss_spatial = entropy.mean()

#         return loss_bnd + self.lambda_spatial * loss_spatial

