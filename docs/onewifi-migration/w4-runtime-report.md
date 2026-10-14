# W4 runtime / remote host / hardware gate report

**窗口：** W4  
**采集时间：** 2026-10-14 13:21:22 +08:00  
**采集主机：** `Halo` / Windows 11 专业工作站版  
**范围：** 仅本地只读预检和证据整理；没有连接、部署或修改远端主机。

> 2026-10-14 13:45 Asia/Shanghai 已补充远端只读预检。SSH 使用当前 `known_hosts` 严格校验并成功认证；没有启动 MDD、写入远端配置或改变容器状态。

## 当前裁决

| 验收项 | 状态 | 证据与原因 |
|---|---|---|
| MDD 唯一控制面实际启动 | **BLOCKED** | 本机未发现 Docker，8443/10443 无监听；没有可确认的 MDD 进程或容器。 |
| 远端 SSH 只读预检 | **PASS** | 严格 host-key 检查和密码认证成功；用户已确认当前指纹 `SHA256:aCczQdbDa7WCjRR8PGzL7HpBq/gpFmY0o/E+//krOpY` 为 FNOS 最新 ED25519 指纹。主机 `TTFN`，`aarch64`，Docker `28.5.2`。 |
| 远端 MDD 镜像/容器 | **BLOCKED** | `docker ps -a` 和镜像清单均未发现 MDD control/engine/hardware/egress；需要选择发布镜像或当前工作树构建。 |
| 远端硬件清单 | **PASS（预检）** | 发现 4 个 Quectel EC25 modem、4 个 `/dev/cdc-wdm*`、16 个 `/dev/ttyUSB*`、3 个 PC/SC reader，三张卡均显示 inserted；未读取订阅者标识。 |
| 第二网关 / SIM 独占检查 | **NOT RUN** | 没有远端容器清单、reader lease 或宿主设备输出；不能据本机空状态推断远端。 |
| reader / SIM 读取 | **NOT RUN** | 本机无远端硬件证据；没有读取或记录任何 ICCID/IMSI。 |
| IMS / VoWiFi 注册 | **NOT RUN** | 没有 MDD instance、engine 或 IMS 日志。 |
| 主叫 / 被叫 / SIP dialog | **NOT RUN** | 没有授权测试号码和运行中的 MDD origin；未拨打电话。 |
| SMS / MMS | **NOT RUN** | 没有运行态或授权号码；未发送消息。 |
| eSIM / APNs | **NOT RUN** | 没有真实 reader、profile、设备或 provider 运行态；未执行写卡或通知。 |
| 回滚 | **NOT RUN** | 本轮未部署、未改远端配置，因此没有产生需要回滚的变更。 |

## 可复跑命令与结果

以下命令均在 `E:\GQ\Ultra\mdd-sim-gateway` 的 Windows PowerShell 执行，输出只包含本机状态：

```powershell
Get-Command docker -ErrorAction SilentlyContinue
Get-Process -Name docker,dockerd,com.docker.backend -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8443,10443 -State Listen -ErrorAction SilentlyContinue
adb devices -l
Get-Service -Name 'pcscd','ModemManager','Docker*' -ErrorAction SilentlyContinue
ssh-keygen -F '[8.137.155.86]:1818' -f "$env:USERPROFILE\.ssh\known_hosts"
```

观察结果：

- `docker` 命令不存在，Docker 相关进程和服务未发现。
- `8443`、`10443` 无监听。
- `adb devices -l` 只有 `List of devices attached`，没有设备行。
- Windows 本机没有可用的 `pcscd`、`ModemManager` 或 Docker 服务结果。
- `known_hosts` 当前指纹与历史记录不同；用户已确认当前指纹为最新值，没有删除、覆盖或绕过 host-key 校验。
- 远端严格 SSH 连接已成功，执行了 `hostname`、`uname -a`、`id`、Docker 版本和只读硬件清单检查。
- 远端为 ARM64，Docker Server `28.5.2`，可用内存约 `5.0GiB`，`/vol1/1000` 可用约 `186G`。
- 远端当前没有 MDD control/engine/hardware/egress 容器或本地镜像；现有容器属于其他应用，未触碰。
- `lsusb` 发现 4 个 EC25 LTE modem；`mmcli -L` 列出 ModemManager modem 24–27；`pcsc_scan -n` 发现 3 个 reader，三张卡状态为 inserted。输出未写入完整卡标识。

## 安全边界

- 13:21 的本地只读预检未连接 `8.137.155.86:1818`；13:45 补充预检使用当前 `known_hosts` 的严格 host-key 校验并成功认证。全程未使用 `StrictHostKeyChecking=no`，未修改 `known_hosts`。
- 未运行 `docker compose`、未构建/推送镜像、未启动控制面、未接触 `E:\GQ\Ultra\NEWONE`。
- 未读取完整订阅者标识、密码、token、APNs key；未发送真实通知、短信或电话。
- 真实运行验收仍需 MDD 部署来源/目录/端口、MDD origin、授权测试号码和目标 reader/SIM；SSH 指纹门已通过。

## 下一步

1. 选择 MDD 部署来源（当前工作树传输构建，或 GitHub/Release 镜像）。
2. 明确 FNOS 数据目录与对外端口，先备份配置并列出容器/端口/reader lease。
3. 只有预检通过且明确授权部署，才启动 MDD 唯一控制面并逐项采集 reader、SIM、IMS、通话、短信、eSIM/APNs 原始日志。
