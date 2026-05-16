import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';

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
    weight: 3,
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

function loadProfile() {
  try {
    return readFileSync(join(process.cwd(), 'data/profile.md'), 'utf8');
  } catch {
    return 'ATELIER — premium creative and AI studio led by Bastien Joubert. 10+ years brand strategy, 50+ automation workflows.';
  }
}

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

  const profile = loadProfile();

  const prompt = `You are evaluating a freelance job opportunity for ATELIER studio.

ATELIER PROFILE:
${profile}

JOB TO EVALUATE:
Title: ${job.title}
Company: ${job.company || 'Unknown'}
Platform: ${job.platform || 'Unknown'}
Description: ${(job.description || '').slice(0, 800)}

Keyword-based pre-score: ${score}/5

Determine:
- role_type: one of [brand_strategy, ai_automation, web_dev, content, product, other]
- identity_mode:
  - "atelier" if platform is upwork or remoteok
  - "bastien_contract" if platform is linkedin and role appears contract/freelance
  - "bastien_permanent" if platform is linkedin and role appears permanent/full-time

Return ONLY this JSON (no markdown, no explanation):
{
  "score": <refined float 1.0-5.0>,
  "rating": "<Perfect Match|Strong Match|Good Match|Weak Match>",
  "summary": "<2 sentences max: what the job needs and why ATELIER fits>",
  "fit_bullets": [
    "<✅ or ⚠️ or ❌> <specific fit point>",
    "<✅ or ⚠️ or ❌> <specific fit point>",
    "<✅ or ⚠️ or ❌> <specific fit point>",
    "<✅ or ⚠️ or ❌> <specific fit point>"
  ],
  "role_type": "<brand_strategy|ai_automation|web_dev|content|product|other>",
  "identity_mode": "<atelier|bastien_contract|bastien_permanent>",
  "relevant_proof_points": [
    "<specific ATELIER experience that maps to this job and why>"
  ]
}

Rules:
- score must align with rating: Perfect>=5, Strong>=4, Good>=3, Weak<3
- fit_bullets: max 4 bullets, specific to THIS job
- ✅ = strong match, ⚠️ = partial/transferable, ❌ = gap or risk
- relevant_proof_points: max 3, pick the most relevant from the profile`;

  const response = await client.chat.completions.create({
    model: config.deepseek.model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 500,
  });

  const raw = response.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(cleaned);

  // backward compat: fit_bullets → fit_analysis (used by sheets.js)
  parsed.fit_analysis = parsed.fit_bullets ?? parsed.fit_analysis ?? [];

  return parsed;
}

export function scoreJobs(jobs) {
  return jobs
    .map(job => ({ ...job, score: scoreJob(job) }))
    .sort((a, b) => b.score - a.score);
}

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
          score:                 analysis.score,
          rating:                analysis.rating,
          summary:               analysis.summary,
          fit_analysis:          analysis.fit_analysis,
          role_type:             analysis.role_type,
          identity_mode:         analysis.identity_mode,
          relevant_proof_points: analysis.relevant_proof_points,
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
