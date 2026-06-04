"""
Main — orchestrateur du pipeline ATELIER Proposal v2
Usage : python proposal/main.py <url_ou_texte_brut>
"""

import os
import re
import sys

from scraper import scrape_job_offer
from analyzer import analyze_job_offer
from proposal_generator import generate_proposal
from google_docs import create_proposal_doc
from sheets import write_proposal_link
from telegram_sender import send_proposal_notification, send_error_notification

PROFILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "profile.md")



def _load_profile() -> str:
    """Charge le profil Bastien depuis data/profile.md."""
    try:
        with open(PROFILE_PATH, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        print(f"[ATELIER Proposal] Attention : profile.md introuvable à {PROFILE_PATH}")
        return ""


def run(raw_input: str) -> None:
    """Exécute le pipeline complet : scrape/texte -> analyse -> proposal -> doc -> telegram."""
    print(f"\n{'='*60}")
    print(f"[ATELIER Proposal] Démarrage pipeline v2")

    # Charger le profil
    profile_md = _load_profile()
    print(f"[ATELIER Proposal] Profil chargé : {len(profile_md)} chars")

    # Détecter si l'input est une URL ou du texte brut
    url_match = re.search(r'https?://[^\s]+', raw_input)

    if url_match:
        source_url = url_match.group(0).rstrip('/')
        print(f"[ATELIER Proposal] Mode : URL → {source_url}")
        print(f"{'='*60}\n")

        print("[Pipeline] Étape 1/5 : Scraping de l'offre...")
        scraped = scrape_job_offer(source_url)
        print("[Pipeline] Scraping terminé.\n")
    else:
        source_url = "manual-input"
        print(f"[ATELIER Proposal] Mode : Texte brut ({len(raw_input)} chars)")
        print(f"{'='*60}\n")

        print("[Pipeline] Étape 1/5 : Texte brut reçu — scraping ignoré.")
        scraped = {
            "raw_content": raw_input,
            "platform": "Other",
            "source_url": "manual-input",
        }
        print("[Pipeline] Contenu prêt.\n")

    raw_content = scraped.get("raw_content", "")

    identity_mode = os.environ.get("IDENTITY_MODE", "").strip() or None

    print("[Pipeline] Étape 2/5 : Analyse via DeepSeek...")
    analysis = analyze_job_offer(scraped, profile_md_content=profile_md, identity_mode=identity_mode)
    print("[Pipeline] Analyse terminée.\n")

    print("[Pipeline] Étape 3/5 : Génération de la proposal via Grok...")
    proposal = generate_proposal(analysis, raw_content, profile_md_content=profile_md)
    print("[Pipeline] Proposal générée.\n")

    print("[Pipeline] Étape 4/5 : Création du Google Doc...")
    google_doc_url = create_proposal_doc(analysis, proposal, source_url)
    print("[Pipeline] Google Doc créé.\n")

    # Write-back du lien doc dans le Google Sheet (optionnel)
    row_index_str = os.environ.get("GOOGLE_SHEET_ROW_INDEX", "").strip()
    spreadsheet_id = os.environ.get("GOOGLE_SPREADSHEET_ID", "").strip()
    if row_index_str and spreadsheet_id:
        try:
            write_proposal_link(spreadsheet_id, int(row_index_str), google_doc_url)
        except Exception as e:
            print(f"[Pipeline] Write-back Sheet ignoré : {e}")

    print("[Pipeline] Étape 5/5 : Envoi notification Telegram...")
    send_proposal_notification(analysis, google_doc_url, source_url)
    print("[Pipeline] Notification envoyée.\n")

    print(f"{'='*60}")
    print(f"[ATELIER Proposal] Pipeline terminé avec succès")
    print(f"[ATELIER Proposal] Rôle : {analysis.get('job_title')} @ {analysis.get('company')}")
    print(f"[ATELIER Proposal] Apply : {analysis.get('apply')} | Mode : {analysis.get('identity_mode')}")
    print(f"[ATELIER Proposal] Doc : {google_doc_url}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[ATELIER Proposal] Erreur : input manquant")
        print("Usage : python scripts/main.py <url_ou_texte_brut>")
        sys.exit(1)

    raw_input = sys.argv[1].strip()

    if not raw_input:
        print("[ATELIER Proposal] Erreur : input vide")
        sys.exit(1)

    source_ref = re.search(r'https?://[^\s]+', raw_input)
    error_url = source_ref.group(0) if source_ref else "manual-input"

    try:
        run(raw_input)
    except Exception as e:
        error_msg = str(e)
        print(f"\n[ATELIER Proposal] ERREUR CRITIQUE : {error_msg}")
        send_error_notification(error_msg, error_url)
        sys.exit(1)
