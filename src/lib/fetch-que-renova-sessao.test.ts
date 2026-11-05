import { describe, expect, it, vi } from 'vitest';
import { fetchQueRenovaSessao } from './fetch-que-renova-sessao';

const URL_DO_BANCO = 'https://x.supabase.co/rest/v1/rpc/com_salvar_interacao';
const vencido = () => new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT expired' }), { status: 401 });
const certo = () => new Response('{"ok":true}', { status: 200 });

describe('renovar o login quando o banco recusa por acesso vencido', () => {
  it('renova e repete o pedido com o acesso novo e o mesmo corpo', async () => {
    const base = vi.fn().mockResolvedValueOnce(vencido()).mockResolvedValueOnce(certo());
    const renovar = vi.fn().mockResolvedValue('novo');
    const r = await fetchQueRenovaSessao(renovar, base)(URL_DO_BANCO, {
      method: 'POST', body: '{"a":1}', headers: { Authorization: 'Bearer velho', apikey: 'k' },
    });
    expect(r.status).toBe(200);
    expect(renovar).toHaveBeenCalledTimes(1);
    const [, init] = base.mock.calls[1];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer novo');
    expect(new Headers(init.headers).get('apikey')).toBe('k');
    expect(init.body).toBe('{"a":1}');
  });

  it('vários pedidos ao mesmo tempo usam uma renovação só', async () => {
    const base = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) =>
      (new Headers(init?.headers).get('Authorization') === 'Bearer novo' ? certo() : vencido()));
    const renovar = vi.fn().mockResolvedValue('novo');
    const pedir = fetchQueRenovaSessao(renovar, base as typeof fetch);
    const respostas = await Promise.all([pedir(URL_DO_BANCO), pedir(URL_DO_BANCO), pedir(URL_DO_BANCO)]);
    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(renovar).toHaveBeenCalledTimes(1);
  });

  it('sem conseguir renovar, devolve a recusa e não entra em repetição', async () => {
    const base = vi.fn().mockImplementation(async () => vencido());
    const r = await fetchQueRenovaSessao(vi.fn().mockRejectedValue(new Error('offline')), base)(URL_DO_BANCO);
    expect(r.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('repete uma vez só', async () => {
    const base = vi.fn().mockImplementation(async () => vencido());
    const r = await fetchQueRenovaSessao(vi.fn().mockResolvedValue('novo'), base)(URL_DO_BANCO);
    expect(r.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('não mexe em outra recusa nem no próprio login', async () => {
    const renovar = vi.fn();
    const semPermissao = vi.fn().mockResolvedValue(new Response('{"message":"permission denied"}', { status: 401 }));
    await fetchQueRenovaSessao(renovar, semPermissao)(URL_DO_BANCO);
    const login = vi.fn().mockImplementation(async () => vencido());
    await fetchQueRenovaSessao(renovar, login)('https://x.supabase.co/auth/v1/token?grant_type=refresh_token');
    expect(renovar).not.toHaveBeenCalled();
  });
});
