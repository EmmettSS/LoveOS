"""
config.urls — نقشه‌ی آدرس‌های LoveOS
پنل بابا روی مسیر مخفی (ADMIN_PATH) قرار دارد.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.urls import path, re_path

from content import api as content_api
from core import api_auth
from core.webhook import soroush_webhook
from games import api as games_api
from health import api as health_api
from library import api as library_api
from social import api as social_api

admin.site.site_header = "پنل بابا — LoveOS"
admin.site.site_title = "LoveOS"
admin.site.index_title = "دنیای کوچیک ما"


def robots(_request):
    return HttpResponse("User-agent: *\nDisallow: /\n", content_type="text/plain")


def healthz(_request):
    return HttpResponse("ok")


urlpatterns = [
    path(f"{settings.ADMIN_PATH}/", admin.site.urls),
    path("robots.txt", robots),
    path("healthz", healthz),
    # ---------------------------------------------------------- auth/shell
    path("api/boot", api_auth.boot),
    path("api/auth/unlock", api_auth.unlock),
    path("api/auth/forgot", api_auth.forgot),
    path("api/auth/help", api_auth.ask_help),
    path("api/auth/logout", api_auth.logout),
    path("api/me", api_auth.me),
    path("api/settings", api_auth.update_settings),
    path("api/vault/unlock", api_auth.vault_unlock),
    # ------------------------------------------------------------- content
    path("api/voices", content_api.voices),
    path("api/voices/random", content_api.voice_random),
    path("api/voices/<int:pk>/played", content_api.voice_played),
    path("api/songs", content_api.songs),
    path("api/songs/upload", content_api.song_upload),
    path("api/songs/<int:pk>", content_api.song_delete),
    path("api/songs/<int:pk>/played", content_api.song_played),
    path("api/memories", content_api.memories),
    path("api/letters", content_api.letters),
    path("api/letters/random", content_api.letter_random),
    path("api/letters/<int:pk>/open", content_api.letter_open),
    path("api/countdowns", content_api.countdowns),
    path("api/garden", content_api.garden),
    path("api/garden/<int:pk>/water", content_api.garden_water),
    path("api/starmap", content_api.starmap),
    path("api/cinema", content_api.cinema),
    path("api/cinema/<int:pk>", content_api.cinema_item),
    path("api/quiz", content_api.quiz),
    path("api/quiz/submit", content_api.quiz_submit),
    path("api/plans", content_api.plans),
    path("api/plans/<int:pk>", content_api.plan_item),
    path("api/moods", content_api.moods),
    path("api/moods/set", content_api.mood_set),
    path("api/vault", content_api.vault),
    path("api/tutorial", content_api.tutorial),
    # -------------------------------------------------------------- social
    path("api/chat", social_api.chat),
    path("api/hug", social_api.hug_state),
    path("api/hug/send", social_api.hug_send),
    path("api/hug/<int:pk>/open", social_api.hug_open),
    path("api/notifications", social_api.notifications),
    path("api/notifications/read-all", social_api.notifications_read_all),
    path("api/notifications/<int:pk>/read", social_api.notification_read),
    path("api/reminders", social_api.reminders),
    path("api/reminders/<int:pk>/mute", social_api.reminder_mute),
    path("api/terminal", social_api.terminal),
    path("api/terminal/sudo", social_api.terminal_sudo),
    path("api/egg", social_api.easter_egg),
    path("api/achievements", social_api.achievements),
    path("api/weather", social_api.weather),
    path("api/map", social_api.map_data),
    # -------------------------------------------------------------- health
    path("api/cycle", health_api.cycle_overview),
    path("api/cycle/start", health_api.cycle_start),
    path("api/cycle/end", health_api.cycle_end),
    path("api/cycle/symptoms", health_api.symptoms),
    path("api/meds", health_api.medications),
    path("api/meds/today", health_api.medication_today),
    path("api/meds/act", health_api.medication_act),
    path("api/meds/report", health_api.medication_report),
    path("api/care", health_api.care_reminders),
    path("api/care/<int:pk>/toggle", health_api.care_toggle),
    # ------------------------------------------------------------- library
    path("api/books", library_api.books),
    path("api/books/<int:pk>", library_api.book_detail),
    path("api/books/<int:book_id>/chapters", library_api.chapter_create),
    path("api/chapters/<int:pk>/publish", library_api.chapter_publish),
    path("api/pages/<int:page_id>/paragraphs", library_api.paragraph_create),
    path("api/pages/<int:page_id>/bookmark", library_api.bookmark_toggle),
    path("api/paragraphs/<int:pk>", library_api.paragraph_item),
    path("api/paragraphs/<int:paragraph_id>/notes", library_api.note_create),
    # --------------------------------------------------------------- games
    path("api/puzzles", games_api.puzzles),
    path("api/puzzles/<int:pk>/start", games_api.puzzle_start),
    path("api/puzzles/<int:pk>/complete", games_api.puzzle_complete),
    # ------------------------------------------------------------- soroush
    path("api/soroush/webhook/<str:secret>/", soroush_webhook),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# ---------------------------------------------------------------------------
# حالت پروداکشن تک‌ورودی (cPanel/Passenger): جنگو خودش فرانت‌اند را سرو می‌کند.
# این بلوک باید همیشه آخرین چیز در فایل باشد، وگرنه الگوی catch-all پایانی
# مسیرهای /api/... و پنل ادمین را می‌بلعد.
# ---------------------------------------------------------------------------
if settings.SERVE_FRONTEND:
    from core import spa as spa_views

    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", spa_views.media_file),
        re_path(r"^static/(?P<path>.*)$", spa_views.static_file),
        re_path(r"^(?P<path>.*)$", spa_views.spa),
    ]
