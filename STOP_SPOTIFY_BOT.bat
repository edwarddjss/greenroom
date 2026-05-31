@echo off
title Spotify Bot - Stopper
echo ====================================================
echo 🛑 Stopping Spotify Bot and FFmpeg...
echo ====================================================
echo.
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im ffmpeg.exe >nul 2>&1
echo Done! All background bot and capture processes terminated.
timeout /t 3 >nul
