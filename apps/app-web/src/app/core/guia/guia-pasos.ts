import type { EstadoPasos } from './guia-setup.service';

/**
 * Definición de los pasos de la guía de primeros pasos (fase-14), compartida
 * por la página de guía y el widget flotante para que muestren exactamente lo
 * mismo. El orden es el de armado: primero el sistema de puntos, después la
 * gente, el ritmo (opcional) y por último arrancar la semana.
 */
export interface PasoGuia {
  /** Clave del flag en EstadoPasos, o 'configuracion' para el paso opcional. */
  clave: keyof EstadoPasos | 'configuracion';
  /** Número visible (1..6). null para el paso opcional, que no cuenta. */
  numero: number | null;
  opcional: boolean;
  titulo: string;
  descripcion: string;
  /** Segmentos de ruta relativos a /grupos/:grupoId (ej: ['secciones', 'actual']). */
  segmentos: string[];
  cta: string;
}

export const PASOS_GUIA: PasoGuia[] = [
  {
    clave: 'zonas',
    numero: 1,
    opcional: false,
    titulo: 'Definí tus zonas',
    descripcion: 'Los niveles de puntos (ej: Rojo, Verde, Dorado) y su color.',
    segmentos: ['umbrales'],
    cta: 'Hacer',
  },
  {
    clave: 'actividades',
    numero: 2,
    opcional: false,
    titulo: 'Cargá actividades',
    descripcion: 'Las opcionales suman puntos; las obligatorias restan si no se hacen.',
    segmentos: ['actividades'],
    cta: 'Hacer',
  },
  {
    clave: 'conductas',
    numero: 3,
    opcional: false,
    titulo: 'Cargá conductas',
    descripcion: 'Lo que suma o resta según el comportamiento.',
    segmentos: ['conductas'],
    cta: 'Hacer',
  },
  {
    clave: 'recompensas',
    numero: 4,
    opcional: false,
    titulo: 'Creá recompensas',
    descripcion: 'Lo que se gana al alcanzar cada zona.',
    segmentos: ['recompensas'],
    cta: 'Hacer',
  },
  {
    clave: 'participantes',
    numero: 5,
    opcional: false,
    titulo: 'Invitá participantes',
    descripcion: 'Generá un link de invitación y compartilo.',
    segmentos: ['invitaciones'],
    cta: 'Hacer',
  },
  {
    clave: 'configuracion',
    numero: null,
    opcional: true,
    titulo: 'Ajustá el ritmo de sesión',
    descripcion: 'Por defecto abrís y cerrás las semanas a mano. Si querés, automatizalo.',
    segmentos: ['configuracion-sesion'],
    cta: 'Ver',
  },
  {
    clave: 'primeraSemana',
    numero: 6,
    opcional: false,
    titulo: 'Arrancá la primera semana',
    descripcion: 'Iniciá la primera sección para empezar a sumar.',
    segmentos: ['secciones', 'actual'],
    cta: 'Hacer',
  },
];
