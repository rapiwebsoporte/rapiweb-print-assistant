Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $AppDir "RapiWebPrintAssistant.exe"
$ConfigPath = Join-Path $AppDir "config.json"

function Get-PrinterNames {
  try {
    Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name | Sort-Object
  } catch {
    Get-Printer | Select-Object -ExpandProperty Name | Sort-Object
  }
}

function Load-Config {
  if (Test-Path $ConfigPath) {
    try {
      return Get-Content $ConfigPath -Raw | ConvertFrom-Json
    } catch {
      return [pscustomobject]@{}
    }
  }
  return [pscustomobject]@{}
}

function Save-Config($PrinterName, $PaperWidth) {
  $config = [ordered]@{
    printerName = $PrinterName
    paperWidth = [int]$PaperWidth
    logsEnabled = $true
  }
  $config | ConvertTo-Json -Depth 3 | Set-Content -Path $ConfigPath -Encoding UTF8
}

function Show-Message($Text, $Title = "RapiWeb Print Assistant", $Icon = [System.Windows.Forms.MessageBoxIcon]::Information) {
  [System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $Icon) | Out-Null
}

$printers = @(Get-PrinterNames)
$config = Load-Config

$form = New-Object System.Windows.Forms.Form
$form.Text = "RapiWeb Print Assistant"
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ClientSize = New-Object System.Drawing.Size(520, 360)
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$accent = [System.Drawing.Color]::FromArgb(245, 110, 25)
$dark = [System.Drawing.Color]::FromArgb(25, 33, 46)
$muted = [System.Drawing.Color]::FromArgb(92, 103, 118)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Configurar impresora termica"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = $dark
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(28, 24)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Elegi la impresora conectada a esta PC. RapiWeb la usara para tickets, comandas y facturas."
$subtitle.ForeColor = $muted
$subtitle.AutoSize = $false
$subtitle.Size = New-Object System.Drawing.Size(460, 42)
$subtitle.Location = New-Object System.Drawing.Point(30, 60)
$form.Controls.Add($subtitle)

$printerLabel = New-Object System.Windows.Forms.Label
$printerLabel.Text = "Impresora"
$printerLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$printerLabel.ForeColor = $dark
$printerLabel.Location = New-Object System.Drawing.Point(30, 118)
$printerLabel.AutoSize = $true
$form.Controls.Add($printerLabel)

$printerCombo = New-Object System.Windows.Forms.ComboBox
$printerCombo.DropDownStyle = "DropDownList"
$printerCombo.Location = New-Object System.Drawing.Point(30, 145)
$printerCombo.Size = New-Object System.Drawing.Size(460, 30)
[void]$printerCombo.Items.AddRange($printers)
if ($config.printerName -and $printerCombo.Items.Contains($config.printerName)) {
  $printerCombo.SelectedItem = $config.printerName
} elseif ($printerCombo.Items.Count -gt 0) {
  $printerCombo.SelectedIndex = 0
}
$form.Controls.Add($printerCombo)

$widthLabel = New-Object System.Windows.Forms.Label
$widthLabel.Text = "Ancho de papel"
$widthLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$widthLabel.ForeColor = $dark
$widthLabel.Location = New-Object System.Drawing.Point(30, 195)
$widthLabel.AutoSize = $true
$form.Controls.Add($widthLabel)

$widthCombo = New-Object System.Windows.Forms.ComboBox
$widthCombo.DropDownStyle = "DropDownList"
$widthCombo.Location = New-Object System.Drawing.Point(30, 222)
$widthCombo.Size = New-Object System.Drawing.Size(220, 30)
[void]$widthCombo.Items.Add("58 mm (ticket chico)")
[void]$widthCombo.Items.Add("80 mm (ticket estandar)")
$currentPaperWidth = 58
if ($config.PSObject.Properties.Name -contains "paperWidth") {
  $currentPaperWidth = [int]$config.paperWidth
}
if ($currentPaperWidth -eq 80) {
  $widthCombo.SelectedIndex = 1
} else {
  $widthCombo.SelectedIndex = 0
}
$form.Controls.Add($widthCombo)

$status = New-Object System.Windows.Forms.Label
$status.Text = ""
$status.ForeColor = $muted
$status.AutoSize = $false
$status.Size = New-Object System.Drawing.Size(460, 26)
$status.Location = New-Object System.Drawing.Point(30, 266)
$form.Controls.Add($status)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Text = "Guardar configuracion"
$saveButton.BackColor = $accent
$saveButton.ForeColor = [System.Drawing.Color]::White
$saveButton.FlatStyle = "Flat"
$saveButton.FlatAppearance.BorderSize = 0
$saveButton.Size = New-Object System.Drawing.Size(170, 38)
$saveButton.Location = New-Object System.Drawing.Point(30, 305)
$form.Controls.Add($saveButton)

$testButton = New-Object System.Windows.Forms.Button
$testButton.Text = "Probar impresion"
$testButton.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$testButton.ForeColor = [System.Drawing.Color]::White
$testButton.FlatStyle = "Flat"
$testButton.FlatAppearance.BorderSize = 0
$testButton.Size = New-Object System.Drawing.Size(150, 38)
$testButton.Location = New-Object System.Drawing.Point(214, 305)
$form.Controls.Add($testButton)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = "Cerrar"
$closeButton.Size = New-Object System.Drawing.Size(100, 38)
$closeButton.Location = New-Object System.Drawing.Point(390, 305)
$form.Controls.Add($closeButton)

function Get-SelectedPaperWidth {
  if ($widthCombo.SelectedIndex -eq 1) { return 80 }
  return 58
}

function Save-CurrentConfig {
  if (-not $printerCombo.SelectedItem) {
    Show-Message "No se detecto ninguna impresora. Instalá o conectá la impresora en Windows y volvé a abrir esta ventana." "Sin impresoras" ([System.Windows.Forms.MessageBoxIcon]::Warning)
    return $false
  }
  Save-Config -PrinterName $printerCombo.SelectedItem.ToString() -PaperWidth (Get-SelectedPaperWidth)
  $status.Text = "Configuracion guardada: $($printerCombo.SelectedItem) - $(Get-SelectedPaperWidth) mm"
  return $true
}

$saveButton.Add_Click({
  if (Save-CurrentConfig) {
    Show-Message "Listo. RapiWeb ya puede imprimir en esta impresora."
  }
})

$testButton.Add_Click({
  if (-not (Save-CurrentConfig)) { return }
  if (-not (Test-Path $ExePath)) {
    Show-Message "No se encontro RapiWebPrintAssistant.exe en la carpeta de instalacion." "Error" ([System.Windows.Forms.MessageBoxIcon]::Error)
    return
  }
  try {
    $status.Text = "Enviando ticket de prueba..."
    $form.Refresh()
    $p = Start-Process -FilePath $ExePath -ArgumentList "--test" -WindowStyle Hidden -PassThru
    $p.WaitForExit(15000) | Out-Null
    Show-Message "Se envio un ticket de prueba. Si no salio impreso, revisa que la impresora este encendida, con papel y como impresora de Windows."
    $status.Text = "Ticket de prueba enviado."
  } catch {
    Show-Message "No se pudo enviar la prueba: $($_.Exception.Message)" "Error" ([System.Windows.Forms.MessageBoxIcon]::Error)
    $status.Text = "Error al probar impresion."
  }
})

$closeButton.Add_Click({ $form.Close() })

if ($printers.Count -eq 0) {
  $status.Text = "No se detectaron impresoras instaladas en Windows."
  $saveButton.Enabled = $false
  $testButton.Enabled = $false
}

[void]$form.ShowDialog()
