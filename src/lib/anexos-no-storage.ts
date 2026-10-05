// Anexos em balde privado — o mesmo caminho para Diretrizes e Jornal (revisão de 2026-10-05: os dois
// hooks tinham cópias quase iguais, e um conserto num precisava ser repetido no outro).
import type { PostgrestError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, mensagemDeErro } from '@/lib/supabase-result';

/** Nome de arquivo sem acento nem caractere que o armazenamento recusa. */
export const limparNomeDeArquivo = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

/**
 * Sobe o arquivo para `<pasta>/<uuid>-<nome>` e registra a linha do anexo; se o registro falhar (ou a
 * policy não deixar — zero linhas), o arquivo sai do balde e o erro sobe com nome.
 */
export async function enviarAnexo(
  balde: string,
  pasta: string,
  arquivo: File,
  registrar: (caminho: string) => PromiseLike<{ data: { id: string }[] | null; error: PostgrestError | null }>,
) {
  const caminho = `${pasta}/${crypto.randomUUID()}-${limparNomeDeArquivo(arquivo.name)}`;
  const { error: erroUpload } = await supabase.storage.from(balde).upload(caminho, arquivo);
  if (erroUpload) throw erroUpload;
  const resultado = await registrar(caminho);
  if (resultado.error || !resultado.data?.length) {
    await tirarDoBalde(balde, [caminho]);
    expectRows(resultado, 'anexar o arquivo');
  }
}

/**
 * Apaga arquivos do balde depois que a linha do banco já saiu. Falhar aqui não desfaz nada para a
 * pessoa — o arquivo fica órfão —, então avisa no console em vez de derrubar a ação que já valeu.
 */
export async function tirarDoBalde(balde: string, caminhos: string[]) {
  if (caminhos.length === 0) return;
  const { error } = await supabase.storage.from(balde).remove(caminhos);
  if (error) console.error(`Arquivo ficou no balde ${balde}:`, caminhos, error);
}

/** Abre o anexo numa aba nova, por link de 10 minutos (o balde é privado). */
export async function abrirAnexoDoBalde(balde: string, caminho: string) {
  const { data, error } = await supabase.storage.from(balde).createSignedUrl(caminho, 600);
  if (error) {
    toast.error(`Não foi possível abrir o anexo: ${mensagemDeErro(error)}`);
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}
