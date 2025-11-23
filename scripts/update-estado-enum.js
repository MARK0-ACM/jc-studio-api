/**
 * Script de migración para actualizar el ENUM de estado en la tabla Citas
 * Este script agrega 'rechazada' a los valores permitidos del ENUM
 * 
 * Ejecuta con: node scripts/update-estado-enum.js
 */

const { pool } = require('../db');

async function updateEstadoEnum() {
  let connection;
  
  try {
    connection = await pool.getConnection();
    console.log('✅ Conectado a la base de datos');
    
    // Primero, verificar la estructura actual de la columna estado
    const [columnInfo] = await connection.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'Citas' 
      AND COLUMN_NAME = 'estado'
    `);
    
    if (columnInfo.length === 0) {
      console.error('❌ No se encontró la columna estado en la tabla Citas');
      process.exit(1);
    }
    
    const currentEnum = columnInfo[0].COLUMN_TYPE;
    console.log(`📋 ENUM actual de estado: ${currentEnum}`);
    
    // Verificar si 'rechazada' ya está en el ENUM
    if (currentEnum.includes('rechazada')) {
      console.log('✅ El estado "rechazada" ya está incluido en el ENUM');
      process.exit(0);
    }
    
    // Actualizar el ENUM para incluir 'rechazada'
    console.log('🔄 Actualizando ENUM para incluir "rechazada"...');
    
    await connection.query(`
      ALTER TABLE Citas 
      MODIFY COLUMN estado ENUM('pendiente', 'confirmada', 'rechazada', 'cancelada') 
      NOT NULL DEFAULT 'pendiente'
    `);
    
    console.log('✅ ENUM actualizado exitosamente');
    console.log('📋 Nuevos valores permitidos: pendiente, confirmada, rechazada, cancelada');
    
  } catch (error) {
    console.error('❌ Error al actualizar el ENUM:', error);
    
    if (error.code === 'ER_PARSE_ERROR') {
      console.error('💡 Asegúrate de que la tabla Citas existe y tiene la columna estado');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
      console.log('🔌 Conexión cerrada');
    }
    await pool.end();
    process.exit(0);
  }
}

// Ejecutar la migración
updateEstadoEnum();
