"""
Webhook سروش‌پلاس
آدرس: /api/soroush/webhook/<SOROUSH_WEBHOOK_SECRET>/
سروش یک Update به صورت JSON با POST می‌فرستد؛ ما پیام بابا را در چت ذخیره می‌کنیم.
"""
import json

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from core.services import push_notification
from core.soroush import get_provider
from social.models import ChatMessage


@csrf_exempt
@require_POST
def soroush_webhook(request, secret: str):
    """دریافت Update از سروش‌پلاس (فقط با مسیر محرمانه‌ی درست)."""
    if secret != settings.LOVEOS["SOROUSH_WEBHOOK_SECRET"]:
        return JsonResponse({"ok": False}, status=404)
    try:
        update = json.loads(request.body.decode("utf-8") or "{}")
    except ValueError:
        return JsonResponse({"ok": False, "description": "bad json"}, status=400)

    message = update.get("message") or update.get("edited_message") or {}
    text = (message.get("text") or "").strip()
    chat_id = str((message.get("chat") or {}).get("id", ""))
    allowed = str(settings.LOVEOS["SOROUSH_DADDY_CHAT_ID"] or "")

    # فقط پیام‌های بابا (اگر chat_id تنظیم شده باشد)
    if allowed and chat_id != allowed:
        return JsonResponse({"ok": True, "ignored": True})

    if text:
        message_id = str(message.get("message_id", ""))
        duplicate = bool(
            message_id
            and ChatMessage.objects.filter(
                via="soroush", soroush_message_id=message_id
            ).exists()
        )
        if not duplicate:
            ChatMessage.objects.create(
                sender="daddy",
                text=text,
                via="soroush",
                soroush_message_id=message_id,
            )
            push_notification("chat", "پیام تازه از بابا 💬", text[:160], action_app="chat")

    callback = update.get("callback_query")
    if callback:
        get_provider().call("answerCallbackQuery", {"callback_query_id": callback.get("id"), "text": "ثبت شد ❤"})

    return JsonResponse({"ok": True})
