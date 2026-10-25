// Defeito 4 (2026-10-24): o formulário do cliente lê os campos configurados e manda as respostas.
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/telas/sac/PublicForm.tsx';
let s = readFileSync(F, 'utf8');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achei: ' + de.slice(0, 70)); s = s.replace(de, para); };
troca("import { MultiProductWizard, emptyItem, type ProductItem } from '@/components/sac/MultiProductWizard';",
  "import { MultiProductWizard, emptyItem, type ProductItem } from '@/components/sac/MultiProductWizard';\nimport { CamposDoFormulario, faltandoNoSAC, type CampoDoSAC, type RespostasDoSAC } from '@/components/sac/CamposDoFormulario';");
troca("  const [batches, setBatches] = useState<Batch[]>([]);", "  const [batches, setBatches] = useState<Batch[]>([]);\n  const [campos, setCampos] = useState<CampoDoSAC[]>([]);\n  const [respostas, setRespostas] = useState<RespostasDoSAC>({});");
troca(`      const [{ data: cats }, { data: prods }, { data: bts }] = await Promise.all([`, `      const [{ data: cats }, { data: prods }, { data: bts }, { data: cps, error: erroDosCampos }] = await Promise.all([`);
troca(`        supabase.from('sac_product_batches').select('id, product_id, batch_code').eq('is_active', true).eq('tenant_id', customer.tenant_id).order('batch_code'),
      ]);`, `        supabase.from('sac_product_batches').select('id, product_id, batch_code').eq('is_active', true).eq('tenant_id', customer.tenant_id).order('batch_code'),
        // Os campos que a Qualidade configurou (os do sistema já estão fixos abaixo).
        supabase.from('sac_form_fields').select('id, field_key, label, field_type, placeholder, help_text, is_required, options')
          .eq('is_active', true).eq('is_system', false).eq('tenant_id', customer.tenant_id).order('sort_order'),
      ]);
      if (erroDosCampos) toast.error(\`Não carregou os campos do formulário: \${erroDosCampos.message}\`);
      setCampos((cps || []) as CampoDoSAC[]);`);
troca(`    // Validação dos itens`, `    const faltam = faltandoNoSAC(campos, respostas);
    if (faltam.length) {
      toast.error(\`Preencha: \${faltam.join(', ')}.\`);
      return;
    }
    // Validação dos itens`);
troca(`        invoice_attachments: invoiceList,
      }).select('id, ticket_number').single();`, `        invoice_attachments: invoiceList,
        dynamic_fields: respostas,
      }).select('id, ticket_number').single();`);
troca(`            </Section>

            <Button type="submit" disabled={submitting} className="w-full">`, `            </Section>

            {campos.some((c) => c.field_type !== 'attachments') && (
              <Section title="Mais informações">
                <CamposDoFormulario campos={campos} respostas={respostas} onChange={setRespostas} />
              </Section>
            )}

            <Button type="submit" disabled={submitting} className="w-full">`);
writeFileSync(F, s);
console.log('ok');
