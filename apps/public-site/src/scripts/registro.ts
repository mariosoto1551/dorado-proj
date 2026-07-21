/*
 * Island de /registro — TypeScript vanilla, sin framework (ver skill
 * astro-public-site). Hace POST {GATEWAY}/api/auth/organizaciones a través del
 * Gateway (nunca directo a identity-service).
 *
 * Estados manejados a mano con DOM APIs: idle → loading → éxito | error.
 * En error NO se pierden los datos tipeados. No hay handoff de sesión a app-web
 * (orígenes distintos): en el éxito el usuario vuelve a loguearse en app-web.
 */

// Inyectadas en build por Astro (import.meta.env.PUBLIC_*). Defaults de dev.
const GATEWAY_URL = import.meta.env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';
const APP_WEB_URL = import.meta.env.PUBLIC_APP_WEB_URL ?? 'http://localhost:4200';

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
  const loginUrl = `${APP_WEB_URL}/login`;

  // Ambos links a app-web/login (el del pie del form y el de la pantalla de éxito).
  document
    .querySelectorAll<HTMLAnchorElement>('#link-login, #link-login-exito')
    .forEach((a) => {
      a.href = loginUrl;
    });

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

    // Validación mínima en cliente (el servidor es la fuente de verdad).
    if (!cuerpo.nombre || !cuerpo.emailContacto || cuerpo.password.length < 8) {
      mostrarError('Revisá los datos: el nombre y el email son obligatorios y la contraseña necesita al menos 8 caracteres.');
      return;
    }

    setCargando(true);

    try {
      const respuesta = await fetch(`${GATEWAY_URL}/api/auth/organizaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });

      if (respuesta.ok) {
        // Éxito (201). No guardamos la sesión: mostramos la pantalla de éxito
        // con el link a app-web/login (los datos tipeados ya no importan).
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
