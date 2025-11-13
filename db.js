const mysql = require('mysql2/promise'); 
const config = require('./config'); 

const pool = mysql.createPool(config.db);

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('¡Conexión a la base de datos exitosa!');
    connection.release(); 
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
  }
}

module.exports = {
  pool,
  testConnection
};