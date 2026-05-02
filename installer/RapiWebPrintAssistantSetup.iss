; ====================================================================
;  RapiWeb Print Assistant - Inno Setup Script
;  Compilar con Inno Setup 6+: ISCC.exe RapiWebPrintAssistantSetup.iss
; ====================================================================

#define MyAppName        "RapiWeb Print Assistant"
#define MyAppShortName   "RapiWebPrintAssistant"
#define MyAppVersion     "2.1.1"
#define MyAppPublisher   "RapiWeb"
#define MyAppURL         "https://rapiweb.ar"
#define MyAppExeName     "RapiWebPrintAssistant.exe"
#define MyProtocol       "rapiweb-print"

[Setup]
AppId={{8B5C7F2E-9D4A-4E3B-A0F1-2C7D9E1B4F5A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Instalacion por usuario (no requiere admin) -> mas facil para clientes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={localappdata}\RapiWeb\PrintAssistant
DefaultGroupName=RapiWeb
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\RapiWebPrintAssistant.ico

OutputDir=output
OutputBaseFilename=RapiWebPrintAssistantSetup
SetupIconFile=RapiWebPrintAssistant.ico
Compression=lzma2/ultra
SolidCompression=yes
WizardStyle=modern

ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

; Cierra la app automaticamente si esta corriendo
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[Files]
; Tomamos el .exe ya compilado por pkg desde apps/print-assistant/dist
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "protocol-runner.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "config-ui.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "RapiWebPrintAssistant.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\config-ui.ps1"""; IconFilename: "{app}\RapiWebPrintAssistant.ico"
Name: "{group}\Configurar impresora"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\config-ui.ps1"""; IconFilename: "{app}\RapiWebPrintAssistant.ico"
Name: "{group}\Probar impresion"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--test"; IconFilename: "{app}\RapiWebPrintAssistant.ico"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\config-ui.ps1"""; IconFilename: "{app}\RapiWebPrintAssistant.ico"; Tasks: desktopicon

[Registry]
; Registrar el protocolo personalizado rapiweb-print:// para el USUARIO ACTUAL
; (HKCU evita pedir admin). Si en el futuro queremos instalacion para todos los
; usuarios, cambiar a HKLM y subir PrivilegesRequired a admin.
Root: HKCU; Subkey: "Software\Classes\{#MyProtocol}"; ValueType: string; ValueName: ""; ValueData: "URL:RapiWeb Print Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\{#MyProtocol}"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\{#MyProtocol}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\RapiWebPrintAssistant.ico"""
Root: HKCU; Subkey: "Software\Classes\{#MyProtocol}\shell"; ValueType: string; ValueName: ""; ValueData: "open"
Root: HKCU; Subkey: "Software\Classes\{#MyProtocol}\shell\open"; ValueType: string; ValueName: ""; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\{#MyProtocol}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{sys}\wscript.exe"" ""{app}\protocol-runner.vbs"" ""%1"""

[Run]
; Al terminar la instalacion, abrimos la app en modo configuracion para que el
; cliente elija su impresora termica de inmediato.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\config-ui.ps1"""; Description: "Configurar impresora ahora"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\config.json"
Type: dirifempty; Name: "{app}"
