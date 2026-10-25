// Os campos do formulário do SAC (Qualidade › Configurações › Campos do formulário; defeito 4, 2026-10-24).
export interface CampoDoSAC {
  id: string; field_key: string; label: string; field_type: string;
  placeholder: string | null; help_text: string | null; is_required: boolean; options: unknown;
}
export type RespostasDoSAC = Record<string, string | boolean>;

/** Os obrigatórios sem resposta, pelo rótulo — para a mensagem dizer qual falta. */
export function faltandoNoSAC(campos: CampoDoSAC[], r: RespostasDoSAC): string[] {
  return campos.filter((c) => c.is_required && (r[c.field_key] === undefined || r[c.field_key] === '' || r[c.field_key] === false))
    .map((c) => c.label);
}
