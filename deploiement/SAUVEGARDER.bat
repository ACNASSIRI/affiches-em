@echo off
chcp 65001 >nul
title AFFICHES-EM - sauvegarde complete du serveur
cd /d "%~dp0"
setlocal
for /f "usebackq tokens=1,* delims==" %%a in ("config.txt") do (
  if /i "%%a"=="IP_VPS" set IP_VPS=%%b
  if /i "%%a"=="UTILISATEUR" set UTIL=%%b
)
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set HORO=%%d
if not exist sauvegardes mkdir sauvegardes
echo.
echo Copie de toute la base (comptes, articles, campagnes, logos) vers ce PC...
echo Le site est indisponible quelques secondes pendant la copie.
ssh -t %UTIL%@%IP_VPS% "sudo systemctl stop pocketbase && sudo tar -czf /tmp/pb_data.tgz -C /opt/pocketbase pb_data && sudo systemctl start pocketbase && sudo chown $(whoami) /tmp/pb_data.tgz" || (echo [X] Echec. & pause & exit /b 1)
scp %UTIL%@%IP_VPS%:/tmp/pb_data.tgz "sauvegardes\pb_data_%HORO%.tgz" || (echo [X] Telechargement impossible. & pause & exit /b 1)
ssh -t %UTIL%@%IP_VPS% "rm /tmp/pb_data.tgz"
echo.
echo Sauvegarde enregistree : deploiement\sauvegardes\pb_data_%HORO%.tgz
echo Pour changer de serveur : RESTAURER.bat (apres INSTALLER-SERVEUR.bat sur le nouveau VPS).
pause
