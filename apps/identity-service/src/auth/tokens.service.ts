import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';

import { decodificarPem, JWT_ALG } from '@dorado/shared-auth';
import type { CodigoPlan, PrincipalType, Rol } from '@dorado/shared-types';

import type { RefreshToken } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** TTL del access token: 2 horas (ADR-00 §3). */
const ACCESS_TOKEN_TTL_SEGUNDOS = 2 * 60 * 60;

/** TTL del refresh token: 30 días (ADR-00 §3). */
const REFRESH_TOKEN_TTL_DIAS = 30;

export interface DatosEmisionToken {
  principalId: string;
  principalType: PrincipalType;
  organizacionId: string;
  grupoIds: string[];
  rol: Rol;
  plan: CodigoPlan;
}

export interface RefreshEmitido {
  token: string;
  expiraEn: Date;
}

/**
 * Emisión y rotación de tokens. Identity es el ÚNICO servicio que conoce la
 * clave privada RS256 (ADR-00 §3). El refresh token es opaco (no JWT), se
 * almacena hasheado con SHA-256 — alcanza porque el token tiene 256 bits de
 * entropía aleatoria; argon2 queda para passwords humanas.
 */
@Injectable()
export class TokensService implements OnModuleInit {
  private clavePrivada!: CryptoKey;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit(): Promise<void> {
    const pem = decodificarPem(this.config.getOrThrow<string>('JWT_PRIVATE_KEY'));
    this.clavePrivada = await importPKCS8(pem, JWT_ALG);
  }

  async emitirAccessToken(datos: DatosEmisionToken): Promise<string> {
    const ahora = Math.floor(Date.now() / 1000);

    return await new SignJWT({
      principalType: datos.principalType,
      organizacionId: datos.organizacionId,
      grupoIds: datos.grupoIds,
      rol: datos.rol,
      plan: datos.plan,
    })
      .setProtectedHeader({ alg: JWT_ALG })
      .setSubject(datos.principalId)
      .setIssuedAt(ahora)
      .setExpirationTime(ahora + ACCESS_TOKEN_TTL_SEGUNDOS)
      .sign(this.clavePrivada);
  }

  async emitirRefreshToken(
    principalType: PrincipalType,
    principalId: string
  ): Promise<RefreshEmitido> {
    const token = randomBytes(32).toString('base64url');
    const expiraEn = new Date(Date.now() + REFRESH_TOKEN_TTL_DIAS * 24 * 60 * 60 * 1000);

    await this.prisma.client.refreshToken.create({
      data: { principalType, principalId, tokenHash: this.hashear(token), expiraEn },
    });

    return { token, expiraEn };
  }

  /**
   * Valida y consume (revoca) el refresh token recibido — rotación de ADR-00
   * §3: cada uso revoca el anterior; el nuevo lo emite quien arma la sesión.
   * Devuelve la fila consumida, o null si no existe / ya revocado / expirado.
   */
  async consumirRefreshToken(token: string): Promise<RefreshToken | null> {
    const fila = await this.prisma.client.refreshToken.findFirst({
      where: { tokenHash: this.hashear(token) },
    });

    if (!fila || fila.revocado || fila.expiraEn <= new Date()) {
      return null;
    }

    await this.prisma.client.refreshToken.updateMany({
      where: { id: fila.id },
      data: { revocado: true },
    });

    return fila;
  }

  async revocarRefreshToken(token: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash: this.hashear(token) },
      data: { revocado: true },
    });
  }

  private hashear(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
