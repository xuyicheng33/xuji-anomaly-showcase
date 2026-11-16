import torch
import torch.nn as nn
import torch.optim as optim
import pickle
import dgl.nn
from dgl.nn.pytorch import GATConv
from torch.nn import TransformerEncoder, TransformerDecoder
import matplotlib.pyplot as plt
import os
from src.gltcn import *
from src.dlutils import *
from src.constants import *

# method2仅时间分支

torch.manual_seed(1)
torch.cuda.manual_seed(1)

# python3 main.py --model DTAAD --dataset SMAP --retrain
## Separate LSTM for each variable
class LSTM_Univariate(nn.Module):
    def __init__(self, feats):
        super(LSTM_Univariate, self).__init__()
        self.name = 'LSTM_Univariate'
        self.lr = 0.002
        self.n_feats = feats
        self.n_hidden = 1
        self.lstm = nn.ModuleList([nn.LSTM(1, self.n_hidden) for i in range(feats)])

    def forward(self, x):
        hidden = [(torch.rand(1, 1, self.n_hidden, dtype=torch.float64),
                   torch.randn(1, 1, self.n_hidden, dtype=torch.float64)) for i in range(self.n_feats)]
        outputs = []
        for i, g in enumerate(x):
            multivariate_output = []
            for j in range(self.n_feats):
                univariate_input = g.view(-1)[j].view(1, 1, -1)
                out, hidden[j] = self.lstm[j](univariate_input, hidden[j])
                multivariate_output.append(2 * out.view(-1))
            output = torch.cat(multivariate_output)
            outputs.append(output)
        return torch.stack(outputs)


## Simple Multi-Head Self-Attention Model
class Attention(nn.Module):
    def __init__(self, feats):
        super(Attention, self).__init__()
        self.name = 'Attention'
        self.lr = 0.0001
        self.n_feats = feats
        self.n_window = 5  # MHA w_size = 5
        self.n = self.n_feats * self.n_window
        self.atts = [nn.Sequential(nn.Linear(self.n, feats * feats),
                                   nn.ReLU(True)) for i in range(1)]
        self.atts = nn.ModuleList(self.atts)

    def forward(self, g):
        for at in self.atts:
            ats = at(g.view(-1)).reshape(self.n_feats, self.n_feats)
            g = torch.matmul(g, ats)
        return g, ats


## LSTM_NDT Model
class LSTM_NDT(nn.Module):
    def __init__(self, feats):
        super(LSTM_NDT, self).__init__()
        self.name = 'LSTM_NDT'
        self.lr = 0.002
        self.n_feats = feats
        self.n_hidden = 64
        self.lstm = nn.LSTM(feats, self.n_hidden)
        self.lstm2 = nn.LSTM(feats, self.n_feats)
        self.fcn = nn.Sequential(nn.Linear(self.n_feats, self.n_feats), nn.Sigmoid())

    def forward(self, x):
        hidden = (
            torch.rand(1, 1, self.n_hidden, dtype=torch.float64), torch.randn(1, 1, self.n_hidden, dtype=torch.float64))
        hidden2 = (
            torch.rand(1, 1, self.n_feats, dtype=torch.float64), torch.randn(1, 1, self.n_feats, dtype=torch.float64))
        outputs = []
        for i, g in enumerate(x):
            out, hidden = self.lstm(g.view(1, 1, -1), hidden)
            out, hidden2 = self.lstm2(g.view(1, 1, -1), hidden2)
            out = self.fcn(out.view(-1))
            outputs.append(2 * out.view(-1))
        return torch.stack(outputs)


## DAGMM Model (ICLR 18)
class DAGMM(nn.Module):
    def __init__(self, feats):
        super(DAGMM, self).__init__()
        self.name = 'DAGMM'
        self.lr = 0.0001
        self.beta = 0.01
        self.n_feats = feats
        self.n_hidden = 16
        self.n_latent = 8
        self.n_window = 5  # DAGMM w_size = 5
        self.n = self.n_feats * self.n_window
        self.n_gmm = self.n_feats * self.n_window
        self.encoder = nn.Sequential(
            nn.Linear(self.n, self.n_hidden), nn.Tanh(),
            nn.Linear(self.n_hidden, self.n_hidden), nn.Tanh(),
            nn.Linear(self.n_hidden, self.n_latent)
        )
        self.decoder = nn.Sequential(
            nn.Linear(self.n_latent, self.n_hidden), nn.Tanh(),
            nn.Linear(self.n_hidden, self.n_hidden), nn.Tanh(),
            nn.Linear(self.n_hidden, self.n), nn.Sigmoid(),
        )
        self.estimate = nn.Sequential(
            nn.Linear(self.n_latent + 2, self.n_hidden), nn.Tanh(), nn.Dropout(0.5),
            nn.Linear(self.n_hidden, self.n_gmm), nn.Softmax(dim=1),
        )

    def compute_reconstruction(self, x, x_hat):
        relative_euclidean_distance = (x - x_hat).norm(2, dim=1) / x.norm(2, dim=1)
        cosine_similarity = F.cosine_similarity(x, x_hat, dim=1)
        return relative_euclidean_distance, cosine_similarity

    def forward(self, x):
        ## Encode Decoder
        x = x.view(1, -1)
        z_c = self.encoder(x)
        x_hat = self.decoder(z_c)
        ## Compute Reconstructoin
        rec_1, rec_2 = self.compute_reconstruction(x, x_hat)
        z = torch.cat([z_c, rec_1.unsqueeze(-1), rec_2.unsqueeze(-1)], dim=1)
        ## Estimate
        gamma = self.estimate(z)
        return z_c, x_hat.view(-1), z, gamma.view(-1)


## OmniAnomaly Model (KDD 19)
class OmniAnomaly(nn.Module):
    def __init__(self, feats):
        super(OmniAnomaly, self).__init__()
        self.name = 'OmniAnomaly'
        self.lr = 0.002
        self.beta = 0.01
        self.n_feats = feats
        self.n_hidden = 32
        self.n_latent = 8
        self.lstm = nn.GRU(feats, self.n_hidden, 2)
        self.encoder = nn.Sequential(
            nn.Linear(self.n_hidden, self.n_hidden), nn.PReLU(),
            nn.Linear(self.n_hidden, self.n_hidden), nn.PReLU(),
            nn.Flatten(),
            nn.Linear(self.n_hidden, 2 * self.n_latent)
        )
        self.decoder = nn.Sequential(
            nn.Linear(self.n_latent, self.n_hidden), nn.PReLU(),
            nn.Linear(self.n_hidden, self.n_hidden), nn.PReLU(),
            nn.Linear(self.n_hidden, self.n_feats), nn.Sigmoid(),
        )

    def forward(self, x, hidden=None):
        hidden = torch.rand(2, 1, self.n_hidden, dtype=torch.float64) if hidden is not None else hidden
        out, hidden = self.lstm(x.view(1, 1, -1), hidden)
        ## Encode
        x = self.encoder(out)
        mu, logvar = torch.split(x, [self.n_latent, self.n_latent], dim=-1)
        ## Reparameterization trick
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        x = mu + eps * std
        ## Decoder
        x = self.decoder(x)
        return x.view(-1), mu.view(-1), logvar.view(-1), hidden


## USAD Model (KDD 20)
class USAD(nn.Module):
    def __init__(self, feats):
        super(USAD, self).__init__()
        self.name = 'USAD'
        self.lr = 0.0001
        self.n_feats = feats
        self.n_hidden = 16
        self.n_latent = 5
        self.n_window = 5  # USAD w_size = 5
        self.n = self.n_feats * self.n_window
        self.encoder = nn.Sequential(
            nn.Flatten(),
            nn.Linear(self.n, self.n_hidden), nn.ReLU(True),
            nn.Linear(self.n_hidden, self.n_hidden), nn.ReLU(True),
            nn.Linear(self.n_hidden, self.n_latent), nn.ReLU(True),
        )
        self.decoder1 = nn.Sequential(
            nn.Linear(self.n_latent, self.n_hidden), nn.ReLU(True),
            nn.Linear(self.n_hidden, self.n_hidden), nn.ReLU(True),
            nn.Linear(self.n_hidden, self.n), nn.Sigmoid(),
        )
        self.decoder2 = nn.Sequential(
            nn.Linear(self.n_latent, self.n_hidden), nn.ReLU(True),
            nn.Linear(self.n_hidden, self.n_hidden), nn.ReLU(True),
            nn.Linear(self.n_hidden, self.n), nn.Sigmoid(),
        )

    def forward(self, g):
        ## Encode
        z = self.encoder(g.view(1, -1))
        ## Decoders (Phase 1)
        ae1 = self.decoder1(z)
        ae2 = self.decoder2(z)
        ## Encode-Decode (Phase 2)
        ae2ae1 = self.decoder2(self.encoder(ae1))
        return ae1.view(-1), ae2.view(-1), ae2ae1.view(-1)


## MSCRED Model (AAAI 19)
class MSCRED(nn.Module):
    def __init__(self, feats):
        super(MSCRED, self).__init__()
        self.name = 'MSCRED'
        self.lr = 0.0001
        self.n_feats = feats
        self.n_window = feats
        self.encoder = nn.ModuleList([
            ConvLSTM(1, 32, (3, 3), 1, True, True, False),
            ConvLSTM(32, 64, (3, 3), 1, True, True, False),
            ConvLSTM(64, 128, (3, 3), 1, True, True, False),
        ]
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(128, 64, (3, 3), 1, 1), nn.ReLU(True),
            nn.ConvTranspose2d(64, 32, (3, 3), 1, 1), nn.ReLU(True),
            nn.ConvTranspose2d(32, 1, (3, 3), 1, 1), nn.Sigmoid(),
        )

    def forward(self, g):
        ## Encode
        z = g.view(1, 1, self.n_feats, self.n_window)
        for cell in self.encoder:
            _, z = cell(z.view(1, *z.shape))
            z = z[0][0]
        ## Decode
        x = self.decoder(z)
        return x.view(-1)


## CAE-M Model (TKDE 21)
class CAE_M(nn.Module):
    def __init__(self, feats):
        super(CAE_M, self).__init__()
        self.name = 'CAE_M'
        self.lr = 0.001
        self.n_feats = feats
        self.n_window = feats
        self.encoder = nn.Sequential(
            nn.Conv2d(1, 8, (3, 3), 1, 1), nn.Sigmoid(),
            nn.Conv2d(8, 16, (3, 3), 1, 1), nn.Sigmoid(),
            nn.Conv2d(16, 32, (3, 3), 1, 1), nn.Sigmoid(),
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(32, 4, (3, 3), 1, 1), nn.Sigmoid(),
            nn.ConvTranspose2d(4, 4, (3, 3), 1, 1), nn.Sigmoid(),
            nn.ConvTranspose2d(4, 1, (3, 3), 1, 1), nn.Sigmoid(),
        )

    def forward(self, g):
        ## Encode
        z = g.view(1, 1, self.n_feats, self.n_window)
        z = self.encoder(z)
        ## Decode
        x = self.decoder(z)
        return x.view(-1)


## MTAD_GAT Model (ICDM 20)
class MTAD_GAT(nn.Module):
    def __init__(self, feats):
        super(MTAD_GAT, self).__init__()
        self.name = 'MTAD_GAT'
        self.lr = 0.0001
        self.n_feats = feats
        self.n_window = feats
        self.n_hidden = feats * feats
        self.g = dgl.graph((torch.tensor(list(range(1, feats + 1))), torch.tensor([0] * feats)))
        self.g = dgl.add_self_loop(self.g)
        self.feature_gat = GATConv(feats, 1, feats)
        self.time_gat = GATConv(feats, 1, feats)
        self.gru = nn.GRU((feats + 1) * feats * 3, feats * feats, 1)

    def forward(self, data, hidden):
        hidden = torch.rand(1, 1, self.n_hidden, dtype=torch.float64) if hidden is not None else hidden
        data = data.view(self.n_window, self.n_feats)
        data_r = torch.cat((torch.zeros(1, self.n_feats), data))
        feat_r = self.feature_gat(self.g, data_r)
        data_t = torch.cat((torch.zeros(1, self.n_feats), data.t()))
        time_r = self.time_gat(self.g, data_t)
        data = torch.cat((torch.zeros(1, self.n_feats), data))
        data = data.view(self.n_window + 1, self.n_feats, 1)
        x = torch.cat((data, feat_r, time_r), dim=2).view(1, 1, -1)
        x, h = self.gru(x, hidden)
        return x.view(-1), h


## GDN Model (AAAI 21)
class GDN(nn.Module):
    def __init__(self, feats):
        super(GDN, self).__init__()
        self.name = 'GDN'
        self.lr = 0.0001
        self.n_feats = feats
        self.n_window = 5
        self.n_hidden = 16
        self.n = self.n_window * self.n_feats
        src_ids = np.repeat(np.array(list(range(feats))), feats)
        dst_ids = np.array(list(range(feats)) * feats)
        self.g = dgl.graph((torch.tensor(src_ids), torch.tensor(dst_ids)))
        self.g = dgl.add_self_loop(self.g)
        self.feature_gat = GATConv(1, 1, feats)
        self.attention = nn.Sequential(
            nn.Linear(self.n, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, self.n_window), nn.Softmax(dim=0),
        )
        self.fcn = nn.Sequential(
            nn.Linear(self.n_feats, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, self.n_window), nn.Sigmoid(),
        )

    def forward(self, data):
        # Bahdanau style attention
        att_score = self.attention(data).view(self.n_window, 1)
        data = data.view(self.n_window, self.n_feats)
        data_r = torch.matmul(data.permute(1, 0), att_score)
        # GAT convolution on complete graph
        feat_r = self.feature_gat(self.g, data_r)
        feat_r = feat_r.view(self.n_feats, self.n_feats)
        # Pass through a FCN
        x = self.fcn(feat_r)
        return x.view(-1)


# MAD_GAN (ICANN 19)
class MAD_GAN(nn.Module):
    def __init__(self, feats):
        super(MAD_GAN, self).__init__()
        self.name = 'MAD_GAN'
        self.lr = 0.0001
        self.n_feats = feats
        self.n_hidden = 16
        self.n_window = 5  # MAD_GAN w_size = 5
        self.n = self.n_feats * self.n_window
        self.generator = nn.Sequential(
            nn.Flatten(),
            nn.Linear(self.n, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, self.n), nn.Sigmoid(),
        )
        self.discriminator = nn.Sequential(
            nn.Flatten(),
            nn.Linear(self.n, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, self.n_hidden), nn.LeakyReLU(True),
            nn.Linear(self.n_hidden, 1), nn.Sigmoid(),
        )

    def forward(self, g):
        ## Generate
        z = self.generator(g.view(1, -1))
        ## Discriminator
        real_score = self.discriminator(g.view(1, -1))
        fake_score = self.discriminator(z.view(1, -1))
        return z.view(-1), real_score.view(-1), fake_score.view(-1)

    
# Proposed Model + Self Conditioning + Adversarial + MAML (VLDB 22)
class TranAD(nn.Module):
    def __init__(self, feats):
        super(TranAD, self).__init__()
        self.name = 'TranAD'
        self.lr = lr
        # self.batch = 128
        self.batch = 32
        self.n_feats = feats
        self.n_window = 10
        self.n = self.n_feats * self.n_window 
        self.pos_encoder = PositionalEncoding(2 * feats, 0.1, self.n_window) 
        encoder_layers = TransformerEncoderLayer(d_model=2 * feats, nhead=feats, dim_feedforward=16, dropout=0.1)
        self.transformer_encoder = TransformerEncoder(encoder_layers, 1)  
        decoder_layers1 = TransformerDecoderLayer(d_model=2 * feats, nhead=feats, dim_feedforward=16, dropout=0.1)
        self.transformer_decoder1 = TransformerDecoder(decoder_layers1, 1)
        decoder_layers2 = TransformerDecoderLayer(d_model=2 * feats, nhead=feats, dim_feedforward=16, dropout=0.1)
        self.transformer_decoder2 = TransformerDecoder(decoder_layers2, 1)
        self.fcn = nn.Sequential(nn.Linear(2 * feats, feats), nn.Sigmoid())

    def encode(self, src, c, tgt):
        src = torch.cat((src, c), dim=2)
        src = src * math.sqrt(self.n_feats)
        src = self.pos_encoder(src)
        memory = self.transformer_encoder(src)
        tgt = tgt.repeat(1, 1, 2)
        return tgt, memory

    def forward(self, src, tgt):
        # Phase 1 - Without anomaly scores
        c = torch.zeros_like(src)
        x1 = self.fcn(self.transformer_decoder1(*self.encode(src, c, tgt)))
        # Phase 2 - With anomaly scores
        c = (x1 - src) ** 2  # 广播机制
        x2 = self.fcn(self.transformer_decoder2(*self.encode(src, c, tgt)))
        return x1, x2  

    
# Proposed Model + Tcn_Global + Transformer + MAML
class DTAAD_Tcn_Local(nn.Module):
    def __init__(self, feats):
        super(DTAAD_Tcn_Local, self).__init__()
        self.name = 'DTAAD_Tcn_Local'
        self.lr = lr
        self.batch = 128
        # self.batch = 32
        self.n_feats = feats
        # self.n_window = 10
        self.n_window = 64
        self.g_tcn = Tcn_Global(num_inputs=self.n_window, num_outputs=feats, kernel_size=3, dropout=0.2)
        self.pos_encoder = PositionalEncoding(feats, 0.1, self.n_window)
        encoder_layers = TransformerEncoderLayer(d_model=feats, nhead=feats, dim_feedforward=16,
                                                  dropout=0.1)  # (seq_len, Batch, output_channel)
        self.transformer_encoder = TransformerEncoder(encoder_layers, num_layers=1)  # only one layer
        self.fcn = nn.Linear(feats, feats)
        self.decoder = nn.Sequential(nn.Linear(self.n_window, 1), nn.Sigmoid())

    def forward(self, src):
        g_atts = self.g_tcn(src)
        src = g_atts.permute(2, 0, 1) * math.sqrt(self.n_feats)
        src = self.pos_encoder(src)
        z = self.transformer_encoder(src)
        c = z + self.fcn(z)
        x = self.decoder(c.permute(1, 2, 0))
        return x.permute(0, 2, 1)  # (Batch, 1, output_channel)


# Proposed Model + Tcn_Local + Transformer + MAML
class DTAAD_Tcn_Global(nn.Module):
    def __init__(self, feats): 
        super(DTAAD_Tcn_Global, self).__init__()
        self.name = 'DTAAD_Tcn_Global'
        self.lr = lr
        self.batch = 128
        # self.batch = 32
        self.n_feats = feats
        # self.n_window = 10
        self.n_window = 64
        self.l_tcn = Tcn_Local(num_outputs=feats, kernel_size=3, dropout=0.2)
        self.pos_encoder = PositionalEncoding(feats, 0.1, self.n_window)
        encoder_layers = TransformerEncoderLayer(d_model=feats, nhead=feats, dim_feedforward=16,
                                                  dropout=0.1)
        self.transformer_encoder = TransformerEncoder(encoder_layers, num_layers=1)
        self.fcn = nn.Linear(feats, feats)
        self.decoder = nn.Sequential(nn.Linear(self.n_window, 1), nn.Sigmoid())

    def forward(self, src):
        l_atts = self.l_tcn(src)
        src = l_atts.permute(2, 0, 1) * math.sqrt(self.n_feats)
        src = self.pos_encoder(src)
        z = self.transformer_encoder(src)
        c = z + self.fcn(z)
        x = self.decoder(c.permute(1, 2, 0))
        return x.permute(0, 2, 1)


# Proposed Model + Tcn_Local + Tcn_Global + Transformer + MAML
class DTAAD_Callback(nn.Module):
    def __init__(self, feats):
        super(DTAAD_Callback, self).__init__()
        self.name = 'DTAAD_Callback'
        self.lr = lr
        self.batch = 128
        # self.batch = 32
        self.n_feats = feats
        # self.n_window = 10
        self.n_window = 64
        self.l_tcn = Tcn_Local(num_outputs=feats, kernel_size=4, dropout=0.2)
        self.g_tcn = Tcn_Global(num_inputs=self.n_window, num_outputs=feats, kernel_size=3, dropout=0.2)
        self.pos_encoder = PositionalEncoding(feats, 0.1, self.n_window)
        encoder_layers1 = TransformerEncoderLayer(d_model=feats, nhead=feats, dim_feedforward=16,
                                                  dropout=0.1)
        encoder_layers2 = TransformerEncoderLayer(d_model=feats, nhead=feats, dim_feedforward=16,
                                                  dropout=0.1)
        self.transformer_encoder1 = TransformerEncoder(encoder_layers1, num_layers=1)
        self.transformer_encoder2 = TransformerEncoder(encoder_layers2, num_layers=1)
        self.fcn = nn.Linear(feats, feats)
        self.decoder1 = nn.Sequential(nn.Linear(self.n_window, 1), nn.Sigmoid())
        self.decoder2 = nn.Sequential(nn.Linear(self.n_window, 1), nn.Sigmoid())

    def forward(self, src):
        l_atts = self.l_tcn(src)
        src1 = l_atts.permute(2, 0, 1) * math.sqrt(self.n_feats)
        src1 = self.pos_encoder(src1)
        z1 = self.transformer_encoder1(src1)
        g_atts = self.g_tcn(src)
        src2 = g_atts.permute(2, 0, 1) * math.sqrt(self.n_feats)
        src2 = self.pos_encoder(src2)
        z2 = self.transformer_encoder2(src2)
        c1 = z1 + self.fcn(z1)
        x1 = self.decoder1(c1.permute(1, 2, 0))
        c2 = z2 + self.fcn(z2)
        x2 = self.decoder2(c2.permute(1, 2, 0))
        return x1.permute(0, 2, 1), x2.permute(0, 2, 1)

# Proposed Model + Tcn_Local + Tcn_Global + Callback + MAML
class DTAAD_Transformer(nn.Module):
    def __init__(self, feats):
        super(DTAAD_Transformer, self).__init__()
        self.name = 'DTAAD_Transformer'
        self.lr = lr
        self.batch = 128
        # self.batch = 32
        self.n_feats = feats
        # self.n_window = 10
        self.n_window = 64
        self.l_tcn = Tcn_Local(num_outputs=feats, kernel_size=4, dropout=0.2)
        self.g_tcn = Tcn_Global(num_inputs=self.n_window, num_outputs=feats, kernel_size=3, dropout=0.2)

        self.fcn = nn.Linear(feats, feats)
        self.decoder1 = nn.Sequential(nn.Linear(self.n_window, 1), nn.Sigmoid())
        self.decoder2 = nn.Sequential(nn.Linear(self.n_window, 1), nn.Sigmoid())

    def callback(self, src, c):
        src2 = src + c
        memory = self.g_tcn(src2).permute(0, 2, 1)
        return memory

    def forward(self, src):
        l_atts = self.l_tcn(src).permute(0, 2, 1)
        c1 = l_atts + self.fcn(l_atts)
        x1 = self.decoder1(c1.permute(0, 2, 1))
        c2 = self.callback(src, x1)
        x2 = self.decoder2((c2 + self.fcn(c2)).permute(0, 2, 1))
        return x1.permute(0, 2, 1), x2.permute(0, 2, 1)

class MultiScaleTCN(nn.Module):
    def __init__(
        self,
        feats,
        kernel_size=3,
        dropout=0.2,
        dilations=(1, 2, 4),
        num_layers=2
    ):
        super().__init__()

        self.branches = nn.ModuleList([
            LocalTCN(
                num_outputs=feats,
                kernel_size=kernel_size,
                dropout=dropout,
                dilation=d,
                num_layers=num_layers
            ) for d in dilations
        ])

        self.fuse = nn.Sequential(
            nn.Conv1d(len(dilations) * feats, feats, kernel_size=1),
            nn.LeakyReLU(True)
        )

    def forward(self, src):
        """
        src: (B, L, C)
        return: (L, B, C)
        """
        x = src.permute(0, 2, 1)  # (B, C, L)

        outs = [branch(x) for branch in self.branches]  # list of (B, C, L)

        z = torch.cat(outs, dim=1)  # (B, k*C, L)
        z = self.fuse(z)            # (B, C, L)

        return z.permute(2, 0, 1)   # (L, B, C)

    
class SpatialMultiHeadAttention(nn.Module):
    def __init__(self, d_model, nhead, dropout=0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(
            embed_dim=d_model,
            num_heads=nhead,
            dropout=dropout,
            batch_first=True
        )

    def forward(self, x, attn_mask=None):
        """
        x: (B, C, D)
        attn_mask: (C, C) or (B, C, C)
        """
        out, attn = self.attn(
            x, x, x,
            attn_mask=attn_mask,
            need_weights=True,
            average_attn_weights=False
        )
        return out, attn

class SpatialTransformerEncoderLayer(nn.Module):
    def __init__(self, d_model, nhead, dim_ff=128, dropout=0.1):
        super().__init__()

        self.self_attn = SpatialMultiHeadAttention(d_model, nhead, dropout)

        self.ffn = nn.Sequential(
            nn.Linear(d_model, dim_ff),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(dim_ff, d_model)
        )

        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, spatial_mask=None):
        """
        x: (B, C, L)
        spatial_mask: (C, C)
        """
        attn_out, attn = self.self_attn(x, spatial_mask)
        x = self.norm1(x + self.dropout(attn_out))

        ffn_out = self.ffn(x)
        x = self.norm2(x + self.dropout(ffn_out))

        return x, attn


class SpatialTransformer(nn.Module):
    def __init__(self, d_model, nhead):
        super().__init__()
        self.layer = SpatialTransformerEncoderLayer(d_model, nhead)

    def forward(self, x, spatial_mask=None):
        """
        x: (B, C, L)
        """
        return self.layer(x, spatial_mask)

class LocalScaleBlock(nn.Module):
    """
    单尺度 Local 分支：TCN + Temporal Transformer
    """
    def __init__(self, feats, kernel_size, dropout, dilation, nhead=None):
        super().__init__()

        self.tcn = LocalTCN(
            num_outputs=feats,
            kernel_size=kernel_size,
            dropout=dropout,
            dilation=dilation,
            num_layers=2
        )

        self.pos_encoder = PositionalEncoding(feats, dropout)

        self.transformer = TransformerEncoder(
            TransformerEncoderLayerWithAtten(
                d_model=feats,
                nhead=nhead if nhead is not None else feats,
                dim_feedforward=16,
                dropout=dropout
            ),
            num_layers=1
        )

        self.attn = None

    def forward(self, src):
        """
        src: (B, L, C)
        return: (L, B, C)
        """
        z = self.tcn(src)              # (B, C, L)
        z = z.permute(2, 0, 1)         # (L, B, C)
        z = self.pos_encoder(z)

        z, attn = self.transformer(z)
        self.attn = attn

        return z

class MultiScaleLocalEncoder(nn.Module):
    def __init__(self, feats, kernel_size, dropout, dilations=(1, 2, 4)):
        super().__init__()

        self.blocks = nn.ModuleList([
            LocalScaleBlock(
                feats=feats,
                kernel_size=kernel_size,
                dropout=dropout,
                dilation=d
            ) for d in dilations
        ])

        self.fusion = nn.Linear(len(dilations) * feats, feats)

    def forward(self, src):
        """
        src: (B, L, C)
        return:
            z_local: (L, B, C)
            attn_list: list of attention matrices
        """
        zs = []
        attns = []

        for block in self.blocks:
            z = block(src)      # (L, B, C)
            zs.append(z)
            attns.append(block.attn)

        z_cat = torch.cat(zs, dim=-1)   # (L, B, k*C)
        z_local = self.fusion(z_cat)    # (L, B, C)

        return z_local, attns



# Proposed Model + Tcn_Local + Tcn_Global + Callback + Transformer + MAML
class DTAAD(nn.Module):
    def __init__(self, feats):
        super(DTAAD, self).__init__()
        self.name = 'DTAAD'
        self.lr = lr
        self.batch = 128
        self.n_feats = feats
        self.n_window = 64

        # ========== Global Branch ==========
        self.g_tcn = Tcn_Global(
            num_inputs=self.n_window,
            num_outputs=feats,
            kernel_size=3,
            dropout=0.2
        )

        # # ========== Multi-scale Local Branch ==========
        # self.ms_tcn = MultiScaleTCN(
        #     feats=feats,
        #     kernel_size=3,
        #     dropout=0.2,
        #     dilations=(1, 2, 4)
        # )

        self.pos_encoder = PositionalEncoding(feats, 0.1, self.n_window)

        # ========== Temporal Transformers ==========
        # self.temporal_encoder_local_01 = TransformerEncoder(
        #     TransformerEncoderLayerWithAtten(
        #         d_model=feats,
        #         nhead=feats,
        #         dim_feedforward=16,
        #         dropout=0.1
        #     ),
        #     num_layers=1
        # )

        # ========== Multi-scale Local Branch ==========
        self.local_encoder = MultiScaleLocalEncoder(
            feats=feats,
            kernel_size=3,
            dropout=0.2,
            dilations=(1, 2, 4)
        )



        self.temporal_encoder_global = TransformerEncoder(
            TransformerEncoderLayerWithAtten(
                d_model=feats,
                nhead=feats,
                dim_feedforward=16,
                dropout=0.1
            ),
            num_layers=1
        )

        # ========== Temporal Fusion ==========
        self.temporal_fusion = nn.Linear(feats * 2, feats)

        # ========== Spatial Branch ==========
        # self.spatial_encoder = SpatialTransformer(
        #     d_model=self.n_window,   # 每个变量的特征维 = L
        #     nhead=4
        # )

        # # ========== Spatio-Temporal Fusion ==========
        # self.st_fusion = nn.Linear(feats * 2, feats)

        # ========== Decoder ==========
        self.decoder = nn.Sequential(
            nn.Linear(self.n_window, self.n_window),
            nn.Sigmoid()
        )

        # ========== Attention Storage ==========
        self.save_attn = True
        self.attn_local = None
        self.attn_global = None
        self.attn_spatial = None

    def forward(self, src, src_masked, spatial_mask=None):
        """
        src:        (B, L, C)
        src_masked: (B, L, C)
        spatial_mask: (C, C)
        """

        # ======================================================
        # 1. Local Temporal Branch
        # ======================================================
        # z_local = self.ms_tcn(src)                 # (L, B, C)
        # z_local = self.pos_encoder(z_local)
        # z_local, attn_l = self.temporal_encoder_local(z_local)

        z_local, local_attns = self.local_encoder(src.permute(0,2,1))   # (L, B, C)

        # ======================================================
        # 2. Global Temporal Branch
        # ======================================================
        g = self.g_tcn(src_masked.permute(0, 2, 1))  # (B, C, L)
        g = g.permute(2, 0, 1)                       # (L, B, C)
        g = self.pos_encoder(g)
        z_global, attn_g = self.temporal_encoder_global(g)

        # ======================================================
        # 3. Temporal Fusion
        # ======================================================
        z_time = torch.cat([z_local, z_global], dim=-1)  # (L, B, 2C)
        z_time = self.temporal_fusion(z_time)            # (L, B, C)
        z_time = z_time.permute(1, 0, 2)                 # (B, L, C)

        # # ======================================================
        # # 4. Spatial Branch
        # # ======================================================
        # z_spatial, attn_s = self.spatial_encoder(
        #     src.permute(0, 2, 1),   # (B, C, L)
        #     spatial_mask=spatial_mask
        # )                              # (B, C, L)
        # z_spatial = z_spatial.permute(0, 2, 1)  # (B, L, C)

        # # ======================================================
        # # 5. Spatio-Temporal Fusion
        # # ======================================================
        # z_final = torch.cat([z_time, z_spatial], dim=-1)  # (B, L, 2C)
        # z_final = self.st_fusion(z_final)                  # (B, L, C)

        # ======================================================
        # 6. Save Attention
        # ======================================================
        if self.save_attn:
            # self.attn_local = attn_l.detach().cpu()
            self.attn_local = local_attns
            # self.attn_local = [a.detach().cpu() for a in local_attns]
            self.attn_global = attn_g.detach().cpu()
            # self.attn_spatial = attn_s.detach().cpu()

        # ======================================================
        # 7. Reconstruction
        # ======================================================
        out = self.decoder(z_time.permute(0, 2, 1))  # (B, C, L)
        return out.permute(0, 2, 1)                    # (B, L, C)
    
    def save_attention_maps(self, saveName, prefix="./src/attn/"):
        """
        保存模型当前的注意力矩阵：
        - Temporal Global: [B, H, L, L]
        - Temporal Local (multi-scale): list of [B, H, L, L]
        - Spatial: [B, H, C, C] or [B, C, C]
        """
        os.makedirs(prefix, exist_ok=True)

        def _save(attn, tag):
            if attn is None:
                print(f"[Warning] {tag} attention is None, skip saving.")
                return

            save_base = os.path.join(prefix, f"{saveName}_{tag}")
            torch.save(attn, f"{save_base}.pt")
            np.save(f"{save_base}.npy", attn)
            print(f"[Saved] {tag} attention -> {save_base}.pt / .npy")

        # ========== Global Temporal ==========
        _save(self.attn_global, "temporal_global")

        # ========== Local Temporal (Multi-scale) ==========
        if self.attn_local is None:
            print("[Warning] temporal_local attention is None.")
        elif isinstance(self.attn_local, (list, tuple)):
            for i, attn in enumerate(self.attn_local):
                if attn is None:
                    continue
                _save(attn.detach().numpy(), f"temporal_local_scale{i}")
        else:
            # 兼容单尺度情况
            _save(self.attn_local, "temporal_local")

        # ========== Spatial ==========
        _save(self.attn_spatial, "spatial")

    def visualize_attention(
        self,
        saveName,
        prefix="./src/attn/",
        save_dir="./src/attention_vis/"
    ):
        """
        可视化注意力矩阵：
        - Temporal Global
        - Temporal Local (multi-scale, each scale separately)
        - Spatial
        """
        os.makedirs(save_dir, exist_ok=True)

        attn_items = []

        # ======================================================
        # 1. Global Temporal Attention
        # ======================================================
        global_path = os.path.join(prefix, f"{saveName}_temporal_global.npy")
        if os.path.exists(global_path):
            attn_items.append(("Temporal-Global", global_path))

        # ======================================================
        # 2. Local Temporal Attention (Multi-scale)
        # ======================================================

        for scale_id in [0,1,2,3,4]:
            local_path = os.path.join(
                prefix, f"{saveName}_temporal_local_scale{scale_id}.npy"
            )
            if not os.path.exists(local_path):
                break
            attn_items.append(
                (f"Temporal-Local-Scale{scale_id}", local_path)
            )




        # ======================================================
        # 3. Spatial Attention
        # ======================================================
        spatial_path = os.path.join(prefix, f"{saveName}_spatial.npy")
        if os.path.exists(spatial_path):
            attn_items.append(("Spatial", spatial_path))

        # ======================================================
        # 4. Visualization
        # ======================================================
        for name, path in attn_items:
            attn = np.load(path)
            ndim = attn.ndim

            # ---------- Mean over batch & heads ----------
            if ndim == 4:
                # [B, H, N, N]
                attn_mean = attn.mean(axis=(0, 1))
            elif ndim == 3:
                # [B, N, N] or [H, N, N]
                attn_mean = attn.mean(axis=0)
            else:
                raise ValueError(
                    f"{name}: Unexpected attention shape {attn.shape}"
                )

            # ---------- Plot ----------
            fig, ax = plt.subplots(figsize=(7, 6))
            im = ax.imshow(
                attn_mean,
                cmap="hot",
                interpolation="nearest",
                aspect="auto"
            )

            if "Spatial" in name:
                ax.set_title("Spatial Attention (Variable-wise)")
                ax.set_xlabel("Variable j")
                ax.set_ylabel("Variable i")
            else:
                ax.set_title(f"{name} Attention (Temporal)")
                ax.set_xlabel("Key Time Step")
                ax.set_ylabel("Query Time Step")

            fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

            out_path = os.path.join(
                save_dir,
                f"{name.lower().replace('-', '_')}_{saveName}.png"
            )
            plt.tight_layout()
            plt.savefig(out_path, dpi=300)
            plt.close(fig)

            print(f"[Saved] {out_path}")



    
    # def save_attention_maps(self, saveName, prefix="./src/attn/"):
    #     """
    #     保存模型当前的注意力矩阵：
    #     - Temporal (Local / Global): [B, H, L, L]
    #     - Spatial: [B, H, C, C] or [B, C, C]
    #     """
    #     os.makedirs(prefix, exist_ok=True)

    #     def _save(attn, tag):
    #         if attn is None:
    #             print(f"[Warning] {tag} attention is None, skip saving.")
    #             return

    #         save_base = os.path.join(prefix, f"{saveName}_{tag}")
    #         torch.save(attn, f"{save_base}.pt")
    #         np.save(f"{save_base}.npy", attn.numpy())

    #         print(f"[Saved] {tag} attention -> {save_base}.pt / .npy")

    #     _save(self.attn_local,  "temporal_local")
    #     _save(self.attn_global, "temporal_global")
    #     _save(self.attn_spatial,"spatial")
    
    # def visualize_attention(
    #     self,
    #     saveName,
    #     prefix="./src/attn/",
    #     save_dir="./src/attention_vis/"
    # ):
    #     """
    #     可视化注意力矩阵：
    #     - Temporal Local / Global
    #     - Spatial (Variable-wise)
    #     """
    #     os.makedirs(save_dir, exist_ok=True)

    #     attn_files = {
    #         "Temporal-Local":  f"{prefix}{saveName}_temporal_local.npy",
    #         "Temporal-Global": f"{prefix}{saveName}_temporal_global.npy",
    #         "Spatial":         f"{prefix}{saveName}_spatial.npy"
    #     }

    #     for name, path in attn_files.items():
    #         if not os.path.exists(path):
    #             print(f"[Warning] File not found: {path}")
    #             continue

    #         attn = np.load(path)
    #         ndim = attn.ndim

    #         # ========== 1. Mean over batch & heads ==========
    #         if ndim == 4:
    #             # [B, H, N, N]
    #             attn_mean = attn.mean(axis=(0, 1))
    #         elif ndim == 3:
    #             # [B, N, N] or [H, N, N]
    #             attn_mean = attn.mean(axis=0)
    #         else:
    #             raise ValueError(f"Unexpected attention shape: {attn.shape}")

    #         # ========== 2. Plot ==========
    #         fig, ax = plt.subplots(figsize=(7, 6))

    #         im = ax.imshow(
    #             attn_mean,
    #             cmap="hot",
    #             interpolation="nearest",
    #             aspect="auto"
    #         )

    #         if "Spatial" in name:
    #             ax.set_title("Spatial Attention (Variable-wise)")
    #             ax.set_xlabel("Variable j")
    #             ax.set_ylabel("Variable i")
    #         else:
    #             ax.set_title(f"{name} Attention (Temporal)")
    #             ax.set_xlabel("Key Time Step")
    #             ax.set_ylabel("Query Time Step")

    #         fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    #         out_path = os.path.join(
    #             save_dir,
    #             f"{name.lower().replace('-', '_')}_{saveName}.png"
    #         )
    #         plt.tight_layout()
    #         plt.savefig(out_path, dpi=300)
    #         plt.close(fig)

    #         print(f"[Saved] {out_path}")


