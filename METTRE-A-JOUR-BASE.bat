@echo off
chcp 65001 >nul
title AFFICHES-EM - mise a niveau de la base
cd /d "%~dp0"
echo.
echo Ajout des colonnes manquantes dans Appwrite (picto1 a picto6, gabarit, mentions...)
call npm run completer:schema
echo.
pause
