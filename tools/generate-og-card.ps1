# Generates apps/web/public/og-card.png — the 1200x630 Open Graph banner used
# for social link previews (Facebook renders og:image as a large card no matter
# what, so we ship a designed banner instead of letting it blow up the logo).
#
# Usage (from repo root):  powershell -File tools\generate-og-card.ps1
#
# Brand palette mirrors apps/web/app/assets/css/main.css :root.
# Fonts: Georgia stands in for Playfair Display, Segoe UI for DM Sans —
# the webfonts aren't installed system-wide, these are the repo's CSS fallbacks.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$logoPath = Join-Path $repoRoot 'apps\web\public\logo.png'
$outPath  = Join-Path $repoRoot 'apps\web\public\og-card.png'

$cream     = [System.Drawing.Color]::FromArgb(255, 0xFD, 0xFB, 0xF7)
$greenDark = [System.Drawing.Color]::FromArgb(255, 0x1E, 0x7A, 0x47)
$greenLight = [System.Drawing.Color]::FromArgb(255, 0xF0, 0xFA, 0xF4)
$textDark  = [System.Drawing.Color]::FromArgb(255, 0x1A, 0x2E, 0x1E)
$textMid   = [System.Drawing.Color]::FromArgb(255, 0x4A, 0x63, 0x55)

$w = 1200; $h = 630
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Background
$g.Clear($cream)

# Soft green disc behind the logo so it sits on a deliberate shape
$discBrush = New-Object System.Drawing.SolidBrush($greenLight)
$g.FillEllipse($discBrush, 80, 135, 360, 360)

# Logo (450x450 source, transparent background) centered on the disc
$logo = [System.Drawing.Image]::FromFile($logoPath)
$g.DrawImage($logo, 110, 165, 300, 300)

# Wordmark + tagline
$wordmarkFont = New-Object System.Drawing.Font('Georgia', 78, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$taglineFont  = New-Object System.Drawing.Font('Segoe UI', 36, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$domainFont   = New-Object System.Drawing.Font('Segoe UI', 26, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

$darkBrush  = New-Object System.Drawing.SolidBrush($textDark)
$greenBrush = New-Object System.Drawing.SolidBrush($greenDark)
$midBrush   = New-Object System.Drawing.SolidBrush($textMid)

$textX = 490
$g.DrawString('PantryFinder', $wordmarkFont, $darkBrush, $textX, 215)
$g.DrawString('Find free food pantries near you', $taglineFont, $midBrush, ($textX + 6), 330)
$g.DrawString('PANTRYFINDER.ORG', $domainFont, $greenBrush, ($textX + 8), 400)

# Bottom brand bar
$barBrush = New-Object System.Drawing.SolidBrush($greenDark)
$g.FillRectangle($barBrush, 0, ($h - 16), $w, 16)

$g.Dispose()
$logo.Dispose()
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$size = (Get-Item $outPath).Length
Write-Host "Wrote $outPath ($([math]::Round($size/1KB)) KB)"
