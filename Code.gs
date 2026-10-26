/**
 * Backend RSVP para invitación de matrimonio (Google Apps Script).
 * NO se publica en GitHub Pages: se pega en Extensiones > Apps Script.
 *
 * Funciones para ejecutar a mano desde el editor:
 *   configurarHojas()       crea pestañas y encabezados (una sola vez)
 *   probarNormalizacion()   pruebas puras, no tocan la hoja
 *   probarFlujo()           pruebas de integración con datos temporales "Zz ..."
 */

const CONFIG = {
  SPREADSHEET_ID: 'PEGA_AQUI_EL_ID_DE_TU_GOOGLE_SHEET',
  HOJA_INVITADOS: 'Invitados',
  HOJA_CONFIRMACIONES: 'Confirmaciones',
  HOJA_HISTORIAL: 'Historial',
  LOCK_TIMEOUT_MS: 15000,
  MAX_NOMBRE: 120,
  MAX_CODIGO: 64,
  MAX_URL: 500,
  MAX_RESTRICCIONES: 200,
  MAX_MENSAJE: 600,
  FORMATO_FECHA: 'yyyy-mm-dd hh:mm:ss'
};

// Las columnas se buscan por su nombre de encabezado, el orden no importa.
const COLS_INVITADOS = ['nombre', 'activa']; // 'codigo' es opcional (ver README)
const COLS_CONFIRMACIONES = ['nombre', 'asistencia', 'restricciones', 'mensaje',
  'url_original', 'url_ultima_confirmacion', 'fecha_creacion', 'fecha_actualizacion'];
const COLS_HISTORIAL = ['nombre', 'respuesta_anterior', 'respuesta_nueva', 'fecha_cambio', 'url'];

const RESPUESTAS_VALIDAS = ['SI', 'NO'];

/* ------------------------------ Endpoints ------------------------------ */

/** Comprobación de estado. No expone datos de la hoja. */
function doGet() {
  return json_({ ok: true, mensaje: 'El servicio de confirmaciones está activo.' });
}

function doPost(e) {
  try {
    return json_(procesarConfirmacion_(leerSolicitud_(e)));
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_(error_('ERROR_INTERNO',
      'No pudimos guardar tu respuesta. Inténtalo de nuevo en unos minutos.'));
  }
}

/* --------------------------- Lógica principal --------------------------- */

function procesarConfirmacion_(d) {
  const nombre = limpiarEspacios_(d.invitado);
  const clave = normalizar_(nombre);
  const asistencia = String(d.asistencia || '').trim().toUpperCase();
  const codigo = String(d.codigo == null ? '' : d.codigo).trim().slice(0, CONFIG.MAX_CODIGO);

  if (!clave || nombre.length > CONFIG.MAX_NOMBRE) {
    return error_('NOMBRE_INVALIDO',
      'No encontramos tu nombre en el enlace. Usa el enlace personal que recibiste.');
  }
  if (RESPUESTAS_VALIDAS.indexOf(asistencia) === -1) {
    return error_('RESPUESTA_INVALIDA', 'Elige si asistirás o no antes de enviar.');
  }
  const url = sanitizarCelda_(d.url, CONFIG.MAX_URL);
  const restricciones = sanitizarCelda_(d.restricciones, CONFIG.MAX_RESTRICCIONES);
  const mensaje = sanitizarCelda_(d.mensaje, CONFIG.MAX_MENSAJE);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    return error_('OCUPADO', 'Hay muchas respuestas en este momento. Inténtalo de nuevo en unos segundos.');
  }

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hojaInv = obtenerHoja_(ss, CONFIG.HOJA_INVITADOS);
    const hojaConf = obtenerHoja_(ss, CONFIG.HOJA_CONFIRMACIONES);

    // 1) Identidad: lista maestra
    const mi = mapaColumnas_(hojaInv, COLS_INVITADOS);
    const coincidencias = hojaInv.getDataRange().getValues().slice(1)
      .filter(function (f) { return normalizar_(f[mi.nombre]) === clave; });

    if (coincidencias.length === 0) {
      return error_('NO_AUTORIZADO',
        'Tu nombre no está en la lista de invitados. Revisa tu enlace o escríbenos.');
    }
    if (coincidencias.length > 1) {
      return error_('NOMBRE_AMBIGUO',
        'Hay más de un invitado con un nombre parecido. Escríbenos para ayudarte a confirmar.');
    }
    const inv = coincidencias[0];

    // Código opcional: solo se exige si la celda "codigo" del invitado tiene valor
    const esperado = mi.codigo === undefined ? '' : String(inv[mi.codigo] == null ? '' : inv[mi.codigo]).trim();
    if (esperado && esperado !== codigo) {
      return error_('NO_AUTORIZADO',
        'El enlace no es válido. Usa el enlace personal que te enviamos o escríbenos.');
    }
    if (normalizar_(inv[mi.activa]) !== 'si') {
      return error_('INACTIVO', 'Tu invitación ya no admite cambios. Escríbenos si necesitas ayuda.');
    }
    const nombreOficial = limpiarEspacios_(inv[mi.nombre]);

    // 2) Confirmación vigente
    const mc = mapaColumnas_(hojaConf, COLS_CONFIRMACIONES);
    const valores = hojaConf.getDataRange().getValues();
    const idxs = [];
    for (let i = 1; i < valores.length; i++) {
      if (normalizar_(valores[i][mc.nombre]) === clave) idxs.push(i);
    }
    if (idxs.length > 1) {
      return error_('DATOS_DUPLICADOS', 'Encontramos un problema con tu registro. Escríbenos para ayudarte.');
    }

    const ahora = new Date();
    const ancho = hojaConf.getLastColumn();
    let anterior = '';
    let actualizado = false;

    if (idxs.length === 1) {
      const fila = valores[idxs[0]].slice(0, ancho);
      anterior = String(fila[mc.asistencia] || '').trim().toUpperCase();
      fila[mc.asistencia] = asistencia;
      fila[mc.restricciones] = restricciones;
      fila[mc.mensaje] = mensaje;
      fila[mc.url_ultima_confirmacion] = url;
      fila[mc.fecha_actualizacion] = ahora;
      // url_original y fecha_creacion no se tocan
      hojaConf.getRange(idxs[0] + 1, 1, 1, ancho).setValues([fila]);
      actualizado = true;
    } else {
      const fila = new Array(ancho).fill('');
      fila[mc.nombre] = nombreOficial;
      fila[mc.asistencia] = asistencia;
      fila[mc.restricciones] = restricciones;
      fila[mc.mensaje] = mensaje;
      fila[mc.url_original] = url;
      fila[mc.url_ultima_confirmacion] = url;
      fila[mc.fecha_creacion] = ahora;
      fila[mc.fecha_actualizacion] = ahora;
      hojaConf.appendRow(fila);
      const r = hojaConf.getLastRow();
      hojaConf.getRange(r, mc.fecha_creacion + 1).setNumberFormat(CONFIG.FORMATO_FECHA);
      hojaConf.getRange(r, mc.fecha_actualizacion + 1).setNumberFormat(CONFIG.FORMATO_FECHA);
    }

    // 3) Historial (si la pestaña existe)
    const hojaHist = ss.getSheetByName(CONFIG.HOJA_HISTORIAL);
    if (hojaHist && anterior !== asistencia) {
      const mh = mapaColumnas_(hojaHist, COLS_HISTORIAL);
      const f = new Array(Math.max(hojaHist.getLastColumn(), COLS_HISTORIAL.length)).fill('');
      f[mh.nombre] = nombreOficial;
      f[mh.respuesta_anterior] = anterior || '(sin respuesta)';
      f[mh.respuesta_nueva] = asistencia;
      f[mh.fecha_cambio] = ahora;
      f[mh.url] = url;
      hojaHist.appendRow(f);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      codigo: 'OK',
      nombre: nombreOficial,
      asistencia: asistencia,
      actualizado: actualizado,
      mensaje: asistencia === 'SI' ? 'Tu asistencia quedó confirmada.' : 'Registramos que no podrás asistir.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------ Utilidades ------------------------------ */

function leerSolicitud_(e) {
  let d = {};
  if (e && e.postData && e.postData.contents) {
    try { d = JSON.parse(e.postData.contents); } catch (x) { d = {}; }
  }
  if ((!d || typeof d !== 'object' || !Object.keys(d).length) && e && e.parameter) d = e.parameter;
  d = d || {};
  return {
    invitado: d.invitado, asistencia: d.asistencia, url: d.url,
    codigo: d.codigo, restricciones: d.restricciones, mensaje: d.mensaje
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function error_(codigo, mensaje) {
  return { ok: false, codigo: codigo, mensaje: mensaje };
}

function obtenerHoja_(ss, nombre) {
  const hoja = ss.getSheetByName(nombre);
  if (!hoja) throw new Error('No existe la pestaña "' + nombre + '"');
  return hoja;
}

/** Devuelve {encabezado: índice0}. Falla si falta alguna columna requerida. */
function mapaColumnas_(hoja, requeridas) {
  const n = Math.max(hoja.getLastColumn(), 1);
  const enc = hoja.getRange(1, 1, 1, n).getValues()[0];
  const m = {};
  enc.forEach(function (h, i) {
    const k = normalizar_(h);
    if (k && m[k] === undefined) m[k] = i;
  });
  requeridas.forEach(function (c) {
    if (m[c] === undefined) throw new Error('Falta la columna "' + c + '" en la pestaña "' + hoja.getName() + '"');
  });
  return m;
}

function limpiarEspacios_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

/** Minúsculas, sin tildes, sin espacios sobrantes. */
function normalizar_(s) {
  return limpiarEspacios_(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Recorta, quita caracteres de control y evita que Sheets lo interprete como fórmula. */
function sanitizarCelda_(s, max) {
  let t = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return t;
}

/* ------------------------------ Instalación ------------------------------ */

function configurarHojas() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  asegurarHoja_(ss, CONFIG.HOJA_INVITADOS, COLS_INVITADOS.concat(['codigo']));
  const conf = asegurarHoja_(ss, CONFIG.HOJA_CONFIRMACIONES, COLS_CONFIRMACIONES);
  const mc = mapaColumnas_(conf, COLS_CONFIRMACIONES);
  conf.getRange(2, mc.fecha_creacion + 1, conf.getMaxRows() - 1, 1).setNumberFormat(CONFIG.FORMATO_FECHA);
  conf.getRange(2, mc.fecha_actualizacion + 1, conf.getMaxRows() - 1, 1).setNumberFormat(CONFIG.FORMATO_FECHA);
  const hist = asegurarHoja_(ss, CONFIG.HOJA_HISTORIAL, COLS_HISTORIAL);
  const mh = mapaColumnas_(hist, COLS_HISTORIAL);
  hist.getRange(2, mh.fecha_cambio + 1, hist.getMaxRows() - 1, 1).setNumberFormat(CONFIG.FORMATO_FECHA);
  Logger.log('Hojas listas.');
}

function asegurarHoja_(ss, nombre, encabezados) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/* -------------------------------- Pruebas -------------------------------- */

function probarNormalizacion() {
  const casos = [['  Andrés   CAMARGO ', 'andres camargo'], ['María López', 'maria lopez'], ['Ñandú', 'nandu'], ['', '']];
  casos.forEach(function (c) {
    const r = normalizar_(c[0]);
    Logger.log((r === c[1] ? 'OK    ' : 'FALLA ') + JSON.stringify(c[0]) + ' -> ' + JSON.stringify(r));
  });
  Logger.log(sanitizarCelda_('=HYPERLINK("x")', 50) === "'=HYPERLINK(\"x\")" ? 'OK    sanitizar' : 'FALLA sanitizar');
}

/**
 * Integración: crea invitados temporales "Zz ...", prueba y los elimina
 * (de Invitados, Confirmaciones e Historial). No toca invitados reales.
 */
function probarFlujo() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const inv = obtenerHoja_(ss, CONFIG.HOJA_INVITADOS);
  const conf = obtenerHoja_(ss, CONFIG.HOJA_CONFIRMACIONES);
  const mi = mapaColumnas_(inv, COLS_INVITADOS);
  const mc = mapaColumnas_(conf, COLS_CONFIRMACIONES);
  const resultados = [];
  const A = 'Zz Prueba Activa Ñandú';
  const claveA = normalizar_(A);

  function agregarInvitado(nombre, activa, codigo) {
    const f = new Array(inv.getLastColumn()).fill('');
    f[mi.nombre] = nombre; f[mi.activa] = activa;
    if (mi.codigo !== undefined) f[mi.codigo] = codigo || '';
    inv.appendRow(f);
  }
  function caso(desc, esperado, r) {
    const ok = esperado === true ? r.ok === true : r.codigo === esperado;
    resultados.push((ok ? 'OK    ' : 'FALLA ') + desc + '  ->  ' + JSON.stringify(r));
  }
  function check(desc, cond) { resultados.push((cond ? 'OK    ' : 'FALLA ') + desc); }
  function filasDe(clave) {
    return conf.getDataRange().getValues().slice(1).filter(function (f) { return normalizar_(f[mc.nombre]) === clave; });
  }
  function req(nombre, asistencia, url, extra) {
    return procesarConfirmacion_(Object.assign({ invitado: nombre, asistencia: asistencia, url: url }, extra || {}));
  }

  agregarInvitado(A, 'SI');
  agregarInvitado('Zz Prueba Inactiva', 'NO');
  agregarInvitado('Zz Ambiguo', 'SI');
  agregarInvitado('ZZ ambiguo', 'SI');
  const conCodigo = mi.codigo !== undefined;
  if (conCodigo) agregarInvitado('Zz Prueba Codigo', 'SI', 'abc123');

  try {
    caso('Activo responde SI', true, req(A, 'SI', 'test://1', { restricciones: 'Vegetariano', mensaje: 'Felicidades' }));
    const creacion = filasDe(claveA)[0][mc.fecha_creacion];
    caso('Cambia a NO (mayúsculas y espacios distintos)', true, req('  zz PRUEBA  activa Ñandú ', 'NO', 'test://2'));
    caso('Cambia a SI (sin tildes)', true, req('zz prueba activa nandu', 'SI', 'test://3'));
    const filas = filasDe(claveA);
    check('Una sola fila vigente (' + filas.length + ')', filas.length === 1);
    check('fecha_creacion estable', String(filas[0][mc.fecha_creacion]) === String(creacion));
    check('url_original conserva la primera URL', filas[0][mc.url_original] === 'test://1');
    check('url_ultima_confirmacion guarda la última', filas[0][mc.url_ultima_confirmacion] === 'test://3');
    caso('Invitado inexistente', 'NO_AUTORIZADO', req('Zz No Existe', 'SI', 'test://x'));
    caso('Invitado inactivo', 'INACTIVO', req('Zz Prueba Inactiva', 'SI', 'test://x'));
    caso('Respuesta inválida', 'RESPUESTA_INVALIDA', req(A, 'TAL VEZ', 'test://x'));
    caso('Nombre vacío', 'NOMBRE_INVALIDO', req('   ', 'SI', 'test://x'));
    caso('Nombre ambiguo', 'NOMBRE_AMBIGUO', req('zz ambiguo', 'SI', 'test://x'));
    if (conCodigo) {
      caso('Código incorrecto', 'NO_AUTORIZADO', req('Zz Prueba Codigo', 'SI', 'test://x', { codigo: 'mal' }));
      caso('Sin código cuando se exige', 'NO_AUTORIZADO', req('Zz Prueba Codigo', 'SI', 'test://x'));
      caso('Código correcto', true, req('Zz Prueba Codigo', 'SI', 'test://x', { codigo: 'abc123' }));
    }
  } finally {
    [inv, conf, ss.getSheetByName(CONFIG.HOJA_HISTORIAL)].forEach(function (h) {
      if (!h) return;
      for (let i = h.getLastRow(); i >= 2; i--) {
        if (normalizar_(h.getRange(i, 1).getValue()).indexOf('zz ') === 0) h.deleteRow(i);
      }
    });
    Logger.log(resultados.join('\n'));
  }
}
