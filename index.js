const express = require('express');
const cors = require('cors');
const { testConnection } = require('./db');

// 1. Importar las rutas (¡AQUÍ FALTABA CITAS!)
const authRoutes = require('./routes/auth');
const citasRoutes = require('./routes/citas'); // <-- AÑADE ESTA LÍNEA

const app = express();
const PORT = 4000;
app.use(cors());
app.use(express.json());

// 2. Usar las rutas (¡AQUÍ FALTABA CITAS!)
app.use('/api/auth', authRoutes);
app.use('/api/citas', citasRoutes); // <-- AÑADE ESTA LÍNEA

// Ruta de prueba (la podemos dejar)
app.get('/', (req, res) => {
  res.send('¡El servidor de la API está funcionando!');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  testConnection();
});