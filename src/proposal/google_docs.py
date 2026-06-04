"""
Google Docs — crée et formate un document Google Doc via OAuth2 (compte utilisateur)
"""

import os
from datetime import date

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

DOC_URL_BASE = "https://docs.google.com/document/d/{doc_id}/edit"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


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


def _insert_text(requests, text, index):
    """Ajoute une action insertText et retourne le nouvel index."""
    requests.append({
        "insertText": {
            "location": {"index": index},
            "text": text,
        }
    })
    return index + len(text)


def _style_range(requests, start, end, bold=False, font_size=None, named_style=None, color=None):
    """Applique un style sur un range de texte."""
    if named_style:
        requests.append({
            "updateParagraphStyle": {
                "range": {"startIndex": start, "endIndex": end},
                "paragraphStyle": {"namedStyleType": named_style},
                "fields": "namedStyleType",
            }
        })

    text_style = {}
    fields = []

    if bold is not None:
        text_style["bold"] = bold
        fields.append("bold")
    if font_size:
        text_style["fontSize"] = {"magnitude": font_size, "unit": "PT"}
        fields.append("fontSize")
    if color:
        text_style["foregroundColor"] = {"color": {"rgbColor": color}}
        fields.append("foregroundColor")

    if text_style:
        requests.append({
            "updateTextStyle": {
                "range": {"startIndex": start, "endIndex": end},
                "textStyle": text_style,
                "fields": ",".join(fields),
            }
        })


def create_proposal_doc(analysis: dict, proposal: str, source_url: str) -> str:
    """
    Crée un Google Doc formatté dans le dossier ATELIER Proposals.
    Structure : titre, métadonnées, fit analysis, proposal prête à envoyer.
    Retourne l'URL directe du document.
    """
    folder_id = os.environ.get("GOOGLE_PROPOSALS_FOLDER_ID")
    if not folder_id:
        raise Exception("[GoogleDocs] GOOGLE_PROPOSALS_FOLDER_ID manquant.")

    credentials = _get_credentials()
    docs_service = build("docs", "v1", credentials=credentials)
    drive_service = build("drive", "v3", credentials=credentials)

    today = date.today().strftime("%Y-%m-%d")
    job_title = analysis.get("job_title", "Unknown Role")
    company = analysis.get("company", "Unknown Company")
    platform = analysis.get("platform", "Other")
    job_type = analysis.get("job_type", "freelance")
    identity_mode = analysis.get("identity_mode", "freelance")
    summary = analysis.get("summary", "")
    fit_bullets = analysis.get("fit_bullets", [])
    apply_decision = analysis.get("apply", "maybe")
    apply_reason = analysis.get("apply_reason", "")

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

    # Construire le contenu par blocs avec tracking des positions
    requests = []
    idx = 1  # Google Docs index starts at 1

    # ── Titre ─────────────────────────────────────────────────────────────────
    title = f"{job_title} — {company}\n"
    title_start = idx
    idx = _insert_text(requests, title, idx)
    _style_range(requests, title_start, idx - 1, named_style="HEADING_1")

    # ── Métadonnées ───────────────────────────────────────────────────────────
    meta = f"{platform} · {job_type} · {identity_mode} · {today}\n"
    if source_url and source_url != "manual-input":
        meta += f"{source_url}\n"
    meta += "\n"
    meta_start = idx
    idx = _insert_text(requests, meta, idx)
    _style_range(requests, meta_start, idx - 1, bold=False, font_size=9,
                 color={"red": 0.5, "green": 0.5, "blue": 0.5})

    # ── Summary ───────────────────────────────────────────────────────────────
    if summary:
        section_start = idx
        idx = _insert_text(requests, "SUMMARY\n", idx)
        _style_range(requests, section_start, idx - 1, named_style="HEADING_3")

        sum_start = idx
        idx = _insert_text(requests, f"{summary}\n\n", idx)
        _style_range(requests, sum_start, idx - 1, bold=False, font_size=10)

    # ── Fit Analysis ──────────────────────────────────────────────────────────
    if fit_bullets:
        section_start = idx
        idx = _insert_text(requests, "FIT ANALYSIS\n", idx)
        _style_range(requests, section_start, idx - 1, named_style="HEADING_3")

        for bullet in fit_bullets:
            b_start = idx
            idx = _insert_text(requests, f"{bullet}\n", idx)
            _style_range(requests, b_start, idx - 1, bold=False, font_size=10)

        idx = _insert_text(requests, "\n", idx)

    # ── Apply decision ────────────────────────────────────────────────────────
    apply_line = f"Apply: {apply_decision}"
    if apply_reason:
        apply_line += f" — {apply_reason}"
    apply_line += "\n\n"
    apply_start = idx
    idx = _insert_text(requests, apply_line, idx)
    _style_range(requests, apply_start, idx - 1, bold=True, font_size=10)

    # ── Séparateur ────────────────────────────────────────────────────────────
    sep_start = idx
    idx = _insert_text(requests, "─" * 40 + "\n\n", idx)
    _style_range(requests, sep_start, idx - 1, bold=False, font_size=9,
                 color={"red": 0.7, "green": 0.7, "blue": 0.7})

    # ── Proposal ──────────────────────────────────────────────────────────────
    section_start = idx
    idx = _insert_text(requests, "PROPOSAL\n", idx)
    _style_range(requests, section_start, idx - 1, named_style="HEADING_3")

    prop_start = idx
    idx = _insert_text(requests, f"{proposal}\n", idx)
    _style_range(requests, prop_start, idx - 1, bold=False, font_size=11)

    # Appliquer tous les changements en une seule requête
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
