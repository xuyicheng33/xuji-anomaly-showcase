import numpy as np
import matplotlib.pyplot as plt
from src.spot import SPOT
from src.constants import *
from sklearn.metrics import *

def calc_point2point(predict, actual):
    """
    calculate f1 score by predict and actual.
    Args:
        predict (np.ndarray): the predict label
        actual (np.ndarray): np.ndarray
    """
    TP = np.sum(predict * actual)
    TN = np.sum((1 - predict) * (1 - actual))
    FP = np.sum(predict * (1 - actual))
    FN = np.sum((1 - predict) * actual)
    precision = TP / (TP + FP + 0.00001)
    recall = TP / (TP + FN + 0.00001)
    f1 = 2 * precision * recall / (precision + recall + 0.00001)
    try:
        roc_auc = roc_auc_score(actual, predict)
    except:
        roc_auc = 0
    return f1, precision, recall, TP, TN, FP, FN, roc_auc


def adjust_predicts(score, label,
                    threshold=None,
                    pred=None,
                    calc_latency=False):
    """
    Calculate adjusted predict labels using given `score`, `threshold` (or given `pred`) and `label`.
    Args:
        score (np.ndarray): The anomaly score
        label (np.ndarray): The ground-truth label
        threshold (float): The threshold of anomaly score.
            A point is labeled as "anomaly" if its score is lower than the threshold.
        pred (np.ndarray or None): if not None, adjust `pred` and ignore `score` and `threshold`,
        calc_latency (bool):
    Returns:
        np.ndarray: predict labels
    """
    if len(score) != len(label):
        raise ValueError("score and label must have the same length")
    score = np.asarray(score)
    label = np.asarray(label)
    latency = 0
    if pred is None:
        predict = score > threshold
    else:
        predict = pred
    actual = label > 0.1
    anomaly_state = False
    anomaly_count = 0
    for i in range(len(score)):
        if actual[i] and predict[i] and not anomaly_state:
                anomaly_state = True
                anomaly_count += 1
                for j in range(i, 0, -1):
                    if not actual[j]:
                        break
                    else:
                        if not predict[j]:
                            predict[j] = True
                            latency += 1
        elif not actual[i]:
            anomaly_state = False
        if anomaly_state:
            predict[i] = True
    if calc_latency:
        return predict, latency / (anomaly_count + 1e-4)
    else:
        return predict


def calc_seq(score, label, threshold, calc_latency=False):
    """
    Calculate f1 score for a score sequence
    """
    if calc_latency:
        predict, latency = adjust_predicts(score, label, threshold, calc_latency=calc_latency)
        t = list(calc_point2point(predict, label))
        t.append(latency)
        return t
    else:
        predict = adjust_predicts(score, label, threshold, calc_latency=calc_latency)
        return calc_point2point(predict, label)


def bf_search(score, label, start, end=None, step_num=1, display_freq=1, verbose=True):
    """
    Find the best-f1 score by searching best `threshold` in [`start`, `end`).
    Returns:
        list: list for results
        float: the `threshold` for best-f1
    """
    if step_num is None or end is None:
        end = start
        step_num = 1
    search_step, search_range, search_lower_bound = step_num, end - start, start
    if verbose:
        print("search range: ", search_lower_bound, search_lower_bound + search_range)
    threshold = search_lower_bound
    m = (-1., -1., -1.)
    m_t = 0.0
    for i in range(search_step):
        threshold += search_range / float(search_step)
        target = calc_seq(score, label, threshold, calc_latency=True)
        if target[0] > m[0]:
            m_t = threshold
            m = target
        if verbose and i % display_freq == 0:
            print("cur thr: ", threshold, target, m, m_t)
    print(m, m_t)
    return m, m_t

def mydraw_ROC(reslist):
    # 提取FPR和TPR
    fpr = [item[0] for item in reslist]
    tpr = [item[1] for item in reslist]

    # 绘制ROC曲线
    plt.figure()
    plt.plot(fpr, tpr, color='darkorange', lw=2, label='ROC curve')
    plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.title('Receiver Operating Characteristic')
    plt.legend(loc="lower right")
    
    # 保存图片
    plt.savefig('./adjustThresholdResult/roc_curve.png') 


def pot_eval(init_score, score, label, q=1e-5, level=0.02):
    """
    Run POT method on given score.
    Args:
        init_score (np.ndarray): The data to get init threshold.
            it should be the anomaly score of train set.
        score (np.ndarray): The data to run POT method.
            it should be the anomaly score of test set.
        label:
        q (float): Detection level (risk)
        level (float): Probability associated with the initial threshold t
    Returns:
        dict: pot result dict
    """
    lms = lm[0]
    while True:
        try:
            s = SPOT(q)  # SPOT object
            s.fit(init_score, score)  # data import
            s.initialize(level=lms, min_extrema=False, verbose=False)  # initialization step
        except: lms = lms * 0.999
        else: break
    ret = s.run(dynamic=False)  # run
    # print(len(ret['alarms']))
    # print(len(ret['thresholds']))
    pot_th = np.mean(ret['thresholds']) * lm[1]
    org_pot_th = np.mean(ret['thresholds'])
    # pot_th = np.mean(ret['thresholds'])

    # 调整阈值看结果，画部分AUC曲线
    step_len = float(org_pot_th/100)
    reslist = []
    for i in range(-100, 101):
        pred, p_latency = adjust_predicts(score, label, org_pot_th + i * step_len, calc_latency=True)
        p_t = calc_point2point(pred, label)
        mydict = {
        'f1': p_t[0],
        'precision': p_t[1],
        'recall': p_t[2],
        'TP': p_t[3],
        'TN': p_t[4],
        'FP': p_t[5],  
        'FN': p_t[6],
        'ROC/AUC': p_t[7],
        'threshold': org_pot_th,
        # 'pot-latency': p_latency
        }
        TPR = p_t[2]
        FPR = p_t[5]/(p_t[4]+p_t[5]+0.00001)
        reslist.append([FPR, TPR])
        # 将mydict追加到文本文档，文档路径是./adjustThresholdResult/result.txt
        with open('./adjustThresholdResult/result.txt', 'a') as f:
            f.write(str(i) + ' ' + str(mydict) + '\n')
        print(mydict, "*****", org_pot_th + i * step_len, "*****")
    # 根据reslist画出ROC曲线, 其中reslist是[FPR, TPR]的列表
    mydraw_ROC(reslist)

    # # 调整阈值看结果，画部分AUC曲线
    # step_len = 0.001
    # reslist = []
    # for i in range(-200, 201):
    #     pred, p_latency = adjust_predicts(score, label, pot_th *(1 + i * step_len), calc_latency=True)
    #     p_t = calc_point2point(pred, label)
    #     mydict = {
    #     'f1': p_t[0],
    #     'precision': p_t[1],
    #     'recall': p_t[2],
    #     'TP': p_t[3],
    #     'TN': p_t[4],
    #     'FP': p_t[5],
    #     'FN': p_t[6],
    #     'ROC/AUC': p_t[7],
    #     'threshold': pot_th,
    #     # 'pot-latency': p_latency
    #     }
    #     TPR = p_t[2]
    #     FPR = p_t[5]/(p_t[4]+p_t[5]+0.00001)
    #     reslist.append([FPR, TPR])
    #     # 将mydict追加到文本文档，文档路径是./adjustThresholdResult/result.txt
    #     with open('./adjustThresholdResult/result.txt', 'a') as f:
    #         f.write(str(i) + ' ' + str(mydict) + '\n')
    #     print(mydict, "****", 1 + i * step_len, "****")
    # # 根据reslist画出ROC曲线, 其中reslist是[FPR, TPR]的列表
    # mydraw_ROC(reslist)

    # pot_th = np.percentile(score, 100 * lm[0])
    # np.percentile(score, 100 * lm[0])
    pred, p_latency = adjust_predicts(score, label, pot_th, calc_latency=True)
    # DEBUG - np.save(f'{debug}.npy', np.array(pred))
    # DEBUG - print(np.argwhere(np.array(pred)))
    p_t = calc_point2point(pred, label)
    # 连续异常分数的 AUC（不同于二值 predict 的 ROC/AUC）
    try:
        auc = float(roc_auc_score(np.asarray(label).astype(int), np.asarray(score).astype(float)))
    except Exception:
        auc = 0.0
    # print('POT result: ', p_t, pot_th, p_latency)
    return {
        'f1': p_t[0],
        'precision': p_t[1],
        'recall': p_t[2],
        'auc': auc,
        'TP': p_t[3],
        'TN': p_t[4],
        'FP': p_t[5],
        'FN': p_t[6],
        'ROC/AUC': auc,
        'threshold': pot_th,
        # 'pot-latency': p_latency
    }, np.array(pred)