$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$binDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'build/bin'))

# pomodoro.exe is the name used before the app became lucerna.
foreach ($name in @('lucerna', 'pomodoro')) {
    $binary = [System.IO.Path]::GetFullPath((Join-Path $binDirectory "$name.exe"))

    if (-not $binary.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'O executável está fora da pasta do projeto.'
    }

    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
        continue
    }

    if ((Get-Item -LiteralPath $binDirectory).LinkType -or (Get-Item -LiteralPath $binary).LinkType) {
        throw 'O destino do executável não pode ser um link.'
    }

    $running = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object {
        try {
            [System.IO.Path]::GetFullPath($_.Path) -ieq $binary
        } catch {
            $false
        }
    })

    foreach ($process in $running) {
        if (-not $process.CloseMainWindow() -or -not $process.WaitForExit(10000)) {
            throw 'Feche o lucerna antes de gerar uma nova versão.'
        }
    }

    Remove-Item -LiteralPath $binary -Force
    Write-Output "Executável anterior removido: $binary"
}
