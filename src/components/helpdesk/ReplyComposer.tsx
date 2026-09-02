import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Send, Paperclip, Loader2, Lock, Globe, AtSign, MessageSquarePlus, History } from 'lucide-react';
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAISuggestReply } from '@/hooks/useAISuggestReply';

interface ReplyComposerProps {
  ticketId: string;
  onReply: (content: string, isInternal: boolean, attachments?: File[]) => Promise<void>;
  isSending?: boolean;
  showInternalOption?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onMentionClick?: () => void;
  showMentionButton?: boolean;
}

export function ReplyComposer({
  ticketId,
  onReply,
  isSending = false,
  showInternalOption = false,
  placeholder = "Digite sua resposta...",
  disabled = false,
  onMentionClick,
  showMentionButton = false,
}: ReplyComposerProps) {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { generateSuggestion, isGenerating } = useAISuggestReply();

  const handleSuggestReply = async () => {
    const suggestion = await generateSuggestion(ticketId, 'reply');
    if (suggestion) {
      setSuggestions(prev => [suggestion, ...prev].slice(0, 5));
      setContent(suggestion);
    }
  };

  const handleRestoreSuggestion = (suggestion: string) => {
    setContent(suggestion);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024;
    const validFiles = selectedFiles.filter(file => {
      if (file.size > maxSize) {
        toast.error(`${file.name} excede o limite de 10MB`);
        return false;
      }
      return true;
    });
    setFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!content.trim() && files.length === 0) return;
    try {
      await onReply(content.trim(), isInternal, files);
      setContent('');
      setFiles([]);
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim() || files.length > 0) handleSubmit();
    }
  };

  const isDisabled = disabled || isSending || (!content.trim() && files.length === 0);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border-t border-border bg-background p-4">
        {/* File preview */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {files.map((file, index) => (
              <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm">
                <Paperclip className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button type="button" onClick={() => removeFile(index)} className="text-muted-foreground hover:text-destructive ml-1">×</button>
              </div>
            ))}
          </div>
        )}
        
        {/* AI action bar for technicians */}
        {showInternalOption && (
          <div className="flex items-center gap-1.5 mb-2">
            {/* Suggest reply button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestReply}
                  disabled={disabled || isSending || isGenerating}
                  className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Sugerir</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gerar resposta com IA</TooltipContent>
            </Tooltip>

            {/* AI Refine button */}
            <AIRefineButton
              text={content}
              context="comment"
              onRefine={(refined) => setContent(refined)}
              disabled={disabled || isSending}
            />

            {/* Suggestion history */}
            {suggestions.length > 0 && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{suggestions.length}</span>
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Sugestões anteriores</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b border-border">
                    <p className="text-xs font-medium text-muted-foreground">Sugestões anteriores da IA</p>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleRestoreSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 border-b border-border last:border-0 transition-colors line-clamp-3"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        <div className="flex items-end gap-3">
          {showInternalOption && (
            <Select value={isInternal ? 'internal' : 'public'} onValueChange={(v) => setIsInternal(v === 'internal')}>
              <SelectTrigger className="w-[140px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" />Público</div>
                </SelectItem>
                <SelectItem value="internal">
                  <div className="flex items-center gap-2"><Lock className="w-3.5 h-3.5" />Interno</div>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          
          <div className="flex-1 relative">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isSending}
              className={cn(
                "min-h-[80px] max-h-[200px] resize-none pr-12",
                isInternal && "border-amber-300 focus-visible:ring-amber-400"
              )}
              rows={2}
            />
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isSending}
              className="absolute right-3 bottom-2.5 p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Anexar arquivo"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          {/* Mention button */}
          {showMentionButton && onMentionClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onMentionClick}
                  disabled={disabled || isSending}
                  className="h-10 w-10 flex-shrink-0"
                >
                  <AtSign className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mencionar um colega do TI</TooltipContent>
            </Tooltip>
          )}
          
          {/* Send button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleSubmit}
                disabled={isDisabled}
                size="icon"
                className={cn(
                  "h-10 w-10 flex-shrink-0",
                  isInternal && "bg-amber-500 hover:bg-amber-600"
                )}
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Enviar mensagem</TooltipContent>
          </Tooltip>
        </div>
        
        {isInternal && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Esta mensagem será visível apenas para a equipe técnica
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
