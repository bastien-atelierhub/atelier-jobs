import OpenAI from 'openai';

const CATEGORIES = [
  {
    weight: 5,
    keywords: [
      'n8n', 'make.com', 'zapier', 'automation', 'workflow',
      'ai agent', 'custom gpt', 'claude', 'llm', 'openai',
      'apify', 'scraping', 'pipeline', 'airtable automation',
    ],
  },
  {
    weight: 4,
    keywords: [
      'web development', 'landing page', 'website', 'frontend',
      'ui/ux', 'app development', 'web app', 'saas', 'antigravity',
    ],
  },
  {
    weight: 4,
    keywords: [
      'brand strategy', 'go-to-market', 'gtm', 'marketing strategy',
      'positioning', 'marketing audit', 'content strategy',
    ],
  },
  {
    weight: 3,
    keywords: [
      'social media', 'copywriting', 'content creation', 'reels',
      'video', 'email marketing', 'newsletter',
    ],
  },
  {
    weight: 4,
    keywords: [
      'ui design', 'ux design', 'figma', 'mobile app', 'design system',
      'visual identity', 'brand identity', 'ai video',
    ],
  },
  {
    weight: 4,
    keywords: [
      'crypto', 'web3', 'blockchain', 'nft', 'defi', 'dao',
      'token', 'smart contract', 'web 3',
    ],
  },
];

const NEGATIVE_KEYWORDS = [
  'wordpress', 'woocommerce', 'shopify', 'elementor',
  'event marketing', 'physical', 'pr agency', 'media buying',
  'cheapest', 'lowest bid',
];

const POSITIVE_SIGNALS = [
  'remote', 'freelance', 'contract', 'startup', 'founder',
  'english', 'international', 'series a', 'seed',
];

const ATELIER_PROFILE = `
Bastien Joubert — ATELIER Studio
- 10+ years brand strategy, digital marketing, creative direction
- Nike Brand Digital Specialist Amsterdam: +35% e-commerce, +20% app acquisition
- Swapfiets Barcelona: 1000+ members in 6 months from scratch
- 50+ automation workflows built (n8n, Make, Claude Code, Apify)
- Expert: AI automation, web dev, brand strategy, design, crypto/Web3
- Services: AI automation, web dev, marketing strategy, design, app dev, AI video
`.trim();

export function getRating(score) {
  if (score >= 5)   return 'Perfect Match';
  if (score >= 4)   return 'Strong Match';
  if (score >= 3)   return 'Good Match';
  return 'Weak Match';
}

export function scoreJob(job) {
  const text = `${job.title} ${job.description}`.toLowerCase();

  const hasNegative = NEGATIVE_KEYWORDS.some(kw => text.includes(kw));
  if (hasNegative) return 1;

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const cat of CATEGORIES) {
    totalWeight += cat.weight;
    const hit = cat.keywords.some(kw => text.includes(kw));
    if (hit) matchedWeight += cat.weight;
  }

  const bonusCount = POSITIVE_SIGNALS.filter(s => text.includes(s)).length;
  const bonus = Math.min(bonusCount * 0.3, 1.2);

  const raw = (matchedWeight / totalWeight) * 4 + 1 + bonus;
  return Math.min(5, Math.round(raw * 10) / 10);
}

export async function analyzeWithDeepSeek(job, score, config) {
  const client = new OpenAI({
    apiKey: config.deepseek.apiKey,
    baseURL: config.deepseek.baseUrl,
  });

  const prompt = `You are evaluating a freelance job opportunity for ATELIER studio.

ATELIER PROFILE:
${ATELIER_PROFILE}

JOB TO EVALUATE:
Title: ${job.title}
Company: ${job.company || 'Unknown'}
Platform: ${job.platform || 'Unknown'}
Description: ${(job.description || '').slice(0, 800)}

Keyword-based pre-score: ${score}/5

Return ONLY this JSON (no markdown, no explanation):
{
  "score": <refined float 1.0-5.0 based on your analysis>,
  "rating": "<Perfect Match|Strong Match|Good Match|Weak Match>",
  "summary": "<2 sentences max: what the job needs and why ATELIER fits>",
  "fit_analysis": [
    "<✅ or ⚠️ or ❌> <specific fit point>",
    "<✅ or ⚠️ or ❌> <specific fit point>",
    "<✅ or ⚠️ or ❌> <specific fit point>",
    "<✅ or ⚠️ or ❌> <specific fit point>"
  ]
}

Rules:
- score must align with rating: Perfect≥5, Strong≥4, Good≥3, Weak≥2
- fit_analysis: max 4 bullets, be specific to THIS job and ATELIER's actual experience
- ✅ = strong match, ⚠️ = partial/transferable, ❌ = gap or risk`;

  const response = await client.chat.completions.create({
    model: config.deepseek.model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 400,
  });

  const raw = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

// Synchronous — backward compatible, used when no DeepSeek config available
export function scoreJobs(jobs) {
  return jobs
    .map(job => ({ ...job, score: scoreJob(job) }))
    .sort((a, b) => b.score - a.score);
}

// Async — enriches score >= 2 with DeepSeek analysis
export async function scoreAndAnalyzeJobs(jobs, config) {
  const scored = jobs.map(job => ({ ...job, score: scoreJob(job) }));

  const analyzed = await Promise.allSettled(
    scored.map(async job => {
      if (job.score < 2 || !config?.deepseek?.apiKey) {
        return { ...job, rating: getRating(job.score) };
      }
      try {
        const analysis = await analyzeWithDeepSeek(job, job.score, config);
        return {
          ...job,
          score:        analysis.score,
          rating:       analysis.rating,
          summary:      analysis.summary,
          fit_analysis: analysis.fit_analysis,
        };
      } catch (err) {
        console.warn(`[scorer] DeepSeek failed for "${job.title}":`, err.message);
        return { ...job, rating: getRating(job.score) };
      }
    })
  );

  return analyzed
    .map(r => (r.status === 'fulfilled' ? r.value : r.reason))
    .sort((a, b) => b.score - a.score);
}
