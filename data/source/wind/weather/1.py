import pandas as pd
import numpy as np
import os

df = pd.read_csv('extracted_data.csv')

# 实测天气（完整）
weather_actual = [
    'weather_temperature', 'weather_humidity', 'weather_pressure',
    'weather_ws_10', 'weather_wd_10',
    'weather_ws_30', 'weather_wd_30',
    'weather_ws_50', 'weather_wd_50',
    'weather_ws_70', 'weather_wd_70',
    'weather_ws_hub', 'weather_wd_hub',
]

# 预测天气（完整）
weather_forecast = [
    'forecast_temperature', 'forecast_humidity', 'forecast_pressure',
    'forecast_ws_10', 'forecast_wd_10',
    'forecast_ws_30', 'forecast_wd_30',
    'forecast_ws_50', 'forecast_wd_50',
    'forecast_ws_70', 'forecast_wd_70',
    'forecast_ws_hub', 'forecast_wd_hub',
]

# 1) 只有实测：实测功率 + 实测天气
features_actual_only = ['actualvalue'] + weather_actual

# 2) 实测 + 预测：实测功率 → 预测功率 → 实测天气 → 预测天气
features_actual_and_forecast = (
    ['actualvalue', 'forecastvalue'] + weather_actual + weather_forecast
)

# 3) 原始 7 维子集
features_7 = [
    'actualvalue', 'forecastvalue', 'weather_temperature',
    'weather_ws_10', 'weather_ws_30', 'weather_ws_50', 'weather_ws_70',
]

# 与 preprocess.py 一致：output/<dataset>/{train,test,labels}.npy
output_folder = 'output'

data_actual = df[features_actual_only].values.astype('float32')
data_both = df[features_actual_and_forecast].values.astype('float32')
data_7 = df[features_7].values.astype('float32')


def load_data(data, dataset, train_ratio=0.7):
    """按时间 7/3 划分，测试标签全 0；按 preprocess 标准落盘。"""
    folder = os.path.join(output_folder, dataset)
    os.makedirs(folder, exist_ok=True)

    train_split = int(len(data) * train_ratio)
    train = data[:train_split]
    test = data[train_split:]
    labels = np.zeros_like(test)

    for file in ['train', 'test', 'labels']:
        np.save(os.path.join(folder, f'{file}.npy'), eval(file))

    print(f'{dataset}: train {train.shape}, test {test.shape}, labels {labels.shape}')
    print(f'  -> {folder}/{{train,test,labels}}.npy')


print('1) 只有实测:')
print(f'   列 ({len(features_actual_only)}): {features_actual_only}')

print('2) 实测+预测:')
print(f'   列 ({len(features_actual_and_forecast)}): {features_actual_and_forecast}')

print('3) 原始 7 维:')
print(f'   列 ({len(features_7)}): {features_7}')

print('\n按时间 7/3 划分（labels 全 0），preprocess 标准命名:')
load_data(data_actual, 'xuji_14')
load_data(data_both, 'xuji_28')
load_data(data_7, 'xuji_7')
