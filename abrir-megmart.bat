@echo off
title Megmart Pedidos - no cerrar esta ventana
cd /d "%~dp0"
echo Abriendo Megmart Pedidos en http://localhost:8090
echo Mientras uses la app, deja esta ventana abierta (podes minimizarla).
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8090"
node servidor.js
pause
