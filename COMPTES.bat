@echo off
chcp 65001 >nul
title AFFICHES-EM - comptes utilisateurs
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js introuvable : installez-le depuis https://nodejs.org & pause & exit /b 1)
if not exist "node_modules\pocketbase\package.json" (echo Installation des dependances... & call npm install || (pause & exit /b 1))
echo.
echo ===== Application de utilisateurs.json sur le serveur en ligne =====
call npm run utilisateurs
echo.
echo ===== Comptes existants =====
call npm run utilisateurs -- --liste
pause
