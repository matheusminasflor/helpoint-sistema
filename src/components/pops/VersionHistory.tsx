import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, Eye, RotateCcw, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePOPVersions, useRestorePOPVersion, POPVersion } from '@/hooks/usePOPVersions';
import { MarkdownPreview } from './MarkdownPreview';

interface VersionHistoryProps {
  popId: string;
  currentTitle?: string;
}

export function VersionHistory({ popId, currentTitle }: VersionHistoryProps) {
  const { data: versions, isLoading } = usePOPVersions(popId);
  const restoreVersion = useRestorePOPVersion();
  
  const [isOpen, setIsOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<POPVersion | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const handleViewVersion = (version: POPVersion) => {
    setSelectedVersion(version);
    setShowPreview(true);
  };

  const handleRestoreClick = (version: POPVersion) => {
    setSelectedVersion(version);
    setShowRestoreConfirm(true);
  };

  const handleConfirmRestore = async () => {
    if (!selectedVersion) return;
    
    await restoreVersion.mutateAsync({
      versionId: selectedVersion.id,
      popId,
    });
    
    setShowRestoreConfirm(false);
    setSelectedVersion(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between gap-2 h-auto py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span>Histórico de Versões</span>
              <Badge variant="secondary" className="ml-1">
                {versions.length}
              </Badge>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border rounded-lg mt-2 divide-y">
            {versions.map((version) => (
              <div
                key={version.id}
                className="p-3 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      v{version.version_number}
                    </Badge>
                    <span className="text-sm truncate">
                      {version.change_summary || 'Sem descrição'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{version.author?.full_name || 'Usuário'}</span>
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(version.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewVersion(version)}
                    className="gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Ver</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestoreClick(version)}
                    className="gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Restaurar</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">v{selectedVersion?.version_number}</Badge>
              {selectedVersion?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedVersion?.change_summary || 'Visualização da versão'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="prose dark:prose-invert max-w-none mt-4">
            {selectedVersion && (
              <MarkdownPreview content={selectedVersion.content} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar a versão {selectedVersion?.version_number}?</DialogTitle>
            <DialogDescription>
              O conteúdo atual será substituído pelo conteúdo desta versão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestoreConfirm(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmRestore}
              disabled={restoreVersion.isPending}
            >
              {restoreVersion.isPending ? 'Restaurando...' : 'Restaurar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
