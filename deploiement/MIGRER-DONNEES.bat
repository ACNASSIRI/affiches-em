@echo off
chcp 65001 >nul
title AFFICHES-EM - copie des donnees Appwrite vers PocketBase (une fois)
cd /d "%~dp0\.."
where node >nul 2>nul || (echo Node.js introuvable : installez-le depuis https://nodejs.org & pause & exit /b 1)
if not exist "node_modules\pocketbase\package.json" (echo Installation des dependances... & call npm install || (pause & exit /b 1))
echo.
echo Copie des comptes, articles, marques, campagnes, affiches et logos
echo depuis Appwrite Cloud vers votre serveur. Peut etre relance sans risque.
echo.
call npm run migrer:pocketbase
echo.
pause
