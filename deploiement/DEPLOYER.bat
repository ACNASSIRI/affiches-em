@echo off
chcp 65001 >nul
title AFFICHES-EM - mise en ligne
cd /d "%~dp0\.."
setlocal

for /f "usebackq tokens=1,* delims==" %%a in ("deploiement\config.txt") do (
  if /i "%%a"=="IP_VPS" set IP_VPS=%%b
  if /i "%%a"=="UTILISATEUR" set UTIL=%%b
)
if "%IP_VPS%"=="0.0.0.0" (echo Renseignez IP_VPS dans deploiement\config.txt & pause & exit /b 1)

echo.
echo ===== 1/3 Compilation de l application =====
if not exist "node_modules\pocketbase\package.json" call npm install
call npx vite build || (echo [X] La compilation a echoue. & pause & exit /b 1)

echo.
echo ===== 2/3 Envoi vers le serveur %IP_VPS% =====
if exist site.tgz del site.tgz
tar -czf site.tgz -C dist . || (echo [X] Archive impossible. & pause & exit /b 1)
scp -r site.tgz pocketbase\pb_migrations %UTIL%@%IP_VPS%:/tmp/ || (echo [X] Envoi impossible : verifiez l IP et le mot de passe. & pause & exit /b 1)

echo.
echo ===== 3/3 Mise en place sur le serveur =====
ssh -t %UTIL%@%IP_VPS% "sudo rm -rf /var/www/affiches/* && sudo tar -xzf /tmp/site.tgz -C /var/www/affiches && rm /tmp/site.tgz && sudo cp /tmp/pb_migrations/*.js /opt/pocketbase/pb_migrations/ && sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_migrations && rm -rf /tmp/pb_migrations && sudo systemctl restart pocketbase && echo OK"
del site.tgz

echo.
echo Termine : l application est en ligne.
pause
