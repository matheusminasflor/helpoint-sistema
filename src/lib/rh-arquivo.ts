/**
 * O tamanho máximo de um arquivo do RH (holerite, documento, atestado) — o mesmo limite do balde
 * `rh-documents` no Storage (migration 20261119030000; pedido do dono para o banco não crescer à
 * toa). A tela confere antes de enviar para a pessoa ler o motivo, não um erro do Storage.
 */
export const LIMITE_ARQUIVO_RH_MB = 5;

export function conferirTamanhoDoArquivoRH(file: File): void {
  if (file.size > LIMITE_ARQUIVO_RH_MB * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(1).replace('.', ',');
    throw new Error(`O arquivo tem ${mb} MB; o limite é ${LIMITE_ARQUIVO_RH_MB} MB. Reduza ou comprima o PDF e envie de novo.`);
  }
}
