@echo off
chcp 65001 >nul
title AFFICHES-EM - restauration d une sauvegarde sur le serveur
cd /d "%~dp0"
setlocal
for /f "usebackq tokens=1,* delims==" %%a in ("config.txt") do (
  if /i "%%a"=="IP_VPS" set IP_VPS=%%b
  if /i "%%a"=="UTILISATEUR" set UTIL=%%b
)
set FICHIER=
for /f "delims=" %%f in ('dir /b /o-d "sauvegardes\pb_data_*.tgz" 2^>nul') do if not defined FICHIER set FICHIER=%%f
if not defined FICHIER (echo Aucune sauvegarde dans deploiement\sauvegardes. & pause & exit /b 1)
echo.
echo Sauvegarde la plus recente : %FICHIER%
echo Serveur cible            : %IP_VPS%
echo ATTENTION : les donnees actuelles de ce serveur seront REMPLACEES.
set /p OK=Tapez OUI pour continuer : 
if /i not "%OK%"=="OUI" (echo Annule. & pause & exit /b 0)
scp "sauvegardes\%FICHIER%" %UTIL%@%IP_VPS%:/tmp/pb_data.tgz || (echo [X] Envoi impossible. & pause & exit /b 1)
ssh -t %UTIL%@%IP_VPS% "sudo systemctl stop pocketbase && sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.avant-restauration.$(date +%%s) && sudo tar -xzf /tmp/pb_data.tgz -C /opt/pocketbase && sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data && rm /tmp/pb_data.tgz && sudo systemctl start pocketbase && echo OK"
echo.
pause
