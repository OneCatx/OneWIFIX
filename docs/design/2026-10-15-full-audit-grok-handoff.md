# 2026-10-15 Android / iOS / Web 全盘审查与 Grok 修复交接

审查对象是当前本地源码和未提交工作区。用户授权本轮只审查、输出交接，不修复业务代码、不提交、不推送、不部署，不进行真实电话、短信或通知操作。本文是下一轮修复清单，不代表这些问题已经修好。

## 1. 阅读顺序与审查快照

Grok 先读本文，再读 [产品边界交接](E:/GQ/Ultra/mdd-sim-gateway/docs/design/2026-10-14-final-check-handoff.md)，然后按源码核实并逐项修复。该旧交接中的“最后检查必须收口”若已在工作区完成，不能再次作为现存缺陷；本次已排除完成的路由、导航、改密入口与废弃样式清理。`E:/GQ/Ultra/mdd-sim-gateway/docs/onewifi-migration/GROK_HANDOFF.md`、同目录旧 `capability-report.md`、`GAP_INVENTORY.md` 不代表现状。

- 网关 / Web：`E:\GQ\Ultra\mdd-sim-gateway`，分支 `feat/onewifi-mdd-unified`，HEAD `eed8d2fc37684ac801a84eafdcf4f2f201577d2e`，VERSION `1.14.0`。大量 modified / untracked 文件属于审查前工作，不能用 HEAD 表示实际审查内容。
- Android：`E:\GQ\Ultra\NEWWIFI\apps\android`；融合 iOS：`E:\GQ\Ultra\NEWWIFI\apps\ios`。NEWWIFI HEAD `1b26d707b4fb6334fc91c7fd64bd9539d31678ec`。收口时该仓库仍有 gateway/newwifi_control 的五项预存修改，未触碰；两手机目录未出现本轮业务修改。
- 独立 iOS 对照：`E:\GQ\Ultra\OneWIFI-iOS`，HEAD `bbf0806910ce8642c525bf167bbc76472228beb5`。不能把它与融合 iOS 当成同一套可发布客户端。
- 补充 Flutter 应用对照：`E:\GQ\Ultra\onewifi-app`，HEAD `b2e44f06d190f4ba898a94b541987535aab65d5e`。
- 未融合 MDD 的旧 OneWIFI 基线：`E:\GQ\Ultra\ONEWIFI-6056f50`，有完整 Go 后端和 Vue 源码；README 明确不是 MDD。其 `.git` 引用失效，`6056f50` 只是目录中的短哈希候选，未核实完整 commit 或具体发布 APK/IPA。
- 审查日期：2026-10-15，Asia/Shanghai；环境：Windows / PowerShell。未读取或修改 `E:\GQ\Ultra\NEWONE`。

P1 表示核心业务中断、误操作、可能重复计费或访问控制不符合配置；P2 表示功能不完整、状态/配置误导或恢复问题。未确认 P0。源码确认、隔离复现和硬件待验证分别标记，不能把静态审查写成现场实测。

## 2. Grok 必须遵守的产品边界

1. 一张卡只使用现有 Engine 的一条 IMS 注册。保留 Asterisk / pjproject / `engine/swu_ike.py`，禁止接回旧 Go `internal/vowifi` 成为第二套运行栈。
2. Web 只走 PJSIP / WebRTC。注册失败保持不可用，清理页面残留手机 PCM fallback。Android / iOS 的现有 AMI / AudioSocket `pcm_s16le_8000_mono` 必须保留。
3. 手机 `POST /api/system/update/apply` 继续拒绝。Android OTA 由客户端 GitHub Release `asrtroh-netizen/OneWIFI-APK` 实现；网关只提供手机 `GET /api/system/update/check`。iOS 不增加更新 API。不能为了修手机按钮开放网关 apply 权限。
4. 不恢复强制刷新、一卡 N 待、物理卡分组、eSIM 通知重试、FCM、Telegram 回复机器人；不扩张 PushPlus / 企微 / 飞书。保留 OneTools、发现名单、Bark 验证码短信、Android webhook 的 `urls + secret HMAC + timeout_ms` 和 SMTP。任务的安全重试与禁止的通知重试必须区分，uncertain SMS 不得盲重发。
5. MCC 460 / 248、CSL PLMN 45400 / 45402 / 45410 / 45418 保持 blocked。源码里的 AT&T / Three HK 支持不能写成已注册成功。
6. 按已有交接，已发布 v1.14.0 制品没有未发布 AudioSocket / AT&T / Three HK / eap_direct 改动。本次没有联网核实制品，也没有重新构建 Engine。必须先核对现场 Engine 能力，再验证手机接打；源码存在不能代替制品能力。
7. 不改 `host/mdd_update.py`，不恢复用户取消的包大小和校验限制，不重打 v1.14.0 tag。保留 Python 模块名、运行目录、驱动包名/摘要和历史 issue 链接。OneWIFI 拼写用于产品展示。
8. 保留所有预存脏文件。本轮没有授权 commit / push / 部署，也没有授权 Grok 自动发送真实短信、电话或通知。

## 3. 优先修复顺序

1. 修 Web 短信页初始化崩溃，恢复可操作的收件箱。
2. 统一物理设备与线路 ID；修 WebRTC 初始化、认证、拨号字段、接听与线路选择。错误路径必须明确失败，不能回落到手机 PCM。
3. 统一手机通话 ID 和 Engine 事件关联，精确挂断 / DTMF，处理远端结束后的状态与媒体释放。
4. 修自动任务的 profile / 通道 / 时区 / 时长语义，先阻止过期任务反复补跑和并发重复执行。
5. 修代理信任关闭、反代 ACL 和 SSE 吊销；同步修手机生命周期及认证恢复。
6. 修 eSIM、代理、设置、通知的 API 方法 / DTO / 往返保存问题；Android 移除网关 apply 动作。
7. 对齐客户端源码与发布入口，在 Linux / Android / iPhone 上补真实验收；之后再处理旧版能力补齐。

共享后端 B 编号只计算一次；客户端或旧版报告提到同一根因时交叉引用。不要把各分报告的数量直接相加当作独立 bug 总数。

## 4. 验证结果与证据强度

- Web 全套 `npm.cmd test`：405 项，404 通过、1 失败、0 跳过。失败是生产代码 `ReferenceError: exportInbox is not defined`，不是单纯断言过时。
- Web `npm.cmd run build`：通过。打包成功没有覆盖页面执行与 API 契约，不能据此报告“Web 正常”。
- 后端可在 Windows 独立运行的两批测试：102 / 102 与 48 / 48 通过，合计 150 项。初始批次两个 `main` 导入失败来自 Windows 缺少 `fcntl`，归为环境限制，不作为产品缺陷。
- 后端隔离脚本记录九组观察：任务时区、积压重放、执行参数/结果、代理关闭、Gate 代理 ACL、通话 ID 分裂、旧 ID 挂断/DTMF、SSE 吊销和非法通知输入。脚本用 mock / 临时数据库 / AST 函数提取；退出 0 表示记录完成，不表示九项业务通过。
- 本轮未启动 Linux 主服务、现场 Engine、真实 SIM 或 AMI / AudioSocket；未测试 APNS 真推送与 iOS 原生构建；未联网验 APK / IPA / Engine 版本。下文硬件 / 部署结论必须由 Grok 追加证据。

主要日志和复现：

- [Web 测试日志](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-web-tests.log)
- [Web 构建日志](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-web-build.log)
- [后端 102 项日志](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-backend-safe-tests.log)
- [后端 48 项日志](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-backend-extra-tests.log)
- [隔离复现脚本](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-backend-repro.py) / [观察结果](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-backend-repro.log)

以下正文包含具体问题、源码定位、修复方向和验收条件，分报告仅作为额外取证材料。


## 5. 共享后端与跨端 API 缺陷

### B01 [P1] 手机去电 UUID 与 Engine Uniqueid 没有关联

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8160,8168,8605,8637`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/ami.py:204`；`E:/GQ/Ultra/mdd-sim-gateway/engine/templates/extensions.conf.j2:162,211`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/store.py:2417`。
- 调用方获得 AudioSocket UUID；Engine 的 call_out/call_result 用 Asterisk `${CHANNEL(uniqueid)}`。Originate 不传相关变量；数据库严格按 call_id 匹配。这是数据层根因，不是界面刷新慢。
- 隔离数据库复现：一次模拟去电形成两条记录，numeric Uniqueid 已 ended，UUID 仍 dialing/end_ts=null。手机 SSE 会把后者继续视为活动通话。`device_dial` 还通过 list_calls 最新行取响应，回调抢先插行时可能返回 Engine ID，音频桥却按 UUID 存储。
- 去电答复事件也没有完整状态同步：`call_answer` 处理仅更新 incoming；from-local 没有去电接通回调。不能用 Local AudioSocket Answer 当成对端已接听。
- 建议：定义一份通话关联记录，映射业务 ID、AudioSocket ID、Uniqueid/Linkedid、方向和通道；所有 start/answer/result 走它，返回拨号操作的确切记录。
- 验收：早到/迟到/重复回调、接通/拒接/远端挂断均只有一个业务通话；返回媒体 ID 有对应桥；终态不可被迟到 start 重开。

### B02 [P1] hangup / DTMF 忽略目标通话 ID

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:458-498`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8202`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/ami.py:263,276`。
- hangup 查不到传入 ID 仍调用 `hangup_on_line`，最终执行 `channel request hangup all`。DTMF 完全不读取 ID，选择第一个 IMS 通道。
- 隔离路由复现：传不存在 ID 返回 ok，同时 hangup mock 被调用；DTMF 同样返回 ok，传给 AMI 的只有 digit。
- 影响：旧历史记录/迟到的挂断请求可以结束同一实例的当前通话；多通道时误挂/误送按键。每实例隔离不等于按通话隔离，不声称跨实例全局挂断。
- 建议/验收：按已验证的活动 ID 精确选择 channel；旧终态可幂等返回，未知 ID 返回 404/409，二者都不得碰当前通话；两条活动通道下只影响目标。

### B03 [P1] 自然结束没有释放 handset audio 桥

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/handset_audio.py:120,156,179`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8620`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:468`。
- TCP 结束只置 writer=None；手机 WS 结束只置 phone=None；bridge.drop 仅拨号/应答失败或主动挂断调用。Engine call_result 没有关闭对应桥。
- 源码确认，未运行真实 AudioSocket。影响包括桥表残留、媒体 WS 没有及时终止和断线重连引用过期通话；结合 B01 会持续显示假活动状态。
- 建议/验收：通过 B01 关联在终态统一且幂等地关闭 TCP/WS、清除两张桥索引；远端 BYE、手机断线、Engine 重启后资源恢复基线。

### B04 [P1] 自动任务保存的关键参数未参与执行

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_extras.py:328-338`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8132-8152`。
- profile_iccid/profile_aid、environment、duration_seconds、retry_count、notify 都被保存，但执行只使用 device_id 与 phone/message；call 被立即视为 success，没有时长挂断、目标 profile 校验或结果通知。
- mock 复现 cellular/profile 目标/5秒/retry=3/notify=true 请求只调用一次 `place_handset_call(line,number)`。短信同样固定走 send_sms_on_line；它可能按当前策略自动选实际通道，不能代表用户指定 environment 得到执行。
- 影响：可能用当前错误的 SIM/profile 或通道操作，定时电话超过预设时长；用户认为重试/通知已启用但没有实际行为。
- 建议：只支持当前 Engine 与硬件实际可执行的能力。实现 profile 身份核验、明确通道、受控时长、任务级重试/通知；未实现选项在保存前明确拒绝。任务重试不得扩张为被禁止的 eSIM 通知重试。
- 验收：切换 profile 后旧任务不会默默用新卡；指定 cellular/vowifi 必须执行对应模式或明确失败；重试只针对安全错误，uncertain SMS 禁止盲重发；duration、notify 有可观察结果。

### B05 [P1] 自动任务忽略 timezone

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_extras.py:335,339,343-352`。
- Asia/Shanghai 的 2026-10-15 09:00 被存为 `2026-10-15T09:00:00Z`，正确应为 `2026-10-15T01:00:00Z`；隔离 helper 已复现晚八小时。
- 建议/验收：用 IANA 时区解析本地时间；非法时区拒绝，UTC/Shanghai 和 DST 跳时/重叠时刻明确一致，编辑不会悄悄改变绝对执行时刻。

### B06 [P1] 积压任务每 30 秒补跑；手动执行也消费计划且无并发认领

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_extras.py:264-305`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8117-8129`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:714-721`。
- next_run 只从上次计划时间加 interval；停机数周恢复后仍 due，poller 每30秒再次执行。模拟连续三个 tick 跑的是9月1日、2日、3日，10月15日仍 due。
- 手动 run 调用同一个 begin_run：一次任务提前被 disabled，周期任务跳过下一计划。手动和定时入口都先 await 外部动作再写设置，没有 running claim/锁；异常捕获在整批 for 外，一项抛错跳过其余且没有记录该项失败。
- 建议/验收：明确 missed-run 策略，默认跳至未来或仅补一次；手动 run 不改变计划；原子认领与 operation key 防重，逐任务记失败。两入口同时启动一次、服务停机一月恢复都不能造成重复计费动作。

### B07 [P2] 自动任务把 unavailable / uncertain 记为 success

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8136-8145`；对照真实短信门面 `E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:191-193`。
- public_ip 读取 host_snapshot.public_ip，但主机采集没有此字段，结果 success/unavailable；`uncertain` 短信也被记录为 success/sms accepted。隔离执行已复现二者。
- 建议/验收：公网 IP 功能有真实且对应用户选择线路的来源，否则拒绝；短信记录 accepted_unconfirmed 状态，不能等同投递成功，也不能因此盲目重试；拨号发起成功与通话任务完成区分。

### B08 [P1] 关闭代理头信任后旧 trusted_proxies 仍生效

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_extras.py:148-167`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/gate.py:234-241`。
- save(false) 保留历史 trusted_proxies；gate 只读该字段不读 trust_proxy_headers。toggle false、trusted_proxy(旧代理)=true 已 helper 复现。
- 建议/验收：统一配置来源并明确开关优先级；开→关→重启后 forwarded host/IP 等均按不可信处理；兼容旧配置迁移须明确默认值。

### B09 [P1] 反代部署下允许网段判断的是代理地址

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/gate.py:361-365`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_extras.py:118-130`；对照 `E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:3300` 的审计 IP 解析。
- Gate 用 scope.client 原始 peer 进行 allowed_cidrs 检查，未解析已可信代理链。允许10/8代理后，任意通过它的外部客户可通过网络 ACL；只允许客户网段则可能所有反代请求都被拒绝。有效 bearer 仍必需，本项不是匿名绕过鉴权。
- 隔离 Gate 复现：直接peer=10.1.2.3，allowed=10/8，forwarded client分别10.2.3.4/203.0.113.9，均200。该验证未包括外层Uvicorn ProxyHeadersMiddleware；部署若另行重写scope.client，结果可不同。`E:/GQ/Ultra/mdd-sim-gateway/control/run.py`没有把自有trusted_proxies传给Uvicorn，远程反代与环境FORWARDED_ALLOW_IPS须在Linux核对，不能宣称所有部署均可绕过。
- 建议/验收：共享安全的 effective-client 解析，必须先确认直接 peer 是可信代理，再处理 forwarded chain；内外网客户、伪造头、多级代理和禁用信任各有用例。

### B10 [P1] 通话 SSE 在 token 吊销后继续推送

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:500-521`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/gate.py:369-371`；对照 OneTools 短信 SSE `E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:576-592`。
- Gate 仅为 WebSocket 注册撤销通道。call_events 只检测断开、不复验会话/客户端 token。模拟订阅后 gate.revoke，仍得到后续 snapshot。
- 建议/验收：将 SSE 纳入撤销机制或按 credential 周期复验；登出、改密、客户端吊销后既有 SSE 必须停止，不能继续泄漏通话号码和状态。

### B11 [P2] HTTPS 设置显示可关闭却不改变监听；URL 来源不完整

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_extras.py:170-190`；`E:/GQ/Ultra/mdd-sim-gateway/control/run.py:77`、`:86`、`:103`（实际 TLS listener）；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:647-658`。
- API enabled=false 保存后返回false，但 listener 始终 TLS；http_url 始终空。view fallback10443 与 run fallback8443 不同，且 view 不处理 ONEWIFI_HTTP_PORT 环境覆盖。
- 建议/验收：按当前产品策略返回强制 TLS 与只读 capability，手机不展示可误导的关闭行为；URL 从实际部署地址/端口生成。不能为了修展示而开启不安全 HTTP。默认 config 当前8443可掩盖 fallback不一致，环境覆盖仍须验证。

### B12 [P2] 通知测试的非法输入抛 ValueError，变成 500

- 位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_settings.py:228-237`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:375-376`。
- Bark/wecom 校验在 try 外；try内仅 email 映射ValueError。非法 Bark URL 模拟得到 ValueError、无HTTP状态且网络调用0；现有 HTTPException envelope 不捕获它。
- 建议/验收：测试和保存共享校验及422 error envelope；发送故障用502/明确通道错误且不泄露token；非法URL、空urls、非法template均不发网络请求且不返回500。不增加新的通知通道。

### 能力差距（不作为伪造遥测 bug）

`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:82,89-90` 主机 CPU 缺测为0、网络速率固定0，`sysinfo.collect` 不采实际 CPU百分比/字节速率。符合既有整数缺测约定，但不等于旧版完整遥测能力。建议保留0兼容并增加 availability/source/stale 标记，后续真实采样，禁止用load伪造CPU或signal百分比伪造dBm。

## 6. Web 当前阻断与 API 断裂

### W01 [P1，测试复现] 短信页初始化即抛 ReferenceError

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/composables/useOneWifiSms.js:317`、`:318`、`:398`；调用入口 `E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/OneWifiSms.vue:42`。

`exportInbox` 被声明在 `removeMessage` 内部，而 composable 外层 return 引用它。页面 setup 在返回对象时即抛错，因此不是仅“导出按钮不可用”，而是整个短信页面无法正常初始化。现有 `useOneWifiSms.test.js:140` 已实际触发异常；打包依然通过。

建议：修正函数作用域，保持删除与导出两条操作独立；补页面初始化与导出行为的有效覆盖。验收：既有失败测试通过，短信页可加载联系人、线程、收发状态，删除和导出均调用各自接口；本轮没有发送真实短信。

### W02 [P1，源码确认] 物理 device_id 被直接用于线路 API

位置：`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:4852`、`:4867`、`:4959`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/utils/onewifiModel.device.js:25`、`:59`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/onewifi.adapter.devices.js:186`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:25`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/phone_compat.py:42`。

Web `/api/devices` 返回物理 ID 并单独提供 `instance_id`，模型保留物理 ID。compat 将设备操作重写到只查 `cfg.get_instance(iid)` 的手机门面；短信 thread 和自动任务执行同样需要线路 ID。因此正常的 physical=A / instance=B 绑定下，设备操作、短信筛选、通话、eSIM 和任务存在 ID 失配风险；不能用两种 ID 恰好相同的测试证明正确，也不能把手机线路列表成功当成 Web 成功。

建议：明确两种命名空间，在 Web 适配层统一取绑定 instance_id 执行线路动作，发现/硬件配置保留物理 ID。验收：A 绑定 B 且另有 C，逐接口检查动作只落到 B；未绑定设备禁用线路动作并说明原因。真实切卡/蜂窝操作仍待硬件验证。

### W03 [P1，源码确认] 默认 WebRTC 初始化失败，页面继续手机 PCM 路径

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/Calls.vue:246`、`:278`、`:297`、`:488`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/mddVoice.js:10`、`:95`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/mddWebPhone.js:100`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/callEngine.js:32`。

Calls 调 `bootstrap({})`，没有设置 voice origin，`sessionBase` 初始为空；`softphoneWsUrl` 执行 `new URL('')`，初始化失败后 engine mode=none。页面随后可用 `dialDeviceCall`，接听始终用 `answerDeviceCall`，watch 又调用 `attachHandset` 建手机 PCM media socket。这与产品要求冲突，单独的 callEngine 无 fallback 测试没有覆盖整个页面行为。全局来电条 `E:/GQ/Ultra/mdd-sim-gateway/webui/src/components/GlobalCallBanner.vue:65` 也走设备接听，需要一并对齐。

建议：从当前有效页面 origin 初始化同源 WSS；拨号/接听/挂断只走同一个 WebRTC 会话。明确错误状态、禁用动作并清除 Web 的 handset fallback，保持两手机 AudioSocket。验收：Web 操作无 devices calls/media PCM 请求；失败不回落，Android / iOS 媒体接口不被误删。浏览器麦克风和实际 SIP / 媒体待 Linux 及浏览器实测。

### W04 [P1，源码确认，部分被 W03 遮蔽] WebRTC 请求仍有 CSRF、字段、线路与注册状态错误

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/mddVoice.js:6`、`:34`、`:76`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/gate.py:52`、`:349`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:8209`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/callEngine.js:39`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/Calls.vue:421`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/mddWebPhone.js:109`。

- 语音适配器用旧 `x-mdd-csrf-token`，仅自己的 loginVoice 缓存 token，普通网页登录后 bootstrap 不调用它。Gate 要求 `x-onewifi-csrf-token`，写请求不能复用当前网页登录认证状态。
- dialLine 发 `{number}`，当前 api_call 取 `body['to']`。修 origin / CSRF 后仍有字段断裂。
- bootstrap 默认首条 lines[0]，页面切换设备只刷新列表，不重绑语音 lineId。多线路下 UI 选择与实际动作不一致。
- `UA.start()` 立即返回，尚未收到 registered 就置 ready / 显示“已注册”。当前 provisioning 的 username / host 未用于 fallback URI 构造，属于配置兼容风险，不能断言所有 SIP 配置都必然拒绝。

建议：复用现有 Web 请求封装与 CSRF；提交 to；显式映射所选线路并重新绑定会话；收到 registered 才启用通话。验收：cookie 会话写请求成功且不绕 CSRF，两线路选第二条只请求第二条，注册失败保持不可用。`fetchLines` 的 instances 包装和扁平 password 当前已经对齐，不应再次报错。

### W05 [P2，源码确认] eSIM 编辑依赖缺失 status，mutations 丢 AID

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/deviceEdit.adapter.js:132`、`:259`、`:275`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/components/EsimEditDialog.vue:221`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_api.py:213`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:3533`、`:9031`、`:9556`。

编辑快照用 Promise.all 请求 `/devices/{id}/status` 与 `/esim`；当前 status 未注册/未 rewrite，404 即拒绝整个快照。mutations 提交 `aidHex`，手机 `_reader_args` 只读 `aid_hex/aid`；双 SE 缺失目标会被安全校验拒绝。证据支持“目标选择丢失/被拒绝”，不支持已经切错卡。

建议：用现有真实状态 DTO 或薄兼容 GET，统一 AID 命名并传明确 reader / SE。验收：编辑加载成功；单/双 SE 下 switch / disable / rename 的目标 AID 完整往返，缺目标仍拒绝，真实卡验证选中 SE / ICCID。不得恢复强制刷新或通知重试。

### W06 [P2，源码确认] 代理页面旧 upstream API 没有当前管理实现

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/Proxy.vue:80`、`:143`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/onewifiGateway.proxy.js:5`、`:30`、`:59`、`:79`、`:110`；对照 `E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:5640`、`:5784`、`:5861`、`:9556`。

页面请求 upstream-proxies / probe / countries / rules / bindings，当前后端只有配置与 egress 管理族，没有旧 API 兼容桥；列表 catch 返回空数组，404 被伪装成“没有代理”，后续 CRUD 失败。当前并非完全没有代理能力。

建议：适配现有配置与 egress DTO 或薄兼容层，列表错误明确显示。验收：已有配置显示完整，CRUD / 国家规则 / profile 绑定 / 探测命中真实受保护 API；真实出口另在 Linux 验证，不能复活旧 IMS。

### W07 [P2，源码确认] 保存通知会截断多 URL；webhook 测试丢鉴权参数

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/onewifiGateway.settings.js:4`、`:51`、`:56`、`:86`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/views/settingsNotifyModel.js:34`。

保存先从 urls 取第一项，再写回 `urls=[first]`；已配置多个 webhook / Bark 目标时，普通保存会丢其他目标。`testOnewifiWebhook` 只提交 enabled / 单个 URL，未传 secret / timeout_ms，不能验证用户实际 HMAC / 超时配置。另有编辑 `.url` 被旧 `.urls[0]` 优先级覆盖的风险，需要与页面模型联测。

建议：多目标完整往返；规范统一数据源与编辑优先级，测试提交当前 draft 的 urls / secret / timeout_ms。验收：两 URL 加 HMAC 配置读取、修改、保存、再读取完全保留；mock 断言测试参数，不发送真实通知；仅修现有通道。

补充脱敏契约：`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_settings.py:61` 的 `_restore_urls` 要求脱敏列表长度保持一致。两个 MASK 目标被压成一个会返回 409；通知弹窗保存整个对象，可能连带阻止其他通道修改。因此此缺陷既可能丢目标，也可能直接使保存失败。

### W08 [P2，源码确认] 设备重命名调用未实现的 PATCH 根资源

位置：`E:/GQ/Ultra/mdd-sim-gateway/webui/src/components/OneWifiInstanceRenameDialog.vue:32`；`E:/GQ/Ultra/mdd-sim-gateway/webui/src/api/onewifi.adapter.devices.js:227`；对照 `E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:5133`、`:5211`。

Web 发 `PATCH /api/devices/{id}` + `{name}`，当前只有硬件 PUT 子资源与删除等路由，没有此 PATCH 处理器。这一问题独立于 W02，即使 ID 相同仍不能保存。建议对齐现有名称保存契约或薄兼容映射，明确物理/线路名称归属。验收：保存后重读一致，其他配置不被完整覆盖；空名/过长名拒绝。

## 7. iOS 独有问题、发布源码漂移

本节主源为 `E:\GQ\Ultra\NEWWIFI\apps\ios`，独立发布源码副本为 `E:\GQ\Ultra\OneWIFI-iOS`。副本的本地 `login_screen_test.dart` 在 iOS 审查首次记录时已 dirty；审查没有编辑或撤销它。不能将副本源码等同于用户安装的签名 IPA。

### I01 [P1，源码确认，真机待验] 温后台 VoIP 来电没有重开 SSE

位置：`E:/GQ/Ultra/NEWWIFI/apps/ios/ios/Runner/Calls/CallKitCoordinator.swift:206`、`:216`、`:238`、`:256`、`:422`。

闲置退后台时 stopIdleEvents 停 SSE 并设 fresh=false。receivePush 建立 local / 上报 CallKit / 开绑定计时，却不 startEvents；相同配置 configure 快路径也直接返回。接听要求 fresh=true，约 20 秒后可被绑定超时结束；只有前台恢复会重开事件。适用于融合主源实际 PCM owner，不能直接套到独立副本 SIP owner。

建议：有效 gateway 上收到推送后幂等重开事件，保留 generation / 所有权校验。验收：温后台/锁屏推送→新 SSE 快照→CallKit 接听→双向 PCM，重复推送无重复来电，20 秒计时不误终止。控制流已确认，系统调度与声音未真机复现。

### I02 [P1，源码确认，真机待验] 冷启动首次 configure 清除推送来电

位置：`E:/GQ/Ultra/NEWWIFI/apps/ios/ios/Runner/AppDelegate.swift:21`；`E:/GQ/Ultra/NEWWIFI/apps/ios/ios/Runner/Calls/CallKitCoordinator.swift:148`、`:151`、`:184`、`:238`；`E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/calls/state/call_session_binding.dart:92`。

PushKit 可以先在没有 gateway 时建立 incoming local 并上报 CallKit。随后 Flutter 恢复登录调用 native configure，首次配置没有旧 gateway 命中快路径，无条件 clear / finishLocal，结束刚上报的来电并丢失后台开事件条件。独立副本 configure 是不同路径，未确认同一缺陷。

建议：区分首次为同身份待绑定来电补全会话与切换/撤销会话；前者验证身份后保留 UUID、重开事件，后者仍清理。验收：冷启动 push→凭据恢复→快照绑定→锁屏接听连续成功；无凭据/撤销/切换网关及时结束旧来电，不误操作未取得所有权的远端通话。

### I03 [P2，静态时序确认，竞态待隔离复现] 短信 SSE ACK 可能提前压掉 APNS / Live Activity

位置：`E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/sms/state/remote_otp_controller.dart:253`；副本同文件 `E:/GQ/Ultra/OneWIFI-iOS/lib/features/sms/state/remote_otp_controller.dart:277`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:2032`、`:2038`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_pairing.py:171`；`E:/GQ/Ultra/mdd-sim-gateway/control/app/mobile_notify.py:37`、`:50`。

客户端收到 SSE 先 claim / ACK，但没有展示横幅，注释认为 APNS 负责展示。短信入库后 SSE 可先读出并 ACK，APNS 异步任务随后按 last_confirmed_sms_id 跳过 endpoint，活动更新也被跳过。收件箱有内容不代表通知已展示。两份源码共用此可达时序，但未人为控制竞态或向 Apple 发送请求。

建议：分开 SSE 消费游标与 APNS / 本地实际展示的交付确认。验收：mock 将 ACK 排在推送前，仍恰好一次执行应有推送/活动更新；真实展示后去重仍有效，再真机验横幅与活动。不增加通知重试。

### I04 [P1，源码漂移确认，安装包待验证] 独立发布源码实际 owner 从 PCM 切为 SIP/WebRTC

位置：主源 `E:/GQ/Ultra/NEWWIFI/apps/ios/ios/Runner/AppDelegate.swift:7`、`E:/GQ/Ultra/NEWWIFI/apps/ios/ios/Runner/Calls/CallGatewayClient.swift:120`；副本 `E:/GQ/Ultra/OneWIFI-iOS/ios/Runner/AppDelegate.swift:7`、`:26`；`E:/GQ/Ultra/OneWIFI-iOS/lib/features/calls/data/mdd_sip_background.dart:319`、`:383`；`E:/GQ/Ultra/OneWIFI-iOS/lib/features/calls/data/sip_call_service.dart:233`。

主源创建 CallKitCoordinator、走手机 facade / SSE / PCM；副本创建 MddCallKitCoordinator，后台 FlutterEngine 持有 SIP UA / WebRTC，旧 PCM 类用于隔离测试，保留文件不等于活跃运行。副本 pubspec 为 0.1.28+33 并增加 SIP / WebRTC 依赖；CI 封装 unsigned IPA。本次没有检查远程 CI 或已签名 IPA。这不是已证明“第二条运营商 IMS”，而是客户端 owner / 媒体契约漂移。

建议：确认用户实际构建/签名/安装来源，统一手机 owner 与本次“保留 AudioSocket”要求。不能只给副本未使用的 PCM 类打补丁就报告发布修复。验收：源码 commit / dirty 清单、IPA 入口、签名权限与真机媒体链可追溯；后台 CallKit、取消、切换会话、听筒 PCM 在对应 Engine 上验证。

### iOS 共享后端关联与非缺陷项

- 自动任务可由 iOS 启用/编辑/立即执行，虽没有创建 UI，B04–B07 仍可达；客户端 DTO 保留时区及目标字段，根因在服务器执行链。
- 主源 PCM 路径直接受 B01 / B02 / B03 / B10 影响；副本正常 SIP dialog 挂断 / DTMF 不应机械归入同一路径。B08 的设置关闭两份客户端均可达。
- 主源 auth data 包装、session、logout 与 facade 对齐；副本使用 client/login / auth/status / client/logout 和原生响应，并对部分业务改写 `/api/mobile/v1`。不要误报“所有 iOS 登录必坏”。
- iOS 当前活跃请求没有 update/apply，不新增更新 API。开发 APNS sandbox / development 配置与 unsigned IPA 需要最终签名核对，尚未证明某个已签包必坏；不能未经产品要求全部改 production。
- iOS 26 最低系统限制是现有构建策略，无最低版本需求证据，列发布兼容性确认，不能直接定罪。活动策略是前台准备空活动 + update_only，不能把没有 push-to-start 当作 bug。


## 8. Android 客户端问题

本节以 NEWWIFI 的 Android 子树为基线，原生 OTP / 通话 / OTA 入口已核对。未执行 Flutter / Gradle 测试、构建、安装或真机验收。AND-04/05/06/07 的融合 iOS 可达性已经核对，适用范围见本节末尾，不重复当作新共享后端问题。

### AND-01 [P1] 原生后台直接匹配 JSON 原文，中文验证码无法提取

**证据位置：**

- `E:\GQ\Ultra\NEWWIFI\apps\android\android\app\src\main\kotlin\com\oneims\onewifi\RemoteOtpService.kt:120`：正则取原始 JSON content，未 JSON 解码；`:121`：按中文“验证码”或英文 verification code 匹配验证码；`:122`、`:123`：sender/device 同样取原始字符串。
- 同文件 `:74`–`:76`：解析无结果则不通知、也不推进该消息游标。
- `E:\GQ\Ultra\mdd-sim-gateway\control\app\mobile_api.py:588`：SSE 使用 `json.dumps(data)`，默认将中文编码为 Unicode 转义。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\app\app_dependencies.dart:190`–`:193`：Android OTP 使用原生后台服务路径。

**触发：**已配对、后台 SSE 收到正文包含“验证码123456”的合法短信。线上 JSON 中中文成为 `\u9a8c...`，原生正则看到的是编码文本。

**影响：**该短信无法生成后台验证码通知/复制入口；游标不推进还可能导致重新连接后重放。前台 Dart 轮询路径可能仍正常，不能扩大为全部短信不可达。

**根因链：**网关合法 JSON 编码 → 原生用正则切出未反转义 content → 中文关键词匹配失败 → 返回空提取结果 → 跳过通知与游标推进。

**最小修复建议：**原生使用 JSONObject 解码正文与字段，再提取验证码，并与 Dart 提取规则对齐。不得为此恢复已下线的通知重试产品功能。

**验收：**离线合成 SSE 覆盖中文 Unicode 转义、引号/换行、英文验证码、非验证码；关闭 Flutter 后验证原生通知及消费游标。再在真机验证通知权限拒绝、后台重连和取消行为。

**验证状态：静态证实＋本次离线局部复现。**用网关实际 `json.dumps` 格式及 Kotlin 正则的等价纯内存逻辑复现：中文原文提取为空，JSON 解码后可匹配；英文样例可提取 123456，含引号的中文样例也失败。没有执行 Kotlin 服务或发送真实短信。

### AND-02 [P2] Android 仍提供刻意禁用的网关 update/apply 操作

**证据位置：**

- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\presentation\settings_screen.dart:237`–`:249`：网关 available 为 true 时出现操作按钮，`:245` 显示“应用更新”，`:249` 调用 applyUpdate。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\state\settings_controller.dart:408`–`:413`：可达调用；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\data\settings_api.dart:75`：POST `/api/system/update/apply`。
- `E:\GQ\Ultra\mdd-sim-gateway\control\app\phone_compat.py:45`–`:49`：手机 token 路径兼容重写；`E:\GQ\Ultra\mdd-sim-gateway\control\app\authz.py:99`–`:110`：manage_settings 没有 apply 授权。`E:\GQ\Ultra\mdd-sim-gateway\control\app\mobile_api.py:750` 为兜底处理，不是可用 apply 实现。

**触发：**网关检查返回 available=true，手机用户点击“应用更新”。

**影响：**手机发出设计上必被拒绝的管理动作，更新流程失败/误导用户；这与 Android APK OTA 是不同操作。

**根因链：**网页/网关更新操作残留在手机设置 → 当前手机授权不含 apply → 请求进入手机路径后拒绝。

**最小修复建议：**移除手机 apply 按钮和可达 action，保留版本检查和 APK OTA；不放宽网关手机权限。

**验收：**mock 网关 available=true，手机仍无 apply 按钮且无该 POST 请求；APK OTA 保持可用。

**验证状态：静态证实＋离线授权纯函数复核。**执行当前 authz/phone_compat 的纯逻辑确认该请求未获 grant；未启动 HTTP 服务。后端拒绝本身不是 bug。

### AND-03 [P2] APK 更新使用过期本机版本常量

**证据位置：**`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\domain\gateway_settings.dart:5` 的 `kBoardPackageVersion` 为 0.1.41；`E:\GQ\Ultra\NEWWIFI\apps\android\pubspec.yaml:4` 为 0.1.42+47；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\data\board_update_client.dart:54` 默认采用常量；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\domain\board_update.dart:21`–`:38` 基于该 currentVersion 判定；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\presentation\settings_screen.dart:207` 展示版本。

**触发：**按当前 pubspec 构建安装 0.1.42，GitHub latest 也为 0.1.42。

**影响：**页面展示错误本机版本，并把已安装版本识别为可升级，造成重复下载/安装提示。

**根因链：**包版本已增加 → 手写常量仍为旧版 → OTA 比较和展示共同使用旧值。

**最小修复建议：**从包元数据获取实际版本，或在构建时生成单一版本源。

**验收：**当前包 0.1.42+47 配 latest 0.1.42 不提示升级，配 0.1.43 提示升级；页面版本与包一致。

**验证状态：静态证实。**未查询真实 GitHub Release，未验证已发布 APK 的版本或签名。

### AND-04 [P2] 多 URL 通知配置只编辑首项，掩码尾项使保存/测试冲突

**证据位置：**

- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\data\settings_dto.dart:195`：拆首项与其余项；`:200`–`:207`：编码时合并首项和 extras。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\domain\gateway_settings.dart:201`–`:202`、`:254`：extraUrls 被保存且 copyWith 保留。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\presentation\settings_notify_sheet.dart:66`、`:114`：首项编辑及 copyWith；`:278`、`:319`、`:323`：Bark/webhook/wecom 单 URL 编辑入口。
- `E:\GQ\Ultra\mdd-sim-gateway\control\app\mobile_settings.py:40`：读取时 URL 均掩码；`:65`–`:67`：掩码列表须全掩码且长度一致，混合真实值与掩码拒绝。

**触发：**某渠道已配置至少两个 URL；手机读取后只改首 URL，保留不可编辑的尾部掩码。

**影响：**保存或涉及同样 URL payload 的测试返回 409。保存包含整份通知 DTO，冲突还可能阻断其它通知设置一起保存。

**根因链：**多 URL 全掩码读取 → UI 仅首项可编辑 → DTO 发出新首 URL＋旧掩码尾项 → 后端无法将此混合列表安全还原 → 拒绝。

**最小修复建议：**提供完整 URL 列表编辑，或定义可保留其余项的单项 patch 契约；不得静默丢掉尾部目标。

**验收：**双 URL 原样保存不变；完整替换可保存；单项修改按新契约保留尾项；错误时不发生隐式删除。

**验证状态：静态证实＋本次离线局部复现。**离线 AST 提取并执行当前 `_restore_urls`，使用合成 URL 与掩码混合列表得到 409；异常类型使用本地替身，未导入网关应用、未发送通知。

### AND-05 [P2] webhook 草稿测试遗漏 secret 和 timeout，测试配置与保存配置不同

**证据位置：**`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\presentation\settings_notify_sheet.dart:234`–`:235` 将草稿提交到测试、`:320` 提供 secret 编辑；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\state\settings_controller.dart:275` 传 draft；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\settings\data\settings_dto.dart:102`–`:106` 保存包含 secret/timeout，而 `:131` webhook 测试仅传 enabled/urls；`E:\GQ\Ultra\mdd-sim-gateway\control\app\mobile_settings.py:212`–`:227` 测试合并已保存配置，遗漏字段沿用旧值。

**触发：**已保存旧 secret，手机输入新 secret 后直接点击测试，尚未保存。

**影响：**测试使用旧 secret 或无 HMAC，而用户以为测试当前草稿，导致接收端校验结果与随后保存后的真实行为不一致。timeout 也存在 DTO 遗漏，当前 UI 无独立 timeout 编辑入口，主要可达触发是 secret 修改。

**根因链：**草稿包含完整字段 → 测试 encoder 丢失字段 → 后端合理沿用已保存配置 → 测试与保存语义分叉。

**最小修复建议：**测试与保存共用完整 webhook 字段及相同的掩码保留规则。

**验收：**离线接收器/stub 验证修改后的草稿 secret 和 timeout 被传入测试，签名匹配该草稿；本次不允许外发真实通知。

**验证状态：静态证实。**未调用通知测试 endpoint，未产生网络通知。

### AND-06 [P2] 登录失败返回 detail 信封，被客户端误归类为协议错误

**证据位置：**

- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\auth\data\auth_api.dart:13`：公开 POST `/api/auth/login`。
- `E:\GQ\Ultra\mdd-sim-gateway\control\app\main.py:3161`–`:3162`：429 返回 detail/retry_after，`:3167`：错误凭据抛 401 detail；`:9504`–`:9509`：手机统一 error 包装范围为 mobile/v1，原 auth 路径保留 detail。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\core\http\http_transport.dart:192`–`:200`：非成功状态只接受 error.code/message，否则抛 protocol，`:196` 的 protocol 分支未携带 HTTP status。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\core\state\state_failure.dart:50`–`:65`、`:89`：失败分类/协议错误提示；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\auth\state\session_controller.dart:115`–`:120`：转换；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\auth\presentation\login_screen.dart:124`：展示 failure.message。

**触发：**输错登录密码，或连续失败触发登录节流。

**影响：**错误密码/429 被显示成“服务返回无法识别的数据”类反馈，丢失该分支的 HTTP 状态，无法正常表达节流重试信息。成功登录、session/logout DTO 不在此问题范围。

**根因链：**公开 auth 路径使用传统 FastAPI detail → 通用客户端只识别 mobile error 信封 → 提前抛协议异常 → UI 得到错误分类。

**最小修复建议：**为 auth 路径兼容 detail，保留 status 与 Retry-After 的安全信息；或在保持契约兼容的前提下统一失败信封，不直接暴露敏感原始 detail。

**验收：**mock 401 detail、429 detail＋Retry-After、503；分别得到凭据错误、节流/重试时间和服务异常分类；成功 DTO 不回归。

**验证状态：静态证实。**本次未向网关发送登录请求，未做实际 HTTP 集成重放。

### AND-07 [P2] eSIM 切卡丢弃新 device_id，详情和后续操作仍绑定旧线路

**证据位置：**

- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\esim\data\esim_api.dart:75`–`:85`：校验 status/iccid/verified 后仅返回 status/verified，丢弃 device_id/reader_id。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\esim\state\esim_controller.dart:43`：deviceId 固定；`:135`：成功后读 inventory；`:340`–`:343`：仍按旧 deviceId 请求。
- `E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\devices\state\device_detail_controller.dart:27`：详情固定 ID；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\app\android_oneims_shell.dart:333`–`:345`：两个 controller 初始化为同一所选旧 ID，切卡结果未更新选择；`E:\GQ\Ultra\NEWWIFI\apps\android\lib\features\devices\presentation\device_detail_view.dart:109`、`:114`：详情继续轮询旧 controller。
- `E:\GQ\Ultra\mdd-sim-gateway\control\app\main.py:3953`–`:3967`：切卡按新 ICCID 恢复新 instance；`E:\GQ\Ultra\mdd-sim-gateway\control\app\mobile_api.py:254`–`:265`：返回当前 device_id/reader_id；`:196`–`:210`：旧身份无当前 reader 绑定时拒绝。

**触发：**从实例 A 切换到不同 ICCID 对应实例 B，或从未绑定 reader 切入已配置线路，导致后端返回新的 device_id。

**影响：**硬件切卡成功但 App 仍显示旧线路并请求旧身份，profile 刷新或下一次操作可得到 409；回列表重选才能恢复。旧配置行可能仍存在，不能断言旧 ID 必然删除或必然 404。

**根因链：**切卡改变 live instance 身份 → 后端返回新身份 → DTO 丢弃 → 固定 ID controller 继续轮询/操作 → 后端身份 guard 合理拒绝旧绑定。

**最小修复建议：**SwitchResult 保留新 device_id/reader_id；成功后刷新列表并按新身份重建/重绑定详情与 eSIM controller，不绕过身份校验。

**验收：**mock A→B 返回 device_id=B，下一批详情/eSIM 请求全部使用 B；already_active 同 ID 正常；失败不重绑。真机随后确认切卡后的 IMS/资料归属。

**验证状态：静态证实条件链，待 eSIM 真机验证。**未执行切卡隔离复现或真实 profile 操作。

### 两手机共享问题与独立 iOS 副本的适用范围

以下为 AND 编号的跨端补充，沿用原编号，不另计缺陷。详细证据见 [iOS 分报告附录 F](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-ios.md)。仅核对当前源码，不能推出已安装 IPA 的修复状态。

- **AND-06 / 登录错误：Android 与融合 iOS 均存在。**融合 iOS `E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/auth/data/auth_api.dart:13` 调用 `/api/auth/login`，`E:/GQ/Ultra/NEWWIFI/apps/ios/lib/core/http/http_transport.dart:192` 只接受 error 信封，detail 的 401/429 会误分类。独立副本 `E:/GQ/Ultra/OneWIFI-iOS/lib/features/auth/data/auth_api.dart:14` 改用 client/login 并启用 nativeResponse；`E:/GQ/Ultra/OneWIFI-iOS/lib/core/http/http_transport.dart:204` 已保留 detail、HTTP status 和 Retry-After。后者不属于同一现存根因，按既有兼容回归即可。
- **AND-07 / 切卡身份：Android 与融合 iOS 均存在。**融合 iOS `E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/esim/data/esim_api.dart:75` 丢弃新身份，`E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/esim/state/esim_controller.dart:124` 成功后继续刷新旧 ID。独立副本 `E:/GQ/Ultra/OneWIFI-iOS/lib/features/esim/data/esim_api.dart:85` 已保留新 ID，`E:/GQ/Ultra/OneWIFI-iOS/lib/features/esim/state/esim_controller.dart:138` 通知重绑，`E:/GQ/Ultra/OneWIFI-iOS/lib/app/android_oneims_shell.dart:345` 刷新列表并跳转。副本应验收现有重绑链，不能重复声称它丢弃 device_id。
- **AND-04 / 多 URL 掩码：Android 与融合 iOS 均存在。**融合 iOS `E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/settings/presentation/settings_notify_sheet.dart:67` 只编辑首项，`E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/settings/data/settings_dto.dart:194` 保留掩码尾项，会生成后台合理拒绝的混合列表。独立副本 `E:/GQ/Ultra/OneWIFI-iOS/lib/features/settings/presentation/settings_notify_sheet.dart:62` 已识别全掩码多 URL，`:293`、`:336`、`:342` 禁用三个渠道的 URL 编辑；普通 UI 已阻断此触发。保留该保护或实现完整列表契约，不放宽后台掩码校验。
- **AND-05 / webhook 草稿测试：Android、融合 iOS、独立 iOS 均存在。**融合 iOS `E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/settings/presentation/settings_notify_sheet.dart:235` 先提交草稿，`E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/settings/state/settings_controller.dart:335` 再把草稿交给 repository，故不是按钮未取草稿。真正遗漏在 `E:/GQ/Ultra/NEWWIFI/apps/ios/lib/features/settings/data/settings_dto.dart:125`；独立副本对应 `E:/GQ/Ultra/OneWIFI-iOS/lib/features/settings/data/settings_dto.dart:126` 也只发 enabled/urls。secret 的 UI 修改可触发测试沿用旧鉴权；timeout 也未序列化，但当前 iOS 没有独立 timeout 编辑入口。两份都应统一测试与保存字段、掩码规则，并用 stub 验 HMAC，无需真实外发。

## 9. 与未融合 MDD 的旧 OneWIFI 比较及建议

比较基线固定为 `E:\GQ\Ultra\ONEWIFI-6056f50` 的 Go / Vue 源码，不把其他客户端目录冒充该旧版。比较证明的是实现差异，不代表旧源码对应制品已经在本次机器上实测。旧 baseline 的 gitdir 失效，无法用已核实的完整历史 commit 做回归定位。

### 9.1 已有证据的不足：接口迁移与运行语义不完整

1. **设备身份映射与管理契约。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/cmd/onewifi/native_qmi_vowifi.go:18` 显式 configured→physical 映射；`E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/device_api_dispatch.go:67` 支持设备根资源 PATCH，`:145` 支持 status GET。当前缺口是 W02 / W05 / W08，而非“发现功能完全消失”。建议先统一 physical / instance / reader / ICCID 身份，再补薄兼容映射；用不同 ID 的 fixtures 防止偶然相等掩盖错误。
2. **eSIM AID 兼容与目标选择。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/esim_api_mutations.go:44`、`:91`、`:358` 支持 aid_hex / aidHex 并解析目标。融合 Web 的 AID 丢失与手机切卡后新身份丢失分别见 W05 / AND-07。建议统一请求命名和 SwitchResult，保留当前 SE 锁、目标 ICCID 验证及单 Engine 恢复；双 SE 验收不能省略。
3. **上游代理管理可用性。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/proxy_api.go:13` 注册 upstream API，`:56`、`:86` 有真实 CRUD。融合版有现有配置 / egress，但网页仍发旧路径（W06）。建议优先迁移 UI→当前管理 API；列表失败必须报错，不能吞成空列表。不要拿蜂窝 export-proxy 与 IMS upstream egress 互相替代。
4. **自动任务兑现程度。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/automatic_tasks_exec.go` 有 profile / environment / 恢复 / 时长收尾 / 完成通知运行链；当前 phone_tasks 执行器 B04 静默忽略相关字段。建议先拒绝尚不支持的配置，避免界面承诺，再在现有 Engine / 硬件链实现必要的 profile 身份核验和单次通话定时收尾。旧任务重试策略也不能照搬为 uncertain SMS 盲重发或 eSIM 通知重试。
5. **时区与防重复调度。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/automatic_tasks_api.go:236` 使用 time.LoadLocation，`:284` 用 ParseInLocation；`E:/GQ/Ultra/ONEWIFI-6056f50/internal/store/automatic_tasks.go:111` 事务认领，`:137` 将下次时间推进到 now 之后。当前 B05 / B06 会时区偏移、积压补跑及争抢。建议引入明确 missed-run 策略、原子 claim 和安全恢复状态，这是计费操作的必修项。
6. **公网 IP 的线路归属与错误语义。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/automatic_tasks_exec.go:374` 校验接口并调用 `exportproxy.LookupPublicIP(ctx, config.Interface)`，失败传播。当前 B07 用主机空 snapshot 也 success。建议没有真实线路能力时明确不支持；需要支持时只从指定蜂窝接口查询并关联 ICCID，不能用 NAS 出口假代替。
7. **通话架构迁移尚未接通完整产品路径。**旧 Vue Calls 有设备调用 / PCM 工作流；融合版已决定浏览器 PJSIP / WebRTC，因此旧浏览器 PCM 不再是要恢复的优势。当前不足是 W03 / W04 的接线、CSRF、字段、线路选择和真实注册状态。建议沿现有单 Engine 补齐 WebRTC，把手机 PCM 与浏览器媒体能力分别验收。

### 9.2 需要确认范围或硬件证据的差距

- **MHI / PCIe 与细粒度蜂窝管理。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/cmd/onewifi/native_qmi_vowifi.go:11`、`:26` 有 MHI 映射及 native QMI 动作；旧 device_api_cellular / device_api_operator_vowifi 有蜂窝配置和选网管理。当前 `E:/GQ/Ultra/mdd-sim-gateway/runtime/hardware.py:411` 主要 USB / ttyUSB 发现，`:887` 保留 NetworkManager APN 配置，`:944` 蜂窝 reconcile。尚未证明旧 MHI / PCIe / USSD / USBNetMode 管理逐项等价，也不能直接断言 QMI 全部丢失。建议明确支持硬件矩阵，以 USB QMI 和 MHI/PCIe 各一类真机验证发现、身份、APDU、热插拔、APN/选网；需要补齐时用现有硬件层。
- **蜂窝出口 export-proxy。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/export_proxy_api.go:13` 和 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/exportproxy/bind_linux.go:18` 有真实蜂窝接口隔离。当前同等外部蜂窝导出服务未得到证明，也未确认产品要继续保留。建议先定范围：保留则有接口绑定/权限/出口归属验收；删除则清理误导入口，不增加第二 IMS。
- **地址簿 / MMS 完整体验。**当前 `E:/GQ/Ultra/mdd-sim-gateway/control/app/main.py:6752`、`:7059`、`:7134`、`:7251` 保留联系人、附件、彩信发送与配置后端，但新 Vue 缺完整入口。旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/server/sms_api.go:72` 的 contacts 是短信会话；`E:/GQ/Ultra/ONEWIFI-6056f50/internal/smsdecode/mms.go:57` 只是 MMS 通知解码，不足证明旧版完整彩信产品。建议按产品范围补当前已有后端体验，真实 APN / MMSC / 代理条件下验收。
- **可观测性与能力声明。**现有 CPU 缺测 0 / 网络率 0 符合冻结 DTO，不能作为“伪造遥测”定罪，但诊断能力不足。建议兼容旧整数字段并增加 availability / source / stale；让 Web / 手机显示实际媒体能力、Engine build、有效线路 ID、TLS 状态和任务 supported options，避免源码有入口但现场制品无能力。
- **HTTPS 状态表达。**旧 `E:/GQ/Ultra/ONEWIFI-6056f50/internal/httpsmode/manager.go:75` 实际控制旧 HTTPS 状态；当前固定 TLS 是合理政策，问题只是 B11 的假开关/URL 来源。建议强制 TLS 明确显示为只读状态，不能为了“旧版等价”开放明文监听。

### 9.3 不算旧版回归的主动删减

一卡 N 待、强制刷新、物理卡分组、FCM、Telegram 回复机器人、eSIM 通知重试、被阻断运营商和手机网关 apply 都已有明确决定。不建议恢复。普通 eSIM profiles refresh=1 是手动读芯片，不自动等同被取消的强制刷新入口。旧 Go 独立 IMS、旧浏览器 PCM 和历史 quota / license 机制也不因旧版存在就应迁回。

总体建议：先完成接口 / 身份 / 状态机迁移和计费防重，再做硬件覆盖与管理体验补齐；单 Engine 架构保留，旧版能力按可验证行为迁移，不整包搬回旧运行栈。

## 10. API 审查覆盖与 Grok 契约核对清单

本轮盘点当前全目录并追踪主要调用链，涵盖以下 API 家族；未发现问题不代表已通过现场端到端验收。原始路由 inventory 含动态常量/模板，不能把 rg 行数当作精确 endpoint 总数或测试覆盖率。

- **认证 / 会话 / 授权：**auth login / session / logout / password；client bearer；cookie CSRF；client revoke；配对 bearer 与 mobile grant。成功 DTO 已核对，失败信封见 AND-06，长连接撤销见 B10。原生 / mobile data 包装不能混淆。
- **主机 / 设备 / 发现：**dashboard / host / devices / overview / network / vowifi / flight-mode / reconnect / reboot；发现名单、读卡器与 instance 绑定。手机 fleet 与 Web 物理列表不同，W02 是核心 ID 契约问题。
- **短信：**contacts / thread 查询与删除 / send / uncertain 与分段结果 / 导出 / OneTools pairing / stream / claim / ack / Android OTP / APNS。Web setup W01、Android 解码 AND-01、iOS 交付竞态 I03 单列。
- **通话：**设备 calls / dial / answer / hangup / DTMF / media / events；实例 softphone provisioning / SIP-WS / call / hangup；CallKit、Android native owner。B01–B03 / B10 和 W03–W04 分别覆盖状态、操作目标、媒体释放、鉴权与浏览器接线。
- **eSIM / 卡策略：**catalog / overview / profiles / download SSE / switch / disable / rename / delete / policy / APN / backup。目标 ICCID / AID / SE / reader guard 必须保持；Web 缺路由/AID W05 和手机新身份 AND-07 分开修。
- **自动任务：**list / runs / create / update / delete / manual run / poller。手机启停与立即运行已有任务，Web 可创建；B04–B07 是共享执行语义问题，不归咎于各手机新建 UI。
- **设置 / 安全 / 通知：**preferences / security / https / developer / sms / vowifi / license / notifications / test / deliveries / pairing；多目标和 MASK 往返 W07 / AND-04，草稿测试 AND-05，输入500 B12，反代 B08–B09。
- **代理 / 日志 / 更新：**当前 settings / egress 与旧 upstream 页契约 W06；logs / history；管理与手机 update/check 不应共用错误 rewrite，手机 apply AND-02 保持拒绝，APK OTA AND-03 单独验证。

原始清单与详细分报告：

- [后端路由摘录](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-backend-routes.txt)
- [Web API 与长连接调用摘录](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-web-api-inventory.txt)（源码匹配清单，包含测试引用，不代表请求已实际执行）
- [Android API 调用摘录](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-android-api-inventory.txt) / [Android 完整审查与库存](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-android.md)
- [iOS API 调用摘录](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-ios-api-inventory.txt) / [iOS 完整审查、API 与源码差异](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-ios.md)
- [共享后端取证](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-backend.md) / [旧版源码对比取证](E:/GQ/Ultra/mdd-sim-gateway/.xj-cursor/audit-20261015-legacy.md)

## 11. Grok 执行方式与验收门槛

每批先核实现状，再修一个共同根因。每个编号记录“修改文件、行为变化、隔离证据、真实验收、仍未验证项”；不要只列 build passed。共享缺陷应加真实边界行为测试，不以搜索某段源码字符串存在作为修复完成证据。

建议批次：

1. Web 可用性与契约：W01 / W02 / W05 / W06 / W08；随后 W03 / W04，覆盖全局来电条与页面实际调用，不只测 engine 模块。
2. 手机通话与会话：B01–B03 / B10，融合 iOS I01 / I02，Android / iOS 媒体能力和发布入口 I04；先 mock 事件时序，后真实 Engine 验证。
3. 安全与任务：B08 / B09；B04–B07 优先消除重复计费和静默错配置，加入固定时钟、争抢、恢复和 uncertain fixture。
4. 手机 / 通知契约：AND-01–AND-07、I03、W07、B11 / B12，以及两手机同根因补充；禁用 apply 只改客户端，不放宽后端。
5. 发布与能力补齐：核对实际 Engine / APK / IPA 构建来源及能力；硬件矩阵、蜂窝出口、MMS 范围明确后再实施。

Windows 已执行过的验证可复用（修复后才重跑相关部分）：

```powershell
# 工作目录：E:\GQ\Ultra\mdd-sim-gateway\webui
npm.cmd test
npm.cmd run build

# 工作目录：E:\GQ\Ultra\mdd-sim-gateway
python -m unittest tests.test_phone_extras tests.test_phone_compat tests.test_mobile_dto tests.test_phone_gaps tests.test_mobile_pairing tests.test_handset_audio tests.test_sms_inbox tests.test_sms_code tests.test_mobile_notifications tests.test_mobile_apns tests.test_notify_sms_channels tests.test_device_discovery tests.test_auth tests.test_clients
python -m unittest tests.test_card_backup tests.test_esim_switch_progress tests.test_onewifi_carrier_profiles tests.test_att_three_blockers tests.test_engine_image_layout
python .xj-cursor/audit-20261015-backend-repro.py
```

隔离复现脚本当前打印错误行为；修复后需将预期改成有断言的回归验证，不能见退出0就算业务成功。导入 `control.app.main` 的测试在 Windows 受 `fcntl` 限制，应在 Linux 运行，不能为绕测试改掉生产平台依赖。本轮未执行 Flutter / Gradle / Xcode 运行测试；后续在对应平台执行适合改动的测试并记录。

真实环境必须单列：

- Linux 主服务与外层 Uvicorn ProxyHeadersMiddleware / FORWARDED_ALLOW_IPS 的实际 ACL 行为；真实反代链、安全开关关闭和 credential revoke。
- 同一个实际 Engine 的 originate→answer→远端结束 / 取消 / 重启全周期、唯一业务记录、精确 channel、资源清理与连续通话。
- 浏览器 PJSIP / WebRTC 的注册事件、麦克风拒绝、媒体、断网/重连与第二线路选择；网络记录证明没有 Web PCM fallback。
- Android 后台 OTP、权限拒绝、前台服务 / 待机 / 网络切换、8k mono PCM 听筒与蓝牙；iPhone 冷/温后台推送、CallKit、音频激活/打断、SSE 恢复。
- 签名 IPA 的 aps-environment / provisioning / topic / provider environment；独立源码构建入口、实际安装版本。sandbox 不能随意当 production 改。
- 双 SE / ICCID / AID 切换后线路身份、失败恢复；任务线路归属、时长收尾与公网出口。真实短信/电话/通知需要另行明确安排，不在本轮只读审查授权内。

完成条件：优先缺陷逐项关闭且有行为证据；未验证硬件项明确保留；已知产品禁项没有被恢复；现有脏修改被保留；未执行未经授权的提交、部署或外部发送。

