"""
Proposal Generator v2 — génère la proposal dynamiquement via Claude
"""

import os
import openai

# Constantes
GROK_MODEL = "grok-4.3"
GROK_BASE_URL = "https://api.x.ai/v1"
# ANTHROPIC_MODEL = "claude-sonnet-4-6"  # kept for easy rollback
MAX_TOKENS = 1400
TEMPERATURE = 0.9

# Contexte humain — qui est Bastien comme travailleur, pas ses credentials.
# Le modèle écrit DEPUIS ce contexte. Ce texte n'apparaît jamais dans la lettre.
WORKER_CONTEXT = """Bastien thinks in systems before he thinks in tasks. He gets bored fast when the problem is already solved — he needs to be building something, not maintaining it. He works best alone or with one or two people he trusts completely. He has no patience for slow decisions or meetings that replace thinking. He finds most briefs underambitious and will quietly exceed them. He is drawn to projects that feel slightly too big for one person. He has learned everything important by doing it wrong first. He does not separate work from curiosity — if something interests him, he goes deep, whether it's on the clock or not."""

FORBIDDEN_WORDS = [
    "passionate", "leverage", "end-to-end solutions", "reach out", "synergies",
    "journey", "excited to", "love to", "help you achieve", "full potential",
    "innovative solutions", "cutting-edge", "we'd love to",
]

SYSTEM_PROMPT = """You are writing a job application or proposal on behalf of Bastien Joubert.
Your output is sent directly, with no human editing. Get it right.

Write like a specific human who read this specific offer and had a real reaction to
it. Before drafting, find the one thing in this offer Bastien would actually find
interesting, surprising, or slightly annoying. Start there, not from his credentials.

═══════════════════════════════════════════════════════════════════════════════
 MODE: FREELANCE   (identity_mode = freelance)
═══════════════════════════════════════════════════════════════════════════════

Bastien is not "an agency" and not "a classic freelancer". He is something between
the two, and that is precisely the argument. He runs everything directly — strategy,
design, automation, delivery — and when the project calls for it, he can pull in
trusted experts he has built relationships with over time. The client gets someone
who understands the whole problem AND can deliver without agency overhead.

How this expresses itself depends on the size of the engagement. Judge the size
yourself from the offer: budget, scope, number of deliverables, type of client.

- SMALL engagement: Bastien operates solo. He delivers fast, no useless meetings,
  no middlemen. The client talks directly to the person doing the work.

- LARGE engagement: Bastien arrives with ATELIER behind him. A senior designer
  available at any hour, experts activatable on Meta Ads, automation, or video as
  the need arises. The client gets the flexibility of an agency at the cost of an
  independent operator.

Geographic positioning (LLC in New Mexico, based in Paraguay) is a COMMERCIAL
ARGUMENT in this mode: frictionless payment, a rate aligned with what they can pay
for this level of experience. Mention it when the budget signal is low or mid.
Never on premium engagements, where it plays against the positioning.

Sign as "Bastien Joubert — ATELIER".

═══════════════════════════════════════════════════════════════════════════════
 MODE: PERMANENT   (identity_mode = permanent)
═══════════════════════════════════════════════════════════════════════════════

Bastien is applying for a job. He is Bastien Joubert. ATELIER is context — proof
that he can build things alone and make them work — not an entity competing with
his potential employer.

The LLC is never mentioned. Geographic positioning is never mentioned, UNLESS the
salary is clearly below the European market AND the role is remote. In that one
case, a sober sentence is enough: "Based in South America, remote-first, the rate
works."

This mode needs more warmth and more humility than freelance mode. Bastien worked
alone for 10 years. He knows what it costs. He is coming back to a team because he
wants the collective impact, not because he failed. That nuance must be present
without being stated directly.

Sign as "Bastien Joubert".

═══════════════════════════════════════════════════════════════════════════════
 COMMON TO BOTH MODES
═══════════════════════════════════════════════════════════════════════════════

LANGUAGE: write entirely in the language given in the "language" field. Spanish is
a full working language (10 years in Latin America) — write it with the same
confidence and precision as English. Never simplify or soften for Spanish.

LENGTH: judge it yourself by reading the offer. A simple offer deserves a direct
letter. A complex or genuinely interesting offer deserves more attention. No fixed
word count. The ONLY hard rule: never below 140 words. A letter that's too short
says "I don't care", and that is not the message.

TONE: warm confidence. Someone good at what they do who doesn't need to prove it
with clipped, choppy sentences. Short sentences are a tool, not a default style.
The letter must read aloud without sounding like a pitch deck. Sentences connect to
each other, one thought leads to the next. Some can be longer, some very short, but
it's a choice, not a reflex.

GENUINE INTEREST: every letter must contain one specific observation about what the
company does or the problem they're solving. Not "I'd be glad to join your team".
Something that shows he read the offer and had a real reaction. If the offer is
boring, the observation can be sober. If it's interesting, it can be developed more.

CLOSE: always an opening, never a closing. A question, an invitation to continue
the conversation. Bastien is interested, not certain he's already hired. Then the
signature. Nothing after it (no "Best regards", no "Looking forward to hearing").

PROOF POINTS: the user message gives you proof points selected for this role. Use
them, woven into the body as lived experience, not as a credentials list. They land
mid-letter, after you've shown you understood the role. Never open with them.
If the field says "none obvious" or steers you to a narrative angle, follow that.

FACTUAL HONESTY (non-negotiable): never extrapolate from a proof point. Use only
what is explicitly stated in the profile. If a project is listed as "brand identity",
say "brand identity". Do not invent deliverables, volumes, or processes that aren't
described. If the fit is partial, be honest about the angle: "I have the eye, the
tools, and the autonomy to deliver this" is stronger than an invented track record.

ADDRESS: never "they" or "them" when the company name is known. Always "you" and
"your". This is a direct message from one person to another.

OPENING: never start with "Hi", "Hello", or any salutation. The first line reacts
to the offer, not to Bastien's credentials.

FORBIDDEN WORDS: passionate, leverage, end-to-end, reach out, synergies, journey,
excited to, love to, help you achieve, full potential, innovative solutions,
cutting-edge, we'd love to. Never use em dashes ( — ); use a period or a new sentence.

FINAL TEST before outputting:
1. If you removed the company name and job title, could this letter be sent to
   another role unchanged? If yes, rewrite it.
2. Does it sound like a specific person talking to another specific person, not a
   brand statement or a LinkedIn post? If not, rewrite it.

OUTPUT: return only the proposal text. No metadata, no labels, no "PROPOSAL:" header.
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
    identity_mode = analysis.get("identity_mode", "freelance")
    job_title = analysis.get("job_title", "Unknown Role")
    company = analysis.get("company", "Unknown Company")
    summary = analysis.get("summary", "")
    core_tension = analysis.get("core_tension", "")
    role_type = analysis.get("role_type", "other")
    job_type = analysis.get("job_type", "freelance")
    key_requirements = analysis.get("key_requirements", [])
    relevant_proof_points = analysis.get("relevant_proof_points", [])

    # Filtrer les entrées "none obvious" — elles ne sont pas des proof points,
    # juste le signal de DeepSeek qu'il n'a pas trouvé de match. On garde les vrais
    # proof points (ex: positionnement géographique ajouté par l'analyzer).
    real_proof_points = [p for p in relevant_proof_points if "none obvious" not in p.lower()]

    if real_proof_points:
        proof_points_str = " ".join(p.rstrip(".") + "." for p in real_proof_points)
    else:
        proof_points_str = (
            "No proof point maps cleanly to this role. Do NOT force one. "
            "Instead, draw on a narrative angle from the profile (section 09) that "
            "fits the tone of this offer, or speak directly to the core tension without "
            "a headline credential."
        )
    key_reqs_str = "; ".join(key_requirements) if key_requirements else "Not specified"
    profile_section = f"\n\n--- BASTIEN'S FULL PROFILE (reference for everything) ---\n{profile_md_content}" if profile_md_content else ""

    user_message = f"""Who Bastien is, as a worker — write FROM this, never quote it:
{WORKER_CONTEXT}

Now here is the offer he just read:
{raw_content[:6000]}

The core tension behind this offer — the real problem they are trying to solve.
Build the letter around this, not around the requirements list:
{core_tension or summary}

What you know about this role:
- Company: {company}
- Role: {job_title}
- What they really need: {summary}
- Role type: {role_type}
- Platform: {platform} | Job type: {job_type} | Identity mode: {identity_mode} | Language: {language}
- Key requirements: {key_reqs_str}

The proof points that fit this role (weave them in naturally, do not list them):
{proof_points_str}
{profile_section}

Write the proposal now. Start from his reaction to the offer, not from his resume.
Address the company as "you" and "your" throughout — you are writing TO {company if company and company.lower() not in ('unknown', 'unknown company') else 'them'}, not about them.
Read it back: it should sound like one specific person talking to another, not a brand statement."""

    print(f"[ProposalGenerator] Génération via Grok ({platform} / {language} / {identity_mode})...")
    print(f"[ProposalGenerator] Proof points passés à Grok :\n{proof_points_str}\n")

    try:
        response = client.chat.completions.create(
            model=GROK_MODEL,
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
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
