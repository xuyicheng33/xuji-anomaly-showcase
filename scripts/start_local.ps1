param([switch]$Stop)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtime=Join-Path $taskRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$env:TEMP=$runtime
$env:TMP=$runtime
$env:npm_config_cache='D:\Caches\xuji-npm'
$python=Join-Path $taskRoot '.venv\Scripts\python.exe'
$node=(Get-Command node.exe -ErrorAction Stop).Source
$state=Join-Path $runtime 'processes.json'
if($Stop){
 if(Test-Path -LiteralPath $state){
  $owned=Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
  foreach($taskPid in @($owned.api,$owned.web)){
   $proc=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid" -ErrorAction SilentlyContinue
   if($proc -and ($proc.Name -eq 'node.exe' -or $proc.Name -eq 'python.exe')){Stop-Process -Id $taskPid -ErrorAction SilentlyContinue}
  }
 }
 Write-Output '本地服务已停止。'
 exit
}
if(!(Test-Path -LiteralPath $python)){throw '缺少本地Python环境，请先安装server/requirements.txt。'}
if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'web\public\data\catalog.json'))){throw '缺少数据目录，请先同步研究材料并运行scripts/export_data.py。'}
$apiReady=$false
try{$h=Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2;$apiReady=$h.app -eq 'xuji-anomaly-explorer'}catch{}
if($apiReady){$apiPid=0}else{
 $p=Start-Process -FilePath $python -ArgumentList '-m','uvicorn','server.app:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'api.log') -RedirectStandardError (Join-Path $runtime 'api-error.log') -PassThru
 $apiPid=$p.Id
}
$webReady=$false
try{$w=Invoke-WebRequest 'http://127.0.0.1:5173/' -TimeoutSec 2;$webReady=$w.Content.Contains('许继电气')}catch{}
if($webReady){$webPid=0}else{
 $vite=Join-Path $taskRoot 'web\node_modules\vite\bin\vite.js'
 $p=Start-Process -FilePath $node -ArgumentList ('"'+$vite+'"'),'--host','127.0.0.1','--port','5173' -WorkingDirectory (Join-Path $taskRoot 'web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'web.log') -RedirectStandardError (Join-Path $runtime 'web-error.log') -PassThru
 $webPid=$p.Id
}
if($apiPid -or $webPid){
 @{api=$apiPid;web=$webPid;root=$taskRoot} | ConvertTo-Json | Set-Content -LiteralPath $state -Encoding utf8
}
Write-Output '网站：http://127.0.0.1:5173/'
Write-Output '计算接口：http://127.0.0.1:8000/docs'

