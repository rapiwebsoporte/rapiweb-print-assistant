' RapiWeb Print Assistant - protocolo oculto
' Windows llama este script cuando el navegador dispara rapiweb-print://...
' El script ejecuta RapiWebPrintAssistant.exe sin mostrar ventana de consola.

Option Explicit

Dim fso, shell, appDir, exePath, url, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count = 0 Then
  WScript.Quit 1
End If

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = fso.BuildPath(appDir, "RapiWebPrintAssistant.exe")
url = WScript.Arguments(0)

If Not fso.FileExists(exePath) Then
  WScript.Quit 2
End If

command = """" & exePath & """ """ & url & """"

' 0 = ventana oculta, False = no esperar a que termine
shell.Run command, 0, False
