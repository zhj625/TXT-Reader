$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$documentPath = Join-Path $repositoryRoot 'PRODUCT_DESIGN.md'

if (-not (Test-Path -LiteralPath $documentPath -PathType Leaf)) {
    throw "Product design document is missing: $documentPath"
}

$content = Get-Content -LiteralPath $documentPath -Raw -Encoding UTF8
$requiredPatterns = @(
    '(?m)^# TXT .+ MVP .+$',
    '(?m)^## 1\.',
    '(?m)^## 3\.',
    '(?m)^## 6\.',
    '(?m)^## 7\.',
    'v0\.1',
    '`\.txt`',
    'UTF-8',
    'GBK/GB18030',
    '10.+20 MB'
)

foreach ($pattern in $requiredPatterns) {
    if ($content -notmatch $pattern) {
        throw "Product design document is missing required pattern: $pattern"
    }
}

Write-Host 'Product design document validation passed.'
