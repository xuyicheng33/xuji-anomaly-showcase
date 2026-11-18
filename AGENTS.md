# 维护约定

- 实验服务器 `183.147.142.40:30060` 为外部研究环境，仅允许只读检查；禁止上传、写入、删除、清理、安装、训练或启动会修改文件的程序。项目维护和部署不得改动该服务器。
- 本项目只展示保留的真实实验结果。保持输入、重建、标签、训练记录、阈值和评分精度；模型研究与重新训练不属于界面维护范围。
- `materials/`、数据清单和 `public/` 中全部真实展示资源随仓库同步。`data/source/`、`data/models/`、`data/reference/` 的完整实验档案保留原始字节，存到项目外的数据包，不提交 Git。数据包通过 `npm run data:use -- "数据包目录"` 配置，或使用 `SHOWCASE_DATA_ROOT`；默认识别同级的“项目名-实验数据”目录。`data/experiment-archive.json` 与 `data/frontend-assets.json` 记录完整文件清单及校验值。历史过程查 Git，不新增累计交接文档。
- 窗口原件在 `data/reference/windows-v1/`，导出从复核目录读取，在临时目录验证后整体替换公开资源；公开文件按内容哈希路径发布，读取路径以清单为准。测点数、窗口长度来自清单，显示长度和存储分块独立配置。新增贡献数据须逐项对照原始平方误差，不改实验口径。
- 样式由 `src/report/styles.css` 导入，按基础、共用组件、页面职责组织。修改对应规则和断点，不追加 overrides、patch、refinements 等补丁层。
- 只改页面无需实验数据包，`npm run dev` 直接开发，交付前运行 `npm run verify:frontend`（代码、公开资源校验及桌面和手机浏览器流程）。完整实验复核、数据变更及部署前必须连接数据包并运行 `npm run verify`，不得省略来源、全部窗口及派生载荷检查。日常检查 `npm run check`；npm 中的 Python 入口优先使用项目 `.venv`，CI 使用已配置的 Python。
- 维护环境固定为 `.node-version` 和 `.python-version`；使用 `npm ci`，并在 `.venv` 中执行 `python -m pip install -r requirements.txt`（PowerShell 激活：`.venv/Scripts/Activate.ps1`，macOS 激活：`source .venv/bin/activate`）。`npm run verify:ci` 在 Linux 和 macOS 上运行 `npm run verify:frontend` 及 `npm run audit:ci` 依赖检查。运行依赖告警阻断 CI，开发依赖只临时放行 `picomatch@4.0.7` 的 `GHSA-fc5q-39xc-vjpf`，上游修复后移除例外。CI 无需下载实验数据包，也不代表已完成实验来源复核。完整复核保留为本地 `npm run verify`，部署另行核对数据包完整性。`minimatch` 暂时覆盖为已修复版本；上游依赖覆盖修复版本后再移除该覆盖。
- `npm run deploy`（指定范围时用 `python -X utf8 -B scripts/deploy_release.py --scope "改动范围"`） 发布已验证的构建到专属 9010 站点，切换后核对线上资源与双数据集桌面、手机流程，失败回滚，保留前版。凭据不进入项目。
- `npm run backup` 保存 Git 历史、本地来源材料、工作区和暂存状态，回读校验后输出到 `.qa/backups/`。格式 2 复用包内 Git 内容，额外内容按哈希去重；同一提交下不同修改分别保留。恢复到新目录时运行 `node scripts/run_python.mjs scripts/restore_project.py "备份.zip" "新目录"`，兼容旧版 `workspace/` 备份，校验完成后才交付恢复目录。
- `npm run backup:prune` 默认只预览，保留最近三个不同恢复状态；指定 `-- --keep N --apply` 才回读校验并删除候选备份，未验证的备份保留。日常浏览器证据复用 `.qa/verification/`，CI 失败证据保留 7 天。
- `main` 保持可验证版本，任务分批提交；额外分支和工作树按需短期使用，合并后清理。恢复时还原本地分支、标签与当前提交，不保留临时远端；部署密钥和远端凭据另行配置，不进入备份。
