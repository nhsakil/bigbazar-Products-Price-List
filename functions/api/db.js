import { connect as connectTiDB } from '@tidbcloud/serverless';
import mysql from 'mysql2/promise';

let mysqlPool = null;

/**
 * Returns a database connection for the given environment.
 * Supports both Hostinger Native MySQL (via mysql2) and TiDB Cloud Serverless.
 *
 * @param {object} env - Cloudflare env bindings or node process.env
 * @returns {object} Database Connection instance with .execute(sql, params)
 */
export const getDb = (env = {}) => {
  const getVar = (key) => {
    if (env && env[key]) return env[key];
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    return undefined;
  };

  const databaseUrl = getVar('DATABASE_URL');
  const host = getVar('DB_HOST') || '127.0.0.1';
  const port = parseInt(getVar('DB_PORT') || '3306', 10);
  const user = getVar('DB_USER') || '';
  const password = getVar('DB_PASSWORD') || '';
  const database = getVar('DB_NAME') || '';

  // 1. TiDB Cloud Serverless (HTTP Gateway)
  const isTiDB = (host && host.includes('tidbcloud.com')) || (databaseUrl && databaseUrl.includes('tidbcloud.com'));

  if (isTiDB) {
    if (databaseUrl) {
      return connectTiDB({ url: databaseUrl });
    }
    const encUser = encodeURIComponent(user);
    const encPass = encodeURIComponent(password);
    const url = `mysql://${encUser}:${encPass}@${host}:${port || 4000}/${database}?ssl={"rejectUnauthorized":true}`;
    return connectTiDB({ url });
  }

  // 2. Hostinger Native MySQL (Standard TCP connection via mysql2)
  if (!mysqlPool) {
    const targetHost = host === 'localhost' ? '127.0.0.1' : host;
    
    if (databaseUrl && !databaseUrl.includes('tidbcloud.com')) {
      mysqlPool = mysql.createPool(databaseUrl);
    } else {
      mysqlPool = mysql.createPool({
        host: targetHost,
        port: port || 3306,
        user: user,
        password: password,
        database: database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
    }
  }

  return {
    async execute(sql, params = []) {
      // Normalize undefined params to null for mysql2
      const safeParams = (params || []).map(p => p === undefined ? null : p);
      const [results] = await mysqlPool.execute(sql, safeParams);
      return results;
    }
  };
};
