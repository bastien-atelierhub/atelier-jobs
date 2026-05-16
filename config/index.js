import 'dotenv/config';

export function loadConfig() {
  return {
    apify: {
      apiKey:             process.env.APIFY_API_KEY,
      maxJobsPerPlatform: 50,
    },
    deepseek: {
      apiKey:  process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model:   'deepseek-chat',
    },
    grok: {
      apiKey:  process.env.GROK_API_KEY,
      baseUrl: 'https://api.x.ai/v1',
      model:   'grok-3',
    },
    google: {
      email:         process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey:    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
    },
  };
}
