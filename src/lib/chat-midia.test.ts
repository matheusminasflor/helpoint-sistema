import { describe, expect, it } from 'vitest';
import { caminhoDoAnexo, tipoDoAnexo } from './chat-midia';

describe('anexos do chat', () => {
  it('o caminho começa por empresa e canal (é o que a policy do bucket lê) e limpa o nome', () => {
    expect(caminhoDoAnexo('t1', 'c1', 'Relatório de março (final).pdf', 'abc'))
      .toBe('t1/c1/abc-Relatorio_de_marco__final_.pdf');
  });

  it('o nome não cria pasta nova', () => {
    expect(caminhoDoAnexo('t1', 'c1', '../../outra/x.png', 'abc').split('/')).toHaveLength(3);
  });

  it('foto, áudio e o resto', () => {
    expect(tipoDoAnexo('image/jpeg')).toBe('foto');
    expect(tipoDoAnexo('audio/webm')).toBe('audio');
    expect(tipoDoAnexo('application/pdf')).toBe('arquivo');
    expect(tipoDoAnexo(null)).toBe('arquivo');
  });
});
