const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Kirim stok dari satu cabang ke cabang lain. Stok langsung dikurangi dari
// cabang asal (berstatus "in_transit") tapi belum ditambahkan ke cabang
// tujuan sampai dikonfirmasi diterima lewat /transfers/:id/receive.
router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  const { from_branch, to_branch, product_id, qty } = req.body || {};
  if (!from_branch || !to_branch || !product_id || !qty || qty <= 0) {
    return res.status(400).json({ error: 'from_branch, to_branch, product_id, dan qty (>0) wajib diisi.' });
  }
  if (from_branch === to_branch) {
    return res.status(400).json({ error: 'Cabang asal dan tujuan tidak boleh sama.' });
  }
  if (req.user.role === 'manager' && req.user.branch_id !== from_branch) {
    return res.status(403).json({ error: 'Manager hanya bisa mengirim stok dari cabangnya sendiri.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stockResult = await client.query(
      'SELECT stock FROM branch_stock WHERE branch_id=$1 AND product_id=$2 FOR UPDATE',
      [from_branch, product_id]
    );
    const current = stockResult.rows[0];
    if (!current) {
      throw { status: 404, message: 'Produk tidak terdaftar di cabang asal.' };
    }
    if (current.stock < qty) {
      throw { status: 409, message: `Stok tidak cukup di cabang asal (tersisa ${current.stock}).` };
    }

    await client.query(
      'UPDATE branch_stock SET stock = stock - $1, updated_at = now() WHERE branch_id=$2 AND product_id=$3',
      [qty, from_branch, product_id]
    );

    const id = 'TF-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const { rows } = await client.query(
      `INSERT INTO stock_transfers (id, from_branch, to_branch, product_id, qty, status, requested_by)
       VALUES ($1,$2,$3,$4,$5,'in_transit',$6) RETURNING *`,
      [id, from_branch, to_branch, product_id, qty, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ transfer: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

// Cabang tujuan mengonfirmasi barang sudah diterima secara fisik -- baru
// di titik ini stok cabang tujuan bertambah.
router.post('/:id/receive', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE', [req.params.id]);
    const transfer = rows[0];
    if (!transfer) throw { status: 404, message: 'Transfer tidak ditemukan.' };
    if (transfer.status !== 'in_transit') {
      throw { status: 409, message: `Transfer sudah berstatus ${transfer.status}, tidak bisa diterima lagi.` };
    }
    if (req.user.role === 'manager' && req.user.branch_id !== transfer.to_branch) {
      throw { status: 403, message: 'Hanya cabang tujuan yang bisa mengonfirmasi penerimaan.' };
    }

    await client.query(
      `INSERT INTO branch_stock (branch_id, product_id, stock)
       VALUES ($1,$2,$3)
       ON CONFLICT (branch_id, product_id) DO UPDATE SET stock = branch_stock.stock + $3, updated_at = now()`,
      [transfer.to_branch, transfer.product_id, transfer.qty]
    );

    const { rows: updated } = await client.query(
      `UPDATE stock_transfers SET status='completed', completed_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json({ transfer: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM stock_transfers ORDER BY created_at DESC LIMIT 200');
    res.json({ transfers: rows });
  } catch (err) { next(err); }
});

module.exports = router;
