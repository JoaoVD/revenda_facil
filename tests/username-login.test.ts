import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  emailForLogin,
  saveUsername,
  syncLogin,
  username,
  usernameAvailable,
} from '@/modules/auth/username';

describe('regras do nome de usuário', () => {
  it('normaliza para minúsculas e recusa espaços, acentos e "@"', () => {
    expect(username.parse('  Ana.Cosmeticos ')).toBe('ana.cosmeticos');
    for (const invalid of [
      'ab',
      'ana cosmeticos',
      'anã',
      'ana@x',
      '.ana',
      'a'.repeat(31),
    ])
      expect(username.safeParse(invalid).success).toBe(false);
  });
});

const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const users: string[] = [];
const newUser = () => {
  const id = crypto.randomUUID();
  users.push(id);
  return id;
};

describe.skipIf(!enabled)('login por nome de usuário', () => {
  afterAll(async () => {
    await db.userLogin.deleteMany({ where: { userId: { in: users } } });
  });

  it('troca o usuário pelo e-mail, sem diferenciar maiúsculas', async () => {
    const id = newUser();
    const name = `ana${id.slice(0, 8)}`;
    await saveUsername(id, 'ana@example.com', name.toUpperCase());
    expect(await emailForLogin(name)).toBe('ana@example.com');
    expect(await emailForLogin(` ${name.toUpperCase()} `)).toBe(
      'ana@example.com',
    );
    // E-mail digitado direto continua valendo; inexistente devolve null.
    expect(await emailForLogin('outra@example.com')).toBe('outra@example.com');
    expect(await emailForLogin('ninguem-aqui')).toBeNull();
    expect(await emailForLogin('não é@email')).toBeNull();
  });

  it('não deixa duas contas com o mesmo usuário e permite trocar o próprio', async () => {
    const first = newUser();
    const second = newUser();
    const name = `bia${first.slice(0, 8)}`;
    await saveUsername(first, 'bia@example.com', name);
    expect(await usernameAvailable(name)).toBe(false);
    expect(await usernameAvailable(name, first)).toBe(true);
    await expect(
      saveUsername(second, 'outra@example.com', name),
    ).rejects.toThrow('já está em uso');
    const renamed = await saveUsername(first, 'bia@example.com', `${name}x`);
    expect(renamed.username).toBe(`${name}x`);
    expect(await emailForLogin(name)).toBeNull();
  });

  it('após o login, acompanha a troca de e-mail e cria o vínculo reservado no cadastro', async () => {
    const id = newUser();
    const name = `cris${id.slice(0, 8)}`;
    await saveUsername(id, 'antigo@example.com', name);
    await syncLogin({ id, email: 'novo@example.com' });
    expect(await emailForLogin(name)).toBe('novo@example.com');

    const pending = newUser();
    const reserved = `dani${pending.slice(0, 8)}`;
    await syncLogin({
      id: pending,
      email: 'dani@example.com',
      user_metadata: { username: reserved },
    });
    expect(await emailForLogin(reserved)).toBe('dani@example.com');
  });
});
