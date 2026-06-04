"""
Scraper — récupère le contenu d'une offre via Jina.ai (r.jina.ai/{url})
"""

import requests

# Constantes
JINA_BASE_URL = "https://r.jina.ai/"
REQUEST_TIMEOUT = 30
MIN_CONTENT_LENGTH = 200

# Phrases indiquant un mur de connexion — contenu inutilisable
LOGIN_WALL_SIGNALS = [
    "sign in to view",
    "log in to view",
    "create an account",
    "join to apply",
    "sign up to see",
    "please log in",
    "you must be logged in",
    "sign in with google",
    "create a free account",
]

# Plateformes connues pour bloquer les scrapers
SCRAPER_BLOCKED_PLATFORMS = {
    "Upwork": (
        "Upwork bloque les scrapers — la page nécessite une connexion.\n"
        "Copie-colle le texte de l'offre directement dans le Shortcut, "
        "ou utilise l'URL publique (upwork.com/jobs/~...)"
    ),
}

# Mapping URL → plateforme
PLATFORM_PATTERNS = {
    "linkedin.com": "LinkedIn",
    "upwork.com": "Upwork",
    "contra.com": "Contra",
    "malt.": "Malt",
    "toptal.com": "Toptal",
    "wellfound.com": "Wellfound",
    "arc.dev": "Arc",
    "freelancer.com": "Freelancer",
    "fiverr.com": "Fiverr",
}


def detect_platform(url: str) -> str:
    """Détecte la plateforme depuis l'URL."""
    url_lower = url.lower()
    for pattern, platform in PLATFORM_PATTERNS.items():
        if pattern in url_lower:
            return platform
    return "Other"


def scrape_job_offer(url: str) -> dict:
    """
    Récupère le contenu d'une offre via Jina.ai.
    Retourne un dict avec : raw_content, platform, source_url
    """
    platform = detect_platform(url)
    jina_url = f"{JINA_BASE_URL}{url}"

    print(f"[Scraper] Plateforme détectée : {platform}")
    print(f"[Scraper] Scraping via Jina.ai : {jina_url}")

    try:
        response = requests.get(
            jina_url,
            timeout=REQUEST_TIMEOUT,
            headers={"Accept": "text/plain"},
        )
        response.raise_for_status()
        content = response.text.strip()
    except requests.exceptions.Timeout:
        raise Exception(f"[Scraper] Timeout après {REQUEST_TIMEOUT}s — Jina.ai n'a pas répondu")
    except requests.exceptions.RequestException as e:
        raise Exception(f"[Scraper] Erreur réseau : {e}")

    if not content or len(content) < MIN_CONTENT_LENGTH:
        raise Exception(
            f"[Scraper] Contenu trop court ({len(content)} chars) — "
            f"page inaccessible ou contenu vide. URL : {url}"
        )

    # Détecter un mur de connexion dans le contenu
    content_lower = content.lower()
    for signal in LOGIN_WALL_SIGNALS:
        if signal in content_lower:
            hint = SCRAPER_BLOCKED_PLATFORMS.get(platform, "La page nécessite une connexion.")
            raise Exception(f"[Scraper] Mur de connexion détecté sur {platform}. {hint}")

    print(f"[Scraper] Contenu récupéré : {len(content)} caractères")

    return {
        "raw_content": content,
        "platform": platform,
        "source_url": url,
    }
