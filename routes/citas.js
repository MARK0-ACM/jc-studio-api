const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Importamos el pool de la base de datos

// -----------------------------------------------------------------
// Endpoint: POST /api/citas
// Propósito: Crear una new cita
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
  // 1. Obtenemos los datos del formulario (desde React)
  const { nombre, email, fecha, servicioId } = req.body;

  // 2. Validación simple
  if (!nombre || !email || !fecha || !servicioId) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  try {
    // 3. Insertamos los datos en la tabla 'Citas'
    const [result] = await pool.query(
      'INSERT INTO Citas (cliente_nombre, cliente_email, fecha_hora, servicio_id, estado) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, fecha, servicioId, 'pendiente'] // El estado por defecto es 'pendiente'
    );

    // 4. Respondemos al frontend con éxito
    res.status(201).json({ 
      message: 'Cita agendada exitosamente.',
      citaId: result.insertId // Enviamos el ID de la cita creada
    });

  } catch (error) {
    // 5. Manejo de errores
    console.error('Error al agendar la cita:', error);
    res.status(500).json({ error: 'Error interno del servidor al agendar la cita.' });
  }
});

module.exports = router;