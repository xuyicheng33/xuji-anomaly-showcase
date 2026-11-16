import numpy as np
import torch
import torch.nn as nn
    
class BNDLoss(nn.Module):
    def __init__(self, BNS, _lambda):
        super().__init__()
        self.BNS = BNS
        self._lambda = _lambda
        self.relu = nn.ReLU()
        self.mse_loss = nn.MSELoss(reduction='none')

    def forward(self, z, elem, labels):
        # 计算损失项
        l1 =  self.mse_loss(z, elem)
        l1 = torch.mean(l1, dim=2)
        
        # 处理 labels
        labels = torch.any(labels == 1, dim=-1).long()
        labels = torch.where(labels == 0, -1, labels).int()
        
        # 计算最终损失
        loss = torch.mean(self.relu(2 * self.BNS - labels * l1))
        return loss