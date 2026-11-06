@echo off
chcp 65001 >nul
title AFFICHES-EM - installation Appwrite
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js introuvable : installez-le depuis https://nodejs.org & pause & exit /b 1)
if not exist "node_modules\.bin\vite.cmd" (echo Installation des dependances... & call npm install || (pause & exit /b 1))
echo.
echo ===== 1/2 Creation de la base, des tables et des equipes =====
call npm run setup:appwrite || (echo. & echo [X] Echec : envoyez une capture de cette fenetre. & pause & exit /b 1)
echo.
echo ===== Mise a niveau des colonnes =====
call npm run completer:schema || (echo. & echo [X] Echec : envoyez une capture de cette fenetre. & pause & exit /b 1)
echo.
echo ===== 2/2 Creation des comptes (utilisateurs.json) =====
call npm run utilisateurs || (echo. & echo [X] Echec : envoyez une capture de cette fenetre. & pause & exit /b 1)
echo.
echo Termine. Lancez maintenant LANCER.bat et connectez-vous.
pause
