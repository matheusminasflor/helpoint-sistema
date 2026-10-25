// Defeito 4 (2026-10-24): o detalhe do SAC mostra as respostas dos campos configurados; a data da compra no dia local.
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/telas/qualidade/SACManagement.tsx';
let s = readFileSync(F, 'utf8');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achei: ' + de.slice(0, 70)); s = s.replace(de, para); };
troca("  const [files, setFiles] = useState<File[]>([]);\n", "  const [files, setFiles] = useState<File[]>([]);\n  const [camposDoForm, setCamposDoForm] = useState<{ field_key: string; label: string }[]>([]);\n");
troca("    setTicket(t);\n", "    setTicket(t);\n    if (t?.tenant_id) {\n      const { data: cps, error: cpErr } = await supabase.from('sac_form_fields').select('field_key, label').eq('tenant_id', t.tenant_id);\n      if (cpErr) console.error(cpErr); else setCamposDoForm(cps ?? []);\n    }\n");
troca("                {ticket.purchase_date && <p>Compra: {new Date(ticket.purchase_date).toLocaleDateString('pt-BR')}</p>}",
      "                {ticket.purchase_date && <p>Compra: {parseISO(ticket.purchase_date).toLocaleDateString('pt-BR')}</p>}");
troca(`            )}
          </Card>


          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Status</h3>`, `            )}
          </Card>

          {ticket.dynamic_fields && Object.keys(ticket.dynamic_fields).length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3">Respostas do formulário</h3>
              <RespostasDoFormulario respostas={ticket.dynamic_fields} campos={camposDoForm} />
            </Card>
          )}

          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Status</h3>`);
if (!/from 'date-fns'/.test(s)) s = s.replace(/^(import .*\n)/, `$1import { parseISO } from 'date-fns';\n`);
else if (!/parseISO/.test(s.split('\n').find((l) => l.includes("from 'date-fns'")) ?? '')) s = s.replace(/import \{([^}]*)\} from 'date-fns';/, (m, g) => `import {${g}, parseISO } from 'date-fns';`);
s = s.replace(/^(import .*\n)/, `$1import { RespostasDoFormulario } from '@/components/sac/CamposDoFormulario';\n`);
writeFileSync(F, s);
console.log('ok');
