#!/bin/bash

# Script para preparar y hacer commit de los cambios del sistema de citas

echo "📦 Preparando commit para sistema de citas..."

# Agregar archivos modificados
echo "➕ Agregando archivos modificados..."
git add routes/citas.js

# Agregar archivos nuevos
echo "➕ Agregando archivos nuevos..."
git add scripts/update-estado-enum.js
git add migrations/add_rechazada_estado.sql

# Mostrar estado
echo ""
echo "📋 Estado de los archivos a commitear:"
git status --short

echo ""
echo "✅ Archivos agregados al staging area"
echo ""
echo "Para hacer el commit, ejecuta:"
echo "git commit -F COMMIT_MESSAGE.md"
echo ""
echo "O usa el mensaje corto:"
echo "git commit -m \"feat: implementar validaciones robustas para sistema de citas\""
