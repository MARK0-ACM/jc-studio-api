const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// -----------------------------------------------------------------
// 1. CREAR CITA (Público)
// POST /api/citas
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
  const { nombre, email, fecha, servicioId } = req.body;

  if (!nombre || !email || !fecha || !servicioId) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO Citas (cliente_nombre, cliente_email, fecha_hora, servicio_id, estado) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, fecha, servicioId, 'pendiente']
    );

    res.status(201).json({ 
      message: 'Cita agendada exitosamente.',
      citaId: result.insertId 
    });

  } catch (error) {
    console.error('Error al agendar:', error);
    res.status(500).json({ error: 'Error interno al agendar la cita.' });
  }
});

// -----------------------------------------------------------------
// 2. OBTENER TODAS LAS CITAS (Admin)
// GET /api/citas
// Usamos JOIN para saber el nombre del servicio
// -----------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        Citas.id, 
        Citas.cliente_nombre, 
        Citas.cliente_email, 
        Citas.fecha_hora, 
        Citas.estado,
        Servicios.nombre AS servicio_nombre,
        Servicios.precio
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      ORDER BY Citas.fecha_hora ASC
    `;
    
    // --- AQUÍ ESTABA EL ERROR, AHORA ESTÁ CORREGIDO ---
    const [rows] = await pool.query(query);
    
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// -----------------------------------------------------------------
// 3. ACTUALIZAR ESTADO DE CITA (Admin)
// PUT /api/citas/:id/estado
// Body: { estado: 'confirmada' | 'cancelada' }
// -----------------------------------------------------------------
router.put('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body; // Esperamos 'confirmada', 'cancelada', etc.

  try {
    await pool.query('UPDATE Citas SET estado = ? WHERE id = ?', [estado, id]);
    res.json({ message: `Cita actualizada a: ${estado}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar cita' });
  }
});

// -----------------------------------------------------------------
// 4. ELIMINAR CITA (Admin)
// DELETE /api/citas/:id
// -----------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM Citas WHERE id = ?', [id]);
    res.json({ message: 'Cita eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar cita' });
  }
});

module.exports = router;