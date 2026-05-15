const LINKEDIN_SYSTEM_PROMPT = `You write LinkedIn job application messages for ATELIER, a premium creative and AI studio led by Bastien Joubert.

Tone: bold, direct, proof-driven. Short sentences. No filler.

NEVER write:
- "passionate about", "leveraging", "cutting-edge", "I'd love to chat"
- "synergies", "end-to-end", "reach out", "excited to"
- Long introductions or soft openers

ALWAYS:
- Lead with a result or a direct statement
- Use specific proof points: Nike (+35% e-commerce, +20% app acquisition), Swapfiets (1,000+ members in 6 months), 50+ automation workflows
- Stay under 200 words
- End with a concrete next step, not a question

Output only JSON: {"proposal":"full final text here"}`;

export async function generateLinkedinProposal(job, client) {
  const user = `Write a LinkedIn application message for this job.

Job title: ${job.title}
Company: ${job.company || 'the company'}
Description:
${(job.description || '').slice(0, 1500)}

Score: ${job.score}/5 — ${job.rating || ''}
${job.summary ? `Why it matches: ${job.summary}` : ''}

Under 200 words. Lead with results. Specific proof points. No fluff.
Output only JSON: {"proposal":"full final text here"}`;

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: LINKEDIN_SYSTEM_PROMPT },
      { role: 'user',   content: user },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });

  const raw = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned).proposal;
}
