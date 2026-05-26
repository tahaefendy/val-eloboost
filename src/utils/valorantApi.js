const https = require('https');
require('dotenv').config();

const HENRIK_API_KEY = process.env.HENRIK_API_KEY;

/**
 * Fetches MMR details from Henrik Dev Valorant API.
 * @param {string} region - e.g. 'eu', 'na', 'ap'
 * @param {string} riotId - Format: 'Username#TAG'
 * @returns {Promise<{current_rank: string, current_kp: number, raw: object}>}
 */
function fetchMmrFromApi(region, riotId) {
  return new Promise((resolve, reject) => {
    const parts = riotId.split('#');
    if (parts.length !== 2) {
      return reject(new Error('Geçersiz Riot ID formatı. "KullaniciAdi#TAG" şeklinde olmalıdır.'));
    }

    const name = encodeURIComponent(parts[0]);
    const tag = encodeURIComponent(parts[1]);
    const cleanRegion = encodeURIComponent(region || 'eu');

    const options = {
      hostname: 'api.henrikdev.xyz',
      port: 443,
      path: `/valorant/v2/mmr/${cleanRegion}/${name}/${tag}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ValorantEloBoostAutomation'
      }
    };

    if (HENRIK_API_KEY) {
      options.headers['Authorization'] = HENRIK_API_KEY;
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (res.statusCode === 200 && parsed.status === 200 && parsed.data) {
            resolve({
              current_rank: (parsed.data.current_data && parsed.data.current_data.currenttierpatched) ? parsed.data.current_data.currenttierpatched : 'Unranked',
              current_kp: (parsed.data.current_data && parsed.data.current_data.ranking_in_tier) ? parsed.data.current_data.ranking_in_tier : 0,
              raw: parsed.data
            });
          } else {
            // Handle API error statuses
            const errorMsg = parsed.errors ? parsed.errors[0].message : 'Henrik API Hatası';
            reject(new Error(`${res.statusCode} - ${errorMsg}`));
          }
        } catch (e) {
          reject(new Error(`JSON Ayrıştırma Hatası: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setTimeout(5000, () => {
      req.destroy(new Error('API isteği zaman aşımına uğradı.'));
    });

    req.end();
  });
}

/**
 * Robust MMR fetch function with fallback mock data when API key is missing.
 */
async function getLiveMmr(region, riotId) {
  if (!HENRIK_API_KEY) {
    console.warn('Henrik API Key bulunamadı (.env dosyasında HENRIK_API_KEY boş). Test amaçlı simüle veriler üretiliyor.');
    // Simulated updates for testing without real keys
    const mockRanks = ['Bronze 2', 'Bronze 3', 'Silver 1', 'Silver 2', 'Silver 3', 'Gold 1'];
    const randomRank = mockRanks[Math.floor(Math.random() * mockRanks.length)];
    const randomKp = Math.floor(Math.random() * 100);

    return {
      current_rank: randomRank,
      current_kp: randomKp,
      raw: { simulated: true, region, riotId }
    };
  }

  return await fetchMmrFromApi(region, riotId);
}

module.exports = {
  getLiveMmr
};
