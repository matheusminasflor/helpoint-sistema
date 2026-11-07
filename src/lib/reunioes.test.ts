import { describe, expect, it } from 'vitest';
import { falasCom, lerCsv, mediaDeMinutos, minutosEntre, nomesDaEquipe, secaoDaPauta } from './reunioes';

const pauta = 'Registros da reunião\n\nResumo\nFoco na expansão.\n\nDecisões\nAlinhada\n\nPróximas etapas\n* [Ana] Enviar\n\nDetalhes\nTexto longo.';

describe('seções do Gemini', () => {
  it('devolve o texto da seção como veio, até a próxima', () => {
    expect(secaoDaPauta(pauta, 'Resumo')).toBe('Foco na expansão.');
    expect(secaoDaPauta(pauta, 'Próximas etapas')).toBe('* [Ana] Enviar');
    expect(secaoDaPauta(pauta, 'Detalhes')).toBe('Texto longo.');
  });

  it('seção que não existe vem nula', () => {
    expect(secaoDaPauta('Só um texto', 'Decisões')).toBeNull();
  });
});

describe('tempo da reunião', () => {
  it('calcula os minutos e a média só de quem tem fim', () => {
    expect(minutosEntre('2026-11-06T18:00:00Z', '2026-11-06T19:00:00Z')).toBe(60);
    expect(minutosEntre('2026-11-06T18:00:00Z', null)).toBeNull();
    expect(mediaDeMinutos([
      { inicio: '2026-11-06T18:00:00Z', fim: '2026-11-06T19:00:00Z' },
      { inicio: '2026-11-13T18:00:00Z', fim: '2026-11-13T18:30:00Z' },
      { inicio: '2026-11-20T18:00:00Z', fim: null },
    ])).toBe(45);
  });
});

describe('busca na transcrição', () => {
  const t = '00:01:16\nMarcus Carvalho: Querem que eu compartilhe então?\nMairon Sena: Planejamento';
  it('ignora acento e maiúscula', () => {
    expect(falasCom(t, 'ENTAO')).toEqual(['Marcus Carvalho: Querem que eu compartilhe então?']);
  });
  it('sem termo, mostra tudo', () => {
    expect(falasCom(t, ' ')).toHaveLength(3);
  });
});

describe('lista de presença do Google', () => {
  it('respeita aspas e vírgulas', () => {
    expect(lerCsv('Nome,Tempo\n"Silva, Ana",59 min\r\n\nBia,48 min\n')).toEqual([
      ['Nome', 'Tempo'], ['Silva, Ana', '59 min'], ['Bia', '48 min'],
    ]);
  });
});

describe('nomes do Google sem pessoa', () => {
  it('mostra quem pode ser da equipe e tira o cliente do treinamento', () => {
    expect(nomesDaEquipe(['Silvana Melo', 'Regina Falabella', 'marcus'], ['Silvana Moraes', 'Marcus Carvalho'])).toEqual(['Silvana Melo', 'marcus']);
  });
});
