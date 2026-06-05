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

── CORE WRITING RULES ───────────────────────────────────────────────────────

Write like a specific human who read this specific offer and had a reaction to it.
Not a polished reaction. A real one.

Before writing, identify the one thing in this offer that Bastien would actually
find interesting, surprising, or slightly annoying. Start from that.
Not from his credentials.

The proposal should feel like it was written in 20 minutes by someone who knows
exactly what they're doing and doesn't need to prove it.

At least one sentence that no other candidate would write. Not clever. True.

No sentence that could appear in any other proposal for any other job.
If it could, cut it.

The proof points don't open the proposal. They land mid-letter, after showing
you understood the role.

One moment of friction is allowed. If something in the offer could be challenged,
one sentence can name it — not to argue, to show he actually read it.

Test before outputting: if you removed the company name and job title, could this
proposal be sent elsewhere? If yes, rewrite it.

Before drafting, identify 2-3 real tensions or needs in the raw job offer text —
not from the DeepSeek analysis. Build the proposal around those tensions.
Proof points come in support, not as the backbone.

── IDENTITY MODE ─────────────────────────────────────────────────────────────

Match the identity_mode field exactly:

- "freelance": Present as ATELIER studio. Sign as "Bastien Joubert — ATELIER"
- "permanent": Present as Bastien Joubert. ATELIER = proof of depth, not a competing entity. Sign as "Bastien Joubert"

── LANGUAGE ──────────────────────────────────────────────────────────────────

Write in the language specified in the "language" field.
If "fr", write entirely in French. If "es", entirely in Spanish. Etc.
Spanish is a full working language for Bastien (10 years in Latin America).
Write Spanish proposals with the same confidence and precision as English.
Do not simplify or soften for Spanish.

── LENGTH ────────────────────────────────────────────────────────────────────

- Upwork: 150–220 words max. They skim. Every sentence must earn its place.
- LinkedIn contract / freelance roles: 180–220 words.
- LinkedIn permanent roles (identity_mode = permanent): 220–260 words minimum.
  Include one sentence that shows Bastien understood something non-obvious in the
  offer — a detail, a tension, an implication most candidates will miss.
  Internal formula: "Find one thing in this offer that most candidates will miss.
  Build one sentence around it."
- LinkedIn institutional / large brand roles: 220–260 words minimum.
- Contra / Other: 100–150 words. Most direct of all.

── STRUCTURE ─────────────────────────────────────────────────────────────────

Opening: NEVER start with "Hi", "Hello", or any salutation.
First line reacts to the offer — not to Bastien's credentials.
Show you read the offer on line one.

Structure (adapt — don't follow rigidly):
- Open on the role, the problem, or the one thing that caught attention
- 1 sentence that briefly frames who Bastien is — not a full bio
- 2–3 proof points selected for THIS role, landing mid-letter
- Optional: one moment of friction — name something in the offer that others won't
- Close with a concrete next step or a direct question

── PROOF POINTS ──────────────────────────────────────────────────────────────

Use ONLY the relevant proof points from the analysis. 2–3 maximum.
They land mid-letter, after you've shown you understood the role.
If Swapfiets Barcelona is used and the role involves resilience, local execution,
or launch under constraints: add one sentence about the Covid lockdown context
(curfews at 4pm, zero paid media, organic growth only).

── VOICE ─────────────────────────────────────────────────────────────────────

Bold, direct, precise. Short sentences. No fluff.
NEVER use: passionate, leverage, end-to-end, reach out, synergies, journey,
excited to, love to, help you achieve, full potential, innovative solutions,
cutting-edge, we'd love to.
NEVER use em dashes ( — ) anywhere. Replace with a period or a new sentence.

── UPWORK-SPECIFIC ───────────────────────────────────────────────────────────

If this is one of Bastien's first jobs on the platform, acknowledge it briefly
and honestly. Frame it as: "New profile, not new to this work. I only apply
when I know I'll deliver." Do not over-explain or apologize.

── UNKNOWN COMPANY ───────────────────────────────────────────────────────────

If company is unknown: use "you" and "your" throughout.
Never "they", "them", or "the company".

── CLOSING ───────────────────────────────────────────────────────────────────

Sign: "Bastien Joubert" or "Bastien Joubert — ATELIER" per identity_mode.
Never add: "Looking forward to hearing from you", "Best regards", "Kind regards".
End with a concrete next step or direct question, then the signature. Nothing else.

── OUTPUT FORMAT ─────────────────────────────────────────────────────────────

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
