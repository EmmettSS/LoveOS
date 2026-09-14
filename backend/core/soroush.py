"""
core.soroush — کلاینت بات سروش‌پلاس
مطابق مستند رسمی: https://api.splus.ir/bot<token>/METHOD_NAME
پاسخ‌ها همیشه {"ok": bool, "result": ..., "description": ...} هستند.

Provider abstraction:
  * ConsoleProvider  → فقط لاگ می‌کند (حالت توسعه/سندباکس)
  * SoroushProvider  → ارسال واقعی با sendMessage / sendPhoto / sendVoice / ...
انتخاب با متغیر محیطی NOTIFY_PROVIDER انجام می‌شود.
"""
from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("loveos.soroush")


def _cfg(key: str, default: Any = "") -> Any:
    return settings.LOVEOS.get(key, default)


class BaseProvider:
    name = "base"

    def send_message(self, chat_id: str, text: str, **kwargs) -> dict:
        raise NotImplementedError

    def call(self, method: str, payload: dict | None = None, files: dict | None = None) -> dict:
        raise NotImplementedError


class ConsoleProvider(BaseProvider):
    """حالت توسعه: هیچ درخواستی به شبکه نمی‌زند، فقط لاگ می‌کند."""

    name = "console"

    def send_message(self, chat_id: str, text: str, **kwargs) -> dict:
        logger.info("[SOROUSH-CONSOLE] → %s: %s", chat_id or "(no chat_id)", text)
        return {"ok": True, "result": {"message_id": 0, "console": True, "text": text}}

    def call(self, method: str, payload: dict | None = None, files: dict | None = None) -> dict:
        logger.info("[SOROUSH-CONSOLE] %s %s", method, payload)
        return {"ok": True, "result": {"console": True, "method": method}}


class SoroushProvider(BaseProvider):
    """کلاینت واقعی بات سروش‌پلاس (سازگار با مستند رسمی)."""

    name = "soroush"

    def __init__(self, base: str | None = None, token: str | None = None, timeout: int = 20) -> None:
        self.base = (base or _cfg("SOROUSH_API_BASE", "https://api.splus.ir")).rstrip("/")
        self.token = token or _cfg("SOROUSH_TOKEN", "")
        self.timeout = timeout

    # ------------------------------------------------------------------ core
    @property
    def api_root(self) -> str:
        return f"{self.base}/bot{self.token}"

    def file_url(self, file_path: str) -> str:
        """آدرس دانلود فایل: https://api.splus.ir/file/bot<token>/<file_path>"""
        return f"{self.base}/file/bot{self.token}/{file_path.lstrip('/')}"

    def call(self, method: str, payload: dict | None = None, files: dict | None = None) -> dict:
        if not self.token:
            return {"ok": False, "description": "SOROUSH_TOKEN تنظیم نشده است"}
        url = f"{self.api_root}/{method}"
        try:
            if files:
                resp = requests.post(url, data=payload or {}, files=files, timeout=self.timeout)
            else:
                resp = requests.post(url, json=payload or {}, timeout=self.timeout)
            data = resp.json()
        except ValueError:
            return {"ok": False, "description": f"پاسخ نامعتبر (HTTP {resp.status_code})"}
        except requests.RequestException as exc:  # network error
            return {"ok": False, "description": str(exc)}
        return data

    # --------------------------------------------------------------- methods
    def get_me(self) -> dict:
        return self.call("getMe")

    def send_message(self, chat_id: str, text: str, **kwargs) -> dict:
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": kwargs.pop("parse_mode", _cfg("SOROUSH_PARSE_MODE", "HTML")),
        }
        if kwargs.get("reply_markup"):
            payload["reply_markup"] = kwargs["reply_markup"]
        if kwargs.get("reply_to_message_id"):
            payload["reply_to_message_id"] = kwargs["reply_to_message_id"]
        return self.call("sendMessage", payload)

    def send_photo(self, chat_id: str, file_obj, caption: str = "") -> dict:
        return self.call("sendPhoto", {"chat_id": chat_id, "caption": caption}, files={"photo": file_obj})

    def send_voice(self, chat_id: str, file_obj, caption: str = "") -> dict:
        return self.call("sendVoice", {"chat_id": chat_id, "caption": caption}, files={"voice": file_obj})

    def send_audio(self, chat_id: str, file_obj, caption: str = "") -> dict:
        return self.call("sendAudio", {"chat_id": chat_id, "caption": caption}, files={"audio": file_obj})

    def answer_callback(self, callback_query_id: str, text: str = "") -> dict:
        return self.call("answerCallbackQuery", {"callback_query_id": callback_query_id, "text": text})

    def set_webhook(self, url: str, drop_pending: bool = True) -> dict:
        return self.call("setWebhook", {"url": url, "drop_pending_updates": drop_pending})

    def delete_webhook(self) -> dict:
        return self.call("deleteWebhook", {"drop_pending_updates": True})

    def get_webhook_info(self) -> dict:
        return self.call("getWebhookInfo")

    def get_updates(self, offset: int | None = None, timeout: int = 0) -> dict:
        payload: dict = {"timeout": timeout}
        if offset is not None:
            payload["offset"] = offset
        return self.call("getUpdates", payload)

    def get_file(self, file_id: str) -> dict:
        return self.call("getFile", {"file_id": file_id})


def get_provider() -> BaseProvider:
    """پرووایدر فعال را بر اساس تنظیمات برمی‌گرداند."""
    kind = _cfg("NOTIFY_PROVIDER", "console")
    if kind == "soroush" and _cfg("SOROUSH_TOKEN"):
        return SoroushProvider()
    return ConsoleProvider()


# --------------------------------------------------------------- صف ارسال ---
def notify_daddy(event: str, text: str, chat_id: str | None = None) -> "object":
    """
    یک پیام در صندوق خروجی می‌گذارد و بلافاصله تلاش به ارسال می‌کند.
    اگر شبکه/توکن نبود، در صف می‌ماند و `manage.py sweep` دوباره تلاش می‌کند.
    """
    from core.models import SoroushOutbox  # local import to avoid cycles

    msg = SoroushOutbox.objects.create(
        event=event,
        text=text,
        chat_id=chat_id or _cfg("SOROUSH_DADDY_CHAT_ID", ""),
    )
    flush_one(msg)
    return msg


def flush_one(msg) -> bool:
    provider = get_provider()
    msg.tries += 1
    result = provider.send_message(msg.chat_id, msg.text)
    msg.response = result if isinstance(result, dict) else {}
    if result.get("ok"):
        msg.status = "sent"
        msg.sent_at = timezone.now()
        msg.last_error = ""
    else:
        msg.last_error = str(result.get("description", "unknown error"))
        if msg.tries >= _cfg("OUTBOX_MAX_RETRY", 5):
            msg.status = "failed"
    msg.save()
    return msg.status == "sent"


def flush_outbox(limit: int = 50) -> int:
    """صف را خالی می‌کند (برای cron / sweep)."""
    from core.models import SoroushOutbox

    sent = 0
    for msg in SoroushOutbox.objects.filter(status="pending")[:limit]:
        if flush_one(msg):
            sent += 1
    return sent
