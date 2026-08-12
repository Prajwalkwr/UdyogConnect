$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root
Write-Host "Starting dev environment from: $root"

function Ensure-NodeModules($path) {
    if (-not (Test-Path (Join-Path $path 'node_modules'))) {
        Write-Host "Installing dependencies in $path"
        Push-Location $path
        npm install
        Pop-Location
    } else {
        Write-Host "node_modules exists in $path"
    }
}

Ensure-NodeModules $root
Ensure-NodeModules (Join-Path $root 'client')
Ensure-NodeModules (Join-Path $root 'server')

npm run dev