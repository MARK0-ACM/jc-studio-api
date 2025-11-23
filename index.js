const express = require('express');
const cors = require('cors');
const path = require('path');
const { testConnection } = require('./db');

// Rutas
const authRoutes = require('./routes/auth');
const citasRoutes = require('./routes/citas');
const serviciosRoutes = require('./routes/servicios');
const portafolioRoutes = require('./routes/portafolio');

const app = express();
const PORT = 4000;

// 1. CORS SIMPLE (Deja pasar todo)
app.use(cors()); 

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Log Chivato (Déjalo, nos sirve)
app.use((req, res, next) => {
  console.log(`🔔 Petición entrante: ${req.method} ${req.url}`);
  next();
});

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/portafolio', portafolioRoutes);

app.get('/', (req, res) => {
  res.send('API JC Studio Online');
});

app.listen(PORT, () => {
  console.log(`🔥 Servidor corriendo en http://localhost:${PORT}`);
  testConnection();
});