"""
Sheets — write-back universel dans le Google Sheet atelier-jobs
- Si row_index fourni : met à jour la colonne J (Proposal) de la ligne existante
- Si pas de row_index : cherche l'URL en col H, met à jour si trouvé, crée une ligne sinon
"""

import os
from datetime import date

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"

# Colonnes : A=Job Title B=Description C=Company D=Platform E=Score
# F=Fit For The Role G=Status H=Job URL I=Date Posted J=Proposal K=Notes
COL_PROPOSAL = "J"
COL_DATE     = "I"
COL_NOTES    = "K"


def _get_credentials():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")

    if not client_id or not client_secret or not refresh_token:
        raise Exception("[Sheets] Credentials OAuth2 manquants")

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri=GOOGLE_TOKEN_URI,
    )
    creds.refresh(Request())
    return creds


def _get_service(creds):
    return build("sheets", "v4", credentials=creds)


def write_proposal_link(spreadsheet_id: str, row_index: int, doc_url: str) -> None:
    """Écrit le lien Google Doc dans la colonne J de la ligne donnée."""
    if not spreadsheet_id or not row_index:
        print("[Sheets] write-back ignoré : spreadsheet_id ou row_index manquant")
        return

    creds = _get_credentials()
    service = _get_service(creds)

    today = date.today().strftime("%Y-%m-%d")
    print(f"[Sheets] Mise à jour ligne {row_index} — Proposal + Date...")

    service.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "valueInputOption": "RAW",
            "data": [
                {"range": f"{COL_PROPOSAL}{row_index}", "values": [[doc_url]]},
                {"range": f"{COL_DATE}{row_index}",     "values": [[today]]},
            ],
        },
    ).execute()

    print(f"[Sheets] Lien écrit en J{row_index}")


def upsert_proposal_row(spreadsheet_id: str, analysis: dict, doc_url: str, source_url: str) -> None:
    """
    Write-back universel pour les proposals générées via Shortcut (sans row_index).
    - Cherche l'URL en colonne H
    - Si trouvée : met à jour J (Proposal) et I (Date)
    - Si non trouvée : crée une nouvelle ligne complète
    """
    if not spreadsheet_id:
        print("[Sheets] upsert ignoré : spreadsheet_id manquant")
        return

    creds = _get_credentials()
    service = _get_service(creds)

    today = date.today().strftime("%Y-%m-%d")

    # Lire toutes les URLs (colonne H)
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range="H2:H1000",
    ).execute()

    existing_urls = [row[0] if row else "" for row in result.get("values", [])]

    # Chercher si l'URL existe déjà
    if source_url and source_url != "manual-input":
        for i, url in enumerate(existing_urls):
            if url == source_url:
                row_index = i + 2  # +2 car on commence à H2
                print(f"[Sheets] URL trouvée en ligne {row_index} — mise à jour Proposal + Date")
                service.spreadsheets().values().batchUpdate(
                    spreadsheetId=spreadsheet_id,
                    body={
                        "valueInputOption": "RAW",
                        "data": [
                            {"range": f"{COL_PROPOSAL}{row_index}", "values": [[doc_url]]},
                            {"range": f"{COL_DATE}{row_index}",     "values": [[today]]},
                        ],
                    },
                ).execute()
                print(f"[Sheets] Mise à jour effectuée en ligne {row_index}")
                return

    # URL non trouvée — créer une nouvelle ligne
    print("[Sheets] URL non trouvée — création d'une nouvelle ligne...")

    job_title  = analysis.get("job_title", "")
    company    = analysis.get("company", "")
    platform   = analysis.get("platform", "Manual")
    score      = analysis.get("score", "")
    fit        = "\n".join(analysis.get("fit_bullets", []))
    url        = source_url if source_url != "manual-input" else ""

    new_row = [
        job_title,   # A - Job Title
        "",          # B - Description
        company,     # C - Company
        platform,    # D - Platform
        score,       # E - Score
        fit,         # F - Fit For The Role
        "to_apply",  # G - Status
        url,         # H - Job URL
        today,       # I - Date Posted
        doc_url,     # J - Proposal
        "",          # K - Notes
    ]

    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range="A:K",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [new_row]},
    ).execute()

    print(f"[Sheets] Nouvelle ligne créée : {job_title} — {company}")
