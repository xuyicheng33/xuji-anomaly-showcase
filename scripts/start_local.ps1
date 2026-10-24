$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $taskRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$env:TEMP = $runtime
$env:TMP = $runtime
$env:npm_config_cache = 'D:\Caches\xuji-npm'
$python = Join-Path $taskRoot '.venv\Scripts\python.exe'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$vite = Join-Path $taskRoot 'web\node_modules\vite\bin\vite.js'
if (!(Test-Path -LiteralPath $python)) { throw '缺少本地 Python 环境。' }
if (!(Test-Path -LiteralPath $vite)) { throw '请先在 web 目录安装前端依赖。' }
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'web\public\data\catalog.json'))) { throw '缺少本地研究数据。' }

function Test-Api {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        $schema = Invoke-RestMethod 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 2
        return ($health.status -eq 'ok' -and $schema.info.title -eq 'Xuji Anomaly Explorer')
    } catch { return $false }
}
function Test-Web {
    try {
        $response = Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
        return $response.Content.Contains('xuji-anomaly-explorer')
    } catch { return $false }
}

if (!(Test-Api)) {
    Start-Process -FilePath $python -ArgumentList '-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', '8000' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'api.log') -RedirectStandardError (Join-Path $runtime 'api-error.log') | Out-Null
}
if (!(Test-Web)) {
    Start-Process -FilePath $node -ArgumentList ('"' + $vite + '"'), '--host', '127.0.0.1', '--port', '5173', '--strictPort' -WorkingDirectory (Join-Path $taskRoot 'web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'web.log') -RedirectStandardError (Join-Path $runtime 'web-error.log') | Out-Null
}

$deadline = (Get-Date).AddSeconds(20)
do {
    $ready = (Test-Api) -and (Test-Web)
    if ($ready) { break }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
if (!$ready) { throw '启动未完成，请查看 .runtime 中的服务日志。' }
Write-Output '网站：http://127.0.0.1:5173/'
Write-Output '计算接口：http://127.0.0.1:8000/docs'

