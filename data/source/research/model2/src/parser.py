import argparse

parser = argparse.ArgumentParser(description='Time-Series Anomaly Detection')
parser.add_argument('--dataset',
                    metavar='-d',
                    type=str,
                    required=False,
                    default='synthetic',
                    help="dataset from ['synthetic', 'SMD']")
parser.add_argument('--model',
                    metavar='-m',
                    type=str,
                    required=False,
                    default='LSTM_NDT',
                    help="model name")
parser.add_argument('--Device',
                    metavar='-D',
                    type=str,
                    required=False,
                    default='cpu',
                    help="cuda or cpu")
parser.add_argument('--test',
                    action='store_true',
                    help="test the model")
parser.add_argument('--retrain',
                    action='store_true',
                    help="retrain the model")
parser.add_argument('--less',
                    action='store_true',
                    help="train using less data")
parser.add_argument("--replacing_data", 
                    default=None, type=str,
                    help='external data for soft replacement; None(default)/SMAP/MSL/SMD/SWaT/WADI')
parser.add_argument("--batch_size", 
                    default=128, type=int)
parser.add_argument("--n_features", 
                    default=16, type=int, 
                    help='number of features for a window')
parser.add_argument("--patch_size", 
                    default=4, type=int, 
                    help='number of data points in a patch')
parser.add_argument("--replacing_rate_max", 
                    default=0.6, type=float,
                    help='maximum ratio of replacing interval length to window size')
parser.add_argument("--soft_replacing", 
                    default=0.5, type=float, 
                    help='probability for soft replacement')
parser.add_argument("--uniform_replacing", 
                    default=0.15, type=float, 
                    help='probability for uniform replacement')
parser.add_argument("--peak_noising", 
                    default=0.15, type=float, 
                    help='probability for peak noise')
parser.add_argument("--length_adjusting", 
                    default=0.0, type=float, 
                    help='probability for length adjustment')
parser.add_argument("--flip_replacing_interval", 
                    default='all', type=str,
                    help='allowance for random flipping in soft replacement; vertical/horizontal/all/none')
parser.add_argument("--replacing_weight", 
                    default=0.7, type=float,
                    help='weight for external interval in soft replacement')
parser.add_argument('--epochs', type=int, default=5, help='Number of training epochs')
args = parser.parse_args()


# parser = argparse.ArgumentParser()
# options = parser.parse_args()
