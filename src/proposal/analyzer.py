"""
Analyzer — analyse une offre via DeepSeek et retourne un JSON structuré
"""

import json
import os
import re
from openai import OpenAI

DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-chat"
MAX_TOKENS = 1500
TEMPERATURE = 0.3


def _build_system_prompt(profile_md_content: str) -> str:
    profile_section = f"\n\nBastien's full profile — use this as the primary reference for all decisions:\n{profile_md_content}" if profile_md_content else ""
    return f"""You are an expert at analyzing job offers for Bastien Joubert, founder of ATELIER studio.
Your role is to produce a structured analysis that will be used to generate a personalized proposal.
All decisions — proof point selection, fit assessment, identity mode — must be grounded in Bastien's actual profile below, not in generic assumptions.{profile_section}

---

Analyze the job offer and return ONLY a valid JSON with this exact structure:

{{
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
  "identity_mode": "<freelance|permanent>",
  "key_requirements": ["<req1>", "<req2>", "<req3>"],
  "relevant_proof_points": ["<which of Bastien's experiences are most relevant and why>"],
  "budget_signal": "<premium|mid|low|unknown>",
  "apply": "<yes|maybe|no>",
  "apply_reason": "<one sentence honest reason>"
}}

Rules:

For "identity_mode":
- "freelance" → Upwork, Contra, freelance platforms, project/mission posts, LinkedIn contract roles
- "permanent" → LinkedIn permanent employment offers, CDI, full-time roles

For "relevant_proof_points":
- Select from Bastien's actual profile above — do not invent or generalize
- Explain which specific experience maps to what this offer needs
- Example: "Swapfiets solo launch → they need someone who can execute independently without a team"
- 2–3 maximum. Quality over quantity.
- If budget_signal is "low" and platform is "Upwork", always add this proof point:
  "Geographic positioning — French in Paraguay, LLC in the US, senior profile at entry-level cost. Mention explicitly in the proposal."

For "language": detect the primary language of the job offer (title + description).
Return "fr" for French, "en" for English, "es" for Spanish, "it" for Italian.
Default to "en" if language cannot be determined or is another language.

Return ONLY the JSON object, no markdown, no explanation."""


def analyze_job_offer(scraped_data: dict, profile_md_content: str = "", identity_mode: str = None) -> dict:
    """
    Envoie le contenu brut à DeepSeek pour analyse structurée.
    Le profil complet est injecté dans le system prompt pour un meilleur ancrage.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise Exception("[Analyzer] DEEPSEEK_API_KEY manquant dans les variables d'environnement")

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)

    raw_content = scraped_data.get("raw_content", "")
    platform_detected = scraped_data.get("platform", "Other")

    identity_section = f"\nForced identity_mode: {identity_mode} — override inference, use this value." if identity_mode else ""

    user_message = f"""Platform: {platform_detected}
URL: {scraped_data.get("source_url", "")}
{identity_section}
Job offer:
{raw_content[:8000]}"""

    print(f"[Analyzer] Envoi à DeepSeek ({len(raw_content)} chars de contenu)...")

    system_prompt = _build_system_prompt(profile_md_content)

    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )
    except Exception as e:
        raise Exception(f"[Analyzer] Erreur API DeepSeek : {e}")

    raw_response = response.choices[0].message.content.strip()
    print(f"[Analyzer] Réponse reçue : {raw_response[:200]}...")

    # Nettoyage markdown
    if raw_response.startswith("```"):
        lines = raw_response.split("\n")
        raw_response = "\n".join(lines[1:-1])

    # Extraire le premier objet JSON
    json_match = re.search(r'\{[\s\S]*\}', raw_response)
    if json_match:
        raw_response = json_match.group(0)

    try:
        analysis = json.loads(raw_response)
    except json.JSONDecodeError as e:
        try:
            import json5
            analysis = json5.loads(raw_response)
        except Exception:
            raise Exception(f"[Analyzer] JSON invalide retourné par DeepSeek : {e}\nRéponse : {raw_response}")

    # Valeurs par défaut
    analysis.setdefault("fit_bullets", [])
    analysis.setdefault("job_type", "freelance")
    analysis.setdefault("role_type", "other")
    analysis.setdefault("platform", platform_detected)
    analysis.setdefault("company", "Unknown Company")
    analysis.setdefault("job_title", "Unknown Role")
    analysis.setdefault("summary", "")
    analysis.setdefault("language", "en")
    analysis.setdefault("identity_mode", "freelance")
    analysis.setdefault("key_requirements", [])
    analysis.setdefault("relevant_proof_points", [])
    analysis.setdefault("budget_signal", "unknown")
    analysis.setdefault("apply", "maybe")
    analysis.setdefault("apply_reason", "")

    # Normaliser la langue
    if analysis["language"] not in ("fr", "en", "es", "it"):
        analysis["language"] = "en"

    # Normaliser identity_mode (compatibilité ancienne nomenclature)
    mode = analysis["identity_mode"]
    if mode in ("atelier", "bastien_contract"):
        analysis["identity_mode"] = "freelance"
    elif mode == "bastien_permanent":
        analysis["identity_mode"] = "permanent"

    print(f"[Analyzer] {analysis['job_title']} @ {analysis['company']} | Apply: {analysis['apply']} | Lang: {analysis['language']} | Mode: {analysis['identity_mode']}")

    return analysis
