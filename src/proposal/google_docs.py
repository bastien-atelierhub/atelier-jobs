"""
Google Docs — crée et remplit un document Google Doc via OAuth2 (compte utilisateur)
"""

import os
from datetime import date

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Constantes
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]
DOC_URL_BASE = "https://docs.google.com/document/d/{doc_id}/edit"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _get_credentials():
    """
    Construit les credentials OAuth2 depuis les variables d'environnement.
    Nécessite : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
    Générer ces valeurs une seule fois avec : python scripts/auth_google.py
    """
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        raise Exception(
            "[GoogleDocs] Credentials OAuth2 manquants. "
            "Lancer : python scripts/auth_google.py <client_id> <client_secret>"
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri=GOOGLE_TOKEN_URI,
    )

    # Rafraîchir le token d'accès automatiquement
    creds.refresh(Request())
    return creds


def _build_doc_content(analysis: dict, proposal: str, source_url: str) -> str:
    """Construit le contenu texte du document."""
    today = date.today().strftime("%Y-%m-%d")
    platform = analysis.get("platform", "Other")
    company = analysis.get("company", "Unknown Company")
    job_title = analysis.get("job_title", "Unknown Role")
    fit_bullets = analysis.get("fit_bullets", [])
    summary = analysis.get("summary", "")

    bullets_text = "\n".join(fit_bullets)

    return f"""OFFER DETAILS
Platform: {platform}
Company: {company}
Role: {job_title}
Date: {today}
URL: {source_url}

SUMMARY
{summary}

FIT ANALYSIS
{bullets_text}

PROPOSAL
{proposal}"""


def create_proposal_doc(analysis: dict, proposal: str, source_url: str) -> str:
    """
    Crée un Google Doc dans le dossier ATELIER Proposals.
    Retourne l'URL directe du document.
    """
    folder_id = os.environ.get("GOOGLE_PROPOSALS_FOLDER_ID")
    if not folder_id:
        raise Exception("[GoogleDocs] GOOGLE_PROPOSALS_FOLDER_ID manquant dans les variables d'environnement")

    credentials = _get_credentials()
    docs_service = build("docs", "v1", credentials=credentials)
    drive_service = build("drive", "v3", credentials=credentials)

    today = date.today().strftime("%Y-%m-%d")
    job_title = analysis.get("job_title", "Unknown Role")
    company = analysis.get("company", "Unknown Company")
    doc_title = f"Proposal - {job_title} - {company} - {today}"

    print(f"[GoogleDocs] Création du document : {doc_title}")

    # Création du doc directement dans le dossier cible
    try:
        file_metadata = {
            "name": doc_title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [folder_id],
        }
        doc = drive_service.files().create(body=file_metadata, fields="id").execute()
        doc_id = doc["id"].strip()
    except Exception as e:
        raise Exception(f"[GoogleDocs] Erreur création document : {e}")

    # Insertion du contenu
    content = _build_doc_content(analysis, proposal, source_url)
    try:
        docs_service.documents().batchUpdate(
            documentId=doc_id,
            body={
                "requests": [
                    {
                        "insertText": {
                            "location": {"index": 1},
                            "text": content,
                        }
                    }
                ]
            },
        ).execute()
    except Exception as e:
        raise Exception(f"[GoogleDocs] Erreur insertion contenu : {e}")

    doc_url = DOC_URL_BASE.format(doc_id=doc_id)
    print(f"[GoogleDocs] Document créé : {doc_url}")

    return doc_url
