const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const verifyToken = require('../middleware/authMiddleware');
const SECRET_KEY = 'secreto_super_seguro'; // Misma clave que en auth.js

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
// 1. CREAR CITA (Público o Autenticado) - CON VALIDACIÓN ANTI-CHOQUES
// POST /api/citas
// Si hay token, usa el email del usuario autenticado automáticamente
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
  let { nombre, email, fecha, servicioId } = req.body;

  // Verificar si hay token (usuario autenticado)
  let usuarioAutenticado = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, SECRET_KEY);
        usuarioAutenticado = decoded;
        console.log('👤 Usuario autenticado detectado al crear cita:', usuarioAutenticado.email);
      }
    } catch (err) {
      // Si el token es inválido, continuar como usuario no autenticado
      console.log('⚠️ Token inválido o expirado, continuando como usuario público');
    }
  }

  // Si el usuario está autenticado, usar su email y nombre automáticamente
  if (usuarioAutenticado && usuarioAutenticado.email) {
    email = usuarioAutenticado.email; // Forzar el email del usuario autenticado
    if (usuarioAutenticado.nombre && !nombre) {
      nombre = usuarioAutenticado.nombre; // Usar nombre del token si no se proporcionó
    }
    console.log(`✅ Usando email del usuario autenticado: ${email}`);
  }

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

    // --- VALIDACIÓN DE HORARIO LABORAL ---
    // Configuración: Lunes a Sábado, 11:00 AM a 6:00 PM
    const HORA_INICIO_LABORAL = 11; // 11:00 AM
    const HORA_FIN_LABORAL = 18; // 6:00 PM (18:00)
    const DIA_DOMINGO = 0; // Domingo = 0 en JavaScript Date

    // Validar que no sea domingo
    const diaSemana = fechaInicioNueva.getDay();
    if (diaSemana === DIA_DOMINGO) {
      return res.status(400).json({ 
        error: 'No se pueden agendar citas los domingos. El horario de atención es de lunes a sábado.' 
      });
    }

    // Validar que la hora esté dentro del horario laboral
    const horaInicio = fechaInicioNueva.getHours();
    const minutosInicio = fechaInicioNueva.getMinutes();
    
    // Convertir a minutos desde medianoche para facilitar comparación
    const minutosInicioTotal = horaInicio * 60 + minutosInicio;
    const minutosInicioLaboral = HORA_INICIO_LABORAL * 60; // 11:00 AM = 660 minutos
    const minutosFinLaboral = HORA_FIN_LABORAL * 60; // 6:00 PM = 1080 minutos

    if (minutosInicioTotal < minutosInicioLaboral) {
      return res.status(400).json({ 
        error: `El horario de atención es de ${HORA_INICIO_LABORAL}:00 AM a ${HORA_FIN_LABORAL}:00 PM. Por favor, selecciona un horario dentro de este rango.` 
      });
    }

    // Calcular la hora de finalización de la cita (considerando duración)
    const fechaFinNueva = new Date(fechaInicioNueva.getTime() + duracionNuevaCita * 60000);
    const minutosFinTotal = fechaFinNueva.getHours() * 60 + fechaFinNueva.getMinutes();

    // Validar que la cita termine antes del cierre (6:00 PM)
    if (minutosFinTotal > minutosFinLaboral) {
      const horaFinFormateada = fechaFinNueva.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      return res.status(400).json({ 
        error: `Esta cita terminaría a las ${horaFinFormateada}, pero el horario de atención es hasta las ${HORA_FIN_LABORAL}:00 PM. Por favor, selecciona un horario más temprano que permita completar el servicio antes del cierre.` 
      });
    }

    // Validar que la hora de inicio no sea después del cierre
    if (minutosInicioTotal >= minutosFinLaboral) {
      return res.status(400).json({ 
        error: `El horario de atención es de ${HORA_INICIO_LABORAL} hasta las ${HORA_FIN_LABORAL}:00 PM. Por favor, selecciona un horario dentro de este rango.` 
      });
    }

    console.log(`✅ Validación de horario laboral exitosa. Inicio: ${fechaInicioNueva.toLocaleTimeString()}, Fin: ${fechaFinNueva.toLocaleTimeString()}`);
    
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
// 2. OBTENER CITAS (Admin: TODAS | Cliente: SOLO LAS SUYAS)
// GET /api/citas
// Usamos JOIN para saber el nombre del servicio
// -----------------------------------------------------------------
router.get('/', verifyToken, async (req, res) => {
  try {
    // Verificar que tenemos el usuario autenticado
    if (!req.user || !req.user.rol) {
      return res.status(403).json({ error: 'Acceso denegado. Autenticación requerida.' });
    }

    const usuarioRol = req.user.rol;
    let usuarioEmail = req.user.email;
    
    // Si el email no está en el token (tokens antiguos), obtenerlo de la BD
    if (!usuarioEmail && req.user.id) {
      const [usuario] = await pool.query('SELECT email FROM Usuarios WHERE id = ?', [req.user.id]);
      if (usuario.length > 0) {
        usuarioEmail = usuario[0].email;
      }
    }
    
    // Construir la query base
    let query = `
      SELECT 
        Citas.id, 
        Citas.cliente_nombre, 
        Citas.cliente_email, 
        Citas.fecha_hora, 
        Citas.estado,
        Citas.servicio_id,
        Servicios.nombre AS servicio_nombre,
        Servicios.precio,
        Usuarios.telefono AS cliente_telefono
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      LEFT JOIN Usuarios ON Usuarios.email = Citas.cliente_email
    `;
    
    const params = [];
    
    // 🔐 LÓGICA INTELIGENTE: Admin ve TODO, Cliente ve solo sus citas
    if (usuarioRol === 'admin') {
      // Admin: Sin filtro, obtenemos TODAS las citas
      console.log('👑 Admin solicitando citas: mostrando TODAS');
    } else if (usuarioRol === 'cliente') {
      // Cliente: Solo sus propias citas filtradas por email
      if (!usuarioEmail) {
        return res.status(400).json({ error: 'No se pudo identificar el email del usuario. Por favor, inicia sesión nuevamente.' });
      }
      query += ' WHERE Citas.cliente_email = ?';
      params.push(usuarioEmail);
      console.log(`👤 Cliente solicitando citas: filtrando por email ${usuarioEmail}`);
    } else {
      return res.status(403).json({ error: 'Rol no reconocido. Acceso denegado.' });
    }
    
    query += ' ORDER BY Citas.fecha_hora ASC';
    
    const [rows] = await pool.query(query, params);
    
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
// 3.5. CANCELAR CITA (Cliente) - CON VALIDACIONES
// POST /api/citas/:id/cancelar
// Requiere autenticación y verifica que la cita pertenezca al cliente
// Valida tiempo mínimo antes de la cita (configurable, default: 1 hora)
// -----------------------------------------------------------------
router.post('/:id/cancelar', verifyToken, async (req, res) => {
  const { id } = req.params;
  const usuarioEmail = req.user?.email;
  const usuarioRol = req.user?.rol;

  // Configuración: Tiempo mínimo antes de la cita para poder cancelar (en horas)
  const HORAS_MINIMAS_ANTES = 1; // Puedes cambiar esto según tus necesidades

  if (!usuarioEmail) {
    return res.status(400).json({ error: 'No se pudo identificar tu email. Por favor, inicia sesión nuevamente.' });
  }

  try {
    // 1. Obtener la cita y verificar que existe
    const [citas] = await pool.query(
      `SELECT id, cliente_email, fecha_hora, estado, servicio_id 
       FROM Citas 
       WHERE id = ?`,
      [id]
    );

    if (citas.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const cita = citas[0];

    // 2. Verificar que la cita pertenece al cliente (a menos que sea admin)
    if (usuarioRol !== 'admin' && usuarioRol !== 'jefe') {
      if (cita.cliente_email !== usuarioEmail) {
        return res.status(403).json({ 
          error: 'No tienes permiso para cancelar esta cita. Solo puedes cancelar tus propias citas.' 
        });
      }
    }

    // 3. Verificar que la cita esté en un estado cancelable
    const estadosCancelables = ['pendiente', 'confirmada'];
    if (!estadosCancelables.includes(cita.estado)) {
      return res.status(400).json({ 
        error: `No puedes cancelar una cita que ya está ${cita.estado === 'cancelada' ? 'cancelada' : 'rechazada'}.` 
      });
    }

    // 4. Verificar tiempo mínimo antes de la cita
    const fechaCita = new Date(cita.fecha_hora);
    const ahora = new Date();
    const diferenciaMs = fechaCita.getTime() - ahora.getTime();
    const diferenciaHoras = diferenciaMs / (1000 * 60 * 60);

    if (diferenciaHoras < HORAS_MINIMAS_ANTES) {
      const minutosRestantes = Math.floor(diferenciaMs / (1000 * 60));
      return res.status(400).json({ 
        error: `No puedes cancelar esta cita. Debes cancelar con al menos ${HORAS_MINIMAS_ANTES} hora(s) de anticipación. ` +
               `Tu cita es en ${minutosRestantes} minuto(s). Por favor, contacta directamente con el establecimiento.`,
        tiempoRestante: minutosRestantes,
        requiereContacto: true
      });
    }

    // 5. Obtener información completa de la cita (para notificar al admin)
    const [citaCompleta] = await pool.query(
      `SELECT 
        Citas.id,
        Citas.cliente_nombre,
        Citas.cliente_email,
        Citas.fecha_hora,
        Servicios.nombre AS servicio_nombre,
        Servicios.precio
      FROM Citas
      JOIN Servicios ON Citas.servicio_id = Servicios.id
      WHERE Citas.id = ?`,
      [id]
    );

    // 6. Obtener teléfono del admin (priorizar 'admin', luego 'jefe')
    let adminTelefono = null;
    const [admins] = await pool.query(
      `SELECT telefono FROM Usuarios 
       WHERE (rol = 'admin' OR rol = 'jefe') AND telefono IS NOT NULL AND telefono != ''
       ORDER BY CASE WHEN rol = 'admin' THEN 1 ELSE 2 END
       LIMIT 1`
    );

    if (admins.length > 0) {
      adminTelefono = admins[0].telefono;
      console.log(`📞 Teléfono del admin encontrado: ${adminTelefono}`);
    } else {
      console.log('⚠️ No se encontró teléfono del admin en la base de datos');
    }

    // 7. Si todo está bien, cancelar la cita
    const [result] = await pool.query(
      'UPDATE Citas SET estado = ? WHERE id = ?',
      ['cancelada', id]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: 'Error al cancelar la cita' });
    }

    // 8. Preparar respuesta (incluyendo datos para notificar al admin)
    const respuesta = {
      message: 'Cita cancelada exitosamente',
      estado: 'cancelada',
      penalizacion: false, // Preparado para futuro: si se cancela con menos de X horas, podría haber penalización
      mensajePenalizacion: null,
      // Datos para notificar al admin
      notificarAdmin: adminTelefono ? true : false,
      adminTelefono: adminTelefono,
      citaInfo: citaCompleta.length > 0 ? {
        clienteNombre: citaCompleta[0].cliente_nombre,
        clienteEmail: citaCompleta[0].cliente_email,
        servicioNombre: citaCompleta[0].servicio_nombre,
        fechaHora: citaCompleta[0].fecha_hora,
        precio: citaCompleta[0].precio
      } : null
    };

    // TODO: Aquí podrías agregar lógica para:
    // - Si se cancela con menos de 24 horas pero más de 1 hora: cobrar un porcentaje
    // - Si se cancela con menos de 1 hora: cobrar el 100% o no permitir cancelación
    // - Guardar historial de cancelaciones para detectar clientes que cancelan frecuentemente

    console.log(`✅ Cita ${id} cancelada por cliente ${usuarioEmail}`);
    res.json(respuesta);

  } catch (error) {
    console.error('❌ Error al cancelar cita:', error);
    res.status(500).json({ error: 'Error interno al cancelar la cita' });
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