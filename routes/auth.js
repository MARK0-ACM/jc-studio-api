const express = require('express');
const router = express.Router();
const { pool } = require('../db'); 
const bcrypt = require('bcryptjs'); // Ya lo instalamos
const jwt = require('jsonwebtoken'); // Ya lo instalamos

// Definimos el secreto aquí para reutilizarlo
const JWT_SECRET = 'tu_secreto_jwt_super_seguro';

// -----------------------------------------------------------------
// Endpoint: POST /api/auth/register (¡NUEVO!)
// -----------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { nombre, email, password } = req.body;

  // 1. Validar datos
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  try {
    // 2. Revisar si el email ya existe
    const [rows] = await pool.query('SELECT * FROM Usuarios WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    // 3. ¡Encriptar la contraseña! (Hashing)
    const salt = await bcrypt.genSalt(10); // Genera "sal"
    const hashedPassword = await bcrypt.hash(password, salt); // Crea el hash

    // 4. Guardar el nuevo usuario en la DB
    await pool.query(
      'INSERT INTO Usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [nombre, email, hashedPassword, 'admin'] // Por defecto creamos admins
    );

    res.status(201).json({ message: 'Usuario registrado exitosamente.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});


// -----------------------------------------------------------------
// Endpoint: POST /api/auth/login (¡MODIFICADO!)
// -----------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
  }

  try {
    // 1. Buscar al usuario
    const [rows] = await pool.query('SELECT * FROM Usuarios WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // 2. ¡Comparar la contraseña de forma segura! (LA MODIFICACIÓN)
    // bcrypt compara el password enviado vs el hash guardado en la DB
    const passwordCoincide = await bcrypt.compare(password, user.password);

    if (!passwordCoincide) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // 3. Crear el Token (JWT)
    const token = jwt.sign(
      { id: user.id, rol: user.rol }, 
      JWT_SECRET, // Usamos la constante
      { expiresIn: '1h' } 
    );

    res.json({ token, message: '¡Login exitoso!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

module.exports = router;