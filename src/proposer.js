import OpenAI from 'openai';
import { generateUpworkProposal }  from './proposals/upwork-proposal.js';
import { generateLinkedinProposal } from './proposals/linkedin-proposal.js';
import { generateRemoteokProposal } from './proposals/remoteok-proposal.js';

export async function generateProposals(jobs, config) {
  const client = new OpenAI({
    apiKey: config.deepseek.apiKey,
    baseURL: config.deepseek.baseUrl,
  });

  const qualified = jobs.filter(j => j.score >= 2);
  console.log(`[proposer] ${qualified.length} offres qualifiées (score ≥ 2)`);

  const results = await Promise.allSettled(
    qualified.map(job => generateOne(job, client))
  );

  return results.map((r, i) => ({
    ...qualified[i],
    proposal:      r.status === 'fulfilled' ? r.value : null,
    proposalError: r.status === 'rejected'  ? r.reason?.message : null,
  }));
}

async function generateOne(job, client) {
  const platform = (job.platform || '').toLowerCase();

  if (platform === 'upwork')   return generateUpworkProposal(job, client);
  if (platform === 'linkedin') return generateLinkedinProposal(job, client);
  if (platform === 'remoteok') return generateRemoteokProposal(job, client);

  // Fallback → LinkedIn tone for unknown platforms
  return generateLinkedinProposal(job, client);
}
