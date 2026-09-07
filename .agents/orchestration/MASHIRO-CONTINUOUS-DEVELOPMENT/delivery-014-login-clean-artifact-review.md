# 014 clean 内部制品：STATIC_PASS

Reviewer review_017_trusted 对 `dist/windows-candidate-login-clean` 独立只读复核通过，准入下一步原生安装生命周期验证；不是实际安装/卸载或最终发行 PASS。

- 新 setup：112573602 字节，SHA-256 `E615FFDC9BCD18DDF8A1D8BA83A9BC42DFA2B2B25A401113F9EF9797B082201B`，实际 NotSigned，Mashiro 0.1.0。
- EXE：245289984 字节，SHA-256 `A39A4F4A10E40A2C21BEA5185C919AA8C2F61C06B3B28A592B1AD3B96CB98472`，与上一制品相同，实际 NotSigned、FileVersion 0.1.0。ASAR：15431590 字节，SHA-256 `7FDDAD7FDA3E7ED19E754FB9704B61B7AD1F0E0A9ECDF879AA41D836D30702BC`，与已审 f4 相同；五项冻结输出再次提取核对全部匹配，内部 runtime/权限结构复用已有审查。
- 实际 owned 79 项与目录 79 文件完全一致，无链接或未登记文件；`resources/default_app.asar` 与 `version` 实际缺失，原新增默认应用 fallback 文件已消除。没有修改 fuse；不宣称移除 Electron 自身所有搜索机制。
- 六份 notice 引用文件 hash 全匹配。实际生成宏与冻结 v3 生成器按当前清单重建的全文相同，SHA-256 `B03EAE35045EED2768C4FC30FA004729AF26CD3E82C9EBE51C56320FA252D183`。

[静态原始数据](delivery-014-login-clean-artifact-review.json)、[签名/版本](delivery-014-login-clean-artifact-identity.json)已落盘。核验仅读取文件，不运行 setup/EXE、不修改安装或 Registry。源码身份对应 root 记录的 6fd5ba18565f742e2edeb82e663948f90450caef，runtime 仍 f4，不包含 RET/cold WIP。

原 [v3 ARTIFACT_REPAIR](delivery-014-login-artifact-review-v3.md)与 build-05 输出文件打开失败保持原证据，不猜测原因，也不改写为成功。root 的 build-06 完整生产退出 0 为单独证据；本报告解除的是新候选静态准入门槛，后续仍须实际安装后 payload、登录保留与卸载清理验证。
