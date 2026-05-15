import { scrapeLinkedIn }  from './linkedin.js';
import { scrapeUpwork }    from './upwork.js';
import { scrapeRemoteOK }  from './remoteok.js';

export async function scrapeAll(config, flags = {}) {
  const all = !flags.linkedin && !flags.upwork && !flags.remoteok;
  const results = [];
  const errors = [];

  const tasks = [
    { name: 'linkedin', enabled: all || flags.linkedin, fn: scrapeLinkedIn  },
    { name: 'upwork',   enabled: all || flags.upwork,   fn: scrapeUpwork    },
    { name: 'remoteok', enabled: all || flags.remoteok, fn: scrapeRemoteOK  },
  ];

  await Promise.allSettled(
    tasks
      .filter(t => t.enabled)
      .map(async t => {
        console.log(`[scraper] ${t.name} — démarrage...`);
        try {
          const jobs = await t.fn(config);
          console.log(`[scraper] ${t.name} — ${jobs.length} offres récupérées`);
          results.push(...jobs);
        } catch (err) {
          console.error(`[scraper] ${t.name} — erreur: ${err.message}`);
          errors.push({ platform: t.name, error: err.message });
        }
      })
  );

  return { jobs: results, errors };
}
