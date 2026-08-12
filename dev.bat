@echo off
SETLOCAL
cd /d %~dp0
echo Starting dev environment from %cd%
if not exist node_modules (
  echo Installing root dependencies...
  npm install || goto :err
)
if not exist client\node_modules (
  echo Installing client dependencies...
  pushd client
  npm install || goto :err
  popd
)
if not exist server\node_modules (
  echo Installing server dependencies...
  pushd server
  npm install || goto :err
  popd
)

echo Running npm run dev
npm run dev || goto :err

endlocal
goto :eof
:err
echo ERROR: A command failed. See above for details.
exit /b 1