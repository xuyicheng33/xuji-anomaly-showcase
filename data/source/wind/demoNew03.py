import argparse

import numpy as np
import torch
from src.constants import *


def insert_anomalies(data, data0, options, device, mybatch_size, seq_test, length_adjust_ornot):
    """
    Inserts various types of anomalies into the given dataset based on specified probabilities.

    Parameters:
    - data (torch.Tensor): 需要被插入异常值的数据应该是窗口的形式.
    - data0 未划分窗口的数据用以作为替换数据.
    - options (argparse.Namespace): An object containing the configuration for anomaly insertion.
    - device (torch.device): The computational device (CPU or GPU) to use.
    - mybatch_size: 插入异常数据的窗口数量.
    - seq_test: 是否按序列插入异常数据.

    Returns:
    - data: 插入异常值后的数据.numpy
    - total_x_anomaly: 标签.tensor
    - first_index: 插入异常值的窗口index.numpy
    """



    # 输入：所有窗口 选择：无填充的窗口序列随机选择batch个 替换：包括随机时间戳、随机维度 标签：batch*n_window*d_data维度标注
    # 直接传窗口
    # Get the shape of the data tensor
    n_samples, n_window, d_data = data.shape
    # If all numerical
    numerical_column = np.array(range(d_data))
    # Get the number of samples and window length
    n_batch = mybatch_size  # data中要替换的窗口数
    data_seq_len = n_window

    # Get the index of time windows
    if seq_test:
        valid_index_list = np.arange(n_samples)
    else:
        valid_index_list = np.arange(n_samples)

    # Select replacing data
    replacing_data = data0 if options.replacing_data == None else data0
    # Replaced data length table
    # replacing_rate = (options.replacing_rate_max / 10, options.replacing_rate_max)
    # replacing_rate = (options.replacing_rate_max-0.2, options.replacing_rate_max)
    replacing_len_max = int(replacing_rate[1] * data_seq_len)
    replacing_len_half_max = replacing_len_max // 2
    replacing_table = list(
        np.random.randint(int(data_seq_len * replacing_rate[0]), int(data_seq_len * replacing_rate[1]), size=n_batch))

    # Define the probabilities for different anomaly replacement strategies
    soft_replacing_prob = 1 - options.soft_replacing
    uniform_replacing_prob = soft_replacing_prob - options.uniform_replacing
    # peak_noising_prob = uniform_replacing_prob - options.peak_noising
    # length_adjusting_prob = peak_noising_prob - options.length_adjusting
    # white_noising_prob = options.white_noising  # 弃用置0
    if length_adjust_ornot:
        peak_noising_prob = 0
    else:
        peak_noising_prob = uniform_replacing_prob - options.peak_noising
        length_adjusting_prob = peak_noising_prob - options.length_adjusting


    # Soft replacing flip options
    if options.flip_replacing_interval == 'all':
        vertical_flip = True
        horizontal_flip = True
    elif options.flip_replacing_interval == 'vertical':
        vertical_flip = True
        horizontal_flip = False
    elif options.flip_replacing_interval == 'horizontal':
        vertical_flip = False
        horizontal_flip = True
    elif options.flip_replacing_interval == 'none':
        vertical_flip = False
        horizontal_flip = False

    # Choice n_batch windows for anomaly insertion
    first_index = np.random.choice(valid_index_list, size=n_batch)

    x = []
    for j in first_index:
        # change to Tensor
        x.append(torch.Tensor(data[j].copy()).to(device))
    # x_true to size(batch_size, data_seq_len, d_data)
    x_true = torch.stack(x).to(device)

    replacing_lengths = np.array(replacing_table)
    # Generate random indices for the replacement
    # replacing_index = np.random.randint(0, (n_samples - replacing_lengths + 1)[:, np.newaxis],
    #                                     size=(n_batch, d_data))
    replacing_index = np.random.randint(0, (data0.shape[0] - replacing_lengths + 1)[:, np.newaxis],
                                        size=(n_batch, d_data))
    # Generate random indices for the target position
    target_index = np.random.randint(0, data_seq_len - replacing_lengths + 1)

    # Replacing types and dimensions
    replacing_type = np.random.uniform(0., 1., size=(n_batch,))
    replacing_dim_numerical = np.random.uniform(0., 1., size=(n_batch, d_data))
    replacing_dim_numerical = replacing_dim_numerical \
                              - np.maximum(replacing_dim_numerical.min(axis=1, keepdims=True), 0.3) <= 0.001

    # List of replaced intervals
    x_rep = []
    x_anomaly = torch.zeros(n_batch, data_seq_len, d_data, device=device)  # list of anomaly points
    total_x_anomaly = torch.zeros(n_samples, data_seq_len, d_data, device=device)

    # Soft replacing weights calculating and smoothing
    def replacing_weights(interval_len):
        warmup_len = interval_len // 10
        return np.concatenate((np.linspace(0, options.replacing_weight, num=warmup_len),
                               np.full(interval_len - 2 * warmup_len, options.replacing_weight),
                               np.linspace(options.replacing_weight, 0, num=warmup_len)), axis=None)

    # Iterate over each data point in the batch
    # 把哪个维度换没换给标上，数据和标签，最后把插入异常值的窗口在总窗口中修改上！！
    for j, rep, tar, leng, typ, dim_num in zip(range(n_batch), replacing_index, target_index,
                                               replacing_lengths,
                                               replacing_type, replacing_dim_numerical):
        if leng > 0:
            x_rep.append(x[j][tar:tar + leng].clone())
            _x = x_rep[-1].clone().transpose(0, 1)
            # Replacing nums of dimensions
            rep_len_num = len(dim_num[dim_num])
            # Selected target dimensions
            target_column_numerical = numerical_column[dim_num]

            # External interval replacing
            if typ > soft_replacing_prob:
                # Replacing for numerical columns
                _x_temp = []
                # Select dimensions used for replacing
                col_num = np.random.choice(numerical_column, size=rep_len_num)
                # Randomly select flips
                filp = np.random.randint(0, 2, size=(rep_len_num, 2)) > 0.5
                # Inserting anomalies for numerical column
                # Each replacing column index is different but each target column index is same
                for _col, _rep, _flip in zip(col_num, rep[:rep_len_num], filp):
                    random_interval = replacing_data[_rep:_rep + leng, _col].copy()
                    # fliping options
                    if horizontal_flip and _flip[0]:
                        random_interval = random_interval[::-1].copy()
                    if vertical_flip and _flip[1]:
                        random_interval = 1 - random_interval
                    _x_temp.append(torch.from_numpy(random_interval))
                _x_temp = torch.stack(_x_temp).to(device)
                # Replacing for numerical columns
                weights = torch.from_numpy(replacing_weights(leng)).float().unsqueeze(0).to(device)
                _x[target_column_numerical] = (_x_temp * weights + _x[target_column_numerical] * (1 - weights)).float()
                # Anomaly labels
                x_anomaly[j, tar:tar + leng, target_column_numerical] = 1
                x[j][tar:tar + leng] = _x.transpose(0, 1)

            # Uniform replacing
            elif typ > uniform_replacing_prob:
                _x[target_column_numerical] = torch.rand(rep_len_num, 1, device=device)
                #   _x[target_column_categorical] = torch.randint(0, 2, size=(rep_len_cat, 1), device=device).float()
                x_anomaly[j, tar:tar + leng, target_column_numerical] = 1
                x[j][tar:tar + leng] = _x.transpose(0, 1)

            # Peak noising
            elif typ > peak_noising_prob:
                peak_index = np.random.randint(0, leng)
                peak_value = (_x[target_column_numerical, peak_index] < 0.5).float().to(device)
                peak_value = peak_value + (0.1 * (1 - 2 * peak_value)) * torch.rand(rep_len_num, device=device)
                _x[target_column_numerical, peak_index] = peak_value

                #   peak_value = (_x[target_column_categorical, peak_index] < 0.5).float().to(device)
                #   _x[target_column_categorical, peak_index] = peak_value

                peak_index = tar + peak_index
                # 原两个patch_size的长度
                tar_first = np.maximum(0, peak_index - options.patch_size)
                tar_last = peak_index + options.patch_size + 1

                x_anomaly[j, tar_first:tar_last, target_column_numerical] = 1
                x[j][tar:tar + leng] = _x.transpose(0, 1)

            # Length adjusting (only for bce loss)
            # 修改过，不然length_adjusting_prob=peak_noising_prob，导致没有替换
            elif typ < length_adjusting_prob:
                # Lengthening
                if leng > replacing_len_half_max:
                    scale = np.random.randint(2, 5)
                    _leng = leng - leng % scale
                    scaled_leng = _leng // scale
                    x[j][tar + _leng:] = x[j][tar + scaled_leng:-_leng + scaled_leng].clone()
                    # Repeating scaled_leng
                    x[j][tar:tar + _leng] = torch.repeat_interleave(x[j][tar:tar + scaled_leng], scale, axis=0)
                    x_anomaly[j, tar:tar + _leng, target_column_numerical] = 1
                # Shortening
                else:
                    origin_index = first_index[j]
                    if origin_index > replacing_len_max * 1.5:
                        scale = np.random.randint(2, 5)
                        _leng = leng * (scale - 1)
                        x[j][:tar] = torch.Tensor(
                            data0[origin_index - _leng:origin_index + tar - _leng].copy()).to(device)
                        x[j][tar:tar + leng] = torch.Tensor(
                            data0[origin_index + tar - _leng:origin_index + tar + leng:scale].copy()).to(device)
                        x_anomaly[j, tar:tar + leng, target_column_numerical] = 1
            # White noising (deprecated)
            # elif typ < white_noising_prob:
            #     _x[target_column_numerical] = (_x[target_column_numerical]
            #                                         + torch.normal(mean=0., std=0.003, size=(rep_len_num, leng),
            #                                         device=device)) \
            #                                         .clamp(min=0., max=1.)
            #     x_anomaly[j, tar:tar + leng] = 1
            #     x[j][tar:tar + leng] = _x.transpose(0, 1)
            else:
                x_rep[-1] = None
        else:
            x_rep.append(None)

    for j, window, label in zip(first_index, x, x_anomaly):
        data[j] = window.cpu().numpy()
        # if 1 in label:
        #     print(j)
        total_x_anomaly[j] = label
        # 把插入异常值后的窗口放入原始数据，把异常标签插入到所有标签中，返回原始数据、异常窗口、异常标签
        # 窗口覆盖问题，直接返回时间窗口

    return data, total_x_anomaly, first_index


# Example usage:
# Define your options as a argparse.Namespace object or a dictionary with the necessary settings
# options = argparse.Namespace(...)
# device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
# data_tensor = torch.Tensor(your_data).to(device)  # Replace 'your_data' with your actual data
# data_tensor, anomaly_tensor = insert_anomalies(data_tensor, options, device)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--replacing_data", default=None, type=str,
                        help='external data for soft replacement; None(default)/SMAP/MSL/SMD/SWaT/WADI')

    parser.add_argument("--batch_size", default=128, type=int)
    parser.add_argument("--n_features", default=512, type=int, help='number of features for a window')
    parser.add_argument("--patch_size", default=4, type=int, help='number of data points in a patch')
    parser.add_argument("--replacing_rate_max", default=0.15, type=float,
                        help='maximum ratio of replacing interval length to window size')

    parser.add_argument("--soft_replacing", default=0.5, type=float, help='probability for soft replacement')
    parser.add_argument("--uniform_replacing", default=0.15, type=float, help='probability for uniform replacement')
    parser.add_argument("--peak_noising", default=0.2, type=float, help='probability for peak noise')
    parser.add_argument("--length_adjusting", default=0.0, type=float, help='probability for length adjustment')
    # parser.add_argument("--white_noising", default=0.0, type=float, help='probability for white noise (deprecated)')

    parser.add_argument("--flip_replacing_interval", default='all', type=str,
                        help='allowance for random flipping in soft replacement; vertical/horizontal/all/none')
    parser.add_argument("--replacing_weight", default=0.7, type=float,
                        help='weight for external interval in soft replacement')

    # parser.add_argument("--window_sliding", default=16, type=int, help='sliding steps of windows for validation')
    options = parser.parse_args()
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
