# Invitación de matrimonio · Valentina & Cristian

Página estática (GitHub Pages) + Google Apps Script + Google Sheets.

```
invitacion-matrimonio/
├── index.html   Invitación completa y ventana de confirmación
├── styles.css   Estilos responsive
├── app.js       Menú, visor de fotos, cuenta regresiva y envío del RSVP
├── Code.gs      Backend (se pega en Apps Script, NO va a GitHub Pages)
├── assets/      Imágenes de ejemplo (.svg): reemplázalas por las reales
└── README.md
```

## 1. Google Sheets

1. Crea un Google Sheet **privado** y copia su ID (entre `/d/` y `/edit`).
2. Pega `Code.gs` en **Extensiones → Apps Script**, cambia `SPREADSHEET_ID` y ejecuta `configurarHojas`. Crea estas pestañas:

| Pestaña | Columnas |
| ------- | -------- |
| `Invitados` | `nombre`, `activa`, `codigo` (opcional) |
| `Confirmaciones` | `nombre`, `asistencia`, `restricciones`, `mensaje`, `url_original`, `url_ultima_confirmacion`, `fecha_creacion`, `fecha_actualizacion` |
| `Historial` | `nombre`, `respuesta_anterior`, `respuesta_nueva`, `fecha_cambio`, `url` |

Las columnas se leen por su nombre de encabezado, así que puedes reordenarlas. Si ya habías creado `Confirmaciones` con la versión anterior, bórrala y vuelve a ejecutar `configurarHojas`.

3. Llena `Invitados`:

| nombre | activa | codigo |
| ------ | ------ | ------ |
| Andres Camargo | SI | a8F3kP9x |

- `activa` distinto de `SI` bloquea nuevos envíos.
- **Código opcional:** si la celda `codigo` de un invitado tiene valor, el enlace debe incluirlo (`&codigo=a8F3kP9x`) o se rechaza. Si está vacía, basta con el nombre. Así puedes proteger solo a quien quieras.
- Los nombres deben ser únicos tras ignorar tildes y mayúsculas; si hay homónimos, agrega el segundo apellido.

## 2. Backend

1. Ejecuta `probarNormalizacion` y `probarFlujo` y revisa **Ver → Registros**: todo debe decir `OK`. `probarFlujo` crea invitados temporales `Zz ...` y los borra al terminar.
2. **Implementar → Nueva implementación → Aplicación web**: ejecutar como **Yo**, acceso **Cualquier persona**.
3. Copia la URL que termina en `/exec`.

Cada cambio en `Code.gs` exige **Implementar → Administrar implementaciones → Editar → Nueva versión**.

## 3. Frontend

1. En `app.js` configura `ENDPOINT` y, si cambia, `FECHA_EVENTO`.
2. Reemplaza las imágenes de `assets/` conservando el nombre (o cambia el `src` en `index.html` por tus `.jpg`, idealmente de menos de 300 KB). `hero.svg` es la foto de portada (se referencia en `styles.css`).
3. Prueba local: `python3 -m http.server 8000` y abre  
   `http://localhost:8000/?invitado=Andres%20Camargo`

### Contenido por completar
- **Historia:** el texto es genérico.
- **Preguntas:** faltan los teléfonos de contacto y otras preguntas (hay comentarios HTML con los puntos de inserción).
- **Logística, hoteles y lugares de Pasto:** tomados de la página de referencia; revísalos.
- **Ceremonia:** solo hay recepción; hay un comentario para duplicar la tarjeta.

## 4. GitHub Pages

Sube `index.html`, `styles.css`, `app.js` y `assets/`. En **Settings → Pages** elige la rama `main` y la raíz. Enlace por invitado:

`https://TU-USUARIO.github.io/TU-REPO/?invitado=Nombre%20Apellido&codigo=a8F3kP9x`

## 5. Pruebas antes de compartir (con la app web real)

| Prueba | Resultado esperado |
| ------ | ------------------ |
| Invitado activo responde SI / NO | Se crea la fila |
| Cambia de respuesta | Misma fila; `fecha_creacion` y `url_original` no cambian; `url_ultima_confirmacion` sí |
| Cambio de respuesta | Aparece una fila en `Historial` |
| Nombre inexistente / inactivo | Mensaje claro, sin escritura |
| Invitado con código y enlace sin código o con código distinto | Rechazado |
| Enlace sin `?invitado=` | El botón abre un aviso y el formulario no aparece |
| Tildes, ñ y mayúsculas distintas | Encuentra al invitado correcto |
| Dos pestañas enviando a la vez | Una sola fila |
| Sin internet o Apps Script caído | Error, nunca éxito |
| Celular y computador | Menú, visor de fotos y formulario funcionan |

Prueba rápida del endpoint:

```bash
curl -L -X POST "URL_EXEC" -H "Content-Type: text/plain" \
  -d '{"invitado":"Andres Camargo","asistencia":"SI","url":"prueba"}'
```

## Limitaciones conocidas
- Sin código, el nombre no es una credencial: quien conozca el de otro invitado puede responder por él. Activa `codigo` donde quieras más protección (el código viaja en el enlace, así que tampoco es secreto absoluto).
- Una invitación = una persona. No hay acompañantes ni cupos.
- La página no muestra la respuesta anterior al entrar (evita exponer datos).
- Si la conexión se pierde justo después de enviar, el registro pudo guardarse aunque se vea un error; reenviar es seguro porque actualiza la misma fila.
- La página incluye `noindex` para que los buscadores no la listen.
