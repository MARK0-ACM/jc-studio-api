const express = require('express');
const cors = require('cors');
const { testConnection } = require('./db');

// 1. Importar las nuevas rutas de autenticación
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 4000;
app.use(cors());
app.use(express.json());

// 2. Usar las rutas
// Le decimos a Express: "Cualquier petición que empiece con /api/auth,
// envíala a nuestro archivo authRoutes"
app.use('/api/auth', authRoutes);

// Ruta de prueba (la podemos dejar)
app.get('/', (req, res) => {
  res.send('¡El servidor de la API está funcionando!');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  testConnection();
});
