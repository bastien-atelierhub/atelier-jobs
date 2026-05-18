import { loadConfig }                    from './config/index.js';
import { scrapeAll }                      from './src/scrapers/index.js';
import { scoreAndAnalyzeJobs }            from './src/scorer.js';
import { saveToSheets, getExistingUrls }  from './src/sheets.js';

const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;

function parseFlags(argv) {
  const args = argv.slice(2);
  return {
    linkedin:      args.includes('--linkedin'),
    upwork:        args.includes('--upwork'),
    remoteok:      args.includes('--remoteok'),
    remotive:      args.includes('--remotive'),
    wwr:           args.includes('--wwr'),
    workingnomads: args.includes('--workingnomads'),
    himalayas:     args.includes('--himalayas'),
    dryRun:        args.includes('--dry-run'),
    all:           args.includes('--all'), // bypass filtre date
  };
}

function filterRecent(jobs) {
  const cutoff = Date.now() - TEN_DAYS;
  return jobs.filter(job => {
    if (!job.date) return true;
    const ts = new Date(job.date).getTime();
    if (isNaN(ts)) return true;
    return ts >= cutoff;
  });
}

function deduplicateByUrl(jobs, existingUrls) {
  const seen    = new Set(existingUrls);
  const fresh   = [];
  let skipped   = 0;

  for (const job of jobs) {
    if (job.url && seen.has(job.url)) {
      skipped++;
      continue;
    }
    if (job.url) seen.add(job.url);
    fresh.push(job);
  }

  if (skipped > 0) console.log(`  → ${skipped} doublons ignorés (déjà dans le Sheet)`);
  return fresh;
}

async function main() {
  const flags  = parseFlags(process.argv);
  const config = loadConfig();

  console.log('\n🔍 ATELIER — Job Finder');
  console.log('========================');
  console.log(`Plateformes : ${resolvePlatforms(flags).join(', ')}`);
  console.log(`Dry run     : ${flags.dryRun}`);
  console.log('');

  // 1. Scraping
  console.log('[1/5] Scraping...');
  const { jobs: rawJobs, errors: scrapeErrors } = await scrapeAll(config, flags);
  if (scrapeErrors.length) {
    scrapeErrors.forEach(e => console.warn(`  ⚠ ${e.platform}: ${e.error}`));
  }
  console.log(`  → ${rawJobs.length} offres brutes récupérées\n`);

  if (rawJobs.length === 0) {
    console.log('Aucune offre trouvée. Fin.');
    process.exit(0);
  }

  // 2. Filtre 10 jours
  console.log('[2/5] Filtre 10 jours...');
  const recentJobs = flags.all ? rawJobs : filterRecent(rawJobs);
  const filterLabel = flags.all
    ? `bypass (--all) — ${rawJobs.length} offres`
    : `${recentJobs.length}/${rawJobs.length} dans les 10 derniers jours`;
  console.log(`  → ${filterLabel}\n`);

  if (recentJobs.length === 0) {
    console.log('Aucune offre récente. Fin.');
    process.exit(0);
  }

  // 3. Déduplication
  console.log('[3/5] Déduplication...');
  const existingUrls = flags.dryRun ? new Set() : await getExistingUrls(config);
  const freshJobs    = deduplicateByUrl(recentJobs, existingUrls);
  console.log(`  → ${freshJobs.length} offres nouvelles\n`);

  if (freshJobs.length === 0) {
    console.log('Aucune nouvelle offre. Fin.');
    process.exit(0);
  }

  // 4. Scoring + analyse DeepSeek
  console.log('[4/5] Scoring + analyse DeepSeek...');
  const scoredJobs = await scoreAndAnalyzeJobs(freshJobs, config);
  const qualified  = scoredJobs.filter(j => j.score >= 2);
  console.log(`  → ${qualified.length}/${scoredJobs.length} offres qualifiées (score ≥ 2)\n`);

  printSummary(scoredJobs);

  // 5. Google Sheets
  if (!flags.dryRun) {
    console.log('[5/5] Sauvegarde dans Google Sheets...');
    await saveToSheets(qualified, config);
  } else {
    console.log('[5/5] Sheets ignoré (--dry-run)\n');
    qualified.forEach(j => {
      console.log(`\n[${j.score}] ${j.title} — ${j.company} (${j.platform})`);
      if (j.rating)       console.log(`  Rating: ${j.rating}`);
      if (j.summary)      console.log(`  ${j.summary}`);
      if (j.fit_analysis) j.fit_analysis.forEach(b => console.log(`  ${b}`));
    });
  }

  console.log('\n✓ Terminé.\n');
}

function resolvePlatforms(flags) {
  const all = ['linkedin', 'upwork', 'remoteok', 'remotive', 'weworkremotely', 'workingnomads', 'himalayas'];
  const map = { linkedin: 'linkedin', upwork: 'upwork', remoteok: 'remoteok',
    remotive: 'remotive', wwr: 'weworkremotely', workingnomads: 'workingnomads', himalayas: 'himalayas' };
  const active = Object.entries(map).filter(([k]) => flags[k]).map(([, v]) => v);
  return active.length ? active : all;
}

function printSummary(jobs) {
  console.log('  Scores :');
  jobs.slice(0, 10).forEach(j => {
    const bar    = '█'.repeat(Math.round(j.score));
    const rating = j.rating ? ` [${j.rating}]` : '';
    console.log(`  ${bar.padEnd(5)} ${j.score.toFixed(1)}${rating}  ${j.title.slice(0, 45)} (${j.platform})`);
  });
  console.log('');
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
