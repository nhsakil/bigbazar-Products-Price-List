import { connect } from '@tidbcloud/serverless';

/**
 * Returns a TiDB serverless connection for the given environment.
 * Prefers DATABASE_URL if set; falls back to individual DB_* vars.
 *
 * @param {object} env - Cloudflare env bindings or node process.env
 * @returns {object} TiDB Connection instance
 */
export const getDb = (env = {}) => {
  const getVar = (key) => {
    if (env && env[key]) return env[key];
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    return undefined;
  };

  const databaseUrl = getVar('DATABASE_URL');
  if (databaseUrl) {
    return connect({ url: databaseUrl });
  }

  // Fall back to individual vars
  const user = encodeURIComponent(getVar('DB_USER') || '');
  const pass = encodeURIComponent(getVar('DB_PASSWORD') || '');
  const host = getVar('DB_HOST');
  const port = getVar('DB_PORT') || '4000';
  const name = getVar('DB_NAME') || 'test';

  if (!host || !user) {
    const missing = [];
    if (!host) missing.push('DB_HOST');
    if (!user) missing.push('DB_USER');
    throw new Error(`Missing env vars: ${missing.join(', ')}. Set DATABASE_URL or individual DB_* vars in Cloudflare Pages dashboard.`);
  }

  const url = `mysql://${user}:${pass}@${host}:${port}/${name}?ssl={"rejectUnauthorized":true}`;
  return connect({ url });
};
