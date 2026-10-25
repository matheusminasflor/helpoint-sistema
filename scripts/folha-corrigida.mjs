// Defeito 3 (2026-10-24): a Folha marca a linha corrigida à mão e mostra "voltar ao calculado".
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/telas/rh/RHFolha.tsx';
let s = readFileSync(F, 'utf8');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achei: ' + de.slice(0, 70)); s = s.replace(de, para); };
troca("                              if (v !== Number(r[c.key])) update.mutate({ id: r.id, patch: { [c.key]: v } });",
      "                              // A linha corrigida à mão não é mais sobrescrita por \"Gerar folha do mês\" (20270129180000).\n                              if (v !== Number(r[c.key])) update.mutate({ id: r.id, patch: { [c.key]: v, ajustado_a_mao: true } });");
troca(`                        <div className="text-[12px] text-muted-foreground">{r.employee?.department || '—'} · {r.employee?.job_title || '—'}</div>`,
      `                        <div className="text-[12px] text-muted-foreground">{r.employee?.department || '—'} · {r.employee?.job_title || '—'}</div>
                        {r.ajustado_a_mao && (
                          <div className="text-[12px] text-muted-foreground">
                            Corrigida à mão{edita && (<> · <button type="button" className="underline underline-offset-2 hover:text-foreground"
                              onClick={() => update.mutate({ id: r.id, patch: { ajustado_a_mao: false } })}>voltar ao calculado na próxima geração</button></>)}
                          </div>
                        )}`);
troca(`            Edite qualquer célula para ajustar; o líquido e os totais são recalculados ao usar <strong>"Gerar folha do mês"</strong> novamente.`,
      `            Edite qualquer célula para ajustar: o total de descontos e o líquido se recalculam na hora. A linha corrigida fica
            marcada e <strong>"Gerar folha do mês"</strong> não mexe nela; para voltar ao calculado, desmarque e gere de novo.`);
writeFileSync(F, s);
console.log('ok');
