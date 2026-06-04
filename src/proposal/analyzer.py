"""
Analyzer — analyse une offre via DeepSeek et retourne un JSON structuré
"""

import json
import os
import re
from openai import OpenAI

# Constantes
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-chat"
MAX_TOKENS = 1500
TEMPERATURE = 0.3

SYSTEM_PROMPT = """You are an expert at analyzing job offers for Bastien Joubert, founder of ATELIER studio.
Analyze the job offer and return ONLY a valid JSON with this exact structure:

{
  "fit_bullets": [
    "✅ <specific positive — reference actual skills or experience from the offer>",
    "✅ <specific positive>",
    "⚠️ <genuine uncertainty or partial match>",
    "❌ <honest red flag or missing requirement>"
  ],
  "job_type": "<freelance|contract|permanent>",
  "role_type": "<brand_strategy|ai_automation|web_dev|content|product|consulting|other>",
  "platform": "<Upwork|LinkedIn|Contra|Other>",
  "company": "<company name or Unknown>",
  "job_title": "<job title>",
  "summary": "<1 sentence: what they specifically need — be concrete, not generic>",
  "language": "<fr|en|es|it>",
  "identity_mode": "<atelier|bastien_contract|bastien_permanent>",
  "key_requirements": ["<req1>", "<req2>", "<req3>"],
  "relevant_proof_points": ["<which of Bastien's experiences are most relevant and why>"],
  "budget_signal": "<premium|mid|low|unknown>",
  "apply": "<yes|maybe|no>",
  "apply_reason": "<one sentence honest reason>"
}

For "identity_mode":
- "atelier" → Upwork, Contra, freelance platforms, or clear project/mission posts
- "bastien_contract" → LinkedIn contract/temp/project roles inside a company
- "bastien_permanent" → LinkedIn permanent employment offers

For "relevant_proof_points": don't just list them — explain which experience maps to what they need.
Example: "Swapfiets solo launch → they need someone who can execute independently without a team"

For "language": detect the primary language of the job offer (title + description).
Return "fr" for French, "en" for English, "es" for Spanish, "it" for Italian.
Default to "en" if language cannot be determined or is another language.
Note: Bastien speaks Spanish fluently (10 years in Latin America). Spanish proposals
are generated at the same standard as English — full confidence, no simplification.

Return ONLY the JSON object, no markdown, no explanation."""


def analyze_job_offer(scraped_data: dict, profile_md_content: str = "") -> dict:
    """
    Envoie le contenu brut à DeepSeek pour analyse structurée.
    Retourne le JSON parsé avec fit_bullets, metadata, apply decision et langue.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise Exception("[Analyzer] DEEPSEEK_API_KEY manquant dans les variables d'environnement")

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)

    raw_content = scraped_data.get("raw_content", "")
    platform_detected = scraped_data.get("platform", "Other")

    profile_section = f"\nBastien's profile for context:\n{profile_md_content}" if profile_md_content else ""

    user_message = f"""Platform: {platform_detected}
URL: {scraped_data.get("source_url", "")}

Job offer:
{raw_content[:8000]}{profile_section}"""

    print(f"[Analyzer] Envoi à DeepSeek ({len(raw_content)} chars de contenu)...")

    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )
    except Exception as e:
        raise Exception(f"[Analyzer] Erreur API DeepSeek : {e}")

    raw_response = response.choices[0].message.content.strip()
    print(f"[Analyzer] Réponse reçue : {raw_response[:200]}...")

    # Nettoyage au cas où le modèle ajoute du markdown
    if raw_response.startswith("```"):
        lines = raw_response.split("\n")
        raw_response = "\n".join(lines[1:-1])

    # Extraire le premier objet JSON de la réponse (robuste aux textes avant/après)
    json_match = re.search(r'\{[\s\S]*\}', raw_response)
    if json_match:
        raw_response = json_match.group(0)

    try:
        analysis = json.loads(raw_response)
    except json.JSONDecodeError as e:
        # Tentative de réparation : tronquer après la dernière virgule valide
        # pour gérer les guillemets non échappés dans les strings longues
        try:
            import json5
            analysis = json5.loads(raw_response)
        except Exception:
            raise Exception(f"[Analyzer] JSON invalide retourné par DeepSeek : {e}\nRéponse : {raw_response}")

    # Valeurs par défaut si champs manquants
    analysis.setdefault("fit_bullets", [])
    analysis.setdefault("job_type", "freelance")
    analysis.setdefault("role_type", "other")
    analysis.setdefault("platform", platform_detected)
    analysis.setdefault("company", "Unknown Company")
    analysis.setdefault("job_title", "Unknown Role")
    analysis.setdefault("summary", "")
    analysis.setdefault("language", "en")
    analysis.setdefault("identity_mode", "atelier")
    analysis.setdefault("key_requirements", [])
    analysis.setdefault("relevant_proof_points", [])
    analysis.setdefault("budget_signal", "unknown")
    analysis.setdefault("apply", "maybe")
    analysis.setdefault("apply_reason", "")

    # Normaliser la langue
    if analysis["language"] not in ("fr", "en", "es", "it"):
        analysis["language"] = "en"

    print(f"[Analyzer] {analysis['job_title']} @ {analysis['company']} | Apply: {analysis['apply']} | Lang: {analysis['language']}")

    return analysis
