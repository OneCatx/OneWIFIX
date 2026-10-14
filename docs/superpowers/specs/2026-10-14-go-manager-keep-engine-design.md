# Go 管理面保持现有通话引擎

日期：2026-10-14  
状态：待审阅

## 决定

管理程序用已经在 3568 和玩客云上跑过的 Go。通话继续用当前仓库的 Engine 镜像（Asterisk、pjproject、IKE 隧道、SIM 鉴权）。两边只通过三个动作相接：写成 Engine 认的 `instance.json`、拉起容器 `onewifi-engine-{id}`、读取 `run/swu_status.json`。

`E:\GQ\Ultra\NEWONE` 只作读本，不在那个目录里改文件。旧 Go 的 `internal/vowifi` 不接到这条线路上。

## 谁负责什么

Go 管理面负责登录、设备、模组、读卡、eSIM、普通短信、通知、升级和网页托管。网页仍是 Vue，由 Go 把编好的页面发出去。

当前 Engine 镜像负责运营商注册、VoWiFi 和声音。出口代理和运营商策略留在现在这套 Engine 旁边的实现里（`control/app/carrier_profiles.py`、`control/app/egress.py`、`runtime/egress.py`）。Go 使用它们产出的结果，不把运营商表和 SOCKS 出口再写一遍。

读卡器的 PC/SC 库保持 C。Go 调用它，不把库本身改成 Go。

## 交接契约

这些名字以当前 Python 实现为准，Go 适配层不得另起一套：

- 容器名：`onewifi-engine-{id}`（`control/app/engine.py` 的 `container_name`）
- 配置文件：`{data}/instances/{id}/instance.json`，只读挂到容器内 `/config/instance.json`
- 运行目录：`{data}/instances/{id}/run` 挂到 `/run/onewifi`
- 日志目录：`{data}/instances/{id}/logs` 挂到 `/logs`
- 读卡套接字：pcscd 卷或宿主 `/run/pcscd` 挂到 `/run/pcscd`
- 隧道是否建立：`run/swu_status.json` 的 `state` 等于 `CONNECTED`（`tunnel_installed`）
- 容器标签：`io.onewifi.managed=true`，`io.onewifi.component=engine`
- 只替换带这些标签、且名字属于本网关的容器

`instance.json` 的字段由现有 `control.app.config.render_instance_json` 生成。第一段 Go 代码接收这份已经渲染好的文档并交给容器，不在 Go 里重写运营商匹配。

## 第一段要做的事

在本仓库新增 `control-go/engineadapt`。它只做上面的交接：

1. 把一份已渲染的 `instance.json` 写到实例目录。
2. 用 Docker 创建或替换 `onewifi-engine-{id}`，挂载、设备和环境变量与 `control/app/engine.py` 里 `start` 使用的那一组一致。
3. 读取 `swu_status.json`，只把 `CONNECTED` 当成隧道已建立。
4. 拒绝替换没有本网关标签的同名容器。

这一段不把 `NEWONE` 的登录、设备、短信搬进来，也不启动 Go 自己的 IKE。现有 Python 控制面继续对外服务，直到这段交接有测试证明挂载和状态判断与 Python 一致。

## 之后才做的事

交接测试通过之后，再把 Go 管理面（登录、设备、模组、读卡、eSIM、普通短信、通知、升级、网页）从 `NEWONE` 拷进本仓库的 Go 模块。拷贝时排除 `internal/vowifi`。管理面需要通话时，只调用 `engineadapt`。

Python 控制面在 Go 管理面能独立完成上述职责之前保留，不在第一段删除。

## 测试

`engineadapt` 的测试不启动 Asterisk。它们断言：

- 写出的目录和挂载与 `engine.py` 的 `volumes` 一致
- 容器名、标签、`NET_ADMIN` 和 `/dev/net/tun` 与 `engine.py` 一致
- `swu_status.json` 只有 `state=CONNECTED` 时算隧道建立；缺文件、空对象、其他 `state` 都算未建立
- 同名容器没有 `io.onewifi.managed=true` 时拒绝删除

## 不做

- 不修改 `E:\GQ\Ultra\NEWONE`
- 不启用旧 Go 的 IKE/IMS 去替代 Engine
- 不把运营商策略和出口代理重写成 Go
- 不在第一段替换网页或登录接口
- 不把这次改动打进正在发布的 v1.14.0 标签
