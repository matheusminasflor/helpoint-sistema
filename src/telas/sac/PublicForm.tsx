import { sanitizeFileName } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { InvoiceUploader } from '@/components/sac/InvoiceUploader';
import { ImproveTextButton } from '@/components/ai/ImproveTextButton';
import { MultiProductWizard, emptyItem, type ProductItem } from '@/components/sac/MultiProductWizard';

interface Category { id: string; name: string; color: string }
interface Product { id: string; name: string; image_url?: string | null }
interface Batch { id: string; product_id: string; batch_code: string }

export default function SACPublicForm() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const tenant = search.get('tenant');
  const { user, isCustomer, customerProfile, isLoading: authLoading, refreshProfile } = useAuth();
  const customer = customerProfile;
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ protocol: string } | null>(null);
  const [items, setItems] = useState<ProductItem[]>([emptyItem()]);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    purchase_date: '', order_number: '',
    category_id: '', description: '',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(tenant ? `/sac/acesso?tenant=${tenant}` : '/sac/acesso');
      return;
    }
    if (isCustomer && customer) return;
    // Safety net: AuthContext pode estar dessincronizado logo após verifyOtp.
    // Tenta revalidar; se ainda não houver perfil, faz logout em vez de
    // empurrar para /sac/cadastro (cliente já está logado).
    (async () => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) { toast.error(error.message); return; }
      if (data) {
        await refreshProfile();
      } else {
        await supabase.auth.signOut();
        navigate(tenant ? `/sac/acesso?tenant=${tenant}` : '/sac/acesso');
      }
    })();
  }, [authLoading, user, isCustomer, customer, navigate, tenant, refreshProfile]);

  useEffect(() => {
    if (!customer?.tenant_id) return;
    (async () => {
      const [{ data: cats }, { data: prods }, { data: bts }] = await Promise.all([
        supabase.from('sac_categories').select('id, name, color').eq('is_active', true).eq('tenant_id', customer.tenant_id).order('sort_order'),
        supabase.from('sac_products').select('id, name, image_url').eq('is_active', true).eq('tenant_id', customer.tenant_id).order('name'),
        supabase.from('sac_product_batches').select('id, product_id, batch_code').eq('is_active', true).eq('tenant_id', customer.tenant_id).order('batch_code'),
      ]);
      setCategories(cats || []);
      setProducts(prods || []);
      setBatches(bts || []);
    })();
  }, [customer?.tenant_id]);

  const update = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.category_id || !customer || !user) {
      toast.error('Preencha o tipo de solicitação e a descrição geral.');
      return;
    }
    // Validação dos itens
    const valid = items.filter(it => it.product_id || it.product_name || it.description);
    if (!valid.length) {
      toast.error('Adicione pelo menos um produto.');
      return;
    }
    for (const [i, it] of valid.entries()) {
      const hasProduct = it.product_id && it.product_id !== '__other__';
      if (!hasProduct && !it.product_name) {
        toast.error(`Produto ${i + 1}: selecione ou descreva o produto.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // NF
      const invoiceList: any[] = [];
      for (const file of invoiceFiles) {
        const path = `${customer.tenant_id}/customer/${user.id}/invoices/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from('sac-attachments').upload(path, file);
        if (!upErr) {
          invoiceList.push({ file_name: file.name, file_path: path, file_size: file.size, mime_type: file.type });
        } else {
          toast.error(`Falha ao enviar nota fiscal "${file.name}".`);
        }
      }

      const head = valid[0];
      const headProductName = head.product_id && head.product_id !== '__other__'
        ? (products.find(p => p.id === head.product_id)?.name || null)
        : (head.product_name || null);

      const subject = valid.length > 1
        ? `${headProductName || 'Solicitação'} + ${valid.length - 1} produto(s)`
        : (headProductName || 'Solicitação SAC');

      const { data: ticket, error } = await supabase.from('sac_tickets').insert({
        tenant_id: customer.tenant_id,
        customer_user_id: user.id,
        customer_email: customer.email,
        customer_name: customer.full_name,
        customer_document: customer.cnpj || customer.document,
        customer_phone: customer.phone,
        product_id: head.product_id && head.product_id !== '__other__' ? head.product_id : null,
        product_batch_id: head.product_batch_id || null,
        product_name: headProductName,
        product_batch: head.product_batch || null,
        quantity: head.quantity ? Number(head.quantity) : null,
        purchase_date: form.purchase_date || null,
        order_number: form.order_number || null,
        category_id: form.category_id,
        description: form.description,
        subject,
        invoice_attachments: invoiceList,
      }).select('id, ticket_number').single();
      if (error) throw error;

      // Itens (todos, inclusive o primeiro) — fonte de verdade do multi-produto
      for (const [idx, it] of valid.entries()) {
        const productName = it.product_id && it.product_id !== '__other__'
          ? (products.find(p => p.id === it.product_id)?.name || it.product_name)
          : it.product_name;

        const uploaded: any[] = [];
        for (const f of it.files) {
          const path = `${customer.tenant_id}/customer/${user.id}/${ticket.id}/p${idx + 1}-${Date.now()}-${sanitizeFileName(f.name)}`;
          const { error: upErr } = await supabase.storage.from('sac-attachments').upload(path, f);
          if (!upErr) {
            uploaded.push({ file_name: f.name, file_path: path, mime_type: f.type, file_size: f.size });
            // grava também na tabela legada de anexos do ticket
            await supabase.from('sac_ticket_attachments').insert({
              tenant_id: customer.tenant_id,
              ticket_id: ticket.id,
              uploaded_by: user.id,
              file_name: f.name,
              file_path: path,
              file_size: f.size,
              mime_type: f.type,
            });
          }
        }

        await supabase.from('sac_ticket_products').insert({
          tenant_id: customer.tenant_id,
          ticket_id: ticket.id,
          product_id: it.product_id && it.product_id !== '__other__' ? it.product_id : null,
          product_batch_id: it.product_batch_id || null,
          product_name: productName,
          product_batch: it.product_batch || null,
          quantity: it.quantity ? Number(it.quantity) : null,
          description: it.description || null,
          attachments: uploaded,
          sort_order: idx,
        });
      }

      setSuccess({ protocol: `SAC-${String(ticket.ticket_number).padStart(5, '0')}` });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-1 p-6">
        <Card className="max-w-lg w-full p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Recebemos sua solicitação!</h1>
          <p className="text-muted-foreground mb-2">Seu protocolo é:</p>
          <p className="text-3xl font-bold text-primary mb-6">{success.protocol}</p>
          <p className="text-sm text-muted-foreground mb-6">
            Acompanhe e responda diretamente na sua área de cliente. Você receberá um aviso por e-mail quando houver resposta — mas a resposta completa fica aqui no painel.
          </p>
          <Button onClick={() => navigate('/sac/meus-chamados')} className="w-full">Acessar meus chamados</Button>
        </Card>
      </div>
    );
  }

  if (!customer) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-surface-1 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-3xl font-bold">Nova Solicitação</h1>
          <p className="text-muted-foreground mt-1 text-sm">Olá, {customer.full_name}. Conte-nos o que aconteceu.</p>
        </header>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-5">

            <Section title="Produtos envolvidos">
              <p className="text-xs text-muted-foreground -mt-1">
                Pode adicionar quantos produtos quiser. Cada um terá sua própria descrição e fotos.
              </p>
              <MultiProductWizard
                items={items}
                onChange={setItems}
                products={products}
                batches={batches}
                tenantSlug={tenant}
              />

            </Section>

            <Section title="Sobre a compra">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data da compra"><Input type="date" value={form.purchase_date} onChange={e => update('purchase_date', e.target.value)} /></Field>
                <Field label="Nº pedido"><Input value={form.order_number} onChange={e => update('order_number', e.target.value)} /></Field>
              </div>
              <Field label="Nota fiscal de compra (opcional, recomendado)">
                <InvoiceUploader files={invoiceFiles} onChange={setInvoiceFiles} max={5} maxSizeMB={5} />
              </Field>
            </Section>

            <Section title="Sua solicitação">
              <Field label="Tipo de solicitação *">
                <select value={form.category_id} onChange={e => update('category_id', e.target.value)} required className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-[13px]">
                  <option value="">Selecione...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Resumo geral da solicitação *">
                <div className="flex items-center justify-end mb-1">
                  <ImproveTextButton
                    text={form.description}
                    onApply={(t) => update('description', t)}
                    tone="claro, educado e objetivo, mantendo todos os fatos do cliente"
                    tenantSlug={tenant}
                  />

                </div>
                <Textarea
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  rows={4}
                  placeholder="Descreva o contexto geral do seu pedido (motivo da abertura, o que espera como resolução, etc.)"
                  required
                />
              </Field>
            </Section>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : 'Enviar solicitação'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3"><h3 className="font-semibold text-sm border-b pb-2">{title}</h3>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs mb-1 block">{label}</Label>{children}</div>;
}
