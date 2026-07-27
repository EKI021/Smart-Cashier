const express = require('express');
const pool = require('../db/pool');
const { requireAuth, scopeBranchId } = require('../middleware/auth');
const { processTransaction } = require('../services/transactionService');

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const branchId = scopeBranchId(req) || req.body.branch_id;
    if (!branchId) return res.status(400).json({ error: 'branch_id wajib diisi.' });

    const result = await processTransaction({
      branchId,
      cashierId: req.user.id,
      items: req.body.items,
      method: req.body.method,
      cashReceived: req.body.cash_received,
      clientTransactionId: req.body.client_transaction_id,
      createdOffline: false
    });

    res.status(result.duplicate ? 200 : 201).json({
      transaction: { ...result.transaction, cashier: req.user.name },
      duplicate: result.duplicate
    });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const scope = scopeBranchId(req);
    const branchId = req.query.branch_id || scope;

    const { rows } = branchId
      ? await pool.query(
          'SELECT * FROM transactions WHERE branch_id = $1 ORDER BY occurred_at DESC LIMIT 200',
          [branchId]
        )
      : await pool.query('SELECT * FROM transactions ORDER BY occurred_at DESC LIMIT 200');

    res.json({ transactions: rows });
  } catch (err) { next(err); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    const trx = rows[0];
    if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });

    const scope = scopeBranchId(req);
    if (scope && trx.branch_id !== scope) {
      return res.status(403).json({ error: 'Transaksi ini bukan milik cabang Anda.' });
    }

    const { rows: items } = await pool.query(
      'SELECT * FROM transaction_items WHERE transaction_id = $1',
      [trx.id]
    );
    res.json({ transaction: { ...trx, items } });
  } catch (err) { next(err); }
});

module.exports = router;
