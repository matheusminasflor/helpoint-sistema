import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileText } from "lucide-react";
import { generatePDFReport, PDFReportData } from "@/components/dashboard/PDFReportGenerator";

interface SectionDef {
  id: string;
  label: string;
  description: string;
  locked?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'cover', label: 'Capa', description: 'Página de capa com título e período', locked: true },
  { id: 'executive_summary', label: 'Resumo', description: 'A frase de resumo e os números de chamado com meta, anterior e status' },
  // Rodada 2 da TI (2026-11-02): o PDF leva tudo o que a Visão Geral mostra. O "Comparativo" saiu: o anterior já está
  // ao lado de cada número no Resumo.
  { id: 'team', label: 'Equipe (FSENSE) e interrupções', description: 'Produtividade da equipe e de cada pessoa, com meta e status' },
  { id: 'projects', label: 'Projetos da TI', description: 'Em andamento e pendentes, com o término e o que passou dele' },
  { id: 'category', label: 'Chamados por categoria', description: 'Categorias e subcategorias, como na Visão Geral' },
  { id: 'trends', label: 'Abertos × resolvidos por dia', description: 'Os últimos 14 dias do período' },
  { id: 'priority', label: 'Por prioridade', description: 'Chamados agrupados por prioridade' },
  { id: 'assets', label: 'Ativos e contratos', description: 'Equipamentos, licenças, contratos e manutenções' },
];

type SectionId = string;

interface ExportPDFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportData: Omit<PDFReportData, 'selectedSections'>;
}

export function ExportPDFDialog({ open, onOpenChange, reportData }: ExportPDFDialogProps) {
  const [selected, setSelected] = useState<Set<SectionId>>(
    new Set(SECTIONS.map(s => s.id))
  );
  const [isExporting, setIsExporting] = useState(false);

  const toggleSection = (id: SectionId) => {
    const section = SECTIONS.find(s => s.id === id);
    if (section?.locked) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableCount = SECTIONS.filter(s => !s.locked).length;
  const selectedCount = [...selected].filter(id => !SECTIONS.find(s => s.id === id)?.locked).length;
  const allSelected = selectedCount === selectableCount;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set(SECTIONS.filter(s => s.locked).map(s => s.id)));
    } else {
      setSelected(new Set(SECTIONS.map(s => s.id)));
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      generatePDFReport({ ...reportData, selectedSections: [...selected] });
      onOpenChange(false);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Exportar Relatório PDF
          </DialogTitle>
          <DialogDescription>
            Selecione as seções que deseja incluir no relatório.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground">Seções do relatório</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={toggleAll}>
              {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </Button>
          </div>

          <div className="space-y-0.5 max-h-[320px] overflow-y-auto py-1">
            {SECTIONS.map(section => (
              <label
                key={section.id}
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selected.has(section.id)}
                  onCheckedChange={() => toggleSection(section.id)}
                  disabled={section.locked}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight">
                    {section.label}
                    {section.locked && <span className="text-xs text-muted-foreground ml-1.5">(obrigatório)</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleExport} disabled={isExporting || selected.size === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {isExporting ? 'Gerando…' : 'Exportar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
