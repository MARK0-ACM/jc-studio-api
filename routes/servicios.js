const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// -----------------------------------------------------------------
// 1. OBTENER TODOS LOS SERVICIOS (Público y Admin)
// GET /api/servicios
// -----------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Servicios');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// -----------------------------------------------------------------
// 2. CREAR UN NUEVO SERVICIO (Solo Admin)
// POST /api/servicios
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
  const { nombre, descripcion, duracion_min, precio } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO Servicios (nombre, descripcion, duracion_min, precio) VALUES (?, ?, ?, ?)',
      [nombre, descripcion, duracion_min, precio]
    );
    res.status(201).json({ id: result.insertId, message: 'Servicio creado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el servicio' });
  }
});

// -----------------------------------------------------------------
// 3. ACTUALIZAR UN SERVICIO (Solo Admin)
// PUT /api/servicios/:id
// -----------------------------------------------------------------
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, duracion_min, precio } = req.body;

  try {
    await pool.query(
      'UPDATE Servicios SET nombre = ?, descripcion = ?, duracion_min = ?, precio = ? WHERE id = ?',
      [nombre, descripcion, duracion_min, precio, id]
    );
    res.json({ message: 'Servicio actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el servicio' });
  }
});

// -----------------------------------------------------------------
// 4. ELIMINAR UN SERVICIO (Solo Admin)
// DELETE /api/servicios/:id
// -----------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Primero revisamos si hay citas agendadas con este servicio para evitar errores de llave foránea
    // (Opcional: Podrías impedir borrarlo si tiene citas, pero por ahora lo haremos simple)
    
    await pool.query('DELETE FROM Servicios WHERE id = ?', [id]);
    res.json({ message: 'Servicio eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    // Si falla por llave foránea (tiene citas), MySQL dará un error específico
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ error: 'No se puede eliminar este servicio porque tiene citas agendadas.' });
    }
    res.status(500).json({ error: 'Error al eliminar el servicio' });
  }
});

module.exports = router;