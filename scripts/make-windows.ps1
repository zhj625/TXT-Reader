$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$forgeRelativePath = 'node_modules\@electron-forge\cli\dist\electron-forge.js'

function Invoke-ForgeMake([string]$workingDirectory) {
    $forgeCliPath = Join-Path $workingDirectory $forgeRelativePath
    if (-not (Test-Path -LiteralPath $forgeCliPath -PathType Leaf)) {
        throw "Electron Forge is not installed. Run npm install first."
    }

    Push-Location -LiteralPath $workingDirectory
    try {
        & node $forgeCliPath make
        if ($LASTEXITCODE -ne 0) {
            throw "Electron Forge make failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

if (-not $IsWindows -or $repositoryRoot -notmatch '[^\x00-\x7F]') {
    Invoke-ForgeMake $repositoryRoot
    exit 0
}

$usedDriveLetters = Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Name.ToUpperInvariant() }
$driveLetter = @('R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K', 'J', 'I', 'H', 'G', 'F', 'E') |
    Where-Object { $_ -notin $usedDriveLetters } |
    Select-Object -First 1

if (-not $driveLetter) {
    throw 'No free drive letter is available for the ASCII build-path workaround.'
}

$mappedDrive = "${driveLetter}:"
& subst $mappedDrive $repositoryRoot
if ($LASTEXITCODE -ne 0) {
    throw "Unable to map $mappedDrive to the repository for packaging."
}

try {
    Invoke-ForgeMake "${mappedDrive}\"
}
finally {
    & subst $mappedDrive /D
}
