import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Link as LinkIcon, 
  Image, 
  Minus,
  Loader2,
  Quote,
  Code,
  AlertTriangle,
  Lightbulb
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onImageUpload?: (file: File) => Promise<string>;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder, 
  onImageUpload,
  className,
  minHeight = "300px"
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const insertAtCursor = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    
    const newValue = value.substring(0, start) + before + selected + after + value.substring(end);
    onChange(newValue);
    
    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      const newPos = start + before.length + selected.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    
    // Reset input
    e.target.value = '';
    
    setIsUploading(true);
    try {
      const url = await onImageUpload(file);
      insertAtCursor(`\n![${file.name}](${url})\n`);
      toast.success('Imagem adicionada');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Erro ao fazer upload da imagem. Tente novamente ou avise o suporte.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn("border rounded-lg overflow-hidden bg-background", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-2 border-b bg-muted/30 flex-wrap">
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('**', '**')}
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('*', '*')}
          title="Itálico (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n## ')}
          title="Título 2"
          className="font-semibold"
        >
          H2
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n### ')}
          title="Título 3"
          className="font-semibold"
        >
          H3
        </Button>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n- ')}
          title="Lista com marcadores"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n1. ')}
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('[', '](url)')}
          title="Inserir link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        
        <label>
          <Button 
            type="button"
            variant="ghost" 
            size="sm" 
            asChild
            disabled={isUploading}
            title="Inserir imagem"
          >
            <span className="cursor-pointer">
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Image className="h-4 w-4" />
              )}
            </span>
          </Button>
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleImageUpload}
            disabled={isUploading}
          />
        </label>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n> ')}
          title="Citação"
        >
          <Quote className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n```\n', '\n```')}
          title="Bloco de código"
        >
          <Code className="h-4 w-4" />
        </Button>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n💡 **Dica:** ')}
          title="Dica"
          className="text-blue-600"
        >
          <Lightbulb className="h-4 w-4" />
        </Button>
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n⚠️ **Atenção:** ')}
          title="Atenção"
          className="text-amber-600"
        >
          <AlertTriangle className="h-4 w-4" />
        </Button>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          onClick={() => insertAtCursor('\n---\n')}
          title="Linha divisória"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>

      {/* Textarea */}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "border-0 rounded-none resize-y focus-visible:ring-0 font-mono text-sm",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}
