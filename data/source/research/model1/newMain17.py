import pickle
import os
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from tqdm import tqdm
from src.models import *
from src.constants import *
from src.plotting import *
from src.pot import *
from src.utils import *
from src.diagnosis import *
from torch.utils.data import Dataset, DataLoader, TensorDataset
import torch.nn as nn
from time import time
from pprint import pprint
from BNDLosswithW_single import BNDLoss
from demo11 import insert_anomalies_for_traindata, insert_anomalies_for_converterdata
from adaptive_mask import adaptive_period, random_masking, get_periods_and_masking
import gc

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'DejaVu Sans'

def convert_to_windows(data, model):
    windows = []
    w_size = model.n_window
    for i, g in enumerate(data):
        if i >= w_size:
            w = data[i - w_size:i]  # cut
        else:
            w = torch.cat([data[0].repeat(w_size - i, 1), data[0:i]])  # pad
        windows.append(
            w if 'DTAAD' in args.model or 'Attention' in args.model or 'TranAD' in args.model else w.view(-1))
    return torch.stack(windows)


def load_dataset(dataset, myoutput_folder):
    folder = os.path.join(myoutput_folder, dataset)
    if not os.path.exists(folder):
        raise Exception('Processed Data not found.')
    loader = []
    for file in ['train', 'test', 'labels']:
        if myoutput_folder == 'insertedData':
            if dataset == 'SMD': file = 'machine-1-1_' + file
            if dataset == 'SMAP': file = 'P-1_' + file
            if dataset == 'MSL': file = 'C-1_' + file
            if dataset == 'UCR': file = '136_' + file
            if dataset == 'NAB': file = 'ec2_request_latency_system_failure_' + file
        # 新数据
            if dataset == 'converter': file = 'converter_' + file
        loader.append(np.load(os.path.join(folder, f'{file}.npy')))
    train_loader = DataLoader(loader[0], batch_size=loader[0].shape[0])
    test_loader = DataLoader(loader[1], batch_size=loader[1].shape[0])
    labels = loader[2]
    return train_loader, test_loader, labels


def load_model(modelname, dims):
    import src.models
    # 获取模型类
    model_class = getattr(src.models, modelname)
    model = model_class(dims).double()
    optimizer = torch.optim.AdamW(model.parameters(), lr=model.lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, 5, 0.9)
    fname = f'checkpoints/{args.model}_{args.dataset}/model.ckpt'
    if os.path.exists(fname) and (not args.retrain or args.test):
        print(f"{color.GREEN}Loading pre-trained model: {model.name}{color.ENDC}")
        checkpoint = torch.load(fname)
        model.load_state_dict(checkpoint['model_state_dict'])
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
        epoch = checkpoint['epoch']
        accuracy_list = checkpoint['accuracy_list']
    else:
        print(f"{color.GREEN}Creating new model: {model.name}{color.ENDC}")
        epoch = -1
        accuracy_list = []
    return model, optimizer, scheduler, epoch, accuracy_list


def backprop(epoch, model, data, dataO, dataMasked, optimizer, scheduler, labels, training=True):
    l = nn.MSELoss(reduction='mean' if training else 'none')
    feats = dataO.shape[1]
    if 'DAGMM' in model.name:
        l = nn.MSELoss(reduction='none')
        model.to(torch.device(args.Device))
        compute = ComputeLoss(model, 0.1, 0.005, 'cpu', model.n_gmm)
        n = epoch + 1
        w_size = model.n_window
        l1s = []
        l2s = []
        if training:
            for d in data:
                d = d.to(torch.device(args.Device))
                _, x_hat, z, gamma = model(d)
                l1, l2 = l(x_hat, d), l(gamma, d)
                l1s.append(torch.mean(l1).item())
                l2s.append(torch.mean(l2).item())
                loss = torch.mean(l1) + torch.mean(l2)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            scheduler.step()
            tqdm.write(f'Epoch {epoch},\tL1 = {np.mean(l1s)},\tL2 = {np.mean(l2s)}')
            return np.mean(l1s) + np.mean(l2s), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            ae1s = []
            for d in data:
                _, x_hat, _, _ = model(d)
                ae1s.append(x_hat)
            ae1s = torch.stack(ae1s)
            y_pred = ae1s[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            loss = l(ae1s, data)[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            return loss.detach().numpy(), y_pred.detach().numpy()
    if 'Attention' in model.name:
        l = nn.MSELoss(reduction='none')
        model.to(torch.device(args.Device))
        n = epoch + 1
        w_size = model.n_window
        l1s = []
        res = []
        if training:
            for d in data:
                d = d.to(torch.device(args.Device))
                ae = model(d)
                # res.append(torch.mean(ats, axis=0).view(-1))
                l1 = l(ae, d)
                l1s.append(torch.mean(l1).item())
                loss = torch.mean(l1)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            # res = torch.stack(res); np.save('ascores.npy', res.detach().numpy())
            scheduler.step()
            tqdm.write(f'Epoch {epoch},\tL1 = {np.mean(l1s)}')
            return np.mean(l1s), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            ae1s, y_pred = [], []
            for d in data:
                ae1 = model(d)
                y_pred.append(ae1[-1])
                ae1s.append(ae1)
            ae1s, y_pred = torch.stack(ae1s), torch.stack(y_pred)
            loss = torch.mean(l(ae1s, data), axis=1)
            return loss.detach().numpy(), y_pred.detach().numpy()
    elif 'OmniAnomaly' in model.name:
        if training:
            mses, klds = [], []
            model.to(torch.device(args.Device))
            for i, d in enumerate(data):
                d = d.to(torch.device(args.Device))
                y_pred, mu, logvar, hidden = model(d, hidden if i else None)
                MSE = l(y_pred, d)
                KLD = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=0)
                loss = MSE + model.beta * KLD
                mses.append(torch.mean(MSE).item());
                klds.append(model.beta * torch.mean(KLD).item())
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            tqdm.write(f'Epoch {epoch},\tMSE = {np.mean(mses)},\tKLD = {np.mean(klds)}')
            scheduler.step()
            return loss.item(), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            y_preds = []
            for i, d in enumerate(data):
                y_pred, _, _, hidden = model(d, hidden if i else None)
                y_preds.append(y_pred)
            y_pred = torch.stack(y_preds)
            MSE = l(y_pred, data)
            return MSE.detach().numpy(), y_pred.detach().numpy()
    elif 'USAD' in model.name:
        l = nn.MSELoss(reduction='none')
        model.to(torch.device(args.Device))
        n = epoch + 1
        w_size = model.n_window
        l1s, l2s = [], []
        if training:
            for d in data:
                d = d.to(torch.device(args.Device))
                ae1s, ae2s, ae2ae1s = model(d)
                l1 = (1 / n) * l(ae1s, d) + (1 - 1 / n) * l(ae2ae1s, d)
                l2 = (1 / n) * l(ae2s, d) - (1 - 1 / n) * l(ae2ae1s, d)
                l1s.append(torch.mean(l1).item());
                l2s.append(torch.mean(l2).item())
                loss = torch.mean(l1 + l2)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            scheduler.step()
            tqdm.write(f'Epoch {epoch},\tL1 = {np.mean(l1s)},\tL2 = {np.mean(l2s)}')
            return np.mean(l1s) + np.mean(l2s), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            ae1s, ae2s, ae2ae1s = [], [], []
            for d in data:
                ae1, ae2, ae2ae1 = model(d)
                ae1s.append(ae1)
                ae2s.append(ae2)
                ae2ae1s.append(ae2ae1)
            ae1s, ae2s, ae2ae1s = torch.stack(ae1s), torch.stack(ae2s), torch.stack(ae2ae1s)
            y_pred = ae1s[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            loss = 0.1 * l(ae1s, data) + 0.9 * l(ae2ae1s, data)
            loss = loss[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            return loss.detach().numpy(), y_pred.detach().numpy()
    elif model.name in ['GDN', 'MTAD_GAT', 'MSCRED', 'CAE_M']:
        l = nn.MSELoss(reduction='none')
        model.to(torch.device(args.Device))
        n = epoch + 1
        w_size = model.n_window
        l1s = []
        if training:
            for i, d in enumerate(data):
                d = d.to(torch.device(args.Device))
                if 'MTAD_GAT' in model.name:
                    x, h = model(d, h if i else None)
                else:
                    x = model(d)
                loss = torch.mean(l(x, d))
                l1s.append(torch.mean(loss).item())
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            tqdm.write(f'Epoch {epoch},\tMSE = {np.mean(l1s)}')
            return np.mean(l1s), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            xs = []
            for d in data:
                if 'MTAD_GAT' in model.name:
                    x, h = model(d, None)
                else:
                    x = model(d)
                xs.append(x)
            xs = torch.stack(xs)
            y_pred = xs[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            loss = l(xs, data)
            loss = loss[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            return loss.detach().numpy(), y_pred.detach().numpy()
    elif 'GAN' in model.name:
        l = nn.MSELoss(reduction='none')
        model.to(torch.device(args.Device))
        bcel = nn.BCELoss(reduction='mean')
        msel = nn.MSELoss(reduction='mean')
        real_label, fake_label = torch.tensor([0.9]), torch.tensor([0.1])  # label smoothing
        real_label, fake_label = real_label.type(torch.DoubleTensor), fake_label.type(torch.DoubleTensor)
        n = epoch + 1;
        w_size = model.n_window
        mses, gls, dls = [], [], []
        if training:
            for d in data:
                # training discriminator
                d = d.to(torch.device(args.Device))
                model.discriminator.zero_grad()
                _, real, fake = model(d)
                dl = bcel(real, real_label) + bcel(fake, fake_label)
                dl.backward()
                model.generator.zero_grad()
                optimizer.step()
                # training generator
                z, _, fake = model(d)
                mse = msel(z, d)
                gl = bcel(fake, real_label)
                tl = gl + mse
                tl.backward()
                model.discriminator.zero_grad()
                optimizer.step()
                mses.append(mse.item())
                gls.append(gl.item())
                dls.append(dl.item())
            # tqdm.write(f'Epoch {epoch},\tMSE = {mse},\tG = {gl},\tD = {dl}')
            tqdm.write(f'Epoch {epoch},\tMSE = {np.mean(mses)},\tG = {np.mean(gls)},\tD = {np.mean(dls)}')
            return np.mean(gls) + np.mean(dls), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            outputs = []
            for d in data:
                z, _, _ = model(d)
                outputs.append(z)
            outputs = torch.stack(outputs)
            y_pred = outputs[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            loss = l(outputs, data)
            loss = loss[:, data.shape[1] - feats:data.shape[1]].view(-1, feats)
            return loss.detach().numpy(), y_pred.detach().numpy()
    elif 'TranAD' in model.name:
        l = nn.MSELoss(reduction='none')
        model.to(torch.device(args.Device))
        data_x = torch.DoubleTensor(data)
        dataset = TensorDataset(data_x, data_x)
        bs = model.batch if training else len(data)
        dataloader = DataLoader(dataset, batch_size=bs)
        n = epoch + 1
        w_size = model.n_window
        l1s, l2s = [], []
        if training:
            for d, _ in dataloader:
                d = d.to(torch.device(args.Device))
                local_bs = d.shape[0]
                window = d.permute(1, 0, 2)
                elem = window[-1, :, :].view(1, local_bs, feats)
                z = model(window, elem)
                l1 = l(z, elem) if not isinstance(z, tuple) else (1 / n) * l(z[0], elem) + (1 - 1 / n) * l(z[1], elem)
                if isinstance(z, tuple): z = z[1]
                l1s.append(torch.mean(l1).item())
                loss = torch.mean(l1)
                optimizer.zero_grad()
                loss.backward(retain_graph=True)
                optimizer.step()
            scheduler.step()
            tqdm.write(f'Epoch {epoch},\tL1 = {np.mean(l1s)}')
            return np.mean(l1s), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            for d, _ in dataloader:
                window = d.permute(1, 0, 2)
                elem = window[-1, :, :].view(1, bs, feats)
                z = model(window, elem)
                if isinstance(z, tuple): z = z[1]
            loss = l(z, elem)[0]
            return loss.detach().numpy(), z.detach().numpy()[0]
    elif 'DTAAD' in model.name:
        l = nn.MSELoss(reduction='none')
        _lambda = 0.8
        bndLoss=BNDLoss(BNS,_lambda)
        # bndLoss=BNDLoss(BNS,_lambda).to(torch.device(args.Device))
        model.to(torch.device(args.Device))

        data_x = torch.DoubleTensor(data)
        dataMasked_x = torch.DoubleTensor(dataMasked)
        labels = torch.tensor(labels)

        if training:
            dataset = TensorDataset(data_x, labels, dataMasked_x)
        else:
            dataset = TensorDataset(data_x, data_x, dataMasked_x)
        bs = model.batch if training else len(data)
        dataloader = DataLoader(dataset, batch_size=bs)
        n = epoch + 1
        w_size = model.n_window
        global_size = int(model.n_window * global_decoder_rate)
        l1s, l2s = [], []
        l3s = []
        fusion_list = []

        if training:
            for d, d_label, d_masked in dataloader:
                print(d.shape)
                d = d.to(torch.device(args.Device))
                d_masked = d_masked.to(torch.device(args.Device))
                local_bs = d.shape[0]
                window01 = d.permute(0, 2, 1)
                window02 = d_masked.permute(0, 2, 1)
                elem = d
                z = model(window01, window02)
                l1 = l(z, elem)
                l1s.append(torch.mean(l1).item())
                fusion_list.append(z.detach().cpu().numpy())
                

                loss = bndLoss(z, elem, d_label)
                # print(loss.dtype)
               
                l3s.append(l1.cpu().detach().numpy())

                optimizer.zero_grad()
                loss.backward(retain_graph=True)
                optimizer.step()
            scheduler.step()
            tqdm.write(f'Epoch {epoch},\tL1 = {np.mean(l1s)}')
            tqdm.write(f'Epoch {epoch},\tmyLoss = {loss}')
            plot_multidim_reconstruction(
                raw_series=dataO,              # (T, C)
                model_outputs={
                    "fusion": fusion_list,        # list of (batch, L, C)
                    "spatial": None,
                    "temporal": None
                },
                dims=[0],                     # ⭐ 自定义想要画的维度
                labels=None,                    # (T, C) 标签
                epoch=epoch,
                save_dir="./recon_plots"
            )

            # ============================
            # ⭐ 关键改动：fusion_list 合并为 torch.Tensor
            # ============================
            new_fusion_list = np.concatenate(fusion_list, axis=0)
            print(new_fusion_list.shape)

            # ⭐ trainD 也要变成 (N, L, C)
            trainD_tensor = torch.tensor(trainD, dtype=torch.float32)
            labels_tensor = labels.to(torch.device(args.Device))

            # ============================
            # ⭐ 正确统计 normal/abnormal 损失
            # ============================
            normal_mean, abnormal_mean = collect_loss_statistics(
                torch.tensor(new_fusion_list), 
                trainD_tensor, 
                labels_tensor
            )
            normal_losses.append(normal_mean)
            abnormal_losses.append(abnormal_mean)



            # 将l3s转为numpy数组并写出到dataset/Loss文件夹下
            l3s = np.concatenate(l3s, axis=0)
            # print("total_l3s", l3s.shape)
            l3sFileName = f"Loss/train/l3s_{epoch}.npy"
            np.save(l3sFileName, l3s)
            return np.mean(l1s), optimizer.param_groups[0]['lr']
        else:
            print('DTAADTesting')
            model.to(torch.device('cpu'))
            for d, _, d_masked in dataloader:
                window01 = d.permute(0, 2, 1)
                window02 = d_masked.permute(0, 2, 1)
                elem = d
                z = model(window01, window02)
            loss = l(z, elem)
            return loss.detach().numpy(), z.detach().numpy()
    else:
        model.to(torch.device(args.Device))
        data = data.to(torch.device(args.Device))
        y_pred = model(data)
        loss = l(y_pred, data)
        if training:
            tqdm.write(f'Epoch {epoch},\tMSE = {loss}')
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            scheduler.step()
            return loss.item(), optimizer.param_groups[0]['lr']
        else:
            model.to(torch.device('cpu'))
            return loss.detach().numpy(), y_pred.detach().numpy()

normal_losses = []
abnormal_losses = []

def plot_multidim_reconstruction(
        raw_series,
        model_outputs,
        dims=None,
        labels=None,
        epoch=0,
        save_dir="./recon_plots"
):
    """
    多维自定义重建可视化
    raw_series: (T, C)
    model_outputs:
        "fusion":   list of (batch, L, C)
        "spatial":  list of (batch, L, C)
        "temporal": list of (batch, L, C)
    labels: (T, C) or None
    dims: 想要绘制的维度列表，如 [0,3,5]
    """

    os.makedirs(save_dir, exist_ok=True)

    T, C = raw_series.shape

    # 默认绘制所有维度
    if dims is None:
        dims = list(range(C))

    # ------------------------------
    # 1. 窗口还原函数
    # ------------------------------
    def windows_to_series(win_list):
        """将每个窗口的最后一个点拼接成连续序列"""
        seq = []
        for w in win_list:
            # w: (batch, L, C)
            w_last = w[:, -1, :]   # (batch, C)
            seq.append(w_last)
        return np.concatenate(seq, axis=0)

    pred_fusion = windows_to_series(model_outputs["fusion"])
    if model_outputs["spatial"] is not None:
        pred_spatial = windows_to_series(model_outputs["spatial"])
    if model_outputs["temporal"] is not None:
        pred_temporal = windows_to_series(model_outputs["temporal"])

    # 可能因为 batch 不满导致长度不同 → 截断
    pred_fusion = pred_fusion[:T]
    if model_outputs["spatial"] is not None:
        pred_spatial = pred_spatial[:T]
    if model_outputs["temporal"] is not None:
        pred_temporal = pred_temporal[:T]

    # ------------------------------
    # 2. 每个指定维度绘图
    # ------------------------------
    for d in dims:
        plt.figure(figsize=(14, 5))

        plt.plot(raw_series[:, d], label="Original", color="black", linewidth=1)
        plt.plot(pred_fusion[:, d], label="Fusion Output", color="green", linewidth=1.2)
        if model_outputs["spatial"] is not None:
            plt.plot(pred_spatial[:, d], label="Spatial Branch", linestyle="--", linewidth=1)
        if model_outputs["temporal"] is not None:
            plt.plot(pred_temporal[:, d], label="Temporal Branch", linestyle="--", linewidth=1)

        # --- 标红异常 ---
        if labels is not None:
            lbl = labels[:, d]  # (T,)
            anomaly_idx = np.where(lbl == 1)[0]

            if len(anomaly_idx) > 0:
                plt.scatter(anomaly_idx, raw_series[anomaly_idx, d],
                            color="red", s=12, label="Anomaly")

        plt.legend()
        plt.title(f"Epoch {epoch} — Dim {d} Reconstruction")
        plt.tight_layout()

        path = os.path.join(save_dir, f"epoch{epoch}_dim{d}.png")
        plt.savefig(path, dpi=200)
        plt.close()

        print(f"[Saved] {path}")


def save_reconstructed_series(raw_series, model_outputs, epoch=0, save_dir="./reconstructed"):
    """
    将模型输出的窗口格式 (batch, L, C) 还原为连续序列 (T, C)，并保存为 .npy 文件
    model_outputs:
        {
            "fusion":   list of (batch, L, C),
            "spatial":  list of (batch, L, C) or None,
            "temporal": list of (batch, L, C) or None,
            ...
        }
    """

    os.makedirs(save_dir, exist_ok=True)
    T, C = raw_series.shape

    # ------------------------------
    # 1. 窗口还原函数（与原函数一致）
    # ------------------------------
    def windows_to_series(win_list):
        seq = []
        for w in win_list:                   # w: (batch, L, C)
            w_last = w[:, -1, :]             # (batch, C)
            seq.append(w_last)
        return np.concatenate(seq, axis=0)

    # ------------------------------
    # 2. 遍历所有 key，生成序列并保存
    # ------------------------------
    for name, win_list in model_outputs.items():

        if win_list is None:
            print(f"[Skip] {name} has no data.")
            continue

        reconstructed = windows_to_series(win_list)   # (N, C)
        reconstructed = reconstructed[:T]             # 截断对齐长度

        out_path = os.path.join(save_dir, f"epoch{epoch}_{name}.npy")
        np.save(out_path, reconstructed)

        print(f"[Saved] {out_path}  shape={reconstructed.shape}")


def plot_multidim_reconstruction_range(
        raw_series,
        model_outputs,
        dims=None,
        labels=None,
        epoch=0,
        start=0,
        end=None,
        save_dir="./recon_plots"
):
    """
    支持区间绘图的多维重建结果可视化
    raw_series: (T, C)
    model_outputs:
        "fusion":   list of (batch, L, C)
        "spatial":  list of (batch, L, C)
        "temporal": list of (batch, L, C)
    dims: 想绘制的维度列表
    start, end: 时间步区间，例如 start=200, end=300
    """

    os.makedirs(save_dir, exist_ok=True)

    T, C = raw_series.shape

    # 默认绘制所有维度
    if dims is None:
        dims = list(range(C))

    if end is None or end > T:
        end = T

    # ------------------------------
    # 1. 窗口还原函数
    # ------------------------------
    def windows_to_series(win_list):
        seq = []
        for w in win_list:  # 每个 batch 的窗口
            w_last = w[:, -1, :]   # (batch, C)
            seq.append(w_last)
        return np.concatenate(seq, axis=0)

    pred_fusion = windows_to_series(model_outputs["fusion"])
    pred_spatial = windows_to_series(model_outputs["spatial"])
    pred_temporal = windows_to_series(model_outputs["temporal"])

    # 截断到原序列长度
    pred_fusion = pred_fusion[:T]
    pred_spatial = pred_spatial[:T]
    pred_temporal = pred_temporal[:T]

    # ------------------------------
    # 2. 按区间裁剪所有序列
    # ------------------------------
    raw_cut = raw_series[start:end]
    pred_fusion_cut = pred_fusion[start:end]
    pred_spatial_cut = pred_spatial[start:end]
    pred_temporal_cut = pred_temporal[start:end]

    if labels is not None:
        labels_cut = labels[start:end]
    else:
        labels_cut = None

    # ------------------------------
    # 3. 每个维度绘图
    # ------------------------------
    for d in dims:
        plt.figure(figsize=(14, 5))

        plt.plot(raw_cut[:, d], label="Original", color="black", linewidth=1)
        plt.plot(pred_fusion_cut[:, d], label="Fusion Output", linewidth=1.2)
        plt.plot(pred_spatial_cut[:, d], label="Spatial Branch", linestyle="--", linewidth=1)
        plt.plot(pred_temporal_cut[:, d], label="Temporal Branch", linestyle="--", linewidth=1)

        # --- 标红异常 ---
        if labels_cut is not None:
            anomaly_idx = np.where(labels_cut[:, d] == 1)[0]
            if len(anomaly_idx) > 0:
                plt.scatter(anomaly_idx, raw_cut[anomaly_idx, d],
                            color="red", s=12, label="Anomaly")

        plt.legend()
        plt.title(f"Epoch {epoch} — Dim {d} — Range [{start}:{end}]")
        plt.tight_layout()

        path = os.path.join(save_dir, f"epoch{epoch}_dim{d}_{start}_{end}.png")
        plt.savefig(path, dpi=200)
        plt.close()

        print(f"[Saved] {path}")


def save_model(model, optimizer, scheduler, epoch, accuracy_list):
    folder = f'checkpoints/{args.model}_{args.dataset}/'
    os.makedirs(folder, exist_ok=True)
    file_path = f'{folder}/model.ckpt'
    torch.save({
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'scheduler_state_dict': scheduler.state_dict(),
        'accuracy_list': accuracy_list}, file_path)

# def myLoss(z,elem,_lambda,d_label)


# 计算最终损失的函数
def calculate_finalLoss(loss, n_windows):
    num = loss.shape[0]
    reconstruction_num = np.full(num, n_windows)
    reconstruction_num[:n_windows] = np.arange(1, n_windows + 1)
    reconstruction_num[num - n_windows:] = np.arange(n_windows, 0, -1)
    reconstruction_num = reconstruction_num[:, np.newaxis]
    # print(reconstruction_num)
    reconstruction_loss = np.zeros((num, loss.shape[2]))
    for i in range(n_windows-1, num):
        reconstruction_loss[i + 1 - n_windows:i + 1] += loss[i]
    reconstruction_loss = reconstruction_loss / reconstruction_num
    return reconstruction_loss

def calculate_finalReconstruction(y_pred, n_window):
    """
    输入：
        y_pred: shape = (seq_len, n_window, features)
                每个时间点对应一个窗口的重建结果
        n_window: 窗口大小

    输出：
        recon: shape = (seq_len, features)
               每个时间点的最终重建值
    """

    seq_len, win, features = y_pred.shape
    assert win == n_window, "y_pred 第二维必须等于窗口长度 n_window"

    # 每个位置被覆盖的窗口数量（与 calculate_finalLoss 使用相同逻辑）
    reconstruction_num = np.full(seq_len, n_window)
    reconstruction_num[:n_window] = np.arange(1, n_window + 1)
    reconstruction_num[seq_len - n_window:] = np.arange(n_window, 0, -1)
    reconstruction_num = reconstruction_num[:, np.newaxis]  # (seq_len, 1)

    # 最终重建序列
    reconstruction = np.zeros((seq_len, features))

    # 按窗口叠加重建值
    for t in range(n_window - 1, seq_len):
        # y_pred[t] 是一个窗口的重建结果： (n_window, features)
        # 对应的实际时间索引为 (t - n_window + 1) ~ t
        start = t - n_window + 1
        end = t + 1

        reconstruction[start:end] += y_pred[t]

    # 归一化：每个时间点除以覆盖次数
    reconstruction = reconstruction / reconstruction_num

    return reconstruction


def plot_series_reconstruction(raw, recon, loss, labels,
                               target_dim=0,
                               start_idx=None,
                               end_idx=None,
                               save_name="reconstruction_plot",
                               save_dir="./src/plots"):
    """
    绘制原始序列、重建序列、误差曲线，并用红色背景显示异常区段。
    支持:
        - 指定绘制的特征维度 target_dim
        - 指定时间范围 start_idx:end_idx

    参数:
    -------
    raw:        [T] or [T, C]
    recon:      [T] or [T, C]
    loss:       [T]
    labels:     [T] or [T, C]
    target_dim: 要绘制的 feature index
    start_idx:  起始时间点（包含）
    end_idx:    结束时间点（不包含）
    """
    import os
    import numpy as np
    import matplotlib.pyplot as plt

    os.makedirs(save_dir, exist_ok=True)

    raw = np.array(raw)
    recon = np.array(recon)
    loss = np.array(loss)
    labels = np.array(labels)

    # -------- 1. 选择 feature 维度 -------- #
    if raw.ndim == 2:
        raw = raw[:, target_dim]
    if recon.ndim == 2:
        recon = recon[:, target_dim]
    if loss.ndim == 2:
        loss = loss[:, target_dim]

    if labels.ndim == 2:
        labels = labels[:, target_dim]
    labels = (labels > 0).astype(int)

    T = len(raw)

    # -------- 2. 处理范围裁剪 -------- #
    if start_idx is None:
        start_idx = 0
    if end_idx is None or end_idx > T:
        end_idx = T

    raw = raw[start_idx:end_idx]
    recon = recon[start_idx:end_idx]
    loss = loss[start_idx:end_idx]
    labels = labels[start_idx:end_idx]

    x = np.arange(start_idx, end_idx)

    # ======= 作图布局 ======= #
    fig, axes = plt.subplots(3, 1, figsize=(14, 8), sharex=True,
                             gridspec_kw={'height_ratios': [2, 2, 1]})

    # ================= 1. 原始序列 vs 重建序列 ================= #
    axes[0].plot(x, raw, color="black", label="True", linewidth=1)
    axes[0].plot(x, recon, color="red", label="Reconstructed", linewidth=1, alpha=0.7)
    axes[0].set_ylabel("Value")
    axes[0].set_title(f"Original vs Reconstructed (feature={target_dim}, range={start_idx}:{end_idx})")
    axes[0].legend(loc="upper right")

    # 异常区间着色
    for i, xi in enumerate(x):
        if labels[i] == 1:
            axes[0].axvspan(xi - 0.5, xi + 0.5, color="red", alpha=0.2)

    # ================= 2. 重建误差 ================= #
    axes[1].plot(x, loss, color="green", linewidth=1)
    axes[1].set_ylabel("Error")
    axes[1].set_title("Reconstruction Error")

    for i, xi in enumerate(x):
        if labels[i] == 1:
            axes[1].axvspan(xi - 0.5, xi + 0.5, color="red", alpha=0.2)

    # ================= 3. 异常标签 ================= #
    axes[2].imshow(labels.reshape(1, -1), cmap="Reds", aspect="auto",
                   extent=[start_idx, end_idx, 0, 1])
    axes[2].set_yticks([])
    axes[2].set_xlabel("Timestamp")
    axes[2].set_title("Anomaly Labels")

    plt.tight_layout()
    out_path = f"{save_dir}/{save_name}.png"
    plt.savefig(out_path, dpi=300)
    plt.close()

    print(f"[Saved] plot saved at {out_path}")


def plot_reconstruction_from_windows(
        raw_windows,
        recon_windows,
        labels_windows,
        target_dim=0,
        save_name="batch_reconstruction",
        save_dir="./src/plots"
    ):
    """
    将 batch*n_window*feats 的窗口序列还原为完整时间序列，并绘制:
      1. 原始序列（指定维度）
      2. 重建序列（指定维度）
      3. 重建误差曲线（指定维度），异常标红

    参数:
    --------
    raw_windows:      (batch, n_window, feats)
    recon_windows:    (batch, n_window, feats)
    labels_windows:   (batch, n_window, feats) 或 (batch, n_window)
    target_dim:       要绘制哪个特征（int）
    """

    os.makedirs(save_dir, exist_ok=True)

    raw_windows = np.array(raw_windows)
    recon_windows = np.array(recon_windows)
    labels_windows = np.array(labels_windows)

    batch, n_window, feats = raw_windows.shape

    # ==========================
    # 1. 还原为完整时间序列
    # ==========================
    T = batch + n_window - 1

    raw_full = np.zeros((T, feats))
    recon_full = np.zeros((T, feats))
    count_full = np.zeros((T, feats))

    # 滑动窗口重叠平均
    for i in range(batch):
        raw_full[i:i+n_window] += raw_windows[i]
        recon_full[i:i+n_window] += recon_windows[i]
        count_full[i:i+n_window] += 1

    raw_full /= np.maximum(count_full, 1)
    recon_full /= np.maximum(count_full, 1)

    # ==========================
    # 2. 标签展开（按指定维度）
    # ==========================
    if labels_windows.ndim == 3:
        labels_windows = labels_windows[..., target_dim]  # 选择维度

    labels_full = np.zeros(T)

    for i in range(batch):
        labels_full[i:i+n_window] += labels_windows[i]

    labels_full = (labels_full > 0).astype(int)  # 转为 0/1

    # ==========================
    # 3. 计算重建误差（按 target_dim）
    # ==========================
    raw_dim = raw_full[:, target_dim]
    recon_dim = recon_full[:, target_dim]
    error_full = (raw_dim - recon_dim) ** 2

    x = np.arange(T)

    # ==========================
    # 4. 绘图
    # ==========================
    fig, axes = plt.subplots(3, 1, figsize=(14, 8), sharex=True,
                             gridspec_kw={'height_ratios': [2, 2, 1]})

    # ---- (1) 原始 vs 重建 ----
    axes[0].plot(x, raw_dim, color="black", label="True", linewidth=1)
    axes[0].plot(x, recon_dim, color="red", label="Reconstructed", linewidth=1, alpha=0.8)
    axes[0].set_title(f"Reconstruction (feature={target_dim})")
    axes[0].legend()

    # 异常高亮
    for t in range(T):
        if labels_full[t] == 1:
            axes[0].axvspan(t-0.5, t+0.5, color="red", alpha=0.18)

    # ---- (2) 重建误差 ----
    axes[1].plot(x, error_full, color="green", linewidth=1)
    axes[1].set_title("Reconstruction Error")

    for t in range(T):
        if labels_full[t] == 1:
            axes[1].axvspan(t-0.5, t+0.5, color="red", alpha=0.18)

    # ---- (3) 标签条 ----
    axes[2].imshow(labels_full.reshape(1, -1), cmap="Reds", aspect="auto")
    axes[2].set_title("Anomaly Labels")
    axes[2].set_yticks([])

    plt.tight_layout()
    out_path = f"{save_dir}/{save_name}.png"
    plt.savefig(out_path, dpi=300)
    plt.close()

    print(f"[Saved] Plot saved to {out_path}")

    return raw_full, recon_full, error_full, labels_full


# 计算正常、异常损失
def collect_loss_statistics(z, elem, labels):
    """
    输入:
        z: (B, L, C)
        elem: (B, L, C)
        labels: (B, L, C)
    输出:
        当前 batch 中正常/异常损失均值
    """
    
    # (B, L)
    labels_point = (labels == 1).any(dim=-1).int()

    # 每个时间点的 MSE  (B, L)
    point_mse = ((z - elem)**2).mean(dim=-1)

    # 按正常 / 异常分离
    normal_loss = point_mse[labels_point == 0]
    abnormal_loss = point_mse[labels_point == 1]

    normal_mean = normal_loss.mean().item() if normal_loss.numel() > 0 else 0
    abnormal_mean = abnormal_loss.mean().item() if abnormal_loss.numel() > 0 else 0

    return normal_mean, abnormal_mean

if __name__ == '__main__':
    orgtrain_loader, orgtest_loader, orglabels = load_dataset(args.dataset, 'insertedData')
    orgtrainD, orgtestD = next(iter(orgtrain_loader)), next(iter(orgtest_loader))
    labels = orglabels


    # 导入模型
    # args.test = False
    # args.retrain = True
    model, optimizer, scheduler, epoch, accuracy_list = load_model(args.model, labels.shape[1])

    # if args.dataset == 'converter':
    #     insert_anomalies_for_converterdata(args.dataset, orgtestD, args, args.Device, True, a_rate)
    

    # 将数据转换成窗口
    trainD = convert_to_windows(orgtrainD, model)
    testD = convert_to_windows(orgtestD, model)

    
    # 随机数播种，确保结果的可复现性
    np.random.seed(seed_fordata)
        

    # 数据备份
    trainO, testO = orgtrainD, orgtestD

    relu=nn.ReLU()
    k = 5

    ### Training phase
    if not args.test:
        #num_epochs = 5 
        num_epochs = args.epochs
        e = epoch + 1
        start = time()

        for e in tqdm(list(range(epoch + 1, epoch + num_epochs + 1))):
            trainD, trainlabels = insert_anomalies_for_traindata(args.dataset, orgtrainD, args, args.Device, False, a_rate)

            maskedTrainDforGlobal = trainD
            maskedTrainDforGlobal, maskLabelsforGlobal = get_periods_and_masking(maskedTrainDforGlobal, k)

            lossT, lr = backprop(e, model, trainD, trainO, maskedTrainDforGlobal, optimizer, scheduler, trainlabels)
            accuracy_list.append((lossT, lr))
            # model.save_attention_maps(saveName="trainData")
            # model.visualize_attention(saveName="trainData")


        print(color.BOLD + 'Training time: ' + "{:10.4f}".format(time() - start) + ' s' + color.ENDC)
        save_model(model, optimizer, scheduler, e, accuracy_list)
        plot_accuracies(accuracy_list, f'{args.model}_{args.dataset}')

        # ===========================================================
        # 绘制图像并保存
        # ===========================================================
        print(normal_losses)
        print(abnormal_losses)
        plt.figure(figsize=(8, 5))
        plt.plot(normal_losses, label="Normal Loss")
        plt.plot(abnormal_losses, label="Abnormal Loss")
        plt.xlabel("Epoch")
        plt.ylabel("Loss")
        plt.title("Normal vs Abnormal Loss During Training")
        plt.legend()

        # 创建保存目录
        os.makedirs("loss_plots", exist_ok=True)
        save_path = "loss_plots/normal_vs_abnormal_loss.png"

        plt.savefig(save_path, dpi=300)
        plt.close()

        print(f"图像已保存到: {save_path}")

    ### Testing phase
    torch.zero_grad = True
    model.eval()
    print(f'{color.HEADER}Testing {args.model} on {args.dataset}{color.ENDC}')
    maskedTestDforGlobal, maskLabelsforGlobal = get_periods_and_masking(testD, k)
    maskedTestDforGlobal = torch.from_numpy(maskedTestDforGlobal)
    dataset01 = TensorDataset(testD, maskedTestDforGlobal)
    dataloader = DataLoader(dataset01, batch_size=int(testD.shape[0]/10))
    loss = []
    y_pred = []
    fusion_list = []
    for d, d_masked in dataloader:
        subloss, sub_y_pred = backprop(0, model, d, testO,  d_masked, optimizer, scheduler, labels, training=False)
        # model.save_attention_maps(saveName="testData")
        # model.visualize_attention(saveName="testData")
        loss.append(subloss)
        y_pred.append(sub_y_pred)
        fusion_list.append(sub_y_pred)
        del d, subloss  # 删除不再需要的变量
        gc.collect()     # 手动触发垃圾回收
    loss = np.concatenate(loss, axis=0)
    y_pred = np.concatenate(y_pred, axis=0)
    print(loss.shape)
    print(y_pred.shape)
    plot_multidim_reconstruction(
        raw_series=testO,              # (T, C)
        model_outputs={
            "fusion": fusion_list,        # list of (batch, L, C)
            "spatial": None,
            "temporal": None
        },
        dims=[0],                     # ⭐ 自定义想要画的维度
        labels=labels,                    # (T, C) 标签
        epoch="test",
        save_dir="./recon_plots"
    )
    # save_reconstructed_series(        
    #     raw_series=testO,              # (T, C)
    #     model_outputs={
    #         "fusion": fusion_list,        # list of (batch, L, C)
    #         "spatial": None,
    #         "temporal": None
    #     }, epoch="test")
    
    loss = calculate_finalLoss(loss, loss.shape[1])
    y_pred = calculate_finalLoss(y_pred, y_pred.shape[1])
    print(loss.shape)
    print(y_pred.shape)
    plot_series_reconstruction(testO,y_pred,loss,orglabels,0)

    df = pd.DataFrame()
    maskedTrainDforGlobal, maskLabelsforGlobal = get_periods_and_masking(trainD, k)
    maskedTrainDforGlobal = torch.from_numpy(maskedTrainDforGlobal)
    trainD = torch.from_numpy(trainD)
    print(trainD.shape, maskedTrainDforGlobal.shape)
    dataloader = DataLoader(TensorDataset(trainD, maskedTrainDforGlobal), batch_size=int(testD.shape[0]/10))
    lossT = []
    for d, d_masked in dataloader:
        sublossT, _ = backprop(0, model, d, trainO, d_masked, optimizer, scheduler, trainlabels, training=False)
        lossT.append(sublossT)
        del d, sublossT  # 删除不再需要的变量
        gc.collect()     # 手动触发垃圾回收
    lossT = np.concatenate(lossT, axis=0)
    lossTFileName = "Loss/test/trainLoss.npy"
    np.save(lossTFileName, lossT)
    print(lossT.shape, loss.shape, labels.shape)
    lossT = calculate_finalLoss(lossT, lossT.shape[1])




    for i in range(loss.shape[1]):
        lt, l, ls = lossT[:, i], loss[:, i], labels[:, i]
        result, pred, _ = \
            (lt, l, ls)
        preds.append(pred)
    orgRate = orgData_loss_rate
    lossTfinal, lossFinal = np.mean(lossT, axis=1), np.mean(loss, axis=1)
    labelsFinal = (np.sum(labels, axis=1) >= 1) + 0
    result, _ = pot_eval(lossTfinal, lossFinal, labelsFinal)
    result.update(hit_att(loss, labels))
    result.update(ndcg(loss, labels))
    # print(df)
    pprint(result)

