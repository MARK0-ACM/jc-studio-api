const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// CLAVE SECRETA (Debería estar en variables de entorno, pero por ahora aquí)
const SECRET_KEY = 'secreto_super_seguro';

// -----------------------------------------------------------------
// 1. REGISTRO DE USUARIOS (Clientes)
// POST /api/auth/register
// -----------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { nombre, email, password, telefono } = req.body;

  // Validar campos requeridos
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' });
  }

  try {
    // Validar si ya existe
    const [existente] = await pool.query('SELECT * FROM Usuarios WHERE email = ?', [email]);
    if (existente.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado.' });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar como CLIENTE - EXPLÍCITAMENTE
    // Estructura de la tabla: id, nombre, email, telefono, password, rol, fecha_registro
    // El rol es ENUM('admin','cliente') con DEFAULT 'cliente', pero lo especificamos explícitamente
    const rolCliente = 'cliente';
    console.log(`📝 Registrando nuevo usuario:`);
    console.log(`   - Nombre: ${nombre}`);
    console.log(`   - Email: ${email}`);
    console.log(`   - Teléfono: ${telefono || 'No proporcionado'}`);
    console.log(`   - Rol: ${rolCliente} (explícito)`);
    
    // INSERT con todos los campos incluyendo telefono
    const [result] = await pool.query(
      'INSERT INTO Usuarios (nombre, email, telefono, password, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, telefono || null, hashedPassword, rolCliente]
    );

    console.log(`📝 Resultado del INSERT:`, result);

    // Verificar inmediatamente después de insertar
    const [usuarioInsertado] = await pool.query(
      'SELECT id, nombre, email, rol FROM Usuarios WHERE id = ?', 
      [result.insertId]
    );
    
    if (usuarioInsertado.length > 0) {
      const usuario = usuarioInsertado[0];
      console.log(`✅ Usuario insertado en BD:`, usuario);
      
      if (usuario.rol !== 'cliente') {
        console.error(`⚠️ ERROR: El usuario se registró con rol "${usuario.rol}" en lugar de "cliente"`);
        console.error(`⚠️ Esto puede indicar un problema con la base de datos (valor por defecto o trigger)`);
        
        // Intentar corregir el rol si está mal
        try {
          await pool.query('UPDATE Usuarios SET rol = ? WHERE id = ?', ['cliente', result.insertId]);
          console.log(`✅ Rol corregido a "cliente"`);
        } catch (updateError) {
          console.error(`❌ Error al corregir el rol:`, updateError);
        }
      } else {
        console.log(`✅ Rol correcto: cliente`);
      }
    } else {
      console.error(`❌ No se pudo verificar el usuario insertado`);
    }

    res.status(201).json({ message: 'Usuario registrado exitosamente.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor.' });
  }
});

// -----------------------------------------------------------------
// 2. LOGIN (Para Admin y Clientes)
// POST /api/auth/login
// -----------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM Usuarios WHERE email = ?', [email]);
    
    if (rows.length === 0) return res.status(400).json({ error: 'Credenciales inválidas' });

    const usuario = rows[0];
    const validPassword = await bcrypt.compare(password, usuario.password);

    if (!validPassword) return res.status(400).json({ error: 'Credenciales inválidas' });

    // CREAR TOKEN CON ROL, ID, NOMBRE Y EMAIL
    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, email: usuario.email }, 
      SECRET_KEY, 
      { expiresIn: '24h' }
    );

    // Devolvemos el token Y los datos del usuario (importante para el Frontend)
    res.json({ 
      token, 
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;