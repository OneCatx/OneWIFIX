"""Pick a verification code out of an inbound SMS, the way Bark expects one."""

from __future__ import annotations

import re

_KEYWORDS = (
    "验证码", "校验码", "检验码", "确认码", "激活码", "动态码", "动态密码",
    "短信密码", "随机码", "授权码", "登录码", "取件码",
)
_ENGLISH = re.compile(
    r"(?i)\b(?:verification code|verify code|security code|one-time|otp|code|pin)\b")
_TOKEN = re.compile(r"[^A-Za-z0-9]([A-Za-z0-9]{4,8})[^A-Za-z0-9]")
_BRACKET = re.compile(r"【[^】]*】")
_SEPARATORS = set("-/:.")


def extract_verification_code(body: str) -> str:
    text = str(body or "").strip()
    if not text:
        return ""
    keywords = _keyword_spans(text)
    if not keywords:
        return ""
    brackets = [(match.start(), match.end()) for match in _BRACKET.finditer(text)]
    best, best_gap, best_after = "", 1 << 30, False
    for match in _TOKEN.finditer(f" {text} "):
        start, end = match.start(1) - 1, match.end(1) - 1
        if not _candidate(text, start, end) or _inside(brackets, start):
            continue
        value = text[start:end]
        for keyword_start, keyword_end in keywords:
            gap, after = _gap(start, end, keyword_start, keyword_end)
            if gap > 50:
                continue
            if gap < best_gap or (gap == best_gap and after and not best_after):
                best, best_gap, best_after = value, gap, after
    return best


def _keyword_spans(body: str) -> list[tuple[int, int]]:
    spans = []
    for keyword in _KEYWORDS:
        start = 0
        while True:
            at = body.find(keyword, start)
            if at < 0:
                break
            spans.append((at, at + len(keyword)))
            start = at + len(keyword)
    spans.extend((match.start(), match.end()) for match in _ENGLISH.finditer(body))
    return spans


def _gap(start: int, end: int, keyword_start: int, keyword_end: int) -> tuple[int, bool]:
    if start >= keyword_end:
        return start - keyword_end, True
    if keyword_start >= end:
        return keyword_start - end, False
    return 0, True


def _inside(brackets: list[tuple[int, int]], start: int) -> bool:
    return any(start >= left and start < right for left, right in brackets)


def _candidate(body: str, start: int, end: int) -> bool:
    value = body[start:end]
    if not any(character.isdigit() for character in value):
        return False
    if not value.isalnum():
        return False
    return not _separated_number(body, start, end)


def _separated_number(body: str, start: int, end: int) -> bool:
    if (start > 1 and body[start - 1] in _SEPARATORS and body[start - 2].isdigit()):
        return True
    return end + 1 < len(body) and body[end] in _SEPARATORS and body[end + 1].isdigit()
