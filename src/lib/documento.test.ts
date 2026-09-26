import { describe, it, expect } from 'vitest';
import { soDigitos, documentoTemForma, formatarDocumento, rotuloDoDocumento } from './documento';

describe('documento (CNPJ/CPF)', () => {
  it('guarda só dígitos — é o que faz o vínculo com o SAC funcionar', () => {
    // O caso real: o SAC grava `08319138000160`, sem pontuação.
    expect(soDigitos('08.319.138/0001-60')).toBe('08319138000160');
    expect(soDigitos('  08319138000160 ')).toBe('08319138000160');
    expect(soDigitos('123.456.789-09')).toBe('12345678909');
    expect(soDigitos(null)).toBe('');
    expect(soDigitos(undefined)).toBe('');
  });

  it('aceita a forma de CPF e de CNPJ, e recusa o resto', () => {
    expect(documentoTemForma('08.319.138/0001-60')).toBe(true);
    expect(documentoTemForma('123.456.789-09')).toBe(true);
    expect(documentoTemForma('123')).toBe(false);
    expect(documentoTemForma('083191380001601')).toBe(false); // 15 dígitos
    expect(documentoTemForma('')).toBe(false);
    expect(documentoTemForma(null)).toBe(false);
  });

  it('mostra pontuado, e não inventa pontuação em número incompleto', () => {
    expect(formatarDocumento('08319138000160')).toBe('08.319.138/0001-60');
    expect(formatarDocumento('12345678909')).toBe('123.456.789-09');
    // Ainda digitando: devolve os dígitos, para a pessoa ver o que escreveu.
    expect(formatarDocumento('0831913')).toBe('0831913');
    expect(formatarDocumento(null)).toBe('');
  });

  it('diz qual dos dois é, pelo tamanho', () => {
    expect(rotuloDoDocumento('08319138000160')).toBe('CNPJ');
    expect(rotuloDoDocumento('12345678909')).toBe('CPF');
    expect(rotuloDoDocumento('123')).toBe('Documento');
    expect(rotuloDoDocumento(null)).toBe('Documento');
  });

  it('a ida e a volta não perdem nada', () => {
    const doDono = '08.319.138/0001-60';
    expect(formatarDocumento(soDigitos(doDono))).toBe(doDono);
  });
});
