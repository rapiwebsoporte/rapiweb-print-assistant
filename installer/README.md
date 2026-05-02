# Instalador del RapiWeb Print Assistant

Script de [Inno Setup](https://jrsoftware.org/isinfo.php) que produce el `RapiWebPrintAssistantSetup.exe` que distribuimos al cliente final.

## Que hace el instalador

1. Copia `RapiWebPrintAssistant.exe` a `%LOCALAPPDATA%\RapiWeb\PrintAssistant\` (no requiere admin).
2. Registra el protocolo personalizado **`rapiweb-print://`** en `HKCU\Software\Classes\rapiweb-print` para que Windows lance el `.exe` cada vez que el panel dispare una impresion.
3. Crea accesos directos en el menu Inicio (configurar impresora, probar impresion).
4. Al finalizar, ofrece abrir la app en modo `--config` para que el cliente elija la impresora.
5. La desinstalacion borra los registros del protocolo y la carpeta de la app.

## Requisitos para compilar

1. Instalar **Inno Setup 6+** (https://jrsoftware.org/isdl.php).
2. Tener el `.exe` ya compilado en `apps/print-assistant/dist/RapiWebPrintAssistant.exe` (correr `npm run build:exe` desde `apps/print-assistant/`).

## Compilar

Desde PowerShell, en la carpeta `apps/print-assistant/installer/`:

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" .\RapiWebPrintAssistantSetup.iss
```

El instalador final queda en `apps/print-assistant/installer/output/RapiWebPrintAssistantSetup.exe`.

## Distribucion

Una vez compilado:

1. Copiar `RapiWebPrintAssistantSetup.exe` a `rapiweb-landing/public/downloads/`.
2. Commit + push -> Vercel lo sirve en `https://rapiweb.ar/downloads/RapiWebPrintAssistantSetup.exe`.
3. Los botones del panel (`Ajustes` y `Dashboard`) ya apuntan ahi por configuracion (ver `rapiweb-landing/src/config.ts`).

## Notas

- **SmartScreen**: la primera vez que un cliente lo descarga puede aparecer "Windows protegio tu PC". Es normal porque el .exe no esta firmado con un certificado EV. El cliente debe hacer "Mas informacion" -> "Ejecutar de todos modos".
- **Firma de codigo**: si en el futuro queremos eliminar el aviso, hay que firmar el .exe (y el setup) con un certificado de Code Signing EV. Costo aprox. USD 250-400/anio.
- **Por usuario vs por maquina**: actualmente la instalacion es por usuario (HKCU). Si se requiere instalar para todos los usuarios (raro en un local de gastronomia con una sola PC), cambiar `PrivilegesRequired=admin` y los `Root: HKCU` a `Root: HKLM`.
