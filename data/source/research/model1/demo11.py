import argparse
import os
import numpy as np
import torch
from torch.utils.data import DataLoader
from demoNew03 import insert_anomalies

# 用于对数据集进行数据增强
def load_dataset(dataset):
    # if dataset == 'converter':
    #     folder = os.path.join('dataset', 'prodata')
    # else:
    #     folder = os.path.join('otherDataSet', dataset, 'orgdata')
    folder = os.path.join('processed', dataset)
    if not os.path.exists(folder):
        raise Exception('Processed Data not found.')
    loader = []
    for file in ['train', 'test', 'labels']:
        if dataset == 'SMD': file = 'machine-1-1_' + file
        if dataset == 'SMAP': file = 'P-1_' + file
        if dataset == 'MSL': file = 'C-1_' + file
        if dataset == 'UCR': file = '136_' + file
        if dataset == 'NAB': file = 'ec2_request_latency_system_failure_' + file
        # 新数据
        if dataset == 'converter': file = 'converter_' + file
        loader.append(np.load(os.path.join(folder, f'{file}.npy')))
    # loader = [i[:, debug:debug+1] for i in loader]
    # 用少量数据训练时
    # if args.less: loader[0] = cut_array(0.2, loader[0])
    train_loader = DataLoader(loader[0], batch_size=loader[0].shape[0])
    test_loader = DataLoader(loader[1], batch_size=loader[1].shape[0])
    # label弃用
    labels = loader[2]
    return train_loader, test_loader, labels


def convert_to_windows(data):
    windows = []
    w_size = 64  # 窗口大小DTAAD是10，ABert是4*512
    for i, g in enumerate(data):
        if i >= w_size:
            w = data[i - w_size:i]  # cut
        else:
            w = torch.cat([data[0].repeat(w_size - i, 1), data[0:i]])  # pad
        windows.append(w)
    return torch.stack(windows)

def convert_to_noneOverlapWindows(data):
    # 将序列化分为没有重叠的窗口，每个窗口长w_size
    windows = []
    w_size = 64  # 窗口大小DTAAD是10，ABert是4*512
    for start in range(0, data.shape[0], w_size):
        end = start + w_size
        if end <= data.shape[0]:
            w = data[start:end]
        else:
            w = data[start:]
            w = torch.cat([data[start:], data[-1].repeat(w_size - (data.shape[0]-start), 1)])  # pad
        windows.append(w)
    return torch.stack(windows)

def merge_windows(windows, original_length, w_size):
    """
    将分割后的窗口重新合并为原始数据序列。

    :param windows: 分割后的窗口列表
    :param original_length: 原始数据的长度
    :return: 重新合并后的数据张量
    """
    merged_data = []
    for i, w in enumerate(windows):
        if i == len(windows) - 1 and original_length % w_size != 0 and w.shape[0] > original_length % w_size :
            # 去除最后一个窗口的填充部分
            w = w[:original_length % w_size]
        merged_data.append(w)
    merged_data = [torch.from_numpy(arr) if isinstance(arr, np.ndarray) else arr for arr in merged_data]
    return torch.cat(merged_data)

def or_two_array(array1, array2):
    """
    将两个数组中的元素进行按位或操作。

    :param array1: 第一个数组
    :param array2: 第二个数组
    :return: 按位或操作后的新数组
    """
    # 检查两个数组的长度是否一致
    if len(array1) != len(array2):
        raise ValueError("Input arrays must have the same length.")

    return np.bitwise_or(array1, array2)

def insert_anomalies_for_traindata(dataset, data0, args, device, test_insert, anomaly_rate):

    train_loader, test_loader, labels = load_dataset(dataset)
    trainD, testD = next(iter(train_loader)), next(iter(test_loader))
    trainO, testO = trainD, testD
    print(anomaly_rate)

    # 将数据转换成窗口（训练集测试集均不重叠）
    trainD = convert_to_noneOverlapWindows(trainD)
    print(trainO.shape, trainD.shape)
    testD = convert_to_noneOverlapWindows(testD)
    print(testO.shape, testD.shape)

    # 划分batch
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    mybatch_size = args.batch_size

    train_dataloader=DataLoader(trainD, batch_size=mybatch_size)
    insertedTrainData = []
    insertedTrainLabel = []
    insertedTrainIndex = []

    # 训练数据插入异常
    for subData in train_dataloader:
        subInsertedData, subInsertedLabel, subInsertedIndex = insert_anomalies(subData.numpy(), trainO.numpy(), args, device, int(subData.numpy().shape[0]*anomaly_rate), True, True)
        insertedTrainData.append(subInsertedData)
        insertedTrainLabel.append(subInsertedLabel)
        insertedTrainIndex.append(subInsertedIndex)
    insertedTrainData = np.concatenate(insertedTrainData, axis=0)
    insertedTrainLabel = torch.cat(insertedTrainLabel, dim=0)
    insertedTrainIndex = np.concatenate(insertedTrainIndex, axis=0)
    print(insertedTrainData.shape, insertedTrainLabel.cpu().numpy().shape, insertedTrainIndex.shape)

    # 重新组合为序列
    newInsertedTrainData = merge_windows(insertedTrainData, trainO.shape[0], 64)
    newInsertedTrainLabel = merge_windows(insertedTrainLabel, trainO.shape[0], 64)
    newInsertedTrainLabel=newInsertedTrainLabel.cpu().numpy()
    print(newInsertedTrainData.shape, newInsertedTrainLabel.shape)
    # 划分有重叠窗口，Label也需划分
    newInsertedTrainData = convert_to_windows(newInsertedTrainData)
    newInsertedTrainLabel = convert_to_windows(torch.from_numpy(newInsertedTrainLabel))

    if test_insert:
        test_dataloader=DataLoader(testD, batch_size=mybatch_size)
        insertedTestData = []
        insertedTestLabel = []
        insertedTestIndex = []

        for subData in test_dataloader:
            subInsertedData, subInsertedLabel, subInsertedIndex = insert_anomalies(subData.numpy(), testO.numpy(), args, device, int(subData.numpy().shape[0]*max(anomaly_rate,0.7)), True, False)
            insertedTestData.append(subInsertedData)
            insertedTestLabel.append(subInsertedLabel)
            insertedTestIndex.append(subInsertedIndex)
        insertedTestData = np.concatenate(insertedTestData, axis=0)
        insertedTestLabel = torch.cat(insertedTestLabel, dim=0)
        insertedTestIndex = np.concatenate(insertedTestIndex, axis=0)
        print(insertedTestData.shape, insertedTestLabel.cpu().numpy().shape, insertedTestIndex.shape)

        # 重新组合为序列
        newInsertedTestData = merge_windows(insertedTestData, testO.shape[0], 64)
        newInsertedTestLabel = merge_windows(insertedTestLabel, testO.shape[0], 64)
        newInsertedTestLabel01=newInsertedTestLabel.cpu().numpy()
        print(newInsertedTestLabel01.shape, labels.shape)
        newInsertedTestLabel= or_two_array(newInsertedTestLabel01.astype(int), labels.astype(int))
        print(newInsertedTestData.shape, newInsertedTestLabel.shape)
        # 划分有重叠窗口，Label不必划分
        newInsertedTestData = convert_to_windows(newInsertedTestData)
    
     # 保存划分好窗口、插入过异常值的数据
    if dataset == 'converter' and test_insert:
        output_folder = os.path.join('insertedData', dataset)
        np.save(os.path.join(output_folder, 'converter' + "_train.npy"), insertedTrainData)
        np.save(os.path.join(output_folder, 'converter' + "_train_label.npy"), insertedTrainLabel.cpu().numpy())
        np.save(os.path.join(output_folder, 'converter' + "_test.npy"), newInsertedTestData.cpu().numpy())
        np.save(os.path.join(output_folder, 'converter' + "_labels.npy"), newInsertedTestLabel)
    elif dataset != 'converter' and not test_insert:
        output_folder = os.path.join('subInsertedData', dataset)
        np.save(os.path.join(output_folder, "train.npy"), newInsertedTrainData.cpu().numpy())
        np.save(os.path.join(output_folder, "train_label.npy"), newInsertedTrainLabel.cpu().numpy())
    elif dataset == 'converter' and not test_insert:
        output_folder = os.path.join('insertedData', dataset)
        np.save(os.path.join(output_folder, 'converter' + "_train.npy"), insertedTrainData)
        np.save(os.path.join(output_folder, 'converter' + "_train_label.npy"), insertedTrainLabel.cpu().numpy())
    return newInsertedTrainData.cpu().numpy(), newInsertedTrainLabel.cpu().numpy()

def insert_anomalies_for_converterdata(dataset, data0, args, device, test_insert, anomaly_rate):

    train_loader, test_loader, labels = load_dataset(dataset)
    trainD, testD = next(iter(train_loader)), next(iter(test_loader))
    trainO, testO = trainD, testD
    print(anomaly_rate)

    # 将数据转换成窗口（训练集测试集均不重叠）
    print(trainO.shape, trainD.shape)
    trainD = convert_to_noneOverlapWindows(trainD)

    testD = convert_to_noneOverlapWindows(testD)
    print(testO.shape, testD.shape)

    # 划分batch
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    mybatch_size = args.batch_size


    if test_insert:
        test_dataloader=DataLoader(testD, batch_size=mybatch_size)
        insertedTestData = []
        insertedTestLabel = []
        insertedTestIndex = []

        for subData in test_dataloader:
            subInsertedData, subInsertedLabel, subInsertedIndex = insert_anomalies(subData.numpy(), testO.numpy(), args, device, int(subData.numpy().shape[0]*max(anomaly_rate,0.7)), True, False)
            insertedTestData.append(subInsertedData)
            insertedTestLabel.append(subInsertedLabel)
            insertedTestIndex.append(subInsertedIndex)
        insertedTestData = np.concatenate(insertedTestData, axis=0)
        insertedTestLabel = torch.cat(insertedTestLabel, dim=0)
        insertedTestIndex = np.concatenate(insertedTestIndex, axis=0)
        print(insertedTestData.shape, insertedTestLabel.cpu().numpy().shape, insertedTestIndex.shape)

        # 重新组合为序列
        newInsertedTestData = merge_windows(insertedTestData, testO.shape[0], 64)
        newInsertedTestLabel = merge_windows(insertedTestLabel, testO.shape[0], 64)
    
     # 保存划分好窗口、插入过异常值的数据
        output_folder = os.path.join('insertedData', dataset)
        np.save(os.path.join(output_folder, 'converter' + "_test.npy"), newInsertedTestData.cpu().numpy())
        np.save(os.path.join(output_folder, 'converter' + "_labels.npy"), newInsertedTestLabel.cpu().numpy())

    return None

# parser = argparse.ArgumentParser()
# parser.add_argument("--replacing_data", default=None, type=str,
#                     help='external data for soft replacement; None(default)/SMAP/MSL/SMD/SWaT/WADI')
# parser.add_argument("--batch_size", default=128, type=int)
# parser.add_argument("--n_features", default=16, type=int, help='number of features for a window')
# parser.add_argument("--patch_size", default=4, type=int, help='number of data points in a patch')
# parser.add_argument("--replacing_rate_max", default=0.15, type=float,
#                     help='maximum ratio of replacing interval length to window size')

# parser.add_argument("--soft_replacing", default=0.5, type=float, help='probability for soft replacement')
# parser.add_argument("--uniform_replacing", default=0.15, type=float, help='probability for uniform replacement')
# parser.add_argument("--peak_noising", default=0.15, type=float, help='probability for peak noise')
# parser.add_argument("--length_adjusting", default=0.0, type=float, help='probability for length adjustment')
# # parser.add_argument("--white_noising", default=0.0, type=float, help='probability for white noise (deprecated)')

# parser.add_argument("--flip_replacing_interval", default='all', type=str,
#                     help='allowance for random flipping in soft replacement; vertical/horizontal/all/none')
# parser.add_argument("--replacing_weight", default=0.7, type=float,
#                     help='weight for external interval in soft replacement')

# options = parser.parse_args()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--replacing_data", default=None, type=str,
        help='external data for soft replacement; None(default)/SMAP/MSL/SMD/SWaT/WADI')
    parser.add_argument("--batch_size", default=128, type=int)
    parser.add_argument("--n_features", default=16, type=int, help='number of features for a window')
    parser.add_argument("--patch_size", default=4, type=int, help='number of data points in a patch')
    parser.add_argument("--replacing_rate_max", default=0.15, type=float,
        help='maximum ratio of replacing interval length to window size')

    parser.add_argument("--soft_replacing", default=0.5, type=float, help='probability for soft replacement')
    parser.add_argument("--uniform_replacing", default=0.15, type=float, help='probability for uniform replacement')
    parser.add_argument("--peak_noising", default=0.15, type=float, help='probability for peak noise')
    parser.add_argument("--length_adjusting", default=0.0, type=float, help='probability for length adjustment')
    # parser.add_argument("--white_noising", default=0.0, type=float, help='probability for white noise (deprecated)')

    parser.add_argument("--flip_replacing_interval", default='all', type=str,
        help='allowance for random flipping in soft replacement; vertical/horizontal/all/none')
    parser.add_argument("--replacing_weight", default=0.7, type=float,
        help='weight for external interval in soft replacement')

    options = parser.parse_args()









# if __name__ == '__main__':
#     parser = argparse.ArgumentParser()
#     parser.add_argument("--replacing_data", default=None, type=str,
#                         help='external data for soft replacement; None(default)/SMAP/MSL/SMD/SWaT/WADI')
#     parser.add_argument("--batch_size", default=128, type=int)
#     parser.add_argument("--n_features", default=16, type=int, help='number of features for a window')
#     parser.add_argument("--patch_size", default=4, type=int, help='number of data points in a patch')
#     parser.add_argument("--replacing_rate_max", default=0.15, type=float,
#                         help='maximum ratio of replacing interval length to window size')

#     parser.add_argument("--soft_replacing", default=0.5, type=float, help='probability for soft replacement')
#     parser.add_argument("--uniform_replacing", default=0.15, type=float, help='probability for uniform replacement')
#     parser.add_argument("--peak_noising", default=0.15, type=float, help='probability for peak noise')
#     parser.add_argument("--length_adjusting", default=0.0, type=float, help='probability for length adjustment')
#     # parser.add_argument("--white_noising", default=0.0, type=float, help='probability for white noise (deprecated)')

#     parser.add_argument("--flip_replacing_interval", default='all', type=str,
#                         help='allowance for random flipping in soft replacement; vertical/horizontal/all/none')
#     parser.add_argument("--replacing_weight", default=0.7, type=float,
#                         help='weight for external interval in soft replacement')

#     # parser.add_argument("--window_sliding", default=16, type=int, help='sliding steps of windows for validation')
#     options = parser.parse_args()
#     # dataset
#     dataset = 'SMD'
#     train_loader, test_loader, labels = load_dataset(dataset)
#     # model, optimizer, scheduler, epoch, accuracy_list = load_model(args.model, labels.shape[1])
#     #
#     # Prepare data
#     trainD, testD = next(iter(train_loader)), next(iter(test_loader))
#     trainO, testO = trainD, testD


#     # 将数据转换成窗口
#     trainD = convert_to_windows(trainD)
#     print(trainO.shape, trainD.shape)
#     testD = convert_to_noneOverlapWindows(testD)
#     print(testO.shape, testD.shape)

#     # 划分batch
#     device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
#     mybatch_size = options.batch_size
#     train_dataloader=DataLoader(trainD, batch_size=mybatch_size)
#     test_dataloader=DataLoader(testD, batch_size=mybatch_size)
#     insertedTrainData = []
#     insertedTrainLabel = []
#     insertedTrainIndex = []
#     insertedTestData = []
#     insertedTestLabel = []
#     insertedTestIndex = []


#     # 训练数据插入异常
#     for subData in train_dataloader:
#         subInsertedData, subInsertedLabel, subInsertedIndex = insert_anomalies(subData.numpy(), trainO.numpy(), options, device, int(subData.numpy().shape[0]*0.3), False, False)
#         insertedTrainData.append(subInsertedData)
#         insertedTrainLabel.append(subInsertedLabel)
#         insertedTrainIndex.append(subInsertedIndex)
#     insertedTrainData = np.concatenate(insertedTrainData, axis=0)
#     insertedTrainLabel = torch.cat(insertedTrainLabel, dim=0)
#     insertedTrainIndex = np.concatenate(insertedTrainIndex, axis=0)
#     print(insertedTrainData.shape, insertedTrainLabel.cpu().numpy().shape, insertedTrainIndex.shape)

#     # 测试数据插入异常
#     for subData in test_dataloader:
#         subInsertedData, subInsertedLabel, subInsertedIndex = insert_anomalies(subData.numpy(), testO.numpy(), options, device, int(subData.numpy().shape[0]*0.3), True, False)
#         insertedTestData.append(subInsertedData)
#         insertedTestLabel.append(subInsertedLabel)
#         insertedTestIndex.append(subInsertedIndex)
#     insertedTestData = np.concatenate(insertedTestData, axis=0)
#     insertedTestLabel = torch.cat(insertedTestLabel, dim=0)
#     insertedTestIndex = np.concatenate(insertedTestIndex, axis=0)
#     print(insertedTestData.shape, insertedTestLabel.cpu().numpy().shape, insertedTestIndex.shape)


#     # insertedTrainData, insertedTrainLabel, insertedTrainIndex = insert_anomalies(trainD.numpy(), trainO.numpy(), options, device, int(trainD.numpy().shape[0]*0.1), False)
#     # # 测试数据插入异常
#     # # 按序列插入，窗口无重叠
#     # insertedTestData, insertedTestLabel, insertedTestIndex = insert_anomalies(testD.numpy(), testO.numpy(), options, device, int(testD.numpy().shape[0]*0.3), True)

#     # 重新组合为序列
#     newInsertedTestData = merge_windows(insertedTestData, testO.shape[0], 64)
#     newInsertedTestLabel = merge_windows(insertedTestLabel, testO.shape[0], 64)
#     newInsertedTestLabel01=newInsertedTestLabel.cpu().numpy()
#     print(newInsertedTestLabel01.shape, labels.shape)
#     newInsertedTestLabel= or_two_array(newInsertedTestLabel01.astype(int), labels.astype(int))
#     print(newInsertedTestData.shape, newInsertedTestLabel.shape)
#     # 划分有重叠窗口，Label不必划分
#     newInsertedTestData = convert_to_windows(newInsertedTestData)
#     # 保存划分好窗口、插入过异常值的数据
#     if dataset == 'converter':
#         output_folder = os.path.join('dataset', 'inserteddata')
#         np.save(os.path.join(output_folder, 'converter' + "_train.npy"), insertedTrainData)
#         np.save(os.path.join(output_folder, 'converter' + "_train_label.npy"), insertedTrainLabel.cpu().numpy())
#         np.save(os.path.join(output_folder, 'converter' + "_test.npy"), newInsertedTestData.cpu().numpy())
#         np.save(os.path.join(output_folder, 'converter' + "_labels.npy"), newInsertedTestLabel)
#     else:
#         output_folder = os.path.join('otherDataSet', dataset, 'inserteddata')
#         np.save(os.path.join(output_folder, "train.npy"), insertedTrainData)
#         np.save(os.path.join(output_folder, "train_label.npy"), insertedTrainLabel.cpu().numpy())
#         np.save(os.path.join(output_folder, "test.npy"), newInsertedTestData.cpu().numpy())
#         np.save(os.path.join(output_folder, "labels.npy"), newInsertedTestLabel)


#     print(insertedTrainData.shape, insertedTrainLabel.cpu().numpy().shape, newInsertedTestData.cpu().numpy().shape, newInsertedTestLabel.shape)
