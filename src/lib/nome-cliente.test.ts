import { describe, it, expect } from 'vitest';
import { limparNomeCliente } from './nome-cliente';

describe('limparNomeCliente', () => {
  it('corta CPF colado sem pontuação (o caso real do banco de teste)', () => {
    expect(limparNomeCliente('MARIA DA SILVA 12345678901')).toBe('MARIA DA SILVA');
  });

  it('corta CNPJ formatado', () => {
    expect(limparNomeCliente('COMERCIAL EXEMPLO LTDA 12.345.678/0001-99')).toBe('COMERCIAL EXEMPLO LTDA');
  });

  it('não corta nome que termina em número que não é documento', () => {
    expect(limparNomeCliente('COMERCIAL 2000')).toBe('COMERCIAL 2000');
    expect(limparNomeCliente('LOJA 24 HORAS')).toBe('LOJA 24 HORAS');
  });

  it('devolve o nome original quando o que sobraria é vazio', () => {
    expect(limparNomeCliente('12345678901')).toBe('12345678901');
  });

  it('não altera nome sem dígito nenhum', () => {
    expect(limparNomeCliente('JOAO DE SOUZA')).toBe('JOAO DE SOUZA');
  });
});
