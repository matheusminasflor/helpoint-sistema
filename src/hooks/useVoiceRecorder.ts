import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export type RecorderState = 'idle' | 'recording' | 'recorded';

export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [interimText, setInterimText] = useState('');
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [isSending, setIsSending] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isListeningRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');

  const isSupported = true; // MediaRecorder is widely supported
  const isRecording = recorderState === 'recording';
  const isRecorded = recorderState === 'recorded';

  const cleanup = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    analyserRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        toast.error('Permissão de microfone negada. Abra o app em uma nova aba e conceda permissão.', { duration: 6000 });
      } else if (err?.name === 'NotFoundError') {
        toast.error('Nenhum microfone encontrado.');
      } else {
        toast.error('Para usar o microfone, abra o app em uma nova aba.', { duration: 6000 });
      }
      return;
    }

    streamRef.current = stream;

    // Audio analyser for waveform
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevels = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const bars: number[] = [];
        const step = Math.floor(dataArray.length / 12);
        for (let i = 0; i < 12; i++) {
          bars.push(dataArray[i * step] / 255);
        }
        setAudioLevels(bars);
        animFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();
    } catch {}

    // Media recorder for audio blob
    audioChunksRef.current = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500);
    } catch {}

    // Speech recognition (best-effort, not required)
    const SpeechRecognitionClass = getSpeechRecognition();
    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'pt-BR';
      recognition.interimResults = true;
      recognition.continuous = true;
      finalTranscriptRef.current = '';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        finalTranscriptRef.current = final;
        setInterimText(final + interim);
      };

      recognition.onerror = () => {};
      recognition.onend = () => {
        if (isListeningRef.current) {
          try { recognition.start(); } catch {}
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        isListeningRef.current = true;
      } catch {}
    }

    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    setRecorderState('recording');
    setInterimText('');
    setAudioUrl(null);
  }, []);

  const stopRecording = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    analyserRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setRecorderState('recorded');
    setAudioLevels([]);
  }, []);

  const sendRecording = useCallback(async () => {
    // 1. Check if browser Speech API already transcribed
    const browserText = finalTranscriptRef.current.trim() || interimText.trim();
    
    if (browserText && browserText.length > 3) {
      // Browser transcription worked — send directly
      onTranscript(browserText);
      resetState();
      return;
    }

    // 2. No browser transcription — upload audio and transcribe via AI
    setIsSending(true);
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
      
      if (audioBlob.size < 1000) {
        toast.info('Áudio muito curto. Tente gravar novamente.');
        setIsSending(false);
        return;
      }

      const ext = mimeTypeRef.current.includes('webm') ? 'webm' : 'mp4';
      const fileName = `${crypto.randomUUID()}.${ext}`;
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error('Sessão expirada. Faça login novamente.');
        setIsSending(false);
        return;
      }

      const filePath = `${user.id}/${fileName}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('voice-recordings')
        .upload(filePath, audioBlob, {
          contentType: mimeTypeRef.current,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Erro ao enviar áudio. Tente novamente.');
        setIsSending(false);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('voice-recordings')
        .getPublicUrl(filePath);

      // Call transcription edge function
      const { data: transcriptionData, error: transcriptionError } = await supabase.functions
        .invoke('ai-transcribe-audio', {
          body: { audio_url: urlData.publicUrl },
        });

      // Clean up the uploaded file (async, don't wait)
      supabase.storage.from('voice-recordings').remove([filePath]).catch(() => {});

      if (transcriptionError) {
        console.error('Transcription error:', transcriptionError);
        toast.error('Erro ao transcrever áudio. Tente digitar sua mensagem.');
        setIsSending(false);
        return;
      }

      const transcript = transcriptionData?.transcript?.trim();
      
      if (!transcript || transcript === '[áudio inaudível]') {
        toast.info('Não foi possível entender o áudio. Tente falar mais perto do microfone.');
        setIsSending(false);
        return;
      }

      onTranscript(transcript);
      resetState();
    } catch (err) {
      console.error('Send recording error:', err);
      toast.error('Erro ao processar áudio. Tente digitar sua mensagem.');
      setIsSending(false);
    }
  }, [onTranscript, interimText]);

  const resetState = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setRecorderState('idle');
    setInterimText('');
    setDuration(0);
    setAudioUrl(null);
    setAudioLevels([]);
    setIsSending(false);
    finalTranscriptRef.current = '';
    audioChunksRef.current = [];
    cleanup();
  }, [cleanup, audioUrl]);

  const cancelRecording = useCallback(() => {
    cleanup();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setRecorderState('idle');
    setInterimText('');
    setDuration(0);
    setAudioUrl(null);
    setAudioLevels([]);
    setIsSending(false);
    finalTranscriptRef.current = '';
    audioChunksRef.current = [];
  }, [cleanup, audioUrl]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    recorderState,
    isRecording,
    isRecorded,
    interimText,
    duration,
    audioUrl,
    audioLevels,
    isSupported,
    isSending,
    startRecording,
    stopRecording,
    sendRecording,
    cancelRecording,
  };
}
