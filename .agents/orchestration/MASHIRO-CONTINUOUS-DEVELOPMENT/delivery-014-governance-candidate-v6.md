# 014 seed S1 单文件修复 v6

保留v4限定PASS和v5独立REPAIR。仅 [v6单文件清单](delivery-014-governance-manifest-v6-delta.json) 中 seed reader 增加最终路径的普通文件、长度、mtime一致性检查；原descriptor、inode/device、无额外尾部、SHA及旧seed边界均不变。

独立原oracle未修改。[final-check-green01](delivery-014-seed-final-check-green-01.json) 2文件4tests全部通过，包含实际同inode最终lstat前截短反例及大seed损坏/容量反例。Prettier check、限定ESLint和全项目node TypeScript退出0。

没有重跑v4全量，没有付费、schema或其他域改动，无未结束进程。冻结后交原Reviewer仅复核此新增一致性检查。产品SHA256 `3059EF92932FAA73B3FA6B4F57119ADD89D36BC3D29D1AFAC425D9C9FC42ED08`。
