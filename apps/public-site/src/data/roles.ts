/*
 * Fuente única de verdad de los tres roles que el sitio público le habla.
 * Se consume desde el home (selector de rol), el nav, el footer, /ayuda y el
 * bloque "otros roles" al pie de cada página dedicada — así el nombre, el gancho
 * y el color de un rol se escriben una sola vez.
 *
 * Corresponde a los roles reales del producto (ver ADR-00 sección 2):
 *   ORG_ADMIN → 'organizaciones' · TUTOR → 'tutores' · USUARIO → 'participantes'
 * PLATFORM_ADMIN queda deliberadamente fuera: es el rol interno de la
 * plataforma, no un público del sitio de marketing.
 *
 * OJO CON TAILWIND v4: las clases de abajo tienen que estar escritas completas
 * como literales. Este archivo entra en el @source de global.css, así que el
 * scanner las encuentra; si se arman por concatenación (`text-${x}-600`) no se
 * generan.
 */

export interface AcentoRol {
  /** Chip/badge del hero de la página del rol. */
  chip: string;
  /** Cuadrado del ícono. */
  icono: string;
  /** Filete superior de la tarjeta. */
  filete: string;
  /** Texto de acento (palabra destacada del titular, links). */
  texto: string;
  /** Halo difuminado de fondo. */
  halo: string;
  /** Fondo suave de bloques secundarios. */
  suave: string;
  /** Anillo del estado hover/focus de la tarjeta. */
  anillo: string;
}

export interface Rol {
  slug: string;
  href: string;
  /** Cómo se lo nombra en singular, tal como se lee en la app. */
  etiqueta: string;
  /** Título de la página y del ítem de menú. */
  titulo: string;
  /** Una línea: qué hace esta persona en el sistema. */
  gancho: string;
  /** Frase en primera persona para el selector del home ("Soy…"). */
  primeraPersona: string;
  /** Texto del link de la tarjeta. Explícito porque pluralizar en español a
   *  partir de `etiqueta` da engendros ("participantees"). */
  cta: string;
  emoji: string;
  acento: AcentoRol;
}

export const ROLES: Rol[] = [
  {
    slug: 'tutores',
    href: '/para-tutores',
    etiqueta: 'Tutor',
    titulo: 'Para tutores',
    gancho:
      'Definís las reglas del grupo, registrás el día a día y cerrás cada período.',
    primeraPersona: 'Soy tutor · docente · madre o padre',
    cta: 'Ver la vista del tutor',
    emoji: '🎯',
    acento: {
      chip: 'border-marca-200 bg-marca-50 text-marca-700 dark:border-marca-800 dark:bg-marca-900/40 dark:text-marca-300',
      icono: 'bg-gradient-to-br from-marca-400 to-marca-600',
      filete: 'bg-marca-500',
      texto: 'text-marca-600 dark:text-marca-400',
      halo: 'bg-marca-500/20',
      suave: 'bg-marca-50 dark:bg-marca-900/30',
      anillo: 'hover:ring-marca-400/60 dark:hover:ring-marca-500/50',
    },
  },
  {
    slug: 'participantes',
    href: '/para-participantes',
    etiqueta: 'Participante',
    titulo: 'Para participantes',
    gancho:
      'Ves tu lista del día, sumás puntos y avanzás por zonas hasta tu recompensa.',
    primeraPersona: 'Soy participante · alumno · integrante',
    cta: 'Ver la vista del participante',
    emoji: '🚀',
    acento: {
      chip: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
      icono: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
      filete: 'bg-emerald-500',
      texto: 'text-emerald-600 dark:text-emerald-400',
      halo: 'bg-emerald-500/20',
      suave: 'bg-emerald-50 dark:bg-emerald-900/30',
      anillo: 'hover:ring-emerald-400/60 dark:hover:ring-emerald-500/50',
    },
  },
  {
    slug: 'organizaciones',
    href: '/para-organizaciones',
    etiqueta: 'Administrador',
    titulo: 'Para organizaciones',
    gancho:
      'Creás los grupos, invitás a los tutores y mirás todo desde arriba, con tu marca.',
    primeraPersona: 'Dirijo un colegio · club · institución',
    cta: 'Ver la vista de la organización',
    emoji: '🏛️',
    acento: {
      chip: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      icono: 'bg-gradient-to-br from-amber-400 to-amber-600',
      filete: 'bg-amber-500',
      texto: 'text-amber-600 dark:text-amber-400',
      halo: 'bg-amber-500/20',
      suave: 'bg-amber-50 dark:bg-amber-900/30',
      anillo: 'hover:ring-amber-400/60 dark:hover:ring-amber-500/50',
    },
  },
];

export function rolPorSlug(slug: string): Rol {
  const rol = ROLES.find((r) => r.slug === slug);

  if (!rol) {
    throw new Error(`Rol desconocido: ${slug}`);
  }

  return rol;
}

export function otrosRoles(slug: string): Rol[] {
  return ROLES.filter((r) => r.slug !== slug);
}
