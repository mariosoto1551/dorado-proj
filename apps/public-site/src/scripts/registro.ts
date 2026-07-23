/*
 * Island de /registro — TypeScript vanilla, sin framework (ver skill
 * astro-public-site). Hace POST {GATEWAY}/api/auth/organizaciones a través del
 * Gateway (nunca directo a identity-service).
 *
 * Estados manejados a mano con DOM APIs: idle → loading → éxito | error.
 * En error NO se pierden los datos tipeados. No hay handoff de sesión a app-web
 * (orígenes distintos): en el éxito el usuario vuelve a loguearse en app-web.
 */

// Inyectadas en build por Astro (import.meta.env.PUBLIC_*). Si no están (dev /
// "modo casa"), se derivan del host desde el que se abre el sitio, así el
// registro funciona desde cualquier dispositivo de la red local sin rebuild.
const GATEWAY_URL =
  import.meta.env.PUBLIC_GATEWAY_URL ??
  `${window.location.protocol}//${window.location.hostname}:3000`;
const APP_WEB_URL =
  import.meta.env.PUBLIC_APP_WEB_URL ??
  `${window.location.protocol}//${window.location.hostname}:4200`;

interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
}

function esApiError(valor: unknown): valor is ApiErrorResponse {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as ApiErrorResponse).message === 'string'
  );
}

function init(): void {
  const form = document.querySelector<HTMLFormElement>('#form-registro');

  if (!form) {
    return;
  }

  const boton = form.querySelector<HTMLButtonElement>('#btn-registro');
  const btnTexto = form.querySelector<HTMLElement>('#btn-registro-texto');
  const btnSpinner = form.querySelector<HTMLElement>('#btn-registro-spinner');
  const errorBox = document.querySelector<HTMLElement>('#registro-error');
  const errorMsg = document.querySelector<HTMLElement>('#registro-error-msg');
  const vistaForm = document.querySelector<HTMLElement>('#vista-form');
  const vistaExito = document.querySelector<HTMLElement>('#vista-exito');
  const mismatchMsg = document.querySelector<HTMLElement>('#password-mismatch');
  const linkLogin = document.querySelector<HTMLAnchorElement>('#link-login');
  const linkPanel = document.querySelector<HTMLAnchorElement>('#link-panel-exito');

  // Link "¿ya tenés cuenta?" → login. Botón de éxito → raíz de app-web: la
  // cookie de refresh (dorado_refresh) ya quedó guardada por el POST de abajo
  // (credentials: 'include'), así que app-web rehidrata la sesión sola al
  // arrancar y el usuario cae logueado en su panel, sin re-loguearse.
  if (linkLogin) {
    linkLogin.href = `${APP_WEB_URL}/login`;
  }

  if (linkPanel) {
    linkPanel.href = `${APP_WEB_URL}/`;
  }

  function mostrarError(mensaje: string): void {
    if (errorBox && errorMsg) {
      errorMsg.textContent = mensaje;
      errorBox.classList.remove('hidden');
    }
  }

  function ocultarError(): void {
    errorBox?.classList.add('hidden');
  }

  function setCargando(cargando: boolean): void {
    if (!boton) {
      return;
    }

    boton.disabled = cargando;
    btnTexto?.classList.toggle('hidden', cargando);
    btnSpinner?.classList.toggle('hidden', !cargando);
  }

  form.addEventListener('submit', async (evento: SubmitEvent) => {
    evento.preventDefault();
    ocultarError();

    const datos = new FormData(form);
    const cuerpo = {
      nombre: String(datos.get('nombre') ?? '').trim(),
      emailContacto: String(datos.get('emailContacto') ?? '').trim(),
      password: String(datos.get('password') ?? ''),
    };
    const passwordConfirmacion = String(datos.get('passwordConfirmacion') ?? '');

    // Validación mínima en cliente (el servidor es la fuente de verdad).
    if (!cuerpo.nombre || !cuerpo.emailContacto || cuerpo.password.length < 8) {
      mostrarError('Revisá los datos: el nombre y el email son obligatorios y la contraseña necesita al menos 8 caracteres.');
      return;
    }

    // La confirmación solo se valida en cliente: no viaja al servidor.
    if (cuerpo.password !== passwordConfirmacion) {
      mismatchMsg?.classList.remove('hidden');
      mostrarError('Las contraseñas no coinciden. Revisá que sean iguales en los dos campos.');
      return;
    }

    mismatchMsg?.classList.add('hidden');

    setCargando(true);

    try {
      const respuesta = await fetch(`${GATEWAY_URL}/api/auth/organizaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // include: el navegador guarda la cookie httpOnly dorado_refresh que
        // setea el Gateway. Al ser el mismo dominio (localhost) que app-web,
        // esa cookie viaja después con el refresh silencioso de app-web y deja
        // al usuario logueado en su panel sin tener que iniciar sesión de nuevo.
        credentials: 'include',
        body: JSON.stringify(cuerpo),
      });

      if (respuesta.ok) {
        // Éxito (201): la sesión ya quedó establecida (cookie de refresh).
        // Mostramos la pantalla de éxito con el botón a app-web/ (el panel),
        // adonde el usuario entra ya logueado.
        vistaForm?.classList.add('hidden');
        vistaExito?.classList.remove('hidden');
        vistaExito?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Error: mostramos el mensaje del sobre ApiErrorResponse, sin perder datos.
      let mensaje = 'No se pudo crear la organización. Intentá de nuevo.';

      if (respuesta.status === 409) {
        mensaje = 'Ese email ya está registrado. Probá iniciar sesión o usá otro email.';
      } else {
        try {
          const json: unknown = await respuesta.json();

          if (esApiError(json)) {
            mensaje = json.message;
          }
        } catch {
          // Cuerpo no-JSON: dejamos el mensaje genérico.
        }
      }

      mostrarError(mensaje);
    } catch {
      mostrarError('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setCargando(false);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
