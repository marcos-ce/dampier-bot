#!/bin/bash
# Script de inicializacao para Azure App Service Linux
# Azure executa este script ao iniciar o container

echo "[Startup] Iniciando Dampier Bot no Azure..."

# Garante que a pasta de dados persistentes existe
mkdir -p /home/data
mkdir -p /home/data/auth_info_baileys
mkdir -p /home/data/temp_images

echo "[Startup] Pastas de dados OK"
echo "[Startup] Entrando na pasta do projeto..."
cd /home/site/wwwroot || exit 1

echo "[Startup] Iniciando aplicacao Node.js..."
node index.js
