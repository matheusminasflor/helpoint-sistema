import { describe, expect, it } from 'vitest';
import { quemEhDoArquivo } from './holerite-em-lote';

const pessoas = [
  { id: 'maria', full_name: 'Maria Aparecida Souza', email: 'maria@x.com' },
  { id: 'ana', full_name: 'Ana Paula', email: 'ana@x.com' },
  { id: 'anal', full_name: 'Ana Paula Lima', email: 'al@x.com' },
  { id: 'jose', full_name: 'José Antônio', email: 'jose@x.com' },
  { id: 'jose2', full_name: 'Jose Antonio', email: 'j2@x.com' },
  { id: 'semnome', full_name: null, email: 'carlos.reis@x.com' },
];

describe('holerites em lote: de quem é o arquivo (2026-10-25)', () => {
  it('acha o nome no arquivo sem acento nem caixa', () => {
    expect(quemEhDoArquivo('Holerite 10-2026 - MARIA APARECIDA SOUZA.pdf', pessoas)).toBe('maria');
  });
  it('o nome mais longo ganha', () => {
    expect(quemEhDoArquivo('ana_paula_lima_out.pdf', pessoas)).toBe('anal');
    expect(quemEhDoArquivo('ana paula out.pdf', pessoas)).toBe('ana');
  });
  it('empate ou ninguém: o RH escolhe', () => {
    expect(quemEhDoArquivo('jose antonio.pdf', pessoas)).toBeNull();
    expect(quemEhDoArquivo('holerite.pdf', pessoas)).toBeNull();
  });
  it('sem nome cadastrado, o e-mail antes do @', () => {
    expect(quemEhDoArquivo('carlos.reis-10-2026.pdf', pessoas)).toBe('semnome');
  });
  it('não casa pedaço de palavra', () => {
    expect(quemEhDoArquivo('marianaaparecida souza.pdf', pessoas)).toBeNull();
  });
});
