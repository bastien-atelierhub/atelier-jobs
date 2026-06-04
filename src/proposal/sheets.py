"""
Sheets — write-back du lien Google Doc dans la colonne J du Sheet atelier-jobs
"""

import os

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


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


def write_proposal_link(spreadsheet_id: str, row_index: int, doc_url: str) -> None:
    """Écrit le lien Google Doc dans la colonne J (Proposal) de la ligne donnée."""
    if not spreadsheet_id or not row_index:
        print("[Sheets] write-back ignoré : spreadsheet_id ou row_index manquant")
        return

    creds = _get_credentials()
    service = build("sheets", "v4", credentials=creds)

    range_notation = f"J{row_index}"
    print(f"[Sheets] Écriture du lien proposal dans {range_notation}...")

    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_notation,
        valueInputOption="RAW",
        body={"values": [[doc_url]]},
    ).execute()

    print(f"[Sheets] Lien écrit : {doc_url}")
