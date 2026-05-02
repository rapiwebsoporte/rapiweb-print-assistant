# RapiWeb Print Assistant

Aplicacion local para Windows que imprime tickets termicos enviados desde el panel RapiWeb (`admin.rapiweb.ar` / `resto.rapiweb.ar`) sin requerir servidor HTTP local ni configuracion de permisos del navegador.

A diferencia de la v1 (que levantaba un servidor en `localhost:9100`), esta version se registra como handler del protocolo personalizado `rapiweb-print://` y es invocada por Windows on-demand cada vez que el panel dispara una impresion. Esto evita los bloqueos de Chrome Private Network Access, certificados, firewall y permisos de "red local".

## Versiones

- **v2.1.0** - Soporte completo: tickets de venta, comandas de cocina, **facturas AFIP via ESC/POS RAW** con QR fiscal nativo. Generacion estandarizada por `ticket_type`.
- **v2.0.0** - Initial release: protocolo `rapiweb-print://` + tickets de venta.

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
        |                                                                       | dispatch por ticket_type
        |                                                                       | -> print /D:  o  copy /b RAW
        |                                    | POST /print-jobs/:id/ack         |
        |                                    |<---------------------------------|
        |  GET /print-jobs/:id/status (JWT)  |                                  |
        |----------------------------------->|                                  |
```

## Estructura

- `src/index.mjs` - punto de entrada (CLI + handler).
- `src/protocol.mjs` - parser de URLs `rapiweb-print://...`.
- `src/api-client.mjs` - cliente fetch hacia la API.
- `src/printer.mjs` - dispatcher + generadores (texto/ESC-POS) + Windows ops.
- `src/escpos.mjs` - builder de comandos ESC/POS estandar (init, align, bold, size, qr, cut).
- `src/config.mjs` - load/save de `config.json` junto al ejecutable.

## Contrato del payload por `ticket_type`

El frontend envia `{ ticketType, payload }` al endpoint `POST /api/print-jobs`. El `.exe` consume el job y dispara el formato segun `ticketType`:

### `receipt` / `pre-account` (texto plano)
Ticket de venta o pre-cuenta. Imprime con `print /D:`.
```jsonc
{
  "businessName": "Mi Bar",
  "address": "Calle Falsa 123",
  "cuit": "20-12345678-9",
  "phone": "+54 11 1234-5678",
  "orderNumber": 123,
  "receiptNumber": 456,
  "isProvisional": false,        // si true, imprime "PROVISORIO" en vez del nro
  "tableNumber": "5",
  "waiterName": "Juan",
  "customerName": "Maria",
  "deliveryAddress": "Av. Siempreviva 742",
  "serviceType": "delivery",
  "date": "2026-05-02 14:30",
  "items": [
    { "name": "Hamburguesa", "quantity": 2, "price": 1500, "notes": "sin cebolla" }
  ],
  "subtotal": 3000,
  "discount": 300,
  "total": 2700,
  "paymentMethod": "Efectivo",
  "payments": [{ "date": "2026-05-02", "method": "Efectivo", "amount": 2700 }],
  "paperWidth": 58              // 58 | 80, opcional (usa config.json)
}
```

### `kitchen` (texto plano grande)
Comanda de cocina. Sin precios, items en mayuscula con cantidad grande.
```jsonc
{
  "tableNumber": "5",
  "customerName": "Maria",       // si no hay tableNumber
  "orderNumber": "A-123",
  "waiterName": "Juan",
  "date": "14:30",
  "items": [
    { "name": "Hamburguesa", "quantity": 2, "notes": "sin cebolla" }
  ],
  "paperWidth": 58
}
```

### `factura` (ESC/POS RAW con QR fiscal AFIP)
Factura electronica. El `.exe` arma comandos ESC/POS con caja de letra (A/B/C), datos fiscales y QR nativo (RG 4291). El QR lo dibuja la impresora (no es imagen).
```jsonc
{
  "businessName": "Mi Comercio",
  "razonSocial": "JUAN PEREZ S.A.",
  "address": "Calle Falsa 123",
  "cuit": "20-12345678-9",
  "phone": "+54 11 1234-5678",
  "condicionIva": "monotributista",  // responsable_inscripto | monotributista | exento | consumidor_final
  "paperWidth": 80,
  "factura": {
    "tipo_cbte": 11,                  // 1=A, 6=B, 11=C, 2,7,12=ND, 3,8,13=NC
    "punto_venta": 1,
    "numero_cbte": 12345,
    "fecha_cbte": "2026-05-02",
    "cae": "12345678901234",
    "cae_vencimiento": "2026-05-12",
    "cliente_tipo_doc": 99,           // 80=CUIT, 96=DNI, 99=Consumidor Final
    "cliente_nro_doc": "0",
    "cliente_nombre": "Consumidor Final",
    "cliente_domicilio": "",
    "cliente_condicion_iva": "consumidor_final",
    "items": [
      { "cantidad": 1, "descripcion": "Hamburguesa", "precio_unitario": 1500, "subtotal": 1500 }
    ],
    "importe_neto": 1500,
    "importe_iva": 0,
    "importe_total": 1500
  }
}
```

### `raw` (escape hatch)
Bytes ESC/POS arbitrarios en base64. Para casos que no encajan en los tipos estandar.
```jsonc
{
  "raw": "G0AbYQ...."   // base64 de bytes ESC/POS
}
```

## Compatibilidad de impresoras

- **Texto plano** (`receipt`, `pre-account`, `kitchen`): funciona con cualquier impresora instalada en Windows.
- **ESC/POS** (`factura`, `raw`): requiere una impresora compatible ESC/POS estandar. Compatibles confirmadas: Epson TM-T20/T88, Xprinter, POS-58, POS-80, 3nStar, Star TSP, Citizen, Bematech.
- Si la impresora no soporta ESC/POS, el `.exe` reporta `error` al backend y el frontend automaticamente cae al fallback del navegador (dialogo Ctrl+P) sin perder la impresion.

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

El `.exe` (~38 MB) se empaqueta dentro del instalador (`installer/`) que se distribuye al cliente final.

## Instalador (Windows)

Ver `installer/RapiWebPrintAssistantSetup.iss`. Compila con [Inno Setup](https://jrsoftware.org/isinfo.php). El instalador hace:

1. Copia `RapiWebPrintAssistant.exe` a `%LOCALAPPDATA%\RapiWeb\PrintAssistant\`.
2. Registra el protocolo `rapiweb-print://` en `HKCU\Software\Classes\rapiweb-print`.
3. Crea acceso directo en el menu Inicio (configurar / probar).
4. Lanza el `.exe` en modo `--config` para que el cliente elija impresora al instalar.

## Compatibilidad con la v1

La v1 (`legacy_apps/resto-local/print-bridge/`) era un servidor HTTP en `localhost:9100`. La v2 NO escucha ningun puerto y NO es compatible con el frontend viejo. Despues de actualizar el panel a v2, los clientes deben reinstalar la app.
