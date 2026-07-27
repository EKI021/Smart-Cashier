const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM branches ORDER BY name');
    res.json({ branches: rows });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, address } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nama cabang wajib diisi.' });

    const id = 'br-' + crypto.randomUUID().slice(0, 8);
    const { rows } = await pool.query(
      'INSERT INTO branches (id, name, address) VALUES ($1,$2,$3) RETURNING *',
      [id, name, address || null]
    );
    res.status(201).json({ branch: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
