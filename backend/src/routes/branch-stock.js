const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole, scopeBranchId } = require('../middleware/auth');

const router = express.Router();

// Stok + info produk untuk satu cabang (atau semua cabang kalau admin & tidak
// menentukan branch_id).
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const scope = scopeBranchId(req);
    const branchId = req.query.branch_id || scope;

    const query = branchId
      ? `SELECT bs.branch_id, bs.product_id, p.name, p.category, p.price, bs.stock, bs.updated_at
         FROM branch_stock bs JOIN products p ON p.id = bs.product_id
         WHERE bs.branch_id = $1 AND p.active = true ORDER BY p.name`
      : `SELECT bs.branch_id, bs.product_id, p.name, p.category, p.price, bs.stock, bs.updated_at
         FROM branch_stock bs JOIN products p ON p.id = bs.product_id
         WHERE p.active = true ORDER BY bs.branch_id, p.name`;

    const { rows } = branchId ? await pool.query(query, [branchId]) : await pool.query(query);
    res.json({ stock: rows });
  } catch (err) { next(err); }
});

// Koreksi stok manual (mis. hasil stock opname / hitung fisik ulang).
router.put('/:productId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const scope = scopeBranchId(req);
    const branchId = scope || req.body.branch_id;
    if (!branchId) return res.status(400).json({ error: 'branch_id wajib diisi.' });

    const { stock } = req.body || {};
    if (stock === undefined || stock < 0) {
      return res.status(400).json({ error: 'Nilai stok tidak valid.' });
    }

    const { rows } = await pool.query(
      `UPDATE branch_stock SET stock = $1, updated_at = now()
       WHERE branch_id = $2 AND product_id = $3 RETURNING *`,
      [stock, branchId, req.params.productId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Kombinasi cabang & produk tidak ditemukan.' });
    }
    res.json({ branch_stock: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
