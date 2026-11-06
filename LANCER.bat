@echo off
chcp 65001 >nul
title AFFICHES-EM (local)
cd /d "%~dp0"

echo.
echo  ===== AFFICHES-EM - lancement local =====
echo.

rem 1. Node.js present ?
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js n'est pas installe sur ce PC.
  echo      Installez la version LTS depuis https://nodejs.org
  echo      puis fermez cette fenetre et relancez LANCER.bat.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  [OK] Node.js %%v

rem 2. Fichier de configuration : cree automatiquement s'il manque.
if not exist ".env.local" (
  copy /y ".env.example" ".env.local" >nul
  echo  [OK] .env.local cree a partir de .env.example.
) else (
  echo  [OK] .env.local present
)

rem 3. Serveur de donnees : le PocketBase en ligne (deploiement\config.txt).
set PB_PROXY=
set IP_VPS=
set DOMAINE=
for /f "usebackq tokens=1,* delims==" %%a in ("deploiement\config.txt") do (
  if /i "%%a"=="IP_VPS" set IP_VPS=%%b
  if /i "%%a"=="DOMAINE" set DOMAINE=%%b
)
if "%IP_VPS%"=="0.0.0.0" set IP_VPS=
if defined IP_VPS (
  if "%DOMAINE%"=="" set DOMAINE=%IP_VPS:.=-%.sslip.io
  if "%DOMAINE%"=="votre-domaine.com" set DOMAINE=%IP_VPS:.=-%.sslip.io
  call set PB_PROXY=https://%%DOMAINE%%
)
if defined PB_PROXY (
  echo  [OK] Donnees : %PB_PROXY%
) else (
  echo  [!] IP_VPS absente de deploiement\config.txt : PocketBase attendu sur ce PC, port 8090.
)

rem 4. Dependances (premiere fois ou apres mise a jour : 1 a 3 minutes).
if not exist "node_modules\pocketbase\package.json" (
  echo.
  echo  Installation des dependances, premiere fois uniquement...
  call npm install
  if errorlevel 1 (
    echo.
    echo  [X] npm install a echoue. Verifiez la connexion internet et relancez.
    pause
    exit /b 1
  )
)
echo  [OK] Dependances installees

rem 5. Ouvre le navigateur quand le serveur a eu le temps de demarrer.
echo.
echo  Demarrage du serveur... le navigateur s'ouvrira tout seul.
echo  Laissez cette fenetre ouverte : la fermer arrete le site.
echo.
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"
call npm run dev

echo.
echo  Le serveur s'est arrete.
pause
