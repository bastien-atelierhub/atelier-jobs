import { readFileSync } from 'fs';
import { join } from 'path';

function loadProfile() {
  try {
    return readFileSync(join(process.cwd(), 'data/profile.md'), 'utf8');
  } catch {
    return '';
  }
}

function buildSystemPrompt(profile, identityMode) {
  const isBastien = identityMode === 'bastien_contract' || identityMode === 'bastien_permanent';
  const isPermanent = identityMode === 'bastien_permanent';

  const identity = isBastien
    ? `Present as Bastien Joubert, senior professional (not as a studio). Sign "Bastien Joubert".`
    : `Present as ATELIER studio. Sign "Bastien Joubert — ATELIER".`;

  const length = isPermanent
    ? `200 to 250 words minimum.`
    : `Under 200 words.`;

  return `You write LinkedIn job application messages for ATELIER, led by Bastien Joubert.

PROFILE:
${profile}

IDENTITY:
${identity}
If company is unknown or missing: use "you" and "your". Never "they" or "them".

VOICE AND STYLE:
- Bold, direct, proof-driven. Short sentences. Short paragraphs.
- Never use em dashes (—). Use periods or new sentences instead.
- Never open with "Hi" or any salutation.
- Never use: passionate, leverage, end-to-end, reach out, synergies, journey, excited to, love to, cutting-edge, full potential.
- Lead with a result or a direct statement. No soft openers.

PROOF POINTS:
- Select 2 to 3 maximum relevant to THIS specific job.
- For brand/campaign roles: Tiempo x Totti (flew to Rome, directed shoot, sold out worldwide in 48h) or Winner Stays.
- For AI/automation roles: 50+ workflows in production.
- If Swapfiets is used and job involves resilience or local execution: add one sentence about Covid lockdowns context (zero paid media, organic only).

CLOSING:
- End with a concrete next step or direct question.
- Never: "Looking forward to hearing from you", "Best regards", "Kind regards".
- Signature only: "Bastien Joubert" or "Bastien Joubert — ATELIER".

LENGTH: ${length}

Output only JSON: {"proposal":"full text here"}`;
}

export async function generateLinkedinProposal(job, client, model) {
  const profile      = loadProfile();
  const identityMode = job.identity_mode || 'bastien_contract';
  const systemPrompt = buildSystemPrompt(profile, identityMode);

  const user = `Write a LinkedIn application message for this job.

Job title: ${job.title}
Company: ${job.company || 'unknown'}
Identity mode: ${identityMode}
Description:
${(job.description || '').slice(0, 2000)}

Score: ${job.score}/5 — ${job.rating || ''}
${job.summary ? `Why it matches: ${job.summary}` : ''}
${job.relevant_proof_points?.length ? `Relevant proof points: ${job.relevant_proof_points.join(', ')}` : ''}

Lead with results. No fluff. No salutation. Output only JSON: {"proposal":"full text here"}`;

  const response = await client.chat.completions.create({
    model: model || 'grok-3',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: user },
    ],
    temperature: 0.7,
    max_tokens:  600,
  });

  const raw     = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned).proposal;
}
