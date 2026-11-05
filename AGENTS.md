# 维护约定

- 本项目只展示保留的真实实验结果。保持输入、重建、标签、训练记录、阈值和评分精度；模型研究与重新训练不属于界面维护范围。
- 原始材料保留在 `materials/`、`data/source/`、`data/models/`；复核数据在 `data/reference/`，网站只发布 `public/` 中实际使用的资源。历史过程查 Git，不新增累计交接文档。
- 窗口原件在 `data/reference/windows-v1/`，导出从复核目录读取并发布副本；测点数、窗口长度来自清单，显示长度和存储分块独立配置。新增贡献数据须逐项对照原始平方误差，不改实验口径。
- 样式由 `src/report/styles.css` 导入，按基础、共用组件、页面职责组织。修改对应规则和断点，不追加 overrides、patch、refinements 等补丁层。
- 日常检查 `npm run check`；交付前运行 `npm run verify`。数据变更需验证来源、全部窗口及派生载荷；界面整理需检查桌面和手机实际画面。
- `npm run deploy`（指定范围时用 `python -X utf8 -B scripts/deploy_release.py --scope "改动范围"`） 发布已验证的构建到专属 9010 站点，保留前版可回滚。凭据不进入项目。
- `npm run backup` 保存当前代码、Git 历史和本地来源材料，回读校验后输出到 `.qa/backups/`。恢复到新目录时运行 `python -X utf8 -B scripts/restore_project.py "备份.zip" "新目录"`；它克隆包内 `repository.bundle`，覆盖 `workspace/` 内容并恢复清单记录的文件删除。
- `main` 保持可验证版本，任务分批提交；额外分支和工作树按需短期使用，合并后清理。恢复时还原本地分支、标签与当前提交，不保留临时远端；部署密钥和远端凭据另行配置，不进入备份。
