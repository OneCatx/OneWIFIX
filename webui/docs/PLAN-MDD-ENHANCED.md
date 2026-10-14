# 增强版网关 · 完整计划（MDD 打底）

> **决策**：以 MDD 为运行基底打通通话，吸收 OneWIFI 全部强项，界面保留 OneBoard 外观，iOS / 安卓用现有源码适配。  
> **本轮约束**：只改代码，**不部署**。  
> **铁律**：SIM / USIM 只归 MDD 语音引擎，禁止第二套栈抢卡。

---

## 一、目标产品形态

**名称**：OneWIFI（增强版）  
**形态**：一台 Linux 网关 + Web 控制台 + iOS/安卓客户端

```
用户
 ├─ 浏览器 OneBoard（Vue 外观）
 ├─ iPhone App（现有源码适配）
 └─ Android App（现有源码适配）
        │
        ▼
 ┌──────────────────────────────────────┐
 │           网关控制面（MDD control）     │
 │  账号 · 设备 · 卡 · 通话 · 短信 · 彩信  │
 └──────────┬───────────────┬───────────┘
            │               │
   ┌────────▼──────┐  ┌─────▼──────────────┐
   │  语音引擎      │  │  OneWIFI 强项模块   │
   │  (MDD engine) │  │  · 运营商画像        │
   │  Asterisk     │  │  · eSIM ES9+        │
   │  WebRTC/JsSIP │  │  · Telegram/企微     │
   │  ePDG/VoWiFi  │  │  · APNs 推送        │
   │  USIM/PCSC    │  │  · QMI 模组管理      │
   │  MMS/短信      │  └────────────────────┘
   └───────────────┘
```

---

## 二、能力归属（谁负责什么）

| 能力 | 基底 | 来源 | 备注 |
|---|---|---|---|
| 拨打 / 接听 / 通话记录 | **MDD** | Asterisk + JsSIP | 核心，优先级最高 |
| 浏览器 WebRTC 听筒 | **MDD** | softphone_ws | OneBoard 调用 |
| 短信 / 彩信 | **MDD** | control | |
| 读卡器 / SIM / ePDG / VoWiFi | **MDD** | engine | **独占 SIM** |
| 运营商画像（16 profile） | 迁入 | OneWIFI | 对齐 MDD 卡选择 |
| eSIM ES9+ 下载/切换 | 迁入 | OneWIFI | control 扩展 |
| Telegram / 企微 / APNs | 迁入 | OneWIFI | notify 模块 |
| 管理后台界面 | **OneBoard** | OneWIFI Vue | 外观不变 |
| QMI / 模组管理 | 迁入 | OneWIFI | 硬件层或只读 |
| iOS / 安卓 | 适配 | **现有源码** | 改接口，不重写 |

---

## 三、技术栈

| 层 | 技术 |
|---|---|
| 语音引擎 | Asterisk（sysmocom IMS fork）+ PJSIP + WebRTC |
| 信令中继 | MDD control（SIP-over-WebSocket） |
| 控制面 | Python FastAPI（MDD）+ 迁入的 Go/Python 模块 |
| 前端 | Vue 3 + Vite（OneBoard）+ JsSIP |
| 手机 | Flutter（现有 IOS / android 工程） |
| 存储 | SQLite |
| 部署形态 | 宿主机 systemd 或 Docker（引擎） |

---

## 四、分阶段计划

### P0 · 骨架与契约（进行中）

| # | 任务 | 产出 | 状态 |
|---|---|---|---|
| 0.1 | 总体计划文档 | `docs/PLAN-MDD-ENHANCED.md` | ✅ |
| 0.2 | API 映射 | `docs/API-MDD-MAP.md` | ✅ |
| 0.3 | OneBoard → MDD 通话客户端 | `frontend/src/api/mddVoice.js` | ✅ |
| 0.4 | JsSIP WebRTC 听筒 | `frontend/src/views/mddWebPhone.js` | ✅ |
| 0.5 | SIM 归属约定写清 | 文档 + 停 OneWIFI 抢卡 | ✅ |
| 0.6 | 鉴权统一（登录/CSRF/客户端 token） | mddVoice.loginVoice | ✅ |
| 0.7 | 移动端改造清单 | API-MDD-MAP §6 | ✅ |

### P1 · 通话打底（下一个，核心）

| # | 任务 | 验收 |
|---|---|---|
| 1.1 | MDD engine 本地跑通 | 卡识别 → ePDG → IMS 注册 |
| 1.2 | OneBoard 通话页接 mddWebPhone | 拨号、来电、接听、挂断 |
| 1.3 | 通话记录 / 状态 | 列表、状态标签 |
| 1.4 | iOS 适配 | 登录 + CallKit + 通话 API |
| 1.5 | 安卓适配 | 同上 |
| 1.6 | **实测主叫** | 真实拨出接通 |
| 1.7 | **实测被叫** | 真实打进、振铃、接听 |

### P2 · OneWIFI 强项迁入

| # | 任务 | 落点 |
|---|---|---|
| 2.1 | 运营商画像 16 profiles | 引擎/配置层 |
| 2.2 | eSIM ES9+ 下载/切换/回滚 | control `esim` API |
| 2.3 | Telegram 通知与机器人 | notify |
| 2.4 | 企微 / Bark / Webhook | notify |
| 2.5 | APNs / PushKit（iOS 来电） | notify + App |
| 2.6 | QMI/AT 模组状态 | 设备 API |
| 2.7 | 原 OneBoard 页面对齐新 API | 设备/短信/设置 |

### P3 · 界面与双端收口

| # | 任务 |
|---|---|
| 3.1 | OneBoard 全站：仪表盘 / 设备 / 短信 / 通话 / 设置 |
| 3.2 | 视觉与交互与现版一致 |
| 3.3 | iOS 全流程走通（登录→通话→推送） |
| 3.4 | 安卓全流程走通 |
| 3.5 | 本地联调脚本 / 回归测试 |

### P4 · 稳定与硬化（可选后续）

| # | 任务 |
|---|---|
| 4.1 | 多卡多线并行 |
| 4.2 | 自动更新 / 多代回滚 |
| 4.3 | 多国出口 / 代理 |
| 4.4 | 通话诊断与日志 |
| 4.5 | 性能与长时间稳定性 |

---

## 五、仓库与目录（规划）

```
web/                         ← 主工作区（现有）
  mdd/                       ← MDD 源码（运行时基底）
  frontend/                  ← OneBoard Vue
    src/api/mddVoice.js      ← P0 已有
    src/views/mddWebPhone.js ← P0 已有
  docs/
    PLAN-MDD-ENHANCED.md
    API-MDD-MAP.md
  internal/                  ← 原 OneWIFI Go（强项源）
  IOS/                       ← iOS 工程（已有）
  android/                   ← 安卓工程（已有）
```

---

## 六、手机端适配清单（现有源码上改）

### 共用
- [ ] 默认 `origin` → 网关地址
- [ ] 登录 → MDD `auth/login` + CSRF
- [ ] 通话 API → `instances/{id}/call|hangup|softphone`
- [ ] 短信 / 彩信 DTO 映射
- [ ] 网络安全配置（安卓已放开；iOS 0.1.49-62 已放开）

### iOS
- [ ] CallKit 接 MDD 来电
- [ ] PushKit / APNs 对齐新 control
- [ ] JsSIP 或原生 WebRTC 听筒

### Android
- [ ] 连接与登录
- [ ] 通话界面 → 新 API
- [ ] 通知渠道

---

## 七、里程碑与验收

| 里程碑 | 验收标准 |
|---|---|
| **M1 骨架** | P0 代码进库，API 契约明确 |
| **M2 能打电话** | OneBoard 拨出接通 |
| **M3 能接电话** | 真实来电可接听（目标痛点） |
| **M4 双端** | iOS + 安卓能登录通话 |
| **M5 强项齐全** | eSIM / 通知 / 运营商画像可用 |
| **M6 收口** | OneBoard 全站 + 测试通过 |

---

## 八、风险与对策

| 风险 | 对策 |
|---|---|
| SIM 被两套栈抢 | 铁律：只给 MDD engine |
| Asterisk 依赖 XFRM | 目标机选 Debian/飞牛类 |
| 移动端改挂登录 | 保持 DTO 兼容，只换鉴权头 |
| 通话不通 | 先打通一路主叫/被叫再扩 |
| 和另一代理撞车 | 模块边界按本表；通话归我，其它可分工 |

---

## 九、明确不做（本轮）

- 不部署、不发版  
- 不跑双栈抢卡  
- 不重写 iOS/安卓  
- 不追求多卡全功能，先一路通话打样  

---

## 十、执行顺序（立即）

1. ~~P0 契约与客户端骨架~~ → 已完成  
2. **P1.2** OneBoard 通话页接 `mddWebPhone`  
3. **P1.1** 本地 MDD 跑通 IMS  
4. **P1.4/1.5** 移动端改 base + 通话 API  
5. **P1.6/1.7** 主叫 / 被叫实测  
