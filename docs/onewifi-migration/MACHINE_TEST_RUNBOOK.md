# OneWIFI → MDD 三端上机测试清单

目标：明早使用同一个正在运行的 MDD control origin 验证 OneBoard、iOS、Android 的登录、设备/读卡、通话和短信入口。所有动作必须使用授权测试 SIM、授权号码和测试账号；不要保存 token、完整 IMSI/ICCID 或号码到报告。

## 0. 上机前置

- 确认运行中的控制面来自 `mdd-sim-gateway`，没有 NEWONE 进程/容器持有 reader 或 SIM。
- 记录 MDD origin、构建标识、测试时间和 MDD instance_id；确认 reader lease owner 是 MDD。
- Android 需要补齐原有 `android/app/src/main/res/raw/gateway_selfsigned` 可信证书资源后再做 APK/JVM 资源构建；禁止生成替代证书或放宽 TLS。iOS 需要 macOS/Xcode 与签名设备。

远程主机执行部署前，先验证 SSH 主机指纹，再执行只读硬件预检：`pcsc_scan`、`qmicli -L`、`mmcli -L`、`lsusb`、`dmesg --level=err,warn`、MDD reader lease、模块型号/固件和 SIM 卡脱敏 ICCID/IMSI。主机指纹变更时停止部署并重新核验，不能用 `StrictHostKeyChecking=no` 绕过。

## 1. OneBoard

1. 登录 MDD origin，确认 token/session 建立。
2. 打开设备、读卡、线路状态，确认 instance 和 reader 状态来自 MDD。
3. 打开通话页，确认 JsSIP/WSS 使用 MDD softphone 配置；验证来电、去电、通话记录。
4. 发送并接收一条测试 SMS；检查通知/APNs 设置错误态和历史。

## 2. iOS

1. 登录同一 MDD origin，确认设备列表和 reader 状态一致。
2. 验证 CallKit/PushKit/Live Activity 的权限和通知配置。
3. 使用授权号码做一次主叫或被叫，记录 MDD call_id、方向、时间和最终状态；确认 SIP dialog 与 MDD call_id 可追溯关联。
4. 验证通话记录、短信收发、登出后 SIP 断开和 token 撤销。

## 3. Android

1. 使用同一 MDD origin 登录，确认设备、reader、线路和证书指纹配置。
2. 验证前台来电、后台/锁屏来电、resident history 重连；用户接听后确认 reserve/pickup receipt 建立真实 SIP dialog。
3. 验证拒接、超时、关闭、登出不会把 engine call_id 当作 SIP dialog；通话记录和短信来自 MDD。
4. 记录 APK/build variant、Android 版本、MDD instance_id 和脱敏 call_id。

## 4. 统一验收

- 三端同时在线时，一条来电可同时响铃；一个端接听后，其余端停止，MDD 只生成一条线路记录。
- 观察双向媒体、远端挂断、Wi-Fi/蜂窝切换、蓝牙/扬声器和 TURN 路径；失败写明原因。
- SMS/MMS、eSIM、QMI、IMS、APNs 只有观察到真实 MDD/设备结果才能记为 PASS；没有硬件或凭据时记为 NOT RUN/BLOCKED。
- 不发送真实通知、不拨打非授权号码、不写入生产 eSIM。

## 5. 记录格式

每个结果记录：`timestamp`、`platform`、`build_id`、`mdd_instance_id`、脱敏 `call_id`/方向/状态、观察到的错误码和日志路径。不要记录 bearer token、密码、完整 IMSI/ICCID 或完整电话号码。
