require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgres://postgres:postgres123@localhost:5432/pos_kasir'
});

pool.on('error', (err) => {
  console.error('Kesalahan tak terduga pada koneksi database', err);
});

module.exports = pool;
