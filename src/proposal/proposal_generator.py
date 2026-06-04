"""
Proposal Generator v2 — génère la proposal dynamiquement via Claude
"""

import os
import openai

# Constantes
GROK_MODEL = "grok-4.3"
GROK_BASE_URL = "https://api.x.ai/v1"
# ANTHROPIC_MODEL = "claude-sonnet-4-6"  # kept for easy rollback
MAX_TOKENS = 1024
TEMPERATURE = 1.0  # Anthropic API uses default temperature

FORBIDDEN_WORDS = [
    "passionate", "leverage", "end-to-end solutions", "reach out", "synergies",
    "journey", "excited to", "love to", "help you achieve", "full potential",
    "innovative solutions", "cutting-edge", "we'd love to",
]

SYSTEM_PROMPT = """You are writing a job application or proposal on behalf of Bastien Joubert.
Your output will be sent directly — no human editing. Get it right.

CRITICAL RULES:
1. Write in the language specified. If "fr", write entirely in French. If "es", entirely in Spanish. Etc.
   Spanish is a full working language for Bastien (10 years in Latin America). Write Spanish proposals
   with the same confidence and precision as English. Do not simplify or soften for Spanish.

2. Match the identity mode:
   - "atelier": Present as ATELIER studio. Sign as "Bastien Joubert — ATELIER"
   - "bastien_contract": Present as Bastien Joubert, senior professional. Mention ATELIER as current practice only if it strengthens the case. Sign as "Bastien Joubert"
   - "bastien_permanent": Present as Bastien Joubert. ATELIER is proof of depth, not a competing entity. Sign as "Bastien Joubert"

3. The proposal must respond to THIS specific offer. Reference specific elements from the job description.
   Do not write a generic proposal. Actually engage with what they need.

4. Use ONLY the relevant proof points identified in the analysis. Not all of them every time.
   Choose 2–3 maximum. Make them land with specificity.
   If Swapfiets Barcelona is used and the role involves resilience, local execution, or launch under
   constraints: add one sentence about the Covid lockdown context (curfews at 4pm, zero paid media,
   organic growth only). It makes the result significantly stronger.

5. Voice: bold, direct, precise. Short sentences. No fluff.
   NEVER use: passionate, leverage, end-to-end, reach out, synergies, journey, excited to, love to.
   NEVER use em dashes ( — ) anywhere in the proposal. Replace with a period or a new sentence.

6. Length by platform:
   - Upwork: 150–220 words max. They skim. Every sentence must earn its place.
   - LinkedIn contract or permanent roles: 200–250 words.
   - LinkedIn institutional or large brand roles (sports clubs, major corporations, global brands): 220–260 words minimum.
   - Contra/Other: 100–150 words. Most direct of all.

7. Opening: NEVER start with "Hi", "Hello", or any salutation.
   First line attacks the problem or the role directly. Show you read the offer on line one.

8. Structure (adapt — don't follow rigidly):
   - Open directly on the role or problem — no greeting
   - 1 sentence that briefly frames who Bastien is — not a full bio, just enough to anchor what follows
   - 2–3 specific proof points selected for THIS role
   - 1 transition sentence connecting the proof points to what they specifically need — a bridge between "here is what I've done" and "here is why it matters for you"
   - Close with a concrete next step or direct question

9. If company is unknown: use "you" and "your" throughout. Never "they", "them", or "the company".

10. Upwork-specific: If this is one of Bastien's first jobs on the platform, acknowledge it briefly and honestly.
    Frame it as: "New profile, not new to this work. I only apply when I know I'll deliver."
    Do not over-explain or apologize.

11. Closing signature ONLY: "Bastien Joubert" or "Bastien Joubert — ATELIER" depending on identity_mode.
    Never add: "Looking forward to hearing from you", "Best regards", "Kind regards", or any closing phrase.
    End with a concrete next step or direct question, then the signature. Nothing else.

12. The apply field is information only. Always generate the full proposal regardless of fit score or apply value.

OUTPUT FORMAT:
Return only the proposal text. No metadata. No labels. No "PROPOSAL:" header.
The text goes directly into a Google Doc and a Telegram message."""


def _check_forbidden_words(text: str) -> None:
    """Log si un mot interdit est présent."""
    for word in FORBIDDEN_WORDS:
        if word.lower() in text.lower():
            print(f"[ProposalGenerator] Attention : mot interdit détecté : '{word}'")


def generate_proposal(analysis: dict, raw_content: str, profile_md_content: str = "") -> str:
    """
    Génère la proposal via Claude en fonction de l'analyse et du profil.
    Retourne le texte de la proposal.
    """
    api_key = os.environ.get("GROK_API_KEY")
    if not api_key:
        raise Exception("[ProposalGenerator] GROK_API_KEY manquant dans les variables d'environnement")

    client = openai.OpenAI(api_key=api_key, base_url=GROK_BASE_URL)

    platform = analysis.get("platform", "Other")
    language = analysis.get("language", "en")
    identity_mode = analysis.get("identity_mode", "atelier")
    job_title = analysis.get("job_title", "Unknown Role")
    company = analysis.get("company", "Unknown Company")
    summary = analysis.get("summary", "")
    role_type = analysis.get("role_type", "other")
    job_type = analysis.get("job_type", "freelance")
    key_requirements = analysis.get("key_requirements", [])
    relevant_proof_points = analysis.get("relevant_proof_points", [])

    key_reqs_str = "\n".join(f"- {r}" for r in key_requirements) if key_requirements else "Not specified"
    proof_points_str = "\n".join(f"- {p}" for p in relevant_proof_points) if relevant_proof_points else "Not specified"
    profile_section = f"\nBastien's full profile:\n{profile_md_content}" if profile_md_content else ""

    user_message = f"""Job offer:
{raw_content[:6000]}

Analysis results:
- Company: {company}
- Role: {job_title}
- Summary: {summary}
- Role type: {role_type}
- Identity mode: {identity_mode}
- Key requirements:
{key_reqs_str}
- Relevant proof points:
{proof_points_str}
- Platform: {platform}
- Language: {language}
- Job type: {job_type}
{profile_section}

Write the proposal now."""

    print(f"[ProposalGenerator] Génération via Grok ({platform} / {language} / {identity_mode})...")

    try:
        response = client.chat.completions.create(
            model=GROK_MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
    except Exception as e:
        raise Exception(f"[ProposalGenerator] Erreur API Grok : {e}")

    proposal = response.choices[0].message.content.strip()
    print(f"[ProposalGenerator] Proposal générée ({len(proposal)} chars)")

    _check_forbidden_words(proposal)

    return proposal
