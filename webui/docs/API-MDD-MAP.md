# OneBoard ↔ MDD API 映射（P0）

> 基底：MDD control。OneBoard / 手机 App 只当客户端。  
> 约定：App 与 OneBoard 统一走同一套 REST + WS，避免两套账号。

## 1. 鉴权

| 能力 | OneWIFI 旧 | **MDD（新）** |
|---|---|---|
| 登录 | `POST /api/auth/login` | `POST /api/auth/login`（body 同） |
| 会话 | Bearer / Cookie+CSRF | Cookie `mdd_session` + `x-mdd-csrf-token` |
| 客户端配对 | OneTools pairing | `POST /api/auth/client/login` + token |

手机 App 适配：**只换 origin + 鉴权头**，业务 DTO 尽量保持。

## 2. 通话（核心）

| 能力 | MDD 接口 | 说明 |
|---|---|---|
| 线路列表 | `GET /api/instances` | 每卡/每线 |
| 线路状态 | `GET /api/instances/{id}/status` | 注册/IMS/通话态 |
| 拨号 | `POST /api/instances/{id}/call` | 拨出 |
| 挂断 | `POST /api/instances/{id}/hangup` | |
| 通话记录 | `GET /api/instances/{id}/calls` | |
| 软电话配置 | `GET /api/instances/{id}/softphone` | JsSIP 用的 uri/password |
| SIP-WS | `WSS /api/instances/{id}/softphone/ws` | 浏览器 WebRTC 信令 |
| 蜂窝拨号 | `POST /api/instances/{id}/cellular-call` | 备用 |

OneBoard「通话」页：**JsSIP** 连 softphone/ws，不再走 OneWIFI PCM 路径。

## 3. 短信 / 彩信

| 能力 | MDD |
|---|---|
| 线程 | `GET /api/instances/{id}/messages/threads` |
| 发短信 | `POST /api/instances/{id}/sms/send` |
| 发彩信 | `POST /api/instances/{id}/mms/send` |
| 附件 | `POST .../mms/attachments` |

## 4. 卡 / 设备

| 能力 | MDD |
|---|---|
| 读卡器 | `GET /api/readers` |
| 侦测 SIM | `GET /api/sim/detect` |
| 设备 | `GET /api/devices` |
| IMS/蜂窝 | `GET /api/devices/{id}/ims` `/cellular` |
| 硬件 IMEI | `PUT /api/devices/{id}/hardware` |

## 5. OneWIFI 强项迁入（P2 目标）

| 强项 | 迁入点 |
|---|---|
| 运营商画像 | 引擎/配置层（对齐 MDD carrier 选择） |
| eSIM ES9+ | `api/esim/*` 并入 control |
| Telegram/企微 | notify 模块并入 |
| OneBoard 界面 | 前端替换 MDD webui |
| QMI/模组 | 硬件层或只读状态 |

## 6. 客户端适配清单（现有 iOS / 安卓）

- [ ] `BaseUrlPolicy` 默认 origin → 网关地址
- [ ] 登录接口 → MDD auth
- [ ] 通话：WebRTC/CallKit → MDD softphone / call API
- [ ] 短信/彩信 DTO 映射
- [ ] ATS / 网络安全配置（已放开，可复用）
