param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$hwp = $null

function Write-Step([string]$Message) {
  Write-Output "[hancom] $Message"
}

function Register-FilePathCheckerModule {
  $modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) "hancom-security\FilePathCheckerModuleExample.dll"
  if (!(Test-Path -LiteralPath $modulePath)) {
    Write-Step "security module missing: $modulePath"
    return
  }

  $registryPaths = @(
    "HKCU:\Software\HNC\HwpAutomation\Modules",
    "HKCU:\Software\Hnc\HwpAutomation\Modules"
  )

  foreach ($registryPath in $registryPaths) {
    if (!(Test-Path -LiteralPath $registryPath)) {
      New-Item -Path $registryPath -Force | Out-Null
    }
    Set-ItemProperty -Path $registryPath -Name "FilePathCheckerModuleExample" -Value $modulePath
    Write-Step "security module registered path=$registryPath value=$modulePath"
  }
}

try {
  Write-Step "input=$InputPath"
  Write-Step "output=$OutputPath"

  if (!(Test-Path -LiteralPath $InputPath)) {
    throw "Input file does not exist: $InputPath"
  }

  $outputDir = Split-Path -Parent $OutputPath
  if (!(Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  }
  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  Register-FilePathCheckerModule

  Write-Step "creating COM object HWPFrame.HwpObject"
  $hwp = New-Object -ComObject "HWPFrame.HwpObject"

  try {
    $hwp.SetMessageBoxMode(0x00214411) | Out-Null
    Write-Step "SetMessageBoxMode applied"
  } catch {
    Write-Step "SetMessageBoxMode skipped: $($_.Exception.Message)"
  }

  $moduleNames = @(
    "FilePathCheckerModule",
    "FilePathCheckerModuleExample",
    "AutomationModule"
  )

  foreach ($moduleName in $moduleNames) {
    try {
      $registered = $hwp.RegisterModule("FilePathCheckDLL", $moduleName)
      Write-Step "RegisterModule $moduleName result=$registered"
      if ($registered) {
        break
      }
    } catch {
      Write-Step "RegisterModule $moduleName failed: $($_.Exception.Message)"
    }
  }

  try {
    $hwp.XHwpWindows.Item(0).Visible = $false
    Write-Step "window hidden"
  } catch {
    Write-Step "window visibility skipped: $($_.Exception.Message)"
  }

  $extension = [System.IO.Path]::GetExtension($InputPath).ToLowerInvariant()
  $formats = @("", "HWP")
  if ($extension -eq ".hwpx") {
    $formats = @("HWPX", "", "HWP")
  }

  $opened = $false
  foreach ($format in $formats) {
    try {
      Write-Step "Open start format=$format"
      if ($format -eq "") {
        $opened = $hwp.Open($InputPath)
      } else {
        $opened = $hwp.Open($InputPath, $format, "forceopen:true")
      }
      Write-Step "Open result format=$format result=$opened"
      if ($opened) {
        break
      }
    } catch {
      Write-Step "Open failed format=$format error=$($_.Exception.Message)"
    }
  }

  if (!$opened) {
    throw "Hancom HWP failed to open source file."
  }

  Write-Step "SaveAs PDF start"
  $saved = $hwp.SaveAs($OutputPath, "PDF", "")
  Write-Step "SaveAs PDF result=$saved"

  if (!(Test-Path -LiteralPath $OutputPath)) {
    throw "Hancom HWP did not create a PDF file."
  }

  $outputItem = Get-Item -LiteralPath $OutputPath
  Write-Step "PDF created path=$($outputItem.FullName) size=$($outputItem.Length)"
  exit 0
} catch {
  Write-Error "[hancom] error=$($_.Exception.Message)"
  exit 1
} finally {
  if ($hwp -ne $null) {
    try {
      $hwp.Quit() | Out-Null
      Write-Step "Quit completed"
    } catch {
      Write-Step "Quit failed: $($_.Exception.Message)"
    }
  }
}
