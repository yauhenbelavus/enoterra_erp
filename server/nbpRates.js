/**
 * Fetch NBP table A mid rates (PLN per 1 unit of foreign currency).
 * If there is no table on the requested date (weekend/holiday), walk back
 * calendar days until a published table is found.
 */

const https = require('https');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^[A-Z]{3}$/;
const MAX_LOOKBACK_DAYS = 10;
const NBP_TIMEOUT_MS = 10000;

function shiftIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'EnoTerraERP/1.0',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 404 || res.statusCode === 400) {
            resolve({ status: res.statusCode, json: null });
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`NBP HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve({ status: 200, json: JSON.parse(body) });
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(NBP_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('NBP timeout'));
    });
  });
}

async function fetchOneRate(code, requestedDate) {
  let current = requestedDate;
  for (let i = 0; i <= MAX_LOOKBACK_DAYS; i += 1) {
    const url = `https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/${current}/?format=json`;
    const { status, json } = await httpsGetJson(url);
    if (status === 400) return null;
    const rate = json && json.rates && json.rates[0];
    const mid = rate && Number(rate.mid);
    if (status === 200 && Number.isFinite(mid) && mid > 0) {
      return {
        mid,
        requestedDate,
        effectiveDate: rate.effectiveDate || json.effectiveDate || current,
      };
    }
    current = shiftIsoDate(current, -1);
  }
  return null;
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {string[]} codes ISO currency codes
 */
async function fetchNbpRates(date, codes) {
  if (!DATE_PATTERN.test(date)) {
    return { status: 400, error: 'Podaj datę w formacie RRRR-MM-DD' };
  }

  const uniqueCodes = [...new Set(
    (Array.isArray(codes) ? codes : [])
      .map((code) => String(code || '').trim().toUpperCase())
      .filter((code) => CODE_PATTERN.test(code) && code !== 'PLN')
  )];

  const rates = {};
  for (const code of uniqueCodes) {
    const found = await fetchOneRate(code, date);
    if (found) rates[code] = found;
  }

  return { date, rates };
}

module.exports = {
  fetchNbpRates,
};
