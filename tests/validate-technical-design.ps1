$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$documentPath = Join-Path $repositoryRoot 'docs\TECHNICAL_DESIGN.md'
$productDocumentPath = Join-Path $repositoryRoot 'PRODUCT_DESIGN.md'

if (-not (Test-Path -LiteralPath $documentPath -PathType Leaf)) {
    throw "Technical design document is missing: $documentPath"
}

if (-not (Test-Path -LiteralPath $productDocumentPath -PathType Leaf)) {
    throw "Referenced product design document is missing: $productDocumentPath"
}

$content = Get-Content -LiteralPath $documentPath -Raw -Encoding UTF8
$requiredPatterns = @(
    '(?m)^# TXT .+ MVP .+$',
    '(?m)^## 3\. 技术栈$',
    '(?m)^## 4\. 总体架构$',
    '(?m)^## 5\. 本地数据设计$',
    '(?m)^## 8\. 安全边界$',
    '(?m)^## 9\. 测试与验证$',
    '\.\./PRODUCT_DESIGN\.md',
    'Electron',
    'TypeScript',
    'React',
    'Vite',
    'Electron Forge',
    'UTF-8',
    'GBK/GB18030',
    'iconv-lite',
    '10.+20 MB',
    'charOffset',
    'nodeIntegration: false',
    'contextIsolation: true',
    'sandbox: true',
    'Vitest',
    'Playwright Electron',
    '不删除用户的原始 TXT 文件'
)

foreach ($pattern in $requiredPatterns) {
    if ($content -notmatch $pattern) {
        throw "Technical design document is missing required pattern: $pattern"
    }
}

$headingNumbers = [regex]::Matches($content, '(?m)^## (\d+)\.') |
    ForEach-Object { [int]$_.Groups[1].Value }

$expectedHeadingNumbers = 1..14
if (Compare-Object -ReferenceObject $expectedHeadingNumbers -DifferenceObject $headingNumbers) {
    throw 'Technical design top-level numbered headings must contain each section from 1 through 14 exactly once.'
}

Write-Host 'Technical design document validation passed.'
