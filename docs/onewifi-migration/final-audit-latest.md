# W5 终审与制品封存

审计时间：2026-10-14T14:33:26.556550+08:00（本机时区）；审计脚本：`docs/onewifi-migration/run-final-audit.py`。本报告只写入当前审计结果，不把源码、receipt 或静态检查当成设备运行证据。

## 终审裁决

**FAIL：当前状态不能称为代码冻结或完整迁移发布。** `verify-final-evidence.py` 本轮退出 **0（PASS）**。软件 receipts 当前可验证状态为 **PASS**；真实运行时、载体/运营商完整 profile 与设备验收仍未闭环。

## 证据账本

| 领域 | 当前结果 | 可采信证据 | 终审判定 |
|---|---|---|---|
| Android Flutter/analyzer | receipt 记录 892 tests、0 failure/error、analyzer exit 0 | `android-final-evidence.json`；当前 verifier identity | **PASS（软件/构建证据）** |
| Android Kotlin/JVM/APK | JVM 109/0/0/0；debug APK SHA-256 `e210cbd3b4a0f335b8ef1a8d0d81b07a494d13cba96ddb6b5b610a20e1003098`；证书 DER SHA-256 `f87cd8d79fddf38c4be74a368005baad455bb17c6693f3cf867c25d50b5d6f5c` | `android-jvm-apk-evidence.json`；Kotlin/Flutter receipts | **PASS（软件/构建证据）** |
| iOS Flutter/analyzer | 1,086 tests、0 failure/error、analyzer exit 0；receipt identity valid | `ios-final-evidence.json` | **PASS（软件源切片）** |
| OneBoard | Node tests/Vite build exit 0；当前 receipt 校验状态 | `oneboard-final-evidence.json` | **PASS（软件构建）** |
| MDD/backend | receipt 记录 exit 0；当前日志为 2,097 tests / OK (skipped=1)，且哈希已绑定到 receipt | `backend-final-evidence.json`、`backend-final-regression.log` | **PASS（软件回归）** |
| 跨端契约 | shared Dart parity=true；ASGI fixtures 11/11 equal | `source-evidence-checkpoint.json`、`mobile-contract.md` | **PASS** |
| AT&T/Three HK | fail-closed blocker 保留；完整消费者仍缺失 | `carrier-att-three-report.md`、focused 15 tests report | **PASS（阻断策略）；功能 BLOCKED** |
| 真实运行时 | 未观察到登录、reader/SIM、IMS、通话、短信、eSIM、APNs、安装或设备回调 | `RUNTIME_EVIDENCE.md`、`ACCEPTANCE_PROTOCOL.md`、本轮 runtime checks | **NOT RUN/BLOCKED** |

## P1/P2

- **P1 — runtime acceptance:** 真实 MDD origin、reader/SIM、IMS、设备、授权号码和安装态证据仍缺失，不能发布或称冻结。
- **P1 — carrier/native gaps:** AT&T/Three HK 完整 consumers、Asterisk C/image/install、Xcode/Swift 与签名设备仍缺失或未运行。
- **P2 — backend/OneBoard evidence freshness:** 无 backend/OneBoard receipt drift。 无 backend evidence integrity finding。
- **P2 — checkpoint freshness:** 无 checkpoint source drift。 当前 checkpoint 漂移如下：
- none
- **P2 — runtime document drift:** 无当前 Android 资源/APK 状态矛盾；历史阻塞段落已明确标注为历史。

## 源→生成→安装→运行四面

- **源：** 当前 verifier 已确认 receipts 的输入一致；checkpoint 与当前源的漂移状态见上方 P2。shared Dart 与 11 个 ASGI fixture 当前记录一致。
- **生成：** OneBoard/iOS/Android/backend receipts 与 logs 可验证；debug APK 仍只代表组装产物。
- **安装：** debug APK 仅为组装产物，未签名发布、未安装到设备；iOS 无 Xcode/签名安装。
- **运行：** 当前没有授权 MDD origin、reader/SIM、IMS、设备或真实号码证据；全部保持 NOT RUN/BLOCKED。

## 冻结与回滚

**不能冻结。** 软件 receipts 已过 verifier，但 W4 真实运行证据、carrier/native gaps 与安装态回滚演练仍缺失。源码层可以回退到上一个已知 source snapshot；部署回滚没有安装产物、运行快照或演练证据，不能宣称已验证。

## 可复跑命令与制品

```text
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\run-final-audit.py
python E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\verify-final-evidence.py
```

本轮机器可读封存：`final-audit-receipt.json`（SHA-256 见同目录 `STATE_VERSION.tsv` 更新项）。审计脚本未修改源码、构建产物、上游 receipt 或运行环境。
