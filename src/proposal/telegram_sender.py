"""
Telegram Sender — envoie le résultat de la proposal via bot Telegram
"""

import os
import requests

# Constantes
TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"
PARSE_MODE = "HTML"


def _esc(text: str) -> str:
    """Échappe les caractères spéciaux HTML pour Telegram."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def send_proposal_notification(analysis: dict, google_doc_url: str, source_url: str = "") -> bool:
    """
    Envoie la notification Telegram avec fit analysis, apply decision et liens.
    Retourne True si succès, False sinon.
    """
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not bot_token:
        raise Exception("[Telegram] TELEGRAM_BOT_TOKEN manquant dans les variables d'environnement")
    if not chat_id:
        raise Exception("[Telegram] TELEGRAM_CHAT_ID manquant dans les variables d'environnement")

    job_title = _esc(analysis.get("job_title", "Unknown Role"))
    company = _esc(analysis.get("company", "Unknown Company"))
    platform = _esc(analysis.get("platform", "Other"))
    job_type = _esc(analysis.get("job_type", "freelance"))
    language = analysis.get("language", "en").upper()
    identity_mode = _esc(analysis.get("identity_mode", "atelier"))
    fit_bullets = analysis.get("fit_bullets", [])
    apply_decision = _esc(analysis.get("apply", "maybe"))
    apply_reason = _esc(analysis.get("apply_reason", ""))

    bullets_text = "\n".join(_esc(b) for b in fit_bullets)
    apply_line = f"💡 Apply: <b>{apply_decision}</b>"
    if apply_reason:
        apply_line += f" — {apply_reason}"

    doc_line = f'\n📄 <a href="{google_doc_url}">Ouvrir la proposal</a>' if google_doc_url else ""
    job_url_line = f'\n🔗 <a href="{source_url}">Voir l\'offre</a>' if source_url and source_url != "manual-input" else ""

    message = (
        f"🎯 <b>{job_title}</b> — {company}\n"
        f"📍 {platform} | {job_type} | {language}\n"
        f"🧠 Mode: {identity_mode}\n"
        f"\n"
        f"{bullets_text}\n"
        f"\n"
        f"{apply_line}"
        f"{doc_line}"
        f"{job_url_line}"
    )

    print(f"[Telegram] Envoi notification pour : {job_title} @ {company}")

    api_url = TELEGRAM_API_URL.format(token=bot_token)
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": PARSE_MODE,
        "disable_web_page_preview": True,
    }

    try:
        response = requests.post(api_url, json=payload, timeout=15)
        response.raise_for_status()
        result = response.json()

        if not result.get("ok"):
            raise Exception(f"[Telegram] API retourne ok=false : {result}")

        print(f"[Telegram] Notification envoyée avec succès (message_id: {result['result']['message_id']})")
        return True

    except requests.exceptions.RequestException as e:
        raise Exception(f"[Telegram] Erreur réseau : {e}")


def send_error_notification(error_message: str, source_url: str = "") -> bool:
    """
    Envoie une notification d'erreur en cas d'échec du pipeline.
    """
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not bot_token or not chat_id:
        print("[Telegram] Impossible d'envoyer l'erreur : tokens manquants")
        return False

    url_line = f"\n🔗 URL : <code>{_esc(source_url)}</code>" if source_url else ""
    message = (
        f"❌ <b>Erreur pipeline ATELIER Proposal</b>\n"
        f"{url_line}\n"
        f"\n"
        f"<code>{_esc(error_message[:1000])}</code>"
    )

    api_url = TELEGRAM_API_URL.format(token=bot_token)
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": PARSE_MODE,
    }

    try:
        response = requests.post(api_url, json=payload, timeout=15)
        response.raise_for_status()
        print("[Telegram] Notification d'erreur envoyée")
        return True
    except Exception as e:
        print(f"[Telegram] Impossible d'envoyer la notification d'erreur : {e}")
        return False
