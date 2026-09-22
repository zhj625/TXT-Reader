$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$documentPath = Join-Path $repositoryRoot 'docs/PRODUCT_DESIGN.md'

if (-not (Test-Path -LiteralPath $documentPath -PathType Leaf)) {
    throw "Product design document is missing: $documentPath"
}

$content = Get-Content -LiteralPath $documentPath -Raw -Encoding UTF8
# Normalize Windows checkouts before applying multiline heading expressions.
$content = $content -replace "`r`n?", "`n"
$requiredPatterns = @(
    '(?m)^# 墨读本地电子书阅读器产品设计文档$',
    '(?m)^## 1\.',
    '(?m)^## 3\.',
    '(?m)^## 6\.',
    '(?m)^## 7\.',
    'v0\.3',
    '`\.txt`',
    '`\.epub`',
    '章节跳转',
    '作者',
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
