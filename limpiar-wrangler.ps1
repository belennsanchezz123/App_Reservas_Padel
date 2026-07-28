# limpiar-wrangler.ps1
# Mata los servidores de desarrollo de wrangler que se hayan quedado colgados
# ("zombis") de sesiones anteriores y libera el puerto 8788.
#
# Cuándo usarlo: si `npx wrangler pages dev .` no arranca, o el navegador no
# abre http://127.0.0.1:8788 aunque el servidor parezca encendido.
#
# Cómo: en PowerShell, dentro de la carpeta App_Reservas_Padel, ejecuta:
#     .\limpiar-wrangler.ps1
# (si Windows bloquea el script, ejecútalo así:
#     powershell -ExecutionPolicy Bypass -File .\limpiar-wrangler.ps1 )
#
# Es SEGURO: `workerd` es el motor interno de wrangler y no lo usa ningún otro
# programa, así que esto no afecta a VS Code, navegadores ni nada más.

$procs = Get-Process workerd -ErrorAction SilentlyContinue
if ($procs) {
    $n = $procs.Count
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "Cerrados $n servidor(es) de wrangler colgados." -ForegroundColor Green
} else {
    Write-Host "No habia servidores de wrangler colgados." -ForegroundColor Green
}

$puerto = Test-NetConnection -ComputerName 127.0.0.1 -Port 8788 -WarningAction SilentlyContinue
if ($puerto.TcpTestSucceeded) {
    Write-Host "AVISO: el puerto 8788 sigue ocupado. Cierra la terminal donde tengas wrangler y vuelve a ejecutar este script." -ForegroundColor Yellow
} else {
    Write-Host "Puerto 8788 libre. Ya puedes arrancar: npx wrangler pages dev ." -ForegroundColor Green
}
