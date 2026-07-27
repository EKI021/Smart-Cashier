const express = require('express');
const pool = require('../db/pool');
const { requireAuth, scopeBranchId } = require('../middleware/auth');
const { processTransaction } = require('../services/transactionService');

const router = express.Router();

/**
 * Kasir yang sempat offline mengirim SEMUA transaksi yang tertunda di sini
 * sekaligus, begitu koneksi kembali. Tiap transaksi diproses independen --
 * satu gagal (misal stok sudah habis duluan dipakai cabang lain secara
 * konkuren) tidak menggagalkan yang lain dalam batch yang sama.
 */
router.post('/push', requireAuth, async (req, res, next) => {
  try {
    const branchId = scopeBranchId(req) || req.body.branch_id;
    if (!branchId) return res.status(400).json({ error: 'branch_id wajib diisi.' });

    const pending = Array.isArray(req.body.transactions) ? req.body.transactions : [];
    if (pending.length === 0) {
      return res.status(400).json({ error: 'Tidak ada transaksi untuk disinkronkan.' });
    }

    const results = [];
    for (const trx of pending) {
      try {
        const result = await processTransaction({
          branchId,
          cashierId: req.user.id,
          items: trx.items,
          method: trx.method,
          cashReceived: trx.cash_received,
          clientTransactionId: trx.client_transaction_id,
          occurredAt: trx.occurred_at,
          createdOffline: true
        });
        results.push({
          client_transaction_id: trx.client_transaction_id,
          status: result.duplicate ? 'already_synced' : 'synced',
          transaction: result.transaction
        });
      } catch (err) {
        results.push({
          client_transaction_id: trx.client_transaction_id,
          status: 'rejected',
          error: err && err.message ? err.message : 'Gagal memproses transaksi.',
          conflict: err && err.conflict ? err.conflict : undefined
        });
      }
    }

    res.json({ results });
  } catch (err) { next(err); }
});

/**
 * Kasir menarik snapshot katalog + stok cabangnya untuk disimpan di cache
 * lokal, supaya tetap bisa melayani transaksi walau internet terputus.
 */
router.get('/pull', requireAuth, async (req, res, next) => {
  try {
    const branchId = scopeBranchId(req) || req.query.branch_id;
    if (!branchId) return res.status(400).json({ error: 'branch_id wajib diisi.' });

    const { rows: products } = await pool.query('SELECT * FROM products WHERE active = true ORDER BY name');
    const { rows: stock } = await pool.query(
      `SELECT bs.product_id, bs.stock, bs.updated_at
       FROM branch_stock bs WHERE bs.branch_id = $1`,
      [branchId]
    );

    res.json({
      server_time: new Date().toISOString(),
      branch_id: branchId,
      products,
      stock
    });
  } catch (err) { next(err); }
});

module.exports = router;
