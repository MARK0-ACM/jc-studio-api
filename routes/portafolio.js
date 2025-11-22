const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURACIÓN DE MULTER (SUBIDA DE ARCHIVOS) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Carpeta destino
  },
  filename: (req, file, cb) => {
    // Generamos nombre único: timestamp + extensión original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// -----------------------------------------------------------------
// 1. OBTENER TODAS LAS FOTOS
// GET /api/portafolio
// -----------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // Ajustado a tu columna 'fecha_creacion'
    const [rows] = await pool.query('SELECT * FROM Portafolio ORDER BY fecha_creacion DESC');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el portafolio' });
  }
});

// -----------------------------------------------------------------
// 2. SUBIR NUEVA FOTO (Solo Admin)
// POST /api/portafolio
// -----------------------------------------------------------------
router.post('/', upload.single('imagen'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Debes subir una imagen' });
  }

  const { titulo, descripcion } = req.body;
  const imagenUrl = req.file.filename; // Guardamos solo el nombre del archivo

  try {
    // Ajustado: insertamos NOW() en fecha_creacion
    const [result] = await pool.query(
      'INSERT INTO Portafolio (titulo, descripcion, imagen_url, fecha_creacion) VALUES (?, ?, ?, NOW())',
      [titulo, descripcion, imagenUrl]
    );
    res.status(201).json({ message: 'Imagen subida exitosamente', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar en base de datos' });
  }
});

// -----------------------------------------------------------------
// 3. ELIMINAR FOTO (Solo Admin)
// DELETE /api/portafolio/:id
// -----------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Obtener nombre del archivo para borrarlo del disco
    const [rows] = await pool.query('SELECT imagen_url FROM Portafolio WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    const nombreArchivo = rows[0].imagen_url;

    // 2. Borrar de la DB
    await pool.query('DELETE FROM Portafolio WHERE id = ?', [id]);

    // 3. Borrar archivo físico (limpieza)
    const rutaArchivo = path.join(__dirname, '../uploads', nombreArchivo);
    if (fs.existsSync(rutaArchivo)) {
      fs.unlinkSync(rutaArchivo);
    }

    res.json({ message: 'Imagen eliminada correctamente' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
});

module.exports = router;