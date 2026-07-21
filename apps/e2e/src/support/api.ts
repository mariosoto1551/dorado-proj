import { APIRequestContext, APIResponse, expect, request } from '@playwright/test';

/**
 * Cliente REST mínimo sobre el Gateway (:3000/api). Guarda un access token
 * opcional y lo manda como Bearer. NO toca cookies de refresh: cada actor de
 * la suite trabaja con su access token en memoria (mismo espíritu que la
 * regla 7 del proyecto — nada de storage), renovándolo con un login nuevo si
 * hiciera falta, cosa que en una corrida corta no ocurre.
 */
export class Api {
  private constructor(
    private readonly ctx: APIRequestContext,
    public token: string | null
  ) {}

  static async crear(token: string | null = null): Promise<Api> {
    const baseURL = process.env['E2E_GATEWAY_URL'] ?? 'http://localhost:3000';
    const ctx = await request.newContext({ baseURL });

    return new Api(ctx, token);
  }

  /** Nueva instancia que comparte el context HTTP pero con otro token. */
  conToken(token: string | null): Api {
    return new Api(this.ctx, token);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = { 'content-type': 'application/json' };

    if (this.token) {
      base['authorization'] = `Bearer ${this.token}`;
    }

    return { ...base, ...extra };
  }

  get(ruta: string, extraHeaders?: Record<string, string>): Promise<APIResponse> {
    return this.conReintento429(() =>
      this.ctx.get(`/api${ruta}`, { headers: this.headers(extraHeaders) })
    );
  }

  post(
    ruta: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<APIResponse> {
    return this.conReintento429(() =>
      this.ctx.post(`/api${ruta}`, { headers: this.headers(extraHeaders), data: body ?? {} })
    );
  }

  put(ruta: string, body?: unknown): Promise<APIResponse> {
    return this.conReintento429(() =>
      this.ctx.put(`/api${ruta}`, { headers: this.headers(), data: body ?? {} })
    );
  }

  patch(ruta: string, body?: unknown): Promise<APIResponse> {
    return this.conReintento429(() =>
      this.ctx.patch(`/api${ruta}`, { headers: this.headers(), data: body ?? {} })
    );
  }

  delete(ruta: string): Promise<APIResponse> {
    return this.conReintento429(() =>
      this.ctx.delete(`/api${ruta}`, { headers: this.headers() })
    );
  }

  /**
   * Reintenta ante un 429 del rate limiter del Gateway (100 req/min global por
   * IP). No es parte de lo que se prueba —es ruido de infraestructura al correr
   * muchas suites seguidas desde una sola IP— así que se absorbe transparente
   * esperando la ventana. El registro de organización, con su límite estricto
   * de 10/min, se saltea el Gateway (ver `crearOrganizacion`).
   */
  private async conReintento429(hacer: () => Promise<APIResponse>): Promise<APIResponse> {
    for (let intento = 0; intento < 4; intento++) {
      const res = await hacer();

      if (res.status() !== 429) {
        return res;
      }

      await new Promise((resolver) => setTimeout(resolver, 5000));
    }

    return await hacer();
  }

  /** POST que exige 2xx y devuelve el JSON tipado (falla el test si no). */
  async postOk<T>(ruta: string, body?: unknown): Promise<T> {
    const res = await this.post(ruta, body);
    await esperarOk(res, `POST ${ruta}`);

    return (await res.json()) as T;
  }

  async putOk<T>(ruta: string, body?: unknown): Promise<T> {
    const res = await this.put(ruta, body);
    await esperarOk(res, `PUT ${ruta}`);

    return (await res.json()) as T;
  }

  async patchOk<T>(ruta: string, body?: unknown): Promise<T> {
    const res = await this.patch(ruta, body);
    await esperarOk(res, `PATCH ${ruta}`);

    return (await res.json()) as T;
  }

  async getOk<T>(ruta: string): Promise<T> {
    const res = await this.get(ruta);
    await esperarOk(res, `GET ${ruta}`);

    return (await res.json()) as T;
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}

async function esperarOk(res: APIResponse, ctx: string): Promise<void> {
  if (!res.ok()) {
    const cuerpo = await res.text().catch(() => '<sin cuerpo>');
    expect(res.ok(), `${ctx} devolvió ${res.status()}: ${cuerpo}`).toBeTruthy();
  }
}
