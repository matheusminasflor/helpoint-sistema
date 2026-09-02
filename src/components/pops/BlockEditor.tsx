import { useState } from 'react';
import { POPBlock, POPBlockType, generateBlockId } from '@/types/pop-blocks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MediaUploader } from './MediaUploader';
import { VideoToGifConverter } from './VideoToGifConverter';
import { 
  Type, 
  Heading1, 
  ListOrdered, 
  AlertTriangle, 
  Lightbulb, 
  XCircle, 
  CheckCircle2, 
  Image, 
  Video, 
  Code,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Film
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlockEditorProps {
  blocks: POPBlock[];
  onChange: (blocks: POPBlock[]) => void;
}

const BLOCK_TYPES: { type: POPBlockType; icon: React.ReactNode; label: string }[] = [
  { type: 'text', icon: <Type className="h-4 w-4" />, label: 'Texto' },
  { type: 'heading', icon: <Heading1 className="h-4 w-4" />, label: 'Título' },
  { type: 'step', icon: <ListOrdered className="h-4 w-4" />, label: 'Passo' },
  { type: 'tip', icon: <Lightbulb className="h-4 w-4" />, label: 'Dica' },
  { type: 'alert', icon: <AlertTriangle className="h-4 w-4" />, label: 'Alerta' },
  { type: 'error', icon: <XCircle className="h-4 w-4" />, label: 'Erro' },
  { type: 'success', icon: <CheckCircle2 className="h-4 w-4" />, label: 'Sucesso' },
  { type: 'image', icon: <Image className="h-4 w-4" />, label: 'Imagem' },
  { type: 'video', icon: <Video className="h-4 w-4" />, label: 'Vídeo' },
  { type: 'code', icon: <Code className="h-4 w-4" />, label: 'Código' },
];

export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [showMediaUploader, setShowMediaUploader] = useState<string | null>(null);
  const [videoToConvert, setVideoToConvert] = useState<string | null>(null);

  const addBlock = (type: POPBlockType) => {
    const newBlock: POPBlock = {
      id: generateBlockId(),
      type,
      content: '',
      ...(type === 'heading' && { level: 2 }),
      ...(type === 'step' && { stepNumber: getNextStepNumber() }),
    };
    onChange([...blocks, newBlock]);
  };

  const getNextStepNumber = () => {
    const steps = blocks.filter(b => b.type === 'step');
    return steps.length + 1;
  };

  const updateBlock = (id: string, updates: Partial<POPBlock>) => {
    onChange(blocks.map(block => 
      block.id === id ? { ...block, ...updates } : block
    ));
  };

  const removeBlock = (id: string) => {
    const newBlocks = blocks.filter(block => block.id !== id);
    // Renumber steps
    let stepNum = 1;
    const renumbered = newBlocks.map(block => {
      if (block.type === 'step') {
        return { ...block, stepNumber: stepNum++ };
      }
      return block;
    });
    onChange(renumbered);
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
    
    // Renumber steps after moving
    let stepNum = 1;
    const renumbered = newBlocks.map(block => {
      if (block.type === 'step') {
        return { ...block, stepNumber: stepNum++ };
      }
      return block;
    });
    onChange(renumbered);
  };

  const handleMediaUpload = (blockId: string, media: { file_url: string; file_type: string }) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    if (media.file_type === 'video') {
      updateBlock(blockId, { videoUrl: media.file_url });
    } else {
      updateBlock(blockId, { imageUrl: media.file_url });
    }
    setShowMediaUploader(null);
  };

  const handleGifCreated = (blockId: string, gifUrl: string) => {
    updateBlock(blockId, { 
      type: 'image',
      imageUrl: gifUrl 
    });
    setVideoToConvert(null);
  };

  const getBlockStyle = (type: POPBlockType) => {
    switch (type) {
      case 'step':
        return 'border-l-4 border-l-primary bg-primary/5';
      case 'tip':
        return 'border-l-4 border-l-blue-500 bg-blue-500/5';
      case 'alert':
        return 'border-l-4 border-l-yellow-500 bg-yellow-500/5';
      case 'error':
        return 'border-l-4 border-l-destructive bg-destructive/5';
      case 'success':
        return 'border-l-4 border-l-green-500 bg-green-500/5';
      case 'heading':
        return 'bg-muted/50';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-lg border">
        {BLOCK_TYPES.map(({ type, icon, label }) => (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            onClick={() => addBlock(type)}
            className="gap-1.5 h-8 text-xs"
          >
            {icon}
            {label}
          </Button>
        ))}
      </div>

      {/* Blocks */}
      <div className="space-y-2">
        {blocks.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-sm">Clique nos botões acima para adicionar blocos</p>
          </div>
        ) : (
          blocks.map((block, index) => (
            <Card 
              key={block.id} 
              className={cn("p-3 relative group", getBlockStyle(block.type))}
            >
              {/* Block Controls */}
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveBlock(block.id, 'up')}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveBlock(block.id, 'down')}
                  disabled={index === blocks.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeBlock(block.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Block Content */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 pt-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                </div>
                
                <div className="flex-1 space-y-2">
                  {/* Block Type Label */}
                  <div className="flex items-center gap-2">
                    {BLOCK_TYPES.find(t => t.type === block.type)?.icon}
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {BLOCK_TYPES.find(t => t.type === block.type)?.label}
                    </span>
                    
                    {block.type === 'heading' && (
                      <Select
                        value={String(block.level || 2)}
                        onValueChange={(v) => updateBlock(block.id, { level: Number(v) as 1 | 2 | 3 })}
                      >
                        <SelectTrigger className="w-20 h-6 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">H1</SelectItem>
                          <SelectItem value="2">H2</SelectItem>
                          <SelectItem value="3">H3</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    
                    {block.type === 'step' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        Passo {block.stepNumber}
                      </span>
                    )}
                  </div>

                  {/* Block Input */}
                  {(block.type === 'image' || block.type === 'video') ? (
                    <div className="space-y-2">
                      {(block.imageUrl || block.videoUrl) ? (
                        <div className="relative rounded-lg overflow-hidden bg-muted">
                          {block.type === 'image' || block.imageUrl ? (
                            <img 
                              src={block.imageUrl} 
                              alt={block.caption || ''} 
                              className="max-h-48 w-full object-contain"
                            />
                          ) : (
                            <video 
                              src={block.videoUrl} 
                              controls 
                              className="max-h-48 w-full"
                            />
                          )}
                          <div className="absolute top-2 right-2 flex gap-1">
                            {block.videoUrl && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => setVideoToConvert(block.id)}
                              >
                                <Film className="h-3 w-3" />
                                GIF
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateBlock(block.id, { imageUrl: undefined, videoUrl: undefined })}
                            >
                              Remover
                            </Button>
                          </div>
                        </div>
                      ) : showMediaUploader === block.id ? (
                        <MediaUploader
                          onUpload={(media) => handleMediaUpload(block.id, media)}
                          onConvertToGif={block.type === 'video' ? () => setVideoToConvert(block.id) : undefined}
                          accept={block.type === 'image' ? 'image/*,.gif' : 'video/mp4,video/webm'}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full h-20 border-dashed gap-2"
                          onClick={() => setShowMediaUploader(block.id)}
                        >
                          {block.type === 'image' ? <Image className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                          Adicionar {block.type === 'image' ? 'imagem' : 'vídeo'}
                        </Button>
                      )}
                      <Input
                        placeholder="Legenda (opcional)"
                        value={block.caption || ''}
                        onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  ) : block.type === 'code' ? (
                    <Textarea
                      placeholder="Cole o código aqui..."
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="font-mono text-sm min-h-[100px]"
                    />
                  ) : block.type === 'heading' ? (
                    <Input
                      placeholder="Digite o título..."
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className={cn(
                        "font-medium border-0 bg-transparent p-0 h-auto focus-visible:ring-0",
                        block.level === 1 && "text-xl",
                        block.level === 2 && "text-lg",
                        block.level === 3 && "text-base"
                      )}
                    />
                  ) : (
                    <Textarea
                      placeholder="Digite o conteúdo..."
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="text-sm min-h-[60px] resize-none"
                      rows={2}
                    />
                  )}
                </div>
              </div>

              {/* Video to GIF Converter */}
              {videoToConvert === block.id && block.videoUrl && (
                <VideoToGifConverter
                  open={true}
                  onOpenChange={() => setVideoToConvert(null)}
                  videoUrl={block.videoUrl}
                  onGifCreated={(gifUrl) => handleGifCreated(block.id, gifUrl)}
                />
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
