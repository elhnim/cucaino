# Packs a folder of equally-sized animation frames into a grid spritesheet PNG.
# Phase-0 pragmatic packer (Windows System.Drawing). Proper Node/free-tex-packer
# atlas tooling comes in Phase 1. Outputs <out>.png and prints frame metadata.
param(
  [Parameter(Mandatory=$true)][string]$FramesDir,
  [Parameter(Mandatory=$true)][string]$OutPng,
  [int]$Cols = 5,
  [double]$Scale = 0.5
)
Add-Type -AssemblyName System.Drawing
$frames = Get-ChildItem $FramesDir -Filter *.png | Sort-Object Name
if ($frames.Count -eq 0) { throw "no frames in $FramesDir" }
$first = [System.Drawing.Image]::FromFile($frames[0].FullName)
$fw = [int]([math]::Round($first.Width * $Scale))
$fh = [int]([math]::Round($first.Height * $Scale))
$first.Dispose()
$rows = [math]::Ceiling($frames.Count / $Cols)
$sheet = New-Object System.Drawing.Bitmap (($fw * $Cols), ($fh * $rows))
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)
for ($i = 0; $i -lt $frames.Count; $i++) {
  $img = [System.Drawing.Image]::FromFile($frames[$i].FullName)
  $x = ($i % $Cols) * $fw
  $y = [math]::Floor($i / $Cols) * $fh
  $g.DrawImage($img, $x, $y, $fw, $fh)
  $img.Dispose()
}
$g.Dispose()
$dir = Split-Path $OutPng
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$sheet.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Write-Output ("{0} | frameWidth={1} frameHeight={2} frames={3} cols={4}" -f (Split-Path $OutPng -Leaf), $fw, $fh, $frames.Count, $Cols)
