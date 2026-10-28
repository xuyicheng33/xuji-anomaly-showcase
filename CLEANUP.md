# 工作区保留与清理记录

更新：2026-10-28。用户授权清理重复产物、旧截图、缓存及调试脚本；原始数据、权重和正式发布结果保持不变。

本轮删除1060个文件，逻辑大小242040756字节，约230.83 MiB。包括已部署上传包、旧清理归档的展开副本、过时before/after与拼图、旧失败截图、一次性界面调试脚本，以及停止本地预览后清理的日志/缓存。开发预览已恢复到5176，运行时会正常重新生成Vite缓存。

## 已核对的重复大文件

- `.qa/acceptance-20261028/deploy/site.tar.gz`：152468093字节，原发布压缩包；部署记录和逐文件哈希保留。
- `.git/cleanup-archive/20261027/retired/`：66909539字节，722个文件与同目录`removed-files.zip`逐个哈希一致。展开副本已删除；ZIP、`files.json`、`targets.json`、`branches-before.bundle`保留。需要恢复时从ZIP选择单文件，并先检查当前目标是否存在，不整包覆盖。
- 轻量服务器 `/home/ubuntu/xuji-release-b31064c`：152505694字节上传暂存已清理。已发布的`b31064c`与`89f1d98`目录均保留，current指向`89f1d98`。

## 当前必须保留

- `materials/`：老师谈话、报告与历史核查依据。
- `data/source/`、`data/models/`、`data/manifest.json`：原件与权重，部分不受Git管理。模型三与风电资料作为研究原件保留。
- `public/data/journey/`：当前网站真实输入、标签、所有窗口输出和8个案例，服务器旧完整窗口导出目录已不存在。
- `.qa/cases-20261028/raw/`：两个模型的原始案例输出，与服务器JSON哈希一致；案例重建依赖它们。
- `.qa/version-audit/`、`.qa/model-description-20261028/`、`.qa/anomaly-research-20261027/`：保留研究核查记录和关键探针，移除其中已提取自原报告的临时图像。
- `.qa/unified/shots/`、`.qa/acceptance-20261028/final/`：当前验证截图；本轮新证据在`.qa/loading-20261028/`。
- `.git/`：唯一现存本地历史，没有配置remote。保留恢复ZIP/bundle，禁止整目录清理。

当前dist是已部署版本的可重建生产输出，为验收和后续部署保留。新截图应覆盖同一轮验证位置或放入明确的任务目录，不持续复制多个同义版本。详细删除记录见`.qa/loading-20261028/cleanup-result.json`。
