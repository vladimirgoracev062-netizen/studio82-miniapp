@echo off
cd /d "%~dp0"
echo registry=https://registry.npmjs.org/ > .npmrc
if exist package-lock.json del package-lock.json
echo NPM registry fixed. package-lock.json removed.
echo Now open GitHub Desktop, commit and push.
pause
