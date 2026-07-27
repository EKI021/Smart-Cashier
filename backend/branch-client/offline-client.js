/**
 * Simulasi APLIKASI KASIR DI CABANG (bukan server pusat).
 *
 * Ide intinya: perangkat kasir punya antrean lokal (local queue) di
 * node:sqlite. Selama offline, transaksi tetap bisa dibuat dan disimpan
 * lokal. Begitu online lagi, semua yang tertunda dikirim sekaligus ke
 * POST /sync/push milik server pusat. client_transaction_id yang dibuat
 * di sini (bukan oleh server) yang menjaga supaya sinkron ulang tidak
 * pernah membuat transaksi dobel.
 *
 * Jalankan: node branch-client/offline-client.js
 * (Server pusat harus sudah menyala di localhost:4001)
 */

const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const SERVER = process.env.SERVER_URL || 'http://localhost:4001';
const QUEUE_DB_PATH = path.join(__dirname, 'local-queue.sqlite');

const localDb = new DatabaseSync(QUEUE_DB_PATH);
localDb.exec(`
  CREATE TABLE IF NOT EXISTS pending_transactions (
    client_transaction_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
`);

function createOfflineTransaction({ items, method, cash_received }) {
  const clientTransactionId = 'kasir1-' + crypto.randomUUID().slice(0, 8);
  const occurredAt = new Date().toISOString();
  const payload = JSON.stringify({ items, method, cash_received });

  localDb.prepare(
    `INSERT INTO pending_transactions (client_transaction_id, payload, occurred_at, synced)
     VALUES (?, ?, ?, 0)`
  ).run(clientTransactionId, payload, occurredAt);

  console.log(`[OFFLINE] Transaksi ${clientTransactionId} tersimpan di antrean lokal (belum ke server).`);
  return clientTransactionId;
}

function getPendingTransactions() {
  return localDb.prepare('SELECT * FROM pending_transactions WHERE synced = 0').all();
}

async function login(username, password) {
  const res = await fetch(`${SERVER}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login gagal: ' + (await res.text()));
  const data = await res.json();
  return data.token;
}

async function syncNow(token) {
  const pending = getPendingTransactions();
  if (pending.length === 0) {
    console.log('[SYNC] Tidak ada transaksi tertunda.');
    return;
  }

  console.log(`[SYNC] Koneksi kembali. Mengirim ${pending.length} transaksi tertunda ke server pusat...`);

  const body = {
    transactions: pending.map((p) => ({
      client_transaction_id: p.client_transaction_id,
      occurred_at: p.occurred_at,
      ...JSON.parse(p.payload)
    }))
  };

  const res = await fetch(`${SERVER}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  const markSynced = localDb.prepare('UPDATE pending_transactions SET synced = 1 WHERE client_transaction_id = ?');

  for (const r of data.results) {
    if (r.status === 'synced') {
      console.log(`[SYNC] ✔ ${r.client_transaction_id} berhasil disinkronkan -> ${r.transaction.id} (total Rp${r.transaction.total.toLocaleString('id-ID')})`);
      markSynced.run(r.client_transaction_id);
    } else if (r.status === 'already_synced') {
      console.log(`[SYNC] ↺ ${r.client_transaction_id} sudah pernah disinkronkan sebelumnya, dilewati (idempotent).`);
      markSynced.run(r.client_transaction_id);
    } else {
      console.log(`[SYNC] ✘ ${r.client_transaction_id} DITOLAK server: ${r.error}`);
      console.log('       (tetap tersimpan di antrean lokal, tidak otomatis dihapus, perlu ditinjau kasir/manajer)');
    }
  }
}

async function main() {
  console.log('=== Simulasi kasir offline-first: cabang Kelapa Gading ===\n');

  console.log('Kasir login sekali di awal shift (butuh koneksi):');
  const token = await login('kasir1', 'kasir123');
  console.log('Login berhasil.\n');

  console.log('--- Internet toko putus. Kasir tetap melayani pembeli seperti biasa. ---');
  createOfflineTransaction({ items: [{ product_id: 'p4', qty: 2 }], method: 'tunai', cash_received: 20000 });
  createOfflineTransaction({ items: [{ product_id: 'p1', qty: 1 }], method: 'qris' });
  console.log('');

  console.log('--- Internet toko kembali normal. ---');
  await syncNow(token);
  console.log('');

  console.log('--- Simulasi sinkron terulang (misal app restart sebelum antrean lokal dibersihkan) ---');
  await syncNow(token);
}

main().catch((err) => {
  console.error('Gagal menjalankan simulasi:', err.message);
  process.exit(1);
});
