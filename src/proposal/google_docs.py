"""
Google Docs — crée un document Google Doc formatté, prêt à envoyer
Contenu : proposal uniquement (pas de métadonnées internes)
"""

import os

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

DOC_URL_BASE = "https://docs.google.com/document/d/{doc_id}/edit"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

FONT = "Arial"
FONT_SIZE = 11
LINE_SPACING = 1.5
MARGIN = 72  # 1 inch in points
PARA_SPACE_AFTER = 12


def _get_credentials():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        raise Exception("[GoogleDocs] Credentials OAuth2 manquants.")

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri=GOOGLE_TOKEN_URI,
    )
    creds.refresh(Request())
    return creds


def _split_signature(text: str):
    """Sépare le corps de la signature (dernière ligne non vide)."""
    lines = text.rstrip().split("\n")
    # Cherche la dernière ligne non vide comme signature
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip():
            signature = lines[i].strip()
            body = "\n".join(lines[:i]).rstrip()
            return body, signature
    return text, ""


def create_proposal_doc(analysis: dict, proposal: str, source_url: str) -> str:
    """
    Crée un Google Doc contenant uniquement la proposal, formatté et prêt à envoyer.
    Retourne l'URL directe du document.
    """
    from datetime import date

    folder_id = os.environ.get("GOOGLE_PROPOSALS_FOLDER_ID")
    if not folder_id:
        raise Exception("[GoogleDocs] GOOGLE_PROPOSALS_FOLDER_ID manquant.")

    credentials = _get_credentials()
    docs_service = build("docs", "v1", credentials=credentials)
    drive_service = build("drive", "v3", credentials=credentials)

    today = date.today().strftime("%Y-%m-%d")
    job_title = analysis.get("job_title", "Unknown Role")
    company = analysis.get("company", "Unknown Company")
    doc_title = f"{job_title} — {company} — {today}"

    print(f"[GoogleDocs] Création du document : {doc_title}")

    # Créer le doc dans le dossier cible
    try:
        doc = drive_service.files().create(
            body={
                "name": doc_title,
                "mimeType": "application/vnd.google-apps.document",
                "parents": [folder_id],
            },
            fields="id",
        ).execute()
        doc_id = doc["id"].strip()
    except Exception as e:
        raise Exception(f"[GoogleDocs] Erreur création document : {e}")

    # Séparer corps et signature
    body_text, signature = _split_signature(proposal)

    # Construire le texte complet : corps + ligne vide + signature
    full_text = body_text + "\n\n" + signature + "\n"

    # Calculer les positions pour le styling
    body_end = len(body_text) + 1  # +1 pour l'index Google Docs (commence à 1)
    sig_start = body_end + 2       # après \n\n
    sig_end = sig_start + len(signature)

    requests = []

    # ── Insérer le texte complet ───────────────────────────────────────────────
    requests.append({
        "insertText": {
            "location": {"index": 1},
            "text": full_text,
        }
    })

    # ── Police et taille sur tout le doc ──────────────────────────────────────
    requests.append({
        "updateTextStyle": {
            "range": {"startIndex": 1, "endIndex": 1 + len(full_text)},
            "textStyle": {
                "weightedFontFamily": {"fontFamily": FONT},
                "fontSize": {"magnitude": FONT_SIZE, "unit": "PT"},
            },
            "fields": "weightedFontFamily,fontSize",
        }
    })

    # ── Interligne et espacement paragraphes sur tout le doc ──────────────────
    requests.append({
        "updateParagraphStyle": {
            "range": {"startIndex": 1, "endIndex": 1 + len(full_text)},
            "paragraphStyle": {
                "lineSpacing": LINE_SPACING * 100,
                "spaceAbove": {"magnitude": 0, "unit": "PT"},
                "spaceBelow": {"magnitude": PARA_SPACE_AFTER, "unit": "PT"},
            },
            "fields": "lineSpacing,spaceAbove,spaceBelow",
        }
    })

    # ── Marges du document ────────────────────────────────────────────────────
    requests.append({
        "updateDocumentStyle": {
            "documentStyle": {
                "marginTop":    {"magnitude": MARGIN, "unit": "PT"},
                "marginBottom": {"magnitude": MARGIN, "unit": "PT"},
                "marginLeft":   {"magnitude": MARGIN, "unit": "PT"},
                "marginRight":  {"magnitude": MARGIN, "unit": "PT"},
            },
            "fields": "marginTop,marginBottom,marginLeft,marginRight",
        }
    })

    # ── Signature en italique ─────────────────────────────────────────────────
    if signature and sig_start < sig_end:
        requests.append({
            "updateTextStyle": {
                "range": {"startIndex": sig_start, "endIndex": sig_end},
                "textStyle": {"italic": True},
                "fields": "italic",
            }
        })

    # Appliquer
    try:
        docs_service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": requests},
        ).execute()
    except Exception as e:
        raise Exception(f"[GoogleDocs] Erreur formatage document : {e}")

    doc_url = DOC_URL_BASE.format(doc_id=doc_id)
    print(f"[GoogleDocs] Document créé : {doc_url}")

    return doc_url
