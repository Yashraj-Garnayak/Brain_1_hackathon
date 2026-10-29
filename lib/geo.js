'use strict';

const { pool } = require('./db');

function safeDecode(value) {
  if (!value) return null;
  try { return decodeURIComponent(String(value)); } catch { return String(value); }
}

function header(req, ...names) {
  for (const name of names) {
    const value = req.headers[name];
    if (value) return String(value);
  }
  return null;
}

/**
 * Vercel and Cloudflare both expose coarse geo headers. We store country +
 * region (state/province) and keep city private.
 */
function geoFromRequest(req) {
  const country = header(req, 'x-vercel-ip-country', 'cf-ipcountry');
  const region = header(req, 'x-vercel-ip-country-region', 'cf-region-code', 'cf-region');
  const city = header(req, 'x-vercel-ip-city', 'cf-city');

  return {
    country: country ? country.toUpperCase().slice(0, 2) : null,
    region: region ? safeDecode(region).slice(0, 64) : null,
    city: city ? safeDecode(city).slice(0, 80) : null
  };
}

async function touchGeo(userId, geo) {
  if (!userId || !geo || !geo.country) return;
  await pool.query(
    `update users
        set country = $2, region = $3, city = $4, geo_updated_at = now()
      where id = $1
        and (country is distinct from $2 or region is distinct from $3 or city is distinct from $4)`,
    [userId, geo.country, geo.region, geo.city]
  );
}

function regionLabel(country, region) {
  if (!country) return 'REGION UNKNOWN';
  if (!region) return country;
  return `${region} · ${country}`;
}

module.exports = { geoFromRequest, touchGeo, regionLabel };
