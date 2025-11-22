const express = require('express');
const cors = require('cors');
const path = require('path'); // 1. Importar path (nativo de Node)
const { testConnection } = require('./db');

const authRoutes = require('./routes/auth');
const citasRoutes = require('./routes/citas');
const serviciosRoutes = require('./routes/servicios');
const portafolioRoutes = require('./routes/portafolio'); // (Lo crearemos en el paso 3)

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// 2. ¡IMPORTANTE! Hacer pública la carpeta 'uploads'
// Esto permite acceder a las imágenes desde el navegador (ej: http://localhost:4000/uploads/foto.jpg)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/portafolio', portafolioRoutes); // 3. Usar rutas de portafolio

app.get('/', (req, res) => {
  res.send('¡API funcionando!');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  testConnection();
});