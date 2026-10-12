# StarMiner Z: play your copy on an Xbox (or a phone, or another computer) on the same Wi-Fi.
# A web server for the game, from this PC, while this window is open. Edge on an Xbox can't open
# a file, but it can open an address: this gives the game one on your home network.
#
# Run it with "Play on Xbox.bat" (next to it), or: powershell -ExecutionPolicy Bypass -File play-on-xbox.ps1
# It serves the starminer-z.html beside it (or starminer-z-friends.html, if that's all there is)
# and nothing else, and stops when the window's closed.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$name = 'starminer-z.html'
if (-not (Test-Path (Join-Path $here $name))) { $name = 'starminer-z-friends.html' }
$file = Join-Path $here $name
if (-not (Test-Path $file)) {
  Write-Host "Can't find starminer-z.html next to this script. Keep them in the same folder." -ForegroundColor Red
  exit 1
}
$game = [System.IO.File]::ReadAllBytes($file)

# the first free port from 8000
$listener = $null
$port = 8000
for (; $port -lt 8020; $port++) {
  try {
    $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any), $port
    $listener.Start()
    break
  } catch {
    $listener = $null
  }
}
if (-not $listener) {
  Write-Host "Couldn't open a port (8000 to 8019 are all in use)." -ForegroundColor Red
  exit 1
}

# this PC's addresses on the home network
$ips = @()
foreach ($a in [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName())) {
  $s = $a.ToString()
  if ($a.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not $s.StartsWith('127.') -and -not $s.StartsWith('169.254.')) { $ips += $s }
}

Write-Host ''
Write-Host '  StarMiner Z is ready to play on your Xbox.' -ForegroundColor Green
Write-Host ''
Write-Host '  On the Xbox, open Microsoft Edge and go to:'
if ($ips.Count -eq 0) { Write-Host "      http://<this PC's address>:$port" -ForegroundColor Yellow }
foreach ($ip in $ips) { Write-Host "      http://$($ip):$port" -ForegroundColor Yellow }
Write-Host ''
Write-Host '  The Xbox has to be on the same network as this PC. If Windows asks about the firewall,'
Write-Host '  allow it on private networks. Keep this window open while you play; close it to stop.'
Write-Host ''

$crlf = "`r`n"
$ascii = [System.Text.Encoding]::ASCII
function Send-Response($stream, $status, $type, $body) {
  $head = "HTTP/1.1 $status$crlf" + "Content-Type: $type$crlf" + "Content-Length: $($body.Length)$crlf" + "Cache-Control: no-cache$crlf" + "Connection: close$crlf$crlf"
  $h = $ascii.GetBytes($head)
  $stream.Write($h, 0, $h.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

$missing = $ascii.GetBytes('Not here: this only serves StarMiner Z.')
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      # (a browser can open a connection and not use it: give up on one that says nothing)
      $client.ReceiveTimeout = 3000
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, $ascii)
      $line = $reader.ReadLine()
      while ($true) { $h = $reader.ReadLine(); if ($h -eq $null -or $h -eq '') { break } }
      if ($line -match '^(GET|HEAD) (\S+)') {
        $path = ($Matches[2] -split '\?')[0]
        if ($path -eq '/' -or $path -eq "/$name" -or $path -eq '/index.html') {
          $body = $game
          if ($Matches[1] -eq 'HEAD') { $body = New-Object byte[] 0 }
          Send-Response $stream '200 OK' 'text/html; charset=utf-8' $body
          $who = $client.Client.RemoteEndPoint.Address.ToString()
          Write-Host "  [$(Get-Date -Format HH:mm:ss)] sent the game to $who"
        } else {
          Send-Response $stream '404 Not Found' 'text/plain; charset=utf-8' $missing
        }
      }
    } catch {
      # (a connection that went quiet, or was dropped: on to the next)
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
