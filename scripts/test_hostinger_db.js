import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
};

console.log('=============================================');
console.log('   Hostinger Database Connection Diagnostic   ');
console.log('=============================================');
console.log('Host:     ', config.host);
console.log('Port:     ', config.port);
console.log('User:     ', config.user ? config.user : '❌ (MISSING: Set DB_USER)');
console.log('Database: ', config.database ? config.database : '❌ (MISSING: Set DB_NAME)');
console.log('Password: ', config.password ? `****** (Length: ${config.password.length})` : '❌ (MISSING: Set DB_PASSWORD)');
console.log('=============================================\n');

async function test() {
  if (!config.user || !config.database) {
    console.error('❌ Cannot connect: DB_USER or DB_NAME is missing in environment variables.');
    return;
  }

  try {
    const connection = await mysql.createConnection({
      host: config.host === 'localhost' ? '127.0.0.1' : config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10000
    });

    console.log('✅ Connection Successful to Hostinger MySQL!\n');
    
    const [rows] = await connection.execute('SELECT 1 + 1 AS test, VERSION() as mysql_version, DATABASE() as current_db');
    console.log('MySQL Info:', rows[0]);

    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`\nFound ${tables.length} tables in database:`);
    console.table(tables);
    
    await connection.end();
  } catch (err) {
    console.error('❌ Connection FAILED:');
    console.error('---------------------------------------------');
    console.error('Error Code:   ', err.code);
    console.error('Error Number: ', err.errno);
    console.error('Message:      ', err.message);
    console.error('---------------------------------------------');
    
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('👉 Fix: DB_USER or DB_PASSWORD is incorrect in Hostinger.');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('👉 Fix: DB_NAME does not exist. Check prefix (e.g. u123456789_dbname).');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('👉 Fix: Cannot reach MySQL server. Try setting DB_HOST=127.0.0.1 and DB_PORT=3306.');
    }
  }
}

test();
