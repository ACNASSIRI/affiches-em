@echo off
chcp 65001 >nul
title AFFICHES-EM - installation du serveur (une seule fois)
cd /d "%~dp0"
setlocal
for /f "usebackq tokens=1,* delims==" %%a in ("config.txt") do (
  if /i "%%a"=="IP_VPS" set IP_VPS=%%b
  if /i "%%a"=="UTILISATEUR" set UTIL=%%b
  if /i "%%a"=="DOMAINE" set DOMAINE=%%b
)
if "%IP_VPS%"=="0.0.0.0" (echo Renseignez IP_VPS dans config.txt & pause & exit /b 1)
if "%DOMAINE%"=="" set DOMAINE=%IP_VPS:.=-%.sslip.io
if "%DOMAINE%"=="votre-domaine.com" set DOMAINE=%IP_VPS:.=-%.sslip.io
echo Adresse du site : https://%DOMAINE%
echo.
echo Envoi des fichiers d installation vers %IP_VPS% (mot de passe du VPS demande)...
scp -r installer-vps.sh ..\pocketbase\pb_migrations %UTIL%@%IP_VPS%:/tmp/ || (echo [X] Connexion impossible. & pause & exit /b 1)
echo.
echo Installation sur le serveur (quelques minutes, mot de passe demande a nouveau).
echo A la fin, choisissez l e-mail et le mot de passe du super-administrateur PocketBase.
ssh -t %UTIL%@%IP_VPS% "sudo bash /tmp/installer-vps.sh %DOMAINE%"
echo.
echo Serveur pret. Etapes suivantes : DEPLOYER.bat, puis MIGRER-DONNEES.bat.
pause
