import { describe, expect, it } from 'vitest';

import { crearVerificadorDeOrigen } from './cors-origin';

const ORIGENES = ['https://app.dorado.com', 'https://dorado.com'];

/** Ejecuta el verificador y devuelve la decisión (el callback es síncrono). */
function permite(origin: string | undefined, permitirRedLocal = false): boolean {
  const verificar = crearVerificadorDeOrigen(ORIGENES, permitirRedLocal);
  let decision = false;

  verificar(origin, (_err, allow) => {
    decision = allow === true;
  });

  return decision;
}

describe('crearVerificadorDeOrigen', () => {
  it('permite los orígenes de la lista explícita', () => {
    expect(permite('https://app.dorado.com')).toBe(true);
    expect(permite('https://dorado.com')).toBe(true);
  });

  it('permite requests sin Origin (curl, same-origin, healthchecks)', () => {
    expect(permite(undefined)).toBe(true);
  });

  it('rechaza cualquier otro origen cuando no está el modo casa', () => {
    expect(permite('https://malicioso.com')).toBe(false);
    expect(permite('http://192.168.1.50:4200')).toBe(false);
    expect(permite('http://dorado.local:4200')).toBe(false);
  });

  describe('con CORS_ALLOW_LAN (modo casa)', () => {
    it('permite IPs privadas y loopback', () => {
      for (const origen of [
        'http://192.168.1.50:4200',
        'http://10.0.0.7:4321',
        'http://172.16.3.9:4200',
        'http://172.31.255.254:4200',
        'http://localhost:4200',
        'http://127.0.0.1:3000',
      ]) {
        expect(permite(origen, true), origen).toBe(true);
      }
    });

    it('permite nombres de host locales — el atajo estable ante cambios de IP', () => {
      for (const origen of [
        'http://dorado.local:4200',
        'http://desktop-5nne767.local:4200',
        'http://dorado.lan:4200',
        'http://dorado.casa:4200',
        'http://pc.home.arpa:4200',
        'http://dorado:4200',
      ]) {
        expect(permite(origen, true), origen).toBe(true);
      }
    });

    it('NO permite IPs públicas ni dominios de internet', () => {
      for (const origen of [
        'http://8.8.8.8:4200',
        'http://172.15.0.1:4200',
        'http://172.32.0.1:4200',
        'https://malicioso.com',
        'https://dorado.local.malicioso.com',
        'http://192.168.1.50.malicioso.com',
      ]) {
        expect(permite(origen, true), origen).toBe(false);
      }
    });

    it('rechaza orígenes que no son http(s) o no parsean', () => {
      expect(permite('file://dorado.local', true)).toBe(false);
      expect(permite('null', true)).toBe(false);
      expect(permite('no-es-una-url', true)).toBe(false);
    });
  });
});
