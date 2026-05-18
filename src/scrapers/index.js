import { scrapeLinkedIn }        from './linkedin.js';
import { scrapeUpwork }           from './upwork.js';
import { scrapeRemoteOK }         from './remoteok.js';
import { scrapeRemotive }         from './remotive.js';
import { scrapeWeWorkRemotely }   from './weworkremotely.js';
import { scrapeWorkingNomads }    from './workingnomads.js';
import { scrapeHimalayas }        from './himalayas.js';
import { scrapeJobicy }           from './jobicy.js';

export async function scrapeAll(config, flags = {}) {
  const all = !flags.linkedin && !flags.upwork && !flags.remoteok
           && !flags.remotive && !flags.wwr && !flags.workingnomads
           && !flags.himalayas && !flags.jobicy;

  const results = [];
  const errors  = [];

  const tasks = [
    { name: 'linkedin',       enabled: all || flags.linkedin,       fn: scrapeLinkedIn       },
    { name: 'upwork',         enabled: all || flags.upwork,         fn: scrapeUpwork         },
    { name: 'remoteok',       enabled: all || flags.remoteok,       fn: scrapeRemoteOK       },
    { name: 'remotive',       enabled: all || flags.remotive,       fn: scrapeRemotive       },
    { name: 'weworkremotely', enabled: all || flags.wwr,            fn: scrapeWeWorkRemotely },
    { name: 'workingnomads',  enabled: all || flags.workingnomads,  fn: scrapeWorkingNomads  },
    { name: 'himalayas',      enabled: all || flags.himalayas,      fn: scrapeHimalayas      },
    { name: 'jobicy',         enabled: all || flags.jobicy,         fn: scrapeJobicy         },
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
