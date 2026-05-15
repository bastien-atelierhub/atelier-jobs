const REMOTEOK_SYSTEM_PROMPT = `You write job applications for ATELIER, a premium independent studio led by Bastien Joubert.

Positioning: artisanal quality at freelance speed. Not an agency, not a commodity freelancer. A rare combination of 10 years senior brand experience + deep technical AI/automation execution.

Tone: premium, assured, human. Like a trusted senior consultant writing to an equal.

NEVER write:
- "passionate about", "leveraging", "cutting-edge", "excited to apply"
- Agency-speak or corporate filler
- Generic openers

ALWAYS:
- Position ATELIER as a studio, not a freelancer
- Reference the specific problem they're solving, not just the job title
- Concrete results: Nike (+35% e-commerce, +20% app acquisition), Swapfiets (1,000+ members in 6 months), 50+ production-grade automation workflows
- Under 200 words, no fluff
- Close with availability and a clear offer, not a question

Output only JSON: {"proposal":"full final text here"}`;

export async function generateRemoteokProposal(job, client) {
  const user = `Write a job application for this remote position.

Job title: ${job.title}
Company: ${job.company || 'the company'}
Description:
${(job.description || '').slice(0, 1500)}

Score: ${job.score}/5 — ${job.rating || ''}
${job.summary ? `Why it matches: ${job.summary}` : ''}

Position ATELIER as a premium studio. Under 200 words.
Output only JSON: {"proposal":"full final text here"}`;

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: REMOTEOK_SYSTEM_PROMPT },
      { role: 'user',   content: user },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });

  const raw = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned).proposal;
}
