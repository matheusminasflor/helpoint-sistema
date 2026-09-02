import { useEffect, useRef } from 'react';
import { X, Send, Square, Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecorderState } from '@/hooks/useVoiceRecorder';

interface VoiceRecorderBarProps {
  recorderState: RecorderState;
  duration: number;
  interimText: string;
  audioUrl: string | null;
  audioLevels: number[];
  isSending?: boolean;
  onStop: () => void;
  onSend: () => void;
  onCancel: () => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function WaveformBars({ levels }: { levels: number[] }) {
  // Generate 12 bars — use real levels if available, else animate randomly
  const bars = levels.length > 0
    ? levels
    : Array.from({ length: 12 }, () => 0.15 + Math.random() * 0.5);

  return (
    <div className="flex items-center gap-[2px] h-6">
      {bars.map((level, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-red-400 transition-all duration-100"
          style={{
            height: `${Math.max(4, level * 24)}px`,
            opacity: 0.6 + level * 0.4,
          }}
        />
      ))}
    </div>
  );
}

function AudioPreview({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <audio
      ref={audioRef}
      src={audioUrl}
      controls
      className="h-8 w-full max-w-[180px] [&::-webkit-media-controls-panel]:bg-transparent"
    />
  );
}

export function VoiceRecorderBar({
  recorderState,
  duration,
  interimText,
  audioUrl,
  audioLevels,
  isSending = false,
  onStop,
  onSend,
  onCancel,
}: VoiceRecorderBarProps) {
  if (recorderState === 'idle') return null;

  const isRecording = recorderState === 'recording';
  const isRecorded = recorderState === 'recorded';

  return (
    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full bg-surface-1 border border-destructive/30 text-red-400 hover:text-red-600 hover:bg-destructive/10 transition-colors"
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Center content */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {isRecording && (
          <>
            {/* Pulsing red dot */}
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-mono text-red-600 font-medium tabular-nums">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Waveform */}
            <WaveformBars levels={audioLevels} />

            {/* Interim text preview */}
            {interimText && (
              <p className="text-[10px] text-red-500/70 truncate flex-1 italic">
                {interimText}
              </p>
            )}
          </>
        )}

        {isRecorded && (
          <>
            <Mic className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="text-xs text-red-600 font-medium tabular-nums shrink-0">
              {formatDuration(duration)}
            </span>
            {audioUrl ? (
              <AudioPreview audioUrl={audioUrl} />
            ) : interimText ? (
              <p className="text-xs text-slate-600 truncate flex-1 italic">
                "{interimText}"
              </p>
            ) : (
              <p className="text-xs text-slate-400 flex-1">Áudio gravado</p>
            )}
          </>
        )}
      </div>

      {/* Action button */}
      {isRecording && (
        <button
          onClick={onStop}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
          title="Parar gravação"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      )}

      {isRecorded && (
        <button
          onClick={onSend}
          disabled={isSending}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
          title={isSending ? "Transcrevendo..." : "Enviar áudio"}
        >
          {isSending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
