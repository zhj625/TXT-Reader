param([switch]$CheckInstalled)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$bundle = Join-Path $root 'out\make\squirrel.windows\x64'
$release = (Get-Content (Join-Path $bundle 'RELEASES') | Where-Object { $_ -match "-$([regex]::Escape($version))-full\.nupkg" })
if (@($release).Count -ne 1) { throw 'Expected exactly one release for the current version.' }
$parts = $release -split '\s+'
$package = Get-Item (Join-Path $bundle $parts[1])
if ($package.Length -ne [long]$parts[2]) { throw 'Package size does not match RELEASES.' }
if ((Get-FileHash $package.FullName -Algorithm SHA1).Hash -ne $parts[0]) { throw 'Package hash does not match RELEASES.' }
if (-not (Test-Path (Join-Path $bundle 'TXT-Reader-Setup.exe'))) { throw 'Installer missing.' }
if ($CheckInstalled) {
    $installed = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object DisplayName -eq 'TXT Reader'
    if ($installed.DisplayVersion -ne $version) { throw 'Installed version does not match package.json.' }
    $shell = New-Object -ComObject WScript.Shell
    $target = Join-Path $installed.InstallLocation 'txt-reader.exe'
    foreach ($folder in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
        $links = @(Get-ChildItem -LiteralPath $folder -Filter 'TXT Reader.lnk' -Recurse | Where-Object {
            $shortcut = $shell.CreateShortcut($_.FullName)
            $shortcut.TargetPath -eq $target -and (Test-Path -LiteralPath $shortcut.TargetPath)
        })
        if ($links.Count -ne 1) { throw "Expected one valid TXT Reader shortcut in $folder." }
        Write-Output "Valid shortcut: $($links[0].FullName)"
    }
}
Write-Output "Windows release $version validation passed."
