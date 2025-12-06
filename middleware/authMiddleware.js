const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // El token suele venir así: "Bearer eyJhbGci..."
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(403).json({ error: 'Acceso denegado. No hay token.' });
  }

  // Quitamos la palabra "Bearer " si existe
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ error: 'Token malformado.' });
  }

  try {
    // Verificamos el token (Usa tu misma clave secreta que en auth.js)
    const decoded = jwt.verify(token, 'secreto_super_seguro');
    
    // Guardamos los datos del usuario dentro de la petición (req)
    req.user = decoded; 
    
    next(); // Dejamos pasar
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = verifyToken;