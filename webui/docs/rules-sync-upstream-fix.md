# 规则页同步报错排查（2026-07-24）

## 现象

Web 规则页点击「同步」失败；入口 `http://192.168.1.88:8866`，设置后端为 OpenClash。

## 根因链

1. 早期：网关 `/mihomo` 空 upstream → `502 Invalid upstream`（未填 Clash `:9090`）。
2. 已连接后：同步会把「运行时快照」拼成 YAML 再 `PUT /configs`。
3. 实锤 PUT 错误：
   - `unsupport vehicle type: Proxy`（误用 REST 的 `type`，应用 `vehicleType`）
   - 随后 `proxy group ... not found`（快照无 `proxies:` 节点段，无法安全回写）
4. 网关文件 API：`/etc/mihomo/config.yaml` 在容器内不存在；OpenClash 也不能经 API 导出完整 YAML。

## 修复

- `mihomoRuntimeYaml.js`：按 `vehicleType` 序列化；跳过 Compatible / 无 URL 的 http provider
- `mihomoYaml.js` + `useRulesPageView.js`：运行时快照禁止 PUT，提示先导入完整 YAML
- 设置页文案：`:9090` 不是网关 `:8866`

## 你需要做的

1. 设置 → 透明代理后端：OpenClash + `192.168.1.88:9090` + Secret → 保存并连接
2. 设置页 **导入完整 YAML**（从 OpenClash 配置文件复制）
3. 再回规则页点「同步」
