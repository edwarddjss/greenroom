@echo off
title Spotify Bot - Launcher
echo ====================================================
echo greenroom
echo ====================================================
echo.
echo [1/2] Deploying latest Discord slash commands...
powershell -Command "Set-Location '\\wsl.localhost\Ubuntu\home\nazk\Projects\spotify-dj-bot'; node register-commands.js"
echo.
echo [2/2] Launching Bot process...
echo.
echo Keep this window open while using the bot in Discord.
echo To stop the bot, simply close this window.
echo ----------------------------------------------------
powershell -Command "Set-Location '\\wsl.localhost\Ubuntu\home\nazk\Projects\spotify-dj-bot'; npm start"
pause
