'use strict';

/* ================= CONFIGURACIÓN (edita estos valores) ================= */
const CONFIG = {
  // URL de la aplicación web de Apps Script (termina en /exec)
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbxEfwLyMd4C5kVWik48WM47ez7DyDagPJGGYbobzpxvK_HU0osn02h9Br7bhIykSkKWEA/exec',
  // Fecha y hora de la boda, con zona horaria (Colombia = -05:00)
  FECHA_EVENTO: '2026-11-27T18:30:00-05:00',
  PARAM_INVITADO: 'invitado',  // ?invitado=Andres%20Camargo
  PARAM_CODIGO: 'codigo',      // &codigo=a8F3kP9x (opcional)
  MAX_NOMBRE: 120,
  MAX_CODIGO: 64,
  TIMEOUT_MS: 20000
};
/* ====================================================================== */

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);

/* ---------- Invitado desde la URL ---------- */
function limpiar(valor, max) {
  const t = String(valor || '').replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.length <= max ? t : '';
}
const invitado = limpiar(params.get(CONFIG.PARAM_INVITADO), CONFIG.MAX_NOMBRE);
const codigo = limpiar(params.get(CONFIG.PARAM_CODIGO), CONFIG.MAX_CODIGO);

/* ---------- Menú ---------- */
const nav = $('nav');
const menuBoton = $('menu-boton');

function cerrarMenu() {
  nav.classList.remove('nav--abierto');
  menuBoton.setAttribute('aria-expanded', 'false');
  menuBoton.textContent = 'Menú';
}
menuBoton.addEventListener('click', () => {
  const abrir = !nav.classList.contains('nav--abierto');
  nav.classList.toggle('nav--abierto', abrir);
  menuBoton.setAttribute('aria-expanded', String(abrir));
  menuBoton.textContent = abrir ? 'Cerrar' : 'Menú';
});
$('menu').addEventListener('click', (e) => { if (e.target.closest('a')) cerrarMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });

function actualizarNav() { nav.classList.toggle('nav--solido', window.scrollY > 40); }
window.addEventListener('scroll', actualizarNav, { passive: true });
actualizarNav();

/* ---------- Saludo personalizado ---------- */
if (invitado) {
  // textContent: nunca se inserta HTML proveniente de la URL
  $('nombre-invitado').textContent = invitado;
  $('saludo').hidden = false;
  $('rsvp-hola').textContent = 'Hola, ' + invitado;
  $('rsvp-hola').hidden = false;
  $('rsvp-invitado').textContent = invitado;
  $('rsvp-invitado').hidden = false;
}

/* ---------- Cuenta regresiva ---------- */
(function cuentaRegresiva() {
  const objetivo = new Date(CONFIG.FECHA_EVENTO).getTime();
  const caja = $('cuenta');
  if (Number.isNaN(objetivo)) return;
  const pintar = () => {
    const falta = objetivo - Date.now();
    if (falta <= 0) { caja.hidden = true; return false; }
    const min = Math.floor(falta / 60000);
    $('c-dias').textContent = Math.floor(min / 1440);
    $('c-horas').textContent = Math.floor((min % 1440) / 60);
    $('c-min').textContent = min % 60;
    caja.hidden = false;
    return true;
  };
  if (pintar()) {
    const id = setInterval(() => { if (!pintar()) clearInterval(id); }, 30000);
  }
})();

/* ---------- Visor de fotos ---------- */
(function visorFotos() {
  const visor = $('visor');
  const img = $('visor-img');
  const fotos = Array.from(document.querySelectorAll('#galeria img'));
  let actual = 0;

  function mostrar(i) {
    actual = (i + fotos.length) % fotos.length;
    img.src = fotos[actual].currentSrc || fotos[actual].src;
    img.alt = fotos[actual].alt;
  }
  fotos.forEach((f, i) => f.closest('button').addEventListener('click', () => {
    mostrar(i);
    visor.showModal();
  }));
  $('visor-ant').addEventListener('click', () => mostrar(actual - 1));
  $('visor-sig').addEventListener('click', () => mostrar(actual + 1));
  $('visor-cerrar').addEventListener('click', () => visor.close());
  visor.addEventListener('click', (e) => { if (e.target === visor) visor.close(); });
  visor.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') mostrar(actual - 1);
    if (e.key === 'ArrowRight') mostrar(actual + 1);
  });
})();

/* ---------- Confirmación de asistencia ---------- */
(function rsvp() {
  const modal = $('modal-rsvp');
  const form = $('rsvp-form');
  const enviarBtn = $('enviar');
  const estado = $('estado');
  const exito = $('exito');
  let enviando = false;

  function mostrarEstado(tipo, texto) {
    estado.className = 'aviso' + (tipo ? ' aviso--' + tipo : '');
    estado.textContent = texto;
    estado.hidden = !texto;
  }
  function setEnviando(v) {
    enviando = v;
    enviarBtn.disabled = v;
    enviarBtn.textContent = v ? 'Enviando…' : 'Confirmar asistencia';
    form.setAttribute('aria-busy', String(v));
  }

  // Abrir / cerrar
  document.querySelectorAll('[data-abrir-rsvp]').forEach((b) => b.addEventListener('click', () => {
    cerrarMenu();
    $('sin-nombre').hidden = !!invitado;
    form.hidden = !invitado || !exito.hidden;
    modal.showModal();
    document.body.classList.add('bloqueado');
  }));
  $('modal-cerrar').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener('close', () => document.body.classList.remove('bloqueado'));

  // Envío
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (enviando) return; // evita dobles envíos

    const opcion = form.querySelector('input[name="asistencia"]:checked');
    if (!opcion) { mostrarEstado('error', 'Elige si asistirás o no antes de enviar.'); return; }
    if (!CONFIG.ENDPOINT || CONFIG.ENDPOINT.indexOf('PEGA_AQUI') === 0) {
      mostrarEstado('error', 'El formulario aún no está configurado. Escríbenos para confirmar.');
      return;
    }

    mostrarEstado('', '');
    setEnviando(true);
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), CONFIG.TIMEOUT_MS);

    try {
      const respuesta = await fetch(CONFIG.ENDPOINT, {
        method: 'POST',
        // text/plain evita el preflight CORS, que Apps Script no soporta
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          invitado: invitado,
          codigo: codigo,
          asistencia: opcion.value,
          restricciones: $('restricciones').value,
          mensaje: $('mensaje').value,
          url: window.location.href
        }),
        signal: controlador.signal
      });
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      const datos = await respuesta.json();

      if (datos && datos.ok === true) {
        mostrarExito(datos.asistencia, datos.actualizado);
      } else {
        mostrarEstado('error', (datos && datos.mensaje) || 'No pudimos guardar tu respuesta. Inténtalo de nuevo.');
      }
    } catch (err) {
      // Nunca se muestra éxito si la petición falló o no se pudo leer la respuesta
      mostrarEstado('error', err && err.name === 'AbortError'
        ? 'La respuesta tardó demasiado. Revisa tu conexión e inténtalo de nuevo.'
        : 'No pudimos confirmar que tu respuesta llegara. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      clearTimeout(temporizador);
      setEnviando(false);
    }
  });

  function mostrarExito(asistencia, actualizado) {
    const asiste = asistencia === 'SI';
    $('exito-titulo').textContent = asiste ? '¡Gracias! Tu confirmación fue recibida.' : 'Gracias por avisarnos';
    $('exito-texto').textContent = asiste
      ? (actualizado ? 'Actualizamos tu respuesta. ¡Nos vemos el 27 de noviembre!' : '¡Nos vemos el 27 de noviembre!')
      : (actualizado ? 'Actualizamos tu respuesta: no podrás asistir.' : 'Registramos que no podrás asistir. Te vamos a extrañar.');
    form.hidden = true;
    exito.hidden = false;
    mostrarEstado('', '');
    $('exito-titulo').setAttribute('tabindex', '-1');
    $('exito-titulo').focus();
  }

  $('cambiar').addEventListener('click', () => {
    exito.hidden = true;
    form.hidden = false;
    form.querySelectorAll('input[name="asistencia"]').forEach((i) => { i.checked = false; });
    form.querySelector('input[name="asistencia"]').focus();
  });
})();
