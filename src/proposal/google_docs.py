"""
Google Docs — crée une lettre professionnelle formatée, prête à envoyer
Structure : en-tête Bastien / date / company / proposal / signature italique
"""

import os
from datetime import date

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

DOC_URL_BASE = "https://docs.google.com/document/d/{doc_id}/edit"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

FONT = "Arial"
FONT_SIZE = 11
LINE_SPACING = 1.5
MARGIN = 71  # ~2.5cm in points
PARA_SPACE_AFTER = 6

MONTHS_FR = [
    "", "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
]
MONTHS_ES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
]


def _format_date(language: str) -> str:
    today = date.today()
    if language == "fr":
        return f"{today.day} {MONTHS_FR[today.month]} {today.year}"
    elif language == "es":
        return f"{today.day} de {MONTHS_ES[today.month]} de {today.year}"
    else:
        return today.strftime("%B %-d, %Y")


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
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip():
            return "\n".join(lines[:i]).rstrip(), lines[i].strip()
    return text, ""


def _txt(requests, text, idx):
    """Insère du texte et retourne le nouvel index."""
    requests.append({"insertText": {"location": {"index": idx}, "text": text}})
    return idx + len(text)


def _style_text(requests, start, end, bold=False, italic=False, font_size=None):
    style = {}
    fields = []
    if bold is not None:
        style["bold"] = bold
        fields.append("bold")
    if italic:
        style["italic"] = True
        fields.append("italic")
    if font_size:
        style["fontSize"] = {"magnitude": font_size, "unit": "PT"}
        fields.append("fontSize")
    if style:
        requests.append({
            "updateTextStyle": {
                "range": {"startIndex": start, "endIndex": end},
                "textStyle": style,
                "fields": ",".join(fields),
            }
        })


def create_proposal_doc(analysis: dict, proposal: str, source_url: str) -> str:
    """
    Crée un Google Doc formatté comme une vraie lettre professionnelle.
    Structure : Bastien Joubert / date / company / proposal / signature italique.
    Retourne l'URL directe du document.
    """
    folder_id = os.environ.get("GOOGLE_PROPOSALS_FOLDER_ID")
    if not folder_id:
        raise Exception("[GoogleDocs] GOOGLE_PROPOSALS_FOLDER_ID manquant.")

    credentials = _get_credentials()
    docs_service = build("docs", "v1", credentials=credentials)
    drive_service = build("drive", "v3", credentials=credentials)

    today_str = date.today().strftime("%Y-%m-%d")
    job_title = analysis.get("job_title", "Unknown Role")
    company = analysis.get("company", "")
    language = analysis.get("language", "en")
    identity_mode = analysis.get("identity_mode", "freelance")

    # Signature selon identity_mode
    signature_text = "Bastien Joubert — ATELIER" if identity_mode == "freelance" else "Bastien Joubert"

    doc_title = f"{job_title} — {company or 'Unknown'} — {today_str}"
    print(f"[GoogleDocs] Création du document : {doc_title}")

    # Créer le doc
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

    # Séparer corps et signature Grok (on utilise la nôtre à la place)
    body_text, _ = _split_signature(proposal)

    # Construire le contenu bloc par bloc
    formatted_date = _format_date(language)

    # En-tête
    header = f"Bastien Joubert\n\n{formatted_date}\n"
    if company and company.lower() not in ("unknown", "unknown company"):
        header += f"\n{company}\n"
    header += "\n\n"

    # Signature finale
    sig = f"\n\n{signature_text}\n"

    full_text = header + body_text + sig

    requests = []
    idx = 1

    # ── Insérer tout le texte ─────────────────────────────────────────────────
    requests.append({"insertText": {"location": {"index": 1}, "text": full_text}})

    # ── Police + taille sur tout le doc ──────────────────────────────────────
    requests.append({
        "updateTextStyle": {
            "range": {"startIndex": 1, "endIndex": 1 + len(full_text)},
            "textStyle": {
                "weightedFontFamily": {"fontFamily": FONT},
                "fontSize": {"magnitude": FONT_SIZE, "unit": "PT"},
                "bold": False,
                "italic": False,
            },
            "fields": "weightedFontFamily,fontSize,bold,italic",
        }
    })

    # ── Interligne + espacement paragraphes ───────────────────────────────────
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

    # ── Marges ────────────────────────────────────────────────────────────────
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

    # ── "Bastien Joubert" en-tête en gras ─────────────────────────────────────
    name_end = 1 + len("Bastien Joubert")
    _style_text(requests, 1, name_end, bold=True)

    # ── Signature finale en italique ─────────────────────────────────────────
    sig_start = 1 + len(header) + len(body_text) + 2  # après \n\n
    sig_end = sig_start + len(signature_text)
    _style_text(requests, sig_start, sig_end, italic=True)

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
