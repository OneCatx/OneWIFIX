"""Native notification settings mapped onto MDD's retained channel configuration."""
from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import HTTPException

from . import config as cfg, mobile_apns, notify_push

MASK = "********"
CHANNELS = ("telegram", "bark", "email", "pushplus", "webhook", "wecom", "onetools")


def _urls(channel: dict) -> list[str]:
    values = channel.get("urls")
    if isinstance(values, list):
        return [str(value) for value in values]
    return [str(channel["url"])] if channel.get("url") else []


def view(settings: dict) -> dict:
    result = {}
    for name in CHANNELS:
        channel = settings.get(name) or {}
        if name == "onetools":
            # Absent means the pairing stream stays available, matching installs that
            # never saved this channel. An explicit save is what turns it off.
            explicit = isinstance(channel, dict) and "enabled" in channel
            result[name] = {
                "enabled": bool(channel.get("enabled")) if explicit else True,
                "public_base_url": str(channel.get("public_base_url") or ""),
            }
            continue
        if name == "email":
            result[name] = notify_push.email_view(channel)
            continue
        item = {"enabled": bool(channel.get("enabled"))}
        if name in ("webhook", "wecom", "bark"):
            # Webhook URLs may contain credentials in userinfo, paths or query parameters.
            item["urls"] = [MASK for _ in _urls(channel)]
        fields = {
            "telegram": ("bot_token", "chat_id", "admin_id", "base_url", "proxy"),
            "pushplus": ("token", "topic", "channel"),
            "webhook": ("secret", "timeout_ms"),
            "wecom": ("payload_template",),
            "bark": ("group", "icon", "level"),
        }.get(name, ())
        for field in fields:
            value = channel.get(field)
            if field == "proxy":
                value = channel.get("proxy_url") or ""
            if field in ("bot_token", "token", "secret", "proxy", "base_url") and value:
                value = MASK
            item[field] = (max(100, min(30000, int(value))) if field == "timeout_ms"
                           and str(value or "").isdigit() else 5000 if field == "timeout_ms"
                           else value if value is not None else "")
        result[name] = item
    return result


def _restore_urls(values, previous: dict) -> list[str]:
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise HTTPException(422, "notification urls must be a list of strings")
    before = _urls(previous)
    if MASK in values:
        if len(values) != len(before) or any(value != MASK for value in values):
            raise HTTPException(409, "masked destinations cannot be partially edited; replace the full URL list")
        return before
    return [value.strip() for value in values]


def _secret(value, previous):
    return previous if value == MASK else value


def native_view(settings: dict) -> dict:
    result = {key: dict(value) if isinstance(value, dict) else value
              for key, value in settings.items() if key != "system_name"}
    for name in ("wecom", "bark"):
        if name in result:
            result[name]["urls"] = [MASK for _ in _urls(result[name])]
    for name in ("apns", "apns_voip"):
        if name in result and result[name].get("auth_key_path"):
            result[name]["auth_key_path"] = MASK
    return result


def prepare_native(body: dict, current: dict) -> None:
    """Validate only new provider fields and restore masked admin GET round-trips."""
    for name in ("wecom", "bark"):
        if name not in body:
            continue
        supplied = body[name]
        if not isinstance(supplied, dict):
            raise HTTPException(400, f"invalid {name} configuration")
        previous = current.get(name) or {}
        item = {**previous, **supplied}
        if "urls" in supplied:
            item["urls"] = _restore_urls(supplied["urls"], previous)
        if item.get("enabled"):
            try:
                (notify_push.validate_wecom if name == "wecom"
                 else notify_push.validate_bark)(item)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
        body[name] = item
    for name in ("apns", "apns_voip"):
        if name not in body:
            continue
        supplied = body[name]
        if not isinstance(supplied, dict):
            raise HTTPException(400, f"invalid {name} configuration")
        previous = current.get(name) or {}
        item = {**previous, **supplied}
        item["auth_key_path"] = _secret(item.get("auth_key_path"), previous.get("auth_key_path"))
        try:
            mobile_apns.validate_provider_settings(item)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        body[name] = item


def update(body: dict) -> dict:
    if not isinstance(body, dict) or any(key not in CHANNELS for key in body):
        raise HTTPException(422, "unknown notification channel")
    current = cfg.get_settings()
    patch = {}
    for name, supplied in body.items():
        if not isinstance(supplied, dict) or not isinstance(supplied.get("enabled"), bool):
            raise HTTPException(422, "notification channel requires boolean enabled")
        previous = current.get(name) or {}
        if name == "email":
            try:
                patch[name] = notify_push.prepare_email(supplied, previous)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            continue
        if name == "onetools":
            public = str(supplied.get("public_base_url") or "").strip()
            if public:
                parsed = urlsplit(public)
                if parsed.scheme not in ("http", "https") or not parsed.hostname:
                    raise HTTPException(422, "public_base_url must be an absolute http or https URL")
                public = public.rstrip("/")
            item = dict(previous)
            item["enabled"] = supplied["enabled"]
            item["public_base_url"] = public
            patch[name] = item
            continue
        if name == "telegram" and supplied.get("base_url") and not (
                supplied["base_url"] == MASK and
                (current.get("telegram") or {}).get("base_url")):
            raise HTTPException(501, "custom Telegram API base URL is not supported")
        item = dict(previous)
        item["enabled"] = supplied["enabled"]
        if name in ("webhook", "wecom", "bark") and "urls" in supplied:
            urls = _restore_urls(supplied["urls"], previous)
            if name == "webhook":
                item["url"] = urls[0] if urls else ""
                item["urls"] = urls
            else:
                item["urls"] = urls
        fields = {
            "telegram": ("bot_token", "chat_id", "admin_id", "proxy"),
            "pushplus": ("token", "topic", "channel"),
            "webhook": ("secret", "timeout_ms"),
            "wecom": ("payload_template",),
            "bark": ("group", "icon", "level"),
        }.get(name, ())
        for field in fields:
            if field in supplied:
                target = "proxy_url" if field == "proxy" else field
                item[target] = _secret(supplied[field], previous.get(target))
        if name == "telegram" and item.get("proxy_url"):
            item["proxy_mode"] = "manual"
        if item["enabled"]:
            try:
                if name == "wecom":
                    notify_push.validate_wecom(item)
                elif name == "bark":
                    notify_push.validate_bark(item)
                elif name == "webhook":
                    sample = notify_push.build_payload(notify_push.EV_INCOMING_SMS,
                                                       {"id": "preview"}, "", "test")
                    targets = item.get("urls") or ([item["url"]] if item.get("url") else [])
                    if not targets:
                        raise ValueError("webhook URL is empty")
                    for target in targets:
                        notify_push.build_webhook_request({**item, "url": target}, sample)
                elif name == "telegram" and not (item.get("bot_token") and item.get("chat_id")):
                    raise ValueError("Telegram token and chat ID are required")
                elif name == "pushplus" and not item.get("token"):
                    raise ValueError("PushPlus token is required")
            except (ValueError, TypeError) as exc:
                raise HTTPException(422, str(exc)) from exc
        patch[name] = item
    if patch:
        cfg.update_settings(patch)
    return view({**current, **patch})


def test(name: str, body: dict) -> dict:
    senders = {"telegram": notify_push.send_telegram, "webhook": notify_push.send_webhook,
               "wecom": notify_push.send_wecom, "bark": notify_push.send_bark,
               "pushplus": notify_push.send_pushplus, "email": notify_push.send_email}
    if name not in senders:
        raise HTTPException(501, "notification test is not supported")
    if not isinstance(body, dict):
        raise HTTPException(422, "invalid notification test")
    # Apply the same masked-value restoration without persisting. A test only sends to the
    # named channel and uses MDD's standard payload, never the caller's arbitrary message.
    current = cfg.get_settings().get(name) or {}
    item = dict(current)
    if "urls" in body:
        urls = _restore_urls(body["urls"], current)
        if name == "webhook":
            if not urls:
                raise HTTPException(422, "exactly one webhook URL required")
            item["url"] = urls[0]
            item["urls"] = urls
        else:
            item["urls"] = urls
    for field, value in body.items():
        if field in ("urls", "enabled"):
            continue
        target = "proxy_url" if field == "proxy" else field
        item[target] = _secret(value, current.get(target))
    payload = notify_push.build_payload(notify_push.EV_INCOMING_SMS,
                                        {"id": "preview", "name": "SIM"}, "+10000000000", "test")
    try:
        if name == "bark":
            notify_push.validate_bark(item)
        elif name == "wecom":
            notify_push.validate_wecom(item)
        elif name == "webhook":
            targets = item.get("urls") or ([item["url"]] if item.get("url") else [])
            if not targets:
                raise ValueError("webhook URL is empty")
            for target in targets:
                notify_push.build_webhook_request({**item, "url": target}, payload)
        elif name == "telegram" and not (item.get("bot_token") and item.get("chat_id")):
            raise ValueError("Telegram token and chat ID are required")
        elif name == "pushplus" and not item.get("token"):
            raise ValueError("PushPlus token is required")
        return senders[name](item, payload)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError:
        raise HTTPException(502, "notification was not delivered")
