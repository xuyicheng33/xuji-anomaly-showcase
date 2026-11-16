import numpy as np
import torch
import random
from torch.utils.data import Dataset, DataLoader, TensorDataset
import argparse
from src.parser import *

def adaptive_period(data, k):
    """
    data: [B, T, C]
    """
    B, T, C = data.shape
    # 傅里叶变换
    xf = torch.fft.rfft(torch.tensor(data), dim=1) 
    # 振幅取绝对值
    frequency_list = abs(xf)  
    # 将直流分量设置为0
    frequency_list[:, 0, :] = 0  

    period_BKC = frequency_list.permute(2, 0, 1)  
    period_CKB = frequency_list.permute(2, 1, 0)  
    # 计算序列之间基于频率的相似度
    similarity_matrix = torch.matmul(period_BKC, period_CKB)

    # 相似度矩阵归一化
    norm_BKC = torch.norm(period_BKC, p=2, dim=-1, keepdim=True)  
    norm_CKB = torch.norm(period_CKB, p=2, dim=-2, keepdim=True) 
    normalized_similarity_matrix = similarity_matrix / (norm_BKC * norm_CKB + 1e-5)

    # 将对角线元素设置为负无穷大
    mask = torch.eye(normalized_similarity_matrix.shape[-1], device=normalized_similarity_matrix.device, dtype=bool)
    masked_similarity_matrix = normalized_similarity_matrix.masked_fill(mask.unsqueeze(0).unsqueeze(0), float('-inf'))
    masked_similarity_matrix = masked_similarity_matrix[0]

    # 获取最大相似度的序列
    # 创建一个空数组用于存储结果
    result = np.zeros((masked_similarity_matrix.shape[0], 2),dtype=int)
    cols = int(masked_similarity_matrix.numpy().shape[-1])

    # 遍历每个矩阵，找到最大值的索引（行，列）
    for i in range(masked_similarity_matrix.shape[0]):
        m = np.argmax(masked_similarity_matrix[i].numpy())
        r, c = divmod(m, cols)
        # 将找到的行列位置存入结果数组
        result[i, 0] = r
        result[i, 1] = c
    
    newfrequency_list = frequency_list.permute(2, 0, 1)
    topk_frequencies = []
    topk_indexes = []
    for i in range(masked_similarity_matrix.shape[0]):
        A_i = result[i][0]
        A_j = result[i][1]
        A_i_max = newfrequency_list[i][A_i].unsqueeze(0)
        A_j_max = newfrequency_list[i][A_j].unsqueeze(0)
        # print(A_i_max.shape)
        # 寻找主导频率
        # print(torch.cat((A_i_max, A_j_max), dim=0).shape)
        # 相加？
        A_final = A_i_max + A_j_max

        subtopk_frequencies, subtopk_indexes = torch.topk(A_final, k, dim=-1)
        # print(subtopk_frequencies, subtopk_indexes)
        topk_frequencies.append(subtopk_frequencies.numpy())
        topk_indexes.append(subtopk_indexes.numpy())
    topk_frequencies = np.concatenate(topk_frequencies, axis=0)
    topk_indexes = np.concatenate(topk_indexes, axis=0)
  
    periods = np.zeros((topk_indexes.shape[0], topk_indexes.shape[1]),dtype=int)
    periods.fill(T)
    # new_topk_indexes = np.where(topk_indexes == 0, np.inf, topk_indexes)
    # 防止除数为0，或者周期长度大于等于窗口长度
    new_topk_indexes = np.where(topk_indexes < 2, np.inf, topk_indexes)
    # print(topk_indexes,'\n', new_topk_indexes)
    # 计算相应周期 
    periods = T // new_topk_indexes
    periods.astype(int)
    return periods


def random_masking(xb, representative_periods):
    bs, L, C = xb.shape 
    mask = np.ones((bs, L, C), dtype = int)
    k = representative_periods.shape[1]
    mask_ranges = []
    for channel in range(C):
        a = random.randint(0, k-1)
        period = representative_periods[channel][a] 

        # if period <= 2:
        #     mask_range = 2 
        # elif 2 < period <= 21:
        #     mask_range = 4  
        # else:  
        #     mask_range = 8
        # 掩码后的长度等于周期长度
        if period <= 3*L/4:
            mask_range = L/4  
        else:  
            mask_range = L-period 
        
        mask_ranges.append(mask_range)

    for channel in range(C):
        mask_range = int(mask_ranges[channel])
        for b in range(bs):
            start_idx = torch.randint(0, int(L - mask_range + 1), (1,)).item()
            # print(start_idx)
            end_idx = start_idx + mask_range
            # print(start_idx, end_idx)
            xb[b, start_idx:end_idx, channel] = 0  
            mask[b, start_idx:end_idx, channel] = 0
            
    return xb, mask


def get_periods_and_masking(data, k):
    mybatchsize = args.batch_size
    dataset = DataLoader(torch.tensor(data), batch_size = mybatchsize)

    maskeddata = []
    masklabels = []
    for d in dataset:
        subperiods = adaptive_period(d, k)
        submaskeddata, submasklabels = random_masking(d, subperiods)
        maskeddata.append(submaskeddata.numpy())
        masklabels.append(submasklabels)
    
    maskeddata = np.concatenate(maskeddata, axis=0)
    masklabels = np.concatenate(masklabels, axis=0)
    # print(maskeddata.shape, masklabels.shape)
    return maskeddata, masklabels
