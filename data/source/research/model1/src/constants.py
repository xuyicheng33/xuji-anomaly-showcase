from src.parser import *
from src.folderconstants import *

# Threshold parameters
lm_d = {
    'SMD': [(0.99995, 1.04), (0.99995, 0.3599)],# 原始[(0.99995, 1.04), (0.99995, 0.3599)] # 窗口 1.33
    'synthetic': [(0.999, 1), (0.999, 1)],
    'SWaT': [(0.993, 1), (0.993, 1)], # 原始 1 # 窗口 1
    'UCR': [(0.993, 1), (0.99935, 1)],
    'NAB': [(0.991, 1), (0.99, 1.01)],# 原始 1.01 # 窗口 1.48
    'SMAP': [(0.98, 1), (0.98, 1.01)],# 原始 1.01 # 窗口 1.01
    'MSL': [(0.97, 1), (0.999, 1.7)],# 原始 # 窗口 1.5
    'WADI': [(0.99, 1), (0.999, 1)],
    'MSDS': [(0.91, 1), (0.9, 1.04)],
    'MBA': [(0.87, 1), (0.93, 1.59)],# 原始 1.59 # 窗口 1.59
    'converter': [(0.99, 1), (0.99, 1)],
    'sin': [(0.99, 1), (0.99, 1)],
    'subSin': [(0.99, 1), (0.99, 1)]
}
lm = lm_d[args.dataset][1 if 'TranAD' or 'DTAAD' in args.model else 0]

# Hyperparameters lr
lr_d = {
    'SMD': 0.0001,
    'synthetic': 0.0001,
    'SWaT': 0.00001,
    'SMAP': 0.0001,# 0.001
    'MSL': 0.0002,
    'WADI': 0.001,
    'MSDS': 0.001,
    'UCR': 0.00001,
    'NAB': 0.00004,
    'MBA': 0.0001,
    'converter': 0.0001,
    'sin': 0.0002,
    'subSin': 0.0002
}
lr = lr_d[args.dataset]

# BNS Loss
BNS_d = {
    'SMD': [1,0.05440,1,1],
    'synthetic': [1,1,1,1],
    'SWaT': [1,0.5846,1,1],
    'UCR': [1,0.27,1,1],
    'NAB': [1,0.095,1],
    'SMAP': [0.2254,0.2024,0.2253,1],
    'MSL': [1,0.4,1,1],
    'WADI': [1,0.3587,1,1],
    'MSDS': [1,0.12,1,1],
    'MBA': [0.0213,0.0218,0.0213,1],
    'converter': [0.1908,0.2086,0.1908,1],
    'sin': [1,0.25,1,1],
    'subSin': [1,0.7,1,1]
}
BNS=BNS_d[args.dataset][1]

# BND_loss_rate
BND_loss_rate_d = {
    'SMD': 0.5,
    'synthetic': 0.5,
    'SWaT': 0.5,
    'UCR': 0.5,
    'NAB': 0.5,
    'SMAP': 0.5,
    'MSL': 0.5,
    'WADI': 0.5,
    'MSDS': 0.5,
    'MBA': 0.5,
    'converter': 0.5,
    'sin': 0.5,
    'subSin': 0.5
}
BND_loss_rate=BND_loss_rate_d[args.dataset]

# anomaly_rate
a_rate_d = {
    'SMD': 0.4,
    'synthetic': 0.3,
    'SWaT': 0.5,
    'UCR': 0.4,
    'NAB': 0.3,
    'SMAP': 0.95,# 0.8
    'MSL': 0.5,
    'WADI': 0.3,
    'MSDS': 0.2,
    'MBA': 0.5,
    'converter': 0.7,
    'sin': 0.8,
    'subSin': 0.8
}
a_rate=a_rate_d[args.dataset]

# replacing_rate_min, replacing_rate_max
replacing_rate_d = {
    'SMD': (0.4, 0.6),
    'synthetic': (0.4, 0.6),
    'SWaT': (0.7, 0.8),
    'UCR': (0.4, 0.6),
    'NAB': (0.4, 0.6),
    'SMAP': (0.4, 0.6),
    'MSL': (0.4, 0.6),
    'WADI': (0.4, 0.6),
    'MSDS': (0.4, 0.6),
    'MBA': (0.4, 0.6),
    'converter': (0.4, 0.6),
    'sin': (0.4,0.6),
    'subSin': (0.4,0.6)
}
replacing_rate=replacing_rate_d[args.dataset]

# seed for different Data
seed_fordata_d = {
    'SMD': 2,
    'synthetic': 1,
    'SWaT': 1,
    'UCR': 3,
    'NAB': 2,
    'SMAP': 11,# 2,22 101 13 97 
    'MSL': 4,
    'WADI': 1,
    'MSDS': 1,
    'MBA': 7,
    'converter': 3,
    'sin': 4,
    'subSin': 4
}
seed_fordata=seed_fordata_d[args.dataset]


# orgData_loss_rate
orgData_loss_rate_d = {
    'SMD': 0.6,
    'synthetic': 0.3,
    'SWaT': 0.3,
    'UCR': 0.3,
    'NAB': 0.0,
    'SMAP': 0.0,
    'MSL': 0.0,
    'WADI': 0.3,
    'MSDS': 0.3,
    'MBA': 0.4,
    'converter': 0.3,
    'sin': 0.3,
    'subSin': 0.3
}
orgData_loss_rate=orgData_loss_rate_d[args.dataset]

# global_decoder_size
global_decoder_rate_d = {
    'SMD': 1,
    'synthetic': 1,
    'SWaT': 1,
    'UCR': 1,
    'NAB': 1,
    'SMAP': 1,
    'MSL': 1,
    'WADI': 1,
    'MSDS': 1,
    'MBA': 1,
    'converter': 1,
    'sin': 1,
    'subSin': 1
}
global_decoder_rate=global_decoder_rate_d[args.dataset]

# Debugging
percentiles = {
    'SMD': (98, 2000),
    'synthetic': (95, 10),
    'SWaT': (95, 10),
    'SMAP': (97, 5000),
    'MSL': (97, 150),
    'WADI': (99, 1200),
    'MSDS': (96, 30),
    'UCR': (98, 2),
    'NAB': (98, 2),
    'MBA': (99, 2),
    'converter': (98, 2),
    'sin': (99,2),
    'subSin': (99,2)
}
percentile_merlin = percentiles[args.dataset][0]
cvp = percentiles[args.dataset][1]
preds = []
debug = 9
