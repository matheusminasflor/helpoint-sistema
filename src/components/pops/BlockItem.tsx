import { useState } from 'react';
import { 
  Type, 
  Heading1, 
  Code, 
  ListOrdered, 
  Lightbulb, 
  AlertTriangle, 
  XCircle, 
  CheckCircle2, 
  Image, 
  Video,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Trash2,
  Upload,
  Quote,
  Minus,
  List,
  Plus
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POPBlock, POPBlockType } from '@/types/pop-blocks';
import { cn } from '@/lib/utils';
import { MediaUploader } from './MediaUploader';
import { VideoToGifConverter } from './VideoToGifConverter';

interface BlockItemProps {
  block: POPBlock;
  index: number;
  stepNumber?: number;
  onUpdate: (updates: Partial<POPBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const BLOCK_CONFIG: Record<POPBlockType, { icon: React.ElementType; label: string }> = {
  text: { icon: Type, label: 'Texto' },
  heading: { icon: Heading1, label: 'Título' },
  step: { icon: ListOrdered, label: 'Instrução' },
  tip: { icon: Lightbulb, label: 'Dica' },
  alert: { icon: AlertTriangle, label: 'Atenção' },
  error: { icon: XCircle, label: 'Importante' },
  success: { icon: CheckCircle2, label: 'Pronto' },
  image: { icon: Image, label: 'Imagem' },
  video: { icon: Video, label: 'Vídeo' },
  code: { icon: Code, label: 'Código' },
  quote: { icon: Quote, label: 'Citação' },
  divider: { icon: Minus, label: 'Divisor' },
  list: { icon: List, label: 'Lista' },
};

export function BlockItem({ 
  block, 
  index, 
  stepNumber,
  onUpdate, 
  onRemove, 
  onMoveUp, 
  onMoveDown, 
  isFirst, 
  isLast,
  dragHandleProps 
}: BlockItemProps) {
  const [showMediaUploader, setShowMediaUploader] = useState(false);
  const [showVideoConverter, setShowVideoConverter] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const config = BLOCK_CONFIG[block.type];
  const Icon = config.icon;

  const handleMediaUpload = (media: { file_url: string; file_type: string }) => {
    if (block.type === 'image') {
      onUpdate({ imageUrl: media.file_url });
    } else if (block.type === 'video') {
      onUpdate({ videoUrl: media.file_url });
    }
    setShowMediaUploader(false);
  };

  const handleGifCreated = (gifUrl: string) => {
    onUpdate({ imageUrl: gifUrl, type: 'image' });
    setShowVideoConverter(false);
  };

  const handleAddListItem = () => {
    const currentItems = block.listItems || [];
    onUpdate({ listItems: [...currentItems, ''] });
  };

  const handleUpdateListItem = (itemIndex: number, value: string) => {
    const currentItems = [...(block.listItems || [])];
    currentItems[itemIndex] = value;
    onUpdate({ listItems: currentItems });
  };

  const handleRemoveListItem = (itemIndex: number) => {
    const currentItems = [...(block.listItems || [])];
    currentItems.splice(itemIndex, 1);
    onUpdate({ listItems: currentItems });
  };

  const renderContent = () => {
    switch (block.type) {
      case 'heading':
        return (
          <div className="flex items-center gap-2">
            <Select 
              value={String(block.level || 2)} 
              onValueChange={(v) => onUpdate({ level: Number(v) as 1 | 2 | 3 })}
            >
              <SelectTrigger className="w-16 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">H1</SelectItem>
                <SelectItem value="2">H2</SelectItem>
                <SelectItem value="3">H3</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={block.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder="Título da seção..."
              className="flex-1 font-semibold border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </div>
        );

      case 'step':
      case 'text':
      case 'tip':
      case 'alert':
      case 'error':
      case 'success':
        const placeholders: Record<string, string> = {
          step: 'Descreva a instrução...',
          text: 'Escreva o parágrafo...',
          tip: 'Dica: ...',
          alert: 'Atenção: ...',
          error: 'Importante: ...',
          success: 'Pronto! ...'
        };
        return (
          <Textarea
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder={placeholders[block.type]}
            className="min-h-[60px] resize-none border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        );

      case 'image':
        return (
          <div className="space-y-2">
            {block.imageUrl ? (
              <div className="relative group">
                <img 
                  src={block.imageUrl} 
                  alt={block.caption || 'Imagem'} 
                  className="rounded-lg max-h-40 object-contain"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
                  onClick={() => setShowMediaUploader(true)}
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowMediaUploader(true)}
                className="w-full h-24 border border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Clique para upload</span>
              </button>
            )}
            <Input
              value={block.caption || ''}
              onChange={(e) => onUpdate({ caption: e.target.value })}
              placeholder="Legenda (opcional)"
              className="text-xs border-0 bg-transparent px-0 focus-visible:ring-0"
            />
            {showMediaUploader && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                <MediaUploader
                  onUpload={(media) => handleMediaUpload({ file_url: media.file_url, file_type: media.file_type })}
                  accept="image/*"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowMediaUploader(false)} className="mt-2 w-full text-xs">
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="space-y-2">
            {block.videoUrl ? (
              <div className="relative group">
                <video 
                  src={block.videoUrl} 
                  controls 
                  className="rounded-lg max-h-40"
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="secondary" onClick={() => setShowVideoConverter(true)} className="text-xs h-7">
                    GIF
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowMediaUploader(true)} className="text-xs h-7">
                    Trocar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowMediaUploader(true)}
                className="w-full h-24 border border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <Video className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Clique para upload</span>
              </button>
            )}
            <Input
              value={block.caption || ''}
              onChange={(e) => onUpdate({ caption: e.target.value })}
              placeholder="Legenda (opcional)"
              className="text-xs border-0 bg-transparent px-0 focus-visible:ring-0"
            />
            {showMediaUploader && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                <MediaUploader
                  onUpload={(media) => handleMediaUpload({ file_url: media.file_url, file_type: media.file_type })}
                  accept="video/mp4,video/webm"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowMediaUploader(false)} className="mt-2 w-full text-xs">
                  Cancelar
                </Button>
              </div>
            )}
            {showVideoConverter && block.videoUrl && (
              <VideoToGifConverter
                open={showVideoConverter}
                onOpenChange={setShowVideoConverter}
                videoUrl={block.videoUrl}
                onGifCreated={handleGifCreated}
              />
            )}
          </div>
        );

      case 'code':
        return (
          <Textarea
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder="// Cole seu código aqui..."
            className="font-mono text-sm min-h-[80px] resize-none bg-muted/30 rounded-lg"
          />
        );

      case 'quote':
        return (
          <div className="space-y-2 pl-3 border-l-2 border-primary/30">
            <Textarea
              value={block.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder="Digite a citação..."
              className="min-h-[50px] resize-none italic border-0 bg-transparent px-0 focus-visible:ring-0"
            />
            <Input
              value={block.author || ''}
              onChange={(e) => onUpdate({ author: e.target.value })}
              placeholder="— Autor (opcional)"
              className="text-xs border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </div>
        );

      case 'divider':
        return (
          <div className="py-2">
            <hr className="border-t border-muted-foreground/30" />
          </div>
        );

      case 'list':
        return (
          <div className="space-y-1">
            {(block.listItems || []).map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-muted-foreground">•</span>
                <Input
                  value={item}
                  onChange={(e) => handleUpdateListItem(i, e.target.value)}
                  placeholder={`Item ${i + 1}`}
                  className="flex-1 border-0 bg-transparent px-0 focus-visible:ring-0 h-8"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveListItem(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddListItem}
              className="gap-1 text-xs text-muted-foreground h-7"
            >
              <Plus className="h-3 w-3" />
              Adicionar item
            </Button>
          </div>
        );

      default:
        return (
          <Textarea
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder="Escreva o conteúdo..."
            className="min-h-[60px] resize-none border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        );
    }
  };

  return (
    <div 
      className={cn(
        "relative rounded-lg border border-transparent transition-all",
        isHovered && "border-border bg-muted/30"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Minimal header - only visible on hover */}
      <div className={cn(
        "flex items-center justify-between px-2 py-1 transition-opacity",
        isHovered ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex items-center gap-1">
          <div {...dragHandleProps} className="cursor-grab touch-none p-1">
            <GripVertical className="h-3 w-3 text-muted-foreground/50" />
          </div>
          <Icon className="h-3 w-3 text-muted-foreground/70" />
          <span className="text-xs text-muted-foreground/70">{config.label}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-2 pb-2">
        {renderContent()}
      </div>
    </div>
  );
}
