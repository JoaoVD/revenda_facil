import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BusinessError } from '@/lib/errors';

/** 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado. */
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,29}$/,
    'Use de 3 a 30 letras, números, ponto, hífen ou sublinhado, sem espaços nem acentos.',
  );

/**
 * Troca o que foi digitado no login pelo e-mail do Supabase.
 * Com "@" é o próprio e-mail; senão, é o nome de usuário.
 * Usuário inexistente devolve null, e o login responde com a mesma
 * mensagem de senha errada, para não revelar quem tem conta.
 */
export async function emailForLogin(identifier: string) {
  const value = identifier.trim();
  if (value.includes('@')) {
    const email = z.email().safeParse(value);
    return email.success ? email.data : null;
  }
  const name = username.safeParse(value);
  if (!name.success) return null;
  const login = await db.userLogin.findUnique({
    where: { username: name.data },
    select: { email: true },
  });
  return login?.email ?? null;
}

/** Usuário livre? (Ignora o próprio dono, para quem só está confirmando.) */
export async function usernameAvailable(raw: string, userId?: string) {
  const name = username.parse(raw);
  const owner = await db.userLogin.findUnique({
    where: { username: name },
    select: { userId: true },
  });
  return !owner || owner.userId === userId;
}

/** Define ou troca o nome de usuário da conta. */
export async function saveUsername(userId: string, email: string, raw: string) {
  const name = username.parse(raw);
  try {
    return await db.userLogin.upsert({
      where: { userId },
      create: { userId, username: name, email },
      update: { username: name, email },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new BusinessError('Esse nome de usuário já está em uso.');
    throw error;
  }
}

/**
 * Após um login bem-sucedido: mantém o e-mail do vínculo igual ao do
 * Supabase e cria o vínculo pendente do cadastro (guardado nos metadados).
 */
export async function syncLogin(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}) {
  if (!user.email) return;
  const current = await db.userLogin.findUnique({
    where: { userId: user.id },
  });
  if (current) {
    if (current.email !== user.email)
      await db.userLogin.update({
        where: { userId: user.id },
        data: { email: user.email },
      });
    return;
  }
  const pending = username.safeParse(user.user_metadata?.username);
  if (pending.success && (await usernameAvailable(pending.data, user.id)))
    await saveUsername(user.id, user.email, pending.data).catch(() => {
      // Ocupado por outra conta no meio tempo: escolhe outro em Configurações.
    });
}
