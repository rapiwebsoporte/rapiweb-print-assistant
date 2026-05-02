# RapiWeb Print Assistant v2

Aplicacion local para Windows que imprime tickets enviados desde el panel RapiWeb (`admin.rapiweb.ar` / `resto.rapiweb.ar`) a impresoras termicas.

A diferencia de la v1, **no levanta servidor HTTP**. Se registra como handler del protocolo personalizado `rapiweb-print://` y es invocada por Windows cada vez que el panel dispara una impresion. Esto evita los problemas de Chrome Private Network Access, certificados, firewall y permisos de "red local".

## Arquitectura

```
[ navegador panel ]                    [ rapiweb-api ]                [ Print Assistant .exe ]
        |                                    |                                  |
        |  POST /print-jobs (JWT)            |                                  |
        |----------------------------------->| crea job + token efimero         |
        |  { id, token, deeplink }           |                                  |
        |<-----------------------------------|                                  |
        |                                                                       |
        |  window.location.href = "rapiweb-print://print?job=...&t=...&api=..." |
        |  (Windows lanza el .exe registrado)                                   |
        |---------------------------------------------------------------------> |
        |                                                                       |
        |                                    | GET /print-jobs/:id?t=token      |
        |                                    |<---------------------------------|
        |                                    | (consume + atomic mark)          |
        |                                    |--------------------------------->|
        |                                                                       | print /D:"..."
        |                                    | POST /print-jobs/:id/ack         |
        |                                    |<---------------------------------|
        |  GET /print-jobs/:id/status (JWT)  |                                  |
        |----------------------------------->|                                  |
```

## Estructura

- `src/index.mjs` - punto de entrada (CLI + handler).
- `src/protocol.mjs` - parser de URLs `rapiweb-print://...`.
- `src/api-client.mjs` - cliente fetch hacia la API.
- `src/printer.mjs` - logica Windows (`print /D:`, `copy /b`, generador de texto).
- `src/config.mjs` - load/save de `config.json` junto al ejecutable.

## Desarrollo

Requiere Node.js 18+.

```bash
cd apps/print-assistant
npm install
node src/index.mjs                                # menu interactivo
node src/index.mjs --config                        # configurar impresora
node src/index.mjs --test                          # imprimir ticket de prueba
node src/index.mjs "rapiweb-print://print?job=...&t=...&api=https://rapiweb-api.onrender.com"
```

## Empaquetado

```bash
npm run build:bundle    # esbuild -> dist/print-assistant.cjs
npm run build:exe       # pkg     -> dist/RapiWebPrintAssistant.exe
```

El `.exe` resultante (~38 MB) se empaqueta dentro del instalador (`installer/`) que se distribuye al cliente final.

## Instalador (Windows)

Ver `installer/RapiWebPrintAssistantSetup.iss`. Compila con [Inno Setup](https://jrsoftware.org/isinfo.php). El instalador hace:

1. Copia `RapiWebPrintAssistant.exe` a `%LOCALAPPDATA%\RapiWeb\PrintAssistant\`.
2. Registra el protocolo `rapiweb-print://` en `HKCU\Software\Classes\rapiweb-print`.
3. Crea acceso directo en el menu Inicio.
4. (Opcional) lanza el .exe en modo `--config` para configurar impresora al instalar.

## Compatibilidad con la v1

La v1 (`legacy_apps/resto-local/print-bridge/`) era un servidor HTTP en `localhost:9100`. La v2 NO escucha ningun puerto y NO es compatible con el frontend viejo. Asegurate de actualizar el panel cuando despleges esta version.
