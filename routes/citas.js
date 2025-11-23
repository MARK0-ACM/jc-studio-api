const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Helper para comparar solo las fechas (sin hora)
function compararSoloFechas(fecha1, fecha2) {
  const d1 = new Date(fecha1);
  d1.setHours(0, 0, 0, 0, 0);
  const d2 = new Date(fecha2);
  d2.setHours(0, 0, 0, 0, 0);
  
  const año1 = d1.getFullYear();
  const mes1 = d1.getMonth();
  const dia1 = d1.getDate();
  
  const año2 = d2.getFullYear();
  const mes2 = d2.getMonth();
  const dia2 = d2.getDate();
  
  if (año1 < año2) return -1;
  if (año1 > año2) return 1;
  if (mes1 < mes2) return -1;
  if (mes1 > mes2) return 1;
  if (dia1 < dia2) return -1;
  if (dia1 > dia2) return 1;
  return 0;
}

// -----------------------------------------------------------------
// 1. CREAR CITA (Público) - CON VALIDACIÓN ANTI-CHOQUES
// POST /api/citas
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
  const { nombre, email, fecha, servicioId } = req.body;

  if (!nombre || !email || !fecha || !servicioId) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  try {
    // --- PASO 1: OBTENER LA DURACIÓN DEL SERVICIO SOLICITADO ---
    const [servicio] = await pool.query(
      'SELECT duracion_min FROM Servicios WHERE id = ?',
      [servicioId]
    );

    if (servicio.length === 0) {
      return res.status(400).json({ error: 'El servicio especificado no existe.' });
    }

    const duracionNuevaCita = servicio[0].duracion_min; // duración en minutos

    // --- PASO 2: VALIDACIÓN DE DISPONIBILIDAD CON INTERSECCIÓN DE INTERVALOS ---
    // Convertir la fecha de inicio de la nueva cita a objeto Date
    console.log(`📅 Fecha recibida del frontend: "${fecha}"`);
    const fechaInicioNueva = new Date(fecha);
    console.log(`📅 Fecha parseada: ${fechaInicioNueva.toISOString()}`);
    
    // Validar que la fecha sea válida
    if (isNaN(fechaInicioNueva.getTime())) {
      console.log(`❌ Fecha inválida: ${fecha}`);
      return res.status(400).json({ error: 'La fecha proporcionada no es válida.' });
    }
    
    // Validar que la fecha no sea en el pasado (desde el día actual en adelante)
    const fechaActual = new Date();
    
    // Comparar solo las fechas (año, mes, día) usando la función helper
    const comparacion = compararSoloFechas(fechaInicioNueva, fechaActual);
    
    // Si la fecha es anterior al día de hoy (comparacion < 0), rechazar
    if (comparacion < 0) {
      const fechaSolicitadaStr = new Date(fechaInicioNueva).toLocaleDateString('es-MX');
      const fechaHoyStr = new Date(fechaActual).toLocaleDateString('es-MX');
      console.log(`❌ Fecha pasada detectada. Fecha solicitada: ${fechaSolicitadaStr}, Hoy: ${fechaHoyStr}`);
      return res.status(400).json({ 
        error: 'No se pueden agendar citas para fechas pasadas. Por favor elige una fecha a partir de hoy.' 
      });
    }
    
    // Si es el mismo día (comparacion === 0), verificar que la hora no haya pasado
    if (comparacion === 0 && fechaInicioNueva < fechaActual) {
      console.log(`❌ Hora pasada detectada. Fecha solicitada: ${fechaInicioNueva.toISOString()}, Ahora: ${fechaActual.toISOString()}`);
      return res.status(400).json({ 
        error: 'No se pueden agendar citas para horarios que ya pasaron. Por favor elige un horario más tarde.' 
      });
    }
    
    console.log(`✅ Validación de fecha exitosa. Fecha solicitada: ${fechaInicioNueva.toISOString()}, Comparación: ${comparacion}`);
    
    const fechaFinNueva = new Date(fechaInicioNueva.getTime() + duracionNuevaCita * 60000); // + minutos en milisegundos

    // Obtener todas las citas existentes del mismo día que NO estén canceladas
    // Incluimos la duración del servicio para calcular el intervalo completo
    const [citasExistentes] = await pool.query(
      `SELECT 
        Citas.fecha_hora, 
        Servicios.duracion_min
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      WHERE DATE(Citas.fecha_hora) = DATE(?) 
        AND Citas.estado != "cancelada"`,
      [fecha]
    );

    // Verificar intersección de intervalos para cada cita existente
    // Fórmula: inicio_nueva < fin_existente AND fin_nueva > inicio_existente
    for (const citaExistente of citasExistentes) {
      // Asegurar que la fecha viene de la BD como string/datetime válido
      const fechaHoraExistente = citaExistente.fecha_hora instanceof Date 
        ? citaExistente.fecha_hora 
        : new Date(citaExistente.fecha_hora);
      
      // Validar que la fecha existente sea válida
      if (isNaN(fechaHoraExistente.getTime())) {
        console.warn('Fecha inválida encontrada en cita existente:', citaExistente.fecha_hora);
        continue; // Saltar esta cita si tiene fecha inválida
      }
      
      const fechaInicioExistente = fechaHoraExistente;
      const fechaFinExistente = new Date(
        fechaInicioExistente.getTime() + (citaExistente.duracion_min || 0) * 60000
      );

      // Verificar si hay intersección de intervalos
      const hayChoque = fechaInicioNueva < fechaFinExistente && fechaFinNueva > fechaInicioExistente;

      if (hayChoque) {
      // ¡Conflicto encontrado!
      return res.status(409).json({ // 409 = Conflict
        error: 'Lo sentimos, ese horario ya está ocupado. Por favor elige otro.' 
      });
      }
    }

    // --- PASO 3: SI ESTÁ LIBRE, GUARDAMOS ---
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
        Citas.servicio_id,
        Servicios.nombre AS servicio_nombre,
        Servicios.precio
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      ORDER BY Citas.fecha_hora ASC
    `;
    
    const [rows] = await pool.query(query);
    
    // Normalizar fechas a formato ISO string para evitar problemas en el frontend
    const citasNormalizadas = rows.map(cita => {
      // Si fecha_hora es un objeto Date o string, convertirlo a ISO string
      let fechaHoraISO = cita.fecha_hora;
      if (cita.fecha_hora) {
        const fecha = cita.fecha_hora instanceof Date 
          ? cita.fecha_hora 
          : new Date(cita.fecha_hora);
        
        if (!isNaN(fecha.getTime())) {
          fechaHoraISO = fecha.toISOString();
        }
      }
      
      return {
        ...cita,
        fecha_hora: fechaHoraISO
      };
    });
    
    res.json(citasNormalizadas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// -----------------------------------------------------------------
// 3. ACTUALIZAR ESTADO DE CITA (Admin) - DEBE IR ANTES DE /:id
// PUT /api/citas/:id/estado o PATCH /api/citas/:id/estado
// Body: { estado: 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada' }
// -----------------------------------------------------------------
router.put('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  console.log(`🔔 PUT /api/citas/${id}/estado - Estado recibido:`, estado);
  console.log('Body completo:', req.body);

  // Validar que el estado sea uno de los permitidos
  const estadosPermitidos = ['pendiente', 'confirmada', 'rechazada', 'cancelada'];
  if (!estado || !estadosPermitidos.includes(estado)) {
    console.log('❌ Estado inválido:', estado);
    return res.status(400).json({ 
      error: `Estado inválido. Debe ser uno de: ${estadosPermitidos.join(', ')}` 
    });
  }

  try {
    console.log(`Actualizando cita ${id} a estado: ${estado}`);
    const [result] = await pool.query('UPDATE Citas SET estado = ? WHERE id = ?', [estado, id]);
    
    console.log('Resultado de la query:', result);
    
    if (result.affectedRows === 0) {
      console.log(`❌ Cita ${id} no encontrada`);
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    console.log(`✅ Cita ${id} actualizada exitosamente a: ${estado}`);
    res.json({ 
      message: `Cita actualizada a: ${estado}`,
      estado: estado
    });
  } catch (error) {
    console.error('❌ Error al actualizar cita:', error);
    
    // Si el error es porque el ENUM no incluye el valor (ej: 'rechazada')
    if (error.code === 'WARN_DATA_TRUNCATED' || error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ 
        error: `El estado "${estado}" no está permitido en la base de datos. 
                Por favor ejecuta la migración: node scripts/update-estado-enum.js` 
      });
    }
    
    res.status(500).json({ error: 'Error al actualizar cita' });
  }
});

// También soportar PATCH para ser más RESTful
router.patch('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  console.log(`🔔 PATCH /api/citas/${id}/estado - Estado recibido:`, estado);
  console.log('Body completo:', req.body);

  // Validar que el estado sea uno de los permitidos
  const estadosPermitidos = ['pendiente', 'confirmada', 'rechazada', 'cancelada'];
  if (!estado || !estadosPermitidos.includes(estado)) {
    console.log('❌ Estado inválido:', estado);
    return res.status(400).json({ 
      error: `Estado inválido. Debe ser uno de: ${estadosPermitidos.join(', ')}` 
    });
  }

  try {
    console.log(`Actualizando cita ${id} a estado: ${estado}`);
    const [result] = await pool.query('UPDATE Citas SET estado = ? WHERE id = ?', [estado, id]);
    
    console.log('Resultado de la query:', result);
    
    if (result.affectedRows === 0) {
      console.log(`❌ Cita ${id} no encontrada`);
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    console.log(`✅ Cita ${id} actualizada exitosamente a: ${estado}`);
    res.json({ 
      message: `Cita actualizada a: ${estado}`,
      estado: estado
    });
  } catch (error) {
    console.error('❌ Error al actualizar cita:', error);
    
    // Si el error es porque el ENUM no incluye el valor (ej: 'rechazada')
    if (error.code === 'WARN_DATA_TRUNCATED' || error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ 
        error: `El estado "${estado}" no está permitido en la base de datos. 
                Por favor ejecuta la migración: node scripts/update-estado-enum.js` 
      });
    }
    
    res.status(500).json({ error: 'Error al actualizar cita' });
  }
});

// -----------------------------------------------------------------
// 4. OBTENER UNA CITA POR ID (Admin)
// GET /api/citas/:id
// -----------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const query = `
      SELECT 
        Citas.id, 
        Citas.cliente_nombre, 
        Citas.cliente_email, 
        Citas.fecha_hora, 
        Citas.estado,
        Citas.servicio_id,
        Servicios.nombre AS servicio_nombre,
        Servicios.precio
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      WHERE Citas.id = ?
    `;
    
    const [rows] = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }
    
    // Normalizar fecha a formato ISO string
    const cita = rows[0];
    let fechaHoraISO = cita.fecha_hora;
    if (cita.fecha_hora) {
      const fecha = cita.fecha_hora instanceof Date 
        ? cita.fecha_hora 
        : new Date(cita.fecha_hora);
      
      if (!isNaN(fecha.getTime())) {
        fechaHoraISO = fecha.toISOString();
      }
    }
    
    res.json({
      ...cita,
      fecha_hora: fechaHoraISO
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener cita' });
  }
});

// -----------------------------------------------------------------
// 5. ACTUALIZAR UNA CITA COMPLETA (Admin)
// PUT /api/citas/:id
// Body: { nombre, email, fecha, servicioId, estado? }
// -----------------------------------------------------------------
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, email, fecha, servicioId, estado } = req.body;

  if (!nombre || !email || !fecha || !servicioId) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  // Si se proporciona estado, validarlo
  if (estado) {
    const estadosPermitidos = ['pendiente', 'confirmada', 'rechazada', 'cancelada'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ 
        error: `Estado inválido. Debe ser uno de: ${estadosPermitidos.join(', ')}` 
      });
    }
  }

  try {
    // Validar que la fecha sea válida
    const fechaValidada = new Date(fecha);
    if (isNaN(fechaValidada.getTime())) {
      return res.status(400).json({ error: 'La fecha proporcionada no es válida.' });
    }

    // Validar que la fecha no sea en el pasado (desde el día actual en adelante)
    const fechaActual = new Date();
    
    // Comparar solo las fechas (año, mes, día) usando la función helper
    const comparacion = compararSoloFechas(fechaValidada, fechaActual);
    
    // Si la fecha es anterior al día de hoy (comparacion < 0), rechazar
    if (comparacion < 0) {
      const fechaSolicitadaStr = new Date(fechaValidada).toLocaleDateString('es-MX');
      const fechaHoyStr = new Date(fechaActual).toLocaleDateString('es-MX');
      console.log(`❌ Fecha pasada detectada en actualización. Fecha solicitada: ${fechaSolicitadaStr}, Hoy: ${fechaHoyStr}`);
      return res.status(400).json({ 
        error: 'No se pueden actualizar citas a fechas pasadas. Por favor elige una fecha a partir de hoy.' 
      });
    }
    
    // Si es el mismo día (comparacion === 0), verificar que la hora no haya pasado
    if (comparacion === 0 && fechaValidada < fechaActual) {
      console.log(`❌ Hora pasada detectada en actualización. Fecha solicitada: ${fechaValidada.toISOString()}, Ahora: ${fechaActual.toISOString()}`);
      return res.status(400).json({ 
        error: 'No se pueden actualizar citas a horarios que ya pasaron. Por favor elige un horario más tarde.' 
      });
    }
    
    console.log(`✅ Validación de fecha exitosa en actualización. Fecha solicitada: ${fechaValidada.toISOString()}, Comparación: ${comparacion}`);

    // Validar que el servicio exista y obtener su duración
    const [servicio] = await pool.query(
      'SELECT id, duracion_min FROM Servicios WHERE id = ?',
      [servicioId]
    );

    if (servicio.length === 0) {
      return res.status(400).json({ error: 'El servicio especificado no existe.' });
    }

    // Verificar si la cita existe
    const [citaExistente] = await pool.query('SELECT id FROM Citas WHERE id = ?', [id]);
    if (citaExistente.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    // Validar choques de horarios (excluyendo la cita actual que se está editando)
    const duracionServicio = servicio[0].duracion_min || 0;
    const fechaInicioNueva = new Date(fecha);
    const fechaFinNueva = new Date(fechaInicioNueva.getTime() + duracionServicio * 60000);

    const [citasChoque] = await pool.query(
      `SELECT 
        Citas.fecha_hora, 
        Servicios.duracion_min
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      WHERE DATE(Citas.fecha_hora) = DATE(?) 
        AND Citas.estado != "cancelada"
        AND Citas.id != ?`,
      [fecha, id]
    );

    for (const citaChoque of citasChoque) {
      const fechaHoraExistente = citaChoque.fecha_hora instanceof Date 
        ? citaChoque.fecha_hora 
        : new Date(citaChoque.fecha_hora);
      
      if (isNaN(fechaHoraExistente.getTime())) {
        continue;
      }
      
      const fechaInicioExistente = fechaHoraExistente;
      const fechaFinExistente = new Date(
        fechaInicioExistente.getTime() + (citaChoque.duracion_min || 0) * 60000
      );

      const hayChoque = fechaInicioNueva < fechaFinExistente && fechaFinNueva > fechaInicioExistente;

      if (hayChoque) {
        return res.status(409).json({
          error: 'Lo sentimos, ese horario ya está ocupado. Por favor elige otro.' 
        });
      }
    }

    // Actualizar la cita (incluyendo estado si se proporciona)
    if (estado) {
      await pool.query(
        'UPDATE Citas SET cliente_nombre = ?, cliente_email = ?, fecha_hora = ?, servicio_id = ?, estado = ? WHERE id = ?',
        [nombre, email, fecha, servicioId, estado, id]
      );
    } else {
      await pool.query(
        'UPDATE Citas SET cliente_nombre = ?, cliente_email = ?, fecha_hora = ?, servicio_id = ? WHERE id = ?',
        [nombre, email, fecha, servicioId, id]
      );
    }

    res.json({ message: 'Cita actualizada exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar cita' });
  }
});

// -----------------------------------------------------------------
// 6. ELIMINAR CITA (Admin)
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