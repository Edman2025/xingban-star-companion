'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Award,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flame,
  Heart,
  Home,
  LockKeyhole,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Mic,
  Newspaper,
  Pause,
  Play,
  Radio,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  UserRound,
  Users,
  Utensils,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: Record<string, unknown>;
          annotations?: {
            readOnlyHint?: boolean;
            untrustedContentHint?: boolean;
          };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

type StatKey = 'hunger' | 'bond' | 'mood';
type Message = {
  id: number;
  from: 'ai' | 'user';
  text: string;
  time: string;
  mode?: 'text' | 'voice';
  audioUrl?: string;
  audioDuration?: number;
  isAudioLoading?: boolean;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionFactory = new () => SpeechRecognitionLike;
type StarProfile = {
  id: string;
  name: string;
  initial: string;
  role: string;
  color: string;
};

const stars: StarProfile[] = [
  {
    id: 'xingyao',
    name: '星遥',
    initial: '遥',
    role: '原创虚拟唱作人',
    color: '#f0785d',
  },
];

const navItems = [
  { value: 'home', label: '今日陪伴', icon: Home },
  { value: 'chat', label: '悄悄话', icon: MessageCircle },
  { value: 'feed', label: '官方动态', icon: Newspaper },
  { value: 'community', label: '粉丝社区', icon: Users },
  { value: 'profile', label: '我的星球', icon: UserRound },
];

const initialMessages: Message[] = [];
const CHAT_API_URL =
  'https://xingban-star-companion.rzzttg2qgz.chatgpt.site/api/chat';
const VOICE_API_URL =
  'https://xingban-star-companion.rzzttg2qgz.chatgpt.site/api/voice';
const STORAGE_KEY = 'xingban-mvp-state-v3';

const feedItems = [
  {
    type: '新歌',
    title: '原创单曲《向晴而行》概念短片上线',
    body: '星遥的首支原创概念短片已发布，记录从清晨城市到星光舞台的一天。',
    time: '12 分钟前',
    icon: Play,
    accent: 'bg-[#e66e5f]',
  },
  {
    type: '巡演',
    title: '「把光唱给你」线上首演预约开启',
    body: '9 月 12 日 20:00 开播，星友可提前预约并收到开场提醒。',
    time: '1 小时前',
    icon: Radio,
    accent: 'bg-[#d89b36]',
  },
  {
    type: '工作室',
    title: '九月行程图已更新',
    body: '创作直播、线上首演与星友见面会时间均已同步到星伴日历。',
    time: '昨天 20:30',
    icon: CalendarDays,
    accent: 'bg-[#5576c9]',
  },
];

const communityPosts = [
  {
    id: 1,
    author: '遥光收藏家',
    level: 18,
    time: '6 分钟前',
    text: '连续陪伴第 100 天！今天解锁了“清晨电台”回忆卡，系统音色听起来很温暖。',
    tag: '养成记录',
    likes: 328,
    comments: 42,
    initial: '河',
  },
  {
    id: 2,
    author: '向光生长',
    level: 12,
    time: '28 分钟前',
    text: '整理了线上首演的预约和观看清单，第一次参加的星友可以参考。记得只走官方入口！',
    tag: '首演互助',
    likes: 196,
    comments: 31,
    initial: '光',
  },
  {
    id: 3,
    author: '晴天播放键',
    level: 9,
    time: '1 小时前',
    text: '《向晴而行》概念短片里的星轨发夹很有意思，做了一个不剧透的细节分析。',
    tag: '新歌讨论',
    likes: 121,
    comments: 18,
    initial: '七',
  },
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function timeNow() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('home');
  const [star, setStar] = useState(stars[0]);
  const [starDialogOpen, setStarDialogOpen] = useState(false);
  const [stats, setStats] = useState({ hunger: 72, bond: 64, mood: 88 });
  const [xp, setXp] = useState(68);
  const [streak] = useState(12);
  const [fedToday, setFedToday] = useState(1);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [autoVoice, setAutoVoice] = useState(true);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const [chatError, setChatError] = useState('');
  const [reminders, setReminders] = useState<Record<string, boolean>>({
    concert: true,
    movie: false,
  });
  const [likedPosts, setLikedPosts] = useState<number[]>([]);
  const [status, setStatus] = useState('');
  const [mounted, setMounted] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const voiceTranscriptRef = useRef('');
  const voiceShouldSendRef = useRef(true);
  const voiceFinishingRef = useRef(false);
  const voiceStartedAtRef = useRef(0);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef(new Set<string>());

  const level = 7;
  const taskProgress = [
    fedToday >= 2,
    messages.length > initialMessages.length,
    reminders.concert,
  ].filter(Boolean).length;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.starId)
          setStar(stars.find((item) => item.id === data.starId) ?? stars[0]);
        if (data.stats) setStats(data.stats);
        if (typeof data.xp === 'number') setXp(data.xp);
        if (typeof data.fedToday === 'number') setFedToday(data.fedToday);
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (typeof data.autoVoice === 'boolean') setAutoVoice(data.autoVoice);
        if (data.reminders) setReminders(data.reminders);
        if (Array.isArray(data.likedPosts)) setLikedPosts(data.likedPosts);
      }
    } catch {
      // Invalid demo storage is ignored and replaced on the next state change.
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        starId: star.id,
        stats,
        xp,
        fedToday,
        messages: messages.map(
          ({
            audioUrl: _audioUrl,
            isAudioLoading: _isAudioLoading,
            ...message
          }) => message,
        ),
        autoVoice,
        reminders,
        likedPosts,
      }),
    );
  }, [
    mounted,
    star,
    stats,
    xp,
    fedToday,
    messages,
    autoVoice,
    reminders,
    likedPosts,
  ]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      recognitionRef.current?.abort();
      mediaRecorderRef.current?.state === 'recording' &&
        mediaRecorderRef.current.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      activeAudioRef.current?.pause();
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const afterPaint = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

    const reportRegistrationError = (error: unknown) => {
      console.warn('WebMCP tool registration failed', error);
    };

    void Promise.resolve(
      context.registerTool(
        {
          name: 'care_for_companion',
          title: '照顾星伴手办',
          description: '给当前星伴喂星糖或陪它听歌，并立即更新可见的养成状态。',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['feed', 'listen'] },
            },
            required: ['action'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const action = (input as { action?: unknown } | null)?.action;
            if (action !== 'feed' && action !== 'listen') {
              throw new Error('action 必须是 feed 或 listen');
            }
            if (action === 'feed') {
              setStats((current) => ({
                ...current,
                hunger: clamp(current.hunger + 12),
              }));
              setFedToday((current) => Math.min(2, current + 1));
            } else {
              setStats((current) => ({
                ...current,
                mood: clamp(current.mood + 8),
              }));
            }
            setXp((current) => Math.min(100, current + 6));
            await afterPaint();
            return { status: 'completed', action, xp_gained: 6 };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(reportRegistrationError);

    void Promise.resolve(
      context.registerTool(
        {
          name: 'set_event_reminder',
          title: '设置官方活动提醒',
          description: '开启或关闭当前星伴的演唱会或电影官方提醒。',
          inputSchema: {
            type: 'object',
            properties: {
              event: { type: 'string', enum: ['concert', 'movie'] },
              enabled: { type: 'boolean' },
            },
            required: ['event', 'enabled'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const data = input as { event?: unknown; enabled?: unknown } | null;
            if (data?.event !== 'concert' && data?.event !== 'movie') {
              throw new Error('event 必须是 concert 或 movie');
            }
            if (typeof data.enabled !== 'boolean') {
              throw new Error('enabled 必须是布尔值');
            }
            setReminders((current) => ({
              ...current,
              [data.event as string]: data.enabled as boolean,
            }));
            await afterPaint();
            return {
              status: 'updated',
              event: data.event,
              enabled: data.enabled,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(reportRegistrationError);

    return () => lifecycle.abort();
  }, []);

  function announce(text: string) {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 2800);
  }

  function careFor(stat: StatKey, delta: number, label: string) {
    setStats((current) => ({
      ...current,
      [stat]: clamp(current[stat] + delta),
    }));
    setXp((current) => Math.min(100, current + 6));
    if (stat === 'hunger') setFedToday((current) => Math.min(2, current + 1));
    announce(`${label}完成，亲密经验 +6`);
  }

  function chooseStar(profile: StarProfile) {
    stopActiveAudio();
    setStar(profile);
    setStarDialogOpen(false);
    setMessages([]);
    setChatError('');
    announce(`已切换为 ${profile.name} 的陪伴空间`);
  }

  async function sendChatText(
    rawText: string,
    mode: 'text' | 'voice' = 'text',
    audioUrl?: string,
    audioDuration?: number,
  ) {
    const text = rawText.trim();
    if (!text || isSending) return;

    const userMessage: Message = {
      id: Date.now(),
      from: 'user',
      text: text.slice(0, 600),
      time: timeNow(),
      mode,
      audioUrl,
      audioDuration,
    };
    const history = messages.slice(-11).map((message) => ({
      role: message.from === 'ai' ? 'assistant' : 'user',
      content: message.text,
    }));

    setMessages((current) => [...current, userMessage]);
    setMessageInput('');
    setChatError('');
    setIsSending(true);

    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starId: star.id,
          messages: [...history, { role: 'user', content: userMessage.text }],
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        reply?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.reply) {
        throw new Error(data?.error || '回复生成失败，请稍后再试');
      }

      const aiMessage: Message = {
        id: Date.now() + 1,
        from: 'ai',
        text: data.reply as string,
        time: timeNow(),
        mode: 'voice',
      };
      setMessages((current) => [...current, aiMessage]);
      setStats((current) => ({ ...current, bond: clamp(current.bond + 3) }));
      setXp((current) => Math.min(100, current + 4));
      announce(
        autoVoice
          ? 'MiniMax 正在生成语音回复'
          : 'MiniMax 已生成回复，亲密经验 +4',
      );
      if (autoVoice) void playMessageAudio(aiMessage, true);
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== userMessage.id),
      );
      if (mode === 'text') setMessageInput(text);
      setChatError(
        error instanceof Error ? error.message : '网络暂时不可用，请稍后再试',
      );
    } finally {
      setIsSending(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendChatText(messageInput, 'text');
  }

  function stopActiveAudio() {
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;
    setPlayingMessageId(null);
  }

  async function playMessageAudio(message: Message, autoplay = false) {
    if (playingMessageId === message.id) {
      stopActiveAudio();
      return;
    }
    stopActiveAudio();
    setChatError('');

    let audioUrl = message.audioUrl;
    if (!audioUrl) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, isAudioLoading: true } : item,
        ),
      );
      try {
        const response = await fetch(VOICE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ starId: star.id, text: message.text }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || '语音生成失败，请稍后再试');
        }
        const audioBlob = await response.blob();
        audioUrl = URL.createObjectURL(audioBlob);
        audioUrlsRef.current.add(audioUrl);
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id
              ? { ...item, audioUrl, isAudioLoading: false }
              : item,
          ),
        );
      } catch (error) {
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, isAudioLoading: false } : item,
          ),
        );
        setChatError(
          error instanceof Error ? error.message : '语音生成失败，请稍后再试',
        );
        return;
      }
    }

    const audio = new Audio(audioUrl);
    activeAudioRef.current = audio;
    audio.onplay = () => setPlayingMessageId(message.id);
    audio.onended = () => {
      setPlayingMessageId(null);
      activeAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingMessageId(null);
      setChatError('音频加载失败，请重新点击播放');
    };
    try {
      await audio.play();
    } catch {
      setPlayingMessageId(null);
      if (autoplay)
        setChatError('浏览器已阻止自动播放，请点击回复下方的播放按钮');
    }
  }

  function releaseVoiceCapture() {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    recognitionRef.current = null;
    setIsListening(false);
  }

  function finishVoiceCapture(send = true) {
    if (voiceFinishingRef.current) return;
    voiceFinishingRef.current = true;
    const recorder = mediaRecorderRef.current;
    const transcript = voiceTranscriptRef.current.trim();
    const duration = Math.max(
      1,
      Math.round((Date.now() - voiceStartedAtRef.current) / 1000),
    );

    const finish = () => {
      let audioUrl: string | undefined;
      if (recordedChunksRef.current.length) {
        const audioBlob = new Blob(recordedChunksRef.current, {
          type: recorder?.mimeType || 'audio/webm',
        });
        audioUrl = URL.createObjectURL(audioBlob);
        audioUrlsRef.current.add(audioUrl);
      }
      recordedChunksRef.current = [];
      mediaRecorderRef.current = null;
      releaseVoiceCapture();
      setVoiceTranscript('');
      setVoiceSeconds(0);
      if (send && transcript) {
        void sendChatText(transcript, 'voice', audioUrl, duration);
      } else if (send) {
        setChatError('没有识别到语音，请靠近麦克风后重试');
      }
      voiceShouldSendRef.current = true;
      voiceFinishingRef.current = false;
    };

    if (recorder?.state === 'recording') {
      recorder.onstop = finish;
      recorder.stop();
    } else {
      finish();
    }
  }

  function stopVoiceInput() {
    recognitionRef.current?.stop();
  }

  async function startVoiceInput() {
    if (isSending || isListening) return;
    setChatError('');

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionFactory;
      webkitSpeechRecognition?: SpeechRecognitionFactory;
    };
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (
      !Recognition ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setChatError(
        '当前浏览器不支持语音输入，请使用最新版 Chrome、Edge 或 Safari',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const preferredType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        preferredType ? { mimeType: preferredType } : undefined,
      );
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current = recorder;

      const recognition = new Recognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
      voiceTranscriptRef.current = '';
      voiceShouldSendRef.current = true;
      voiceFinishingRef.current = false;
      voiceStartedAtRef.current = Date.now();

      recognition.onstart = () => {
        recorder.start(250);
        setIsListening(true);
        setVoiceSeconds(0);
        voiceTimerRef.current = setInterval(() => {
          const seconds = Math.round(
            (Date.now() - voiceStartedAtRef.current) / 1000,
          );
          setVoiceSeconds(seconds);
          if (seconds >= 30) recognition.stop();
        }, 500);
      };
      recognition.onresult = (event) => {
        const results = (
          event as {
            results?: ArrayLike<{
              0?: { transcript?: string };
              isFinal?: boolean;
            }>;
          }
        ).results;
        if (!results) return;
        let transcript = '';
        for (let index = 0; index < results.length; index += 1) {
          transcript += results[index]?.[0]?.transcript || '';
        }
        voiceTranscriptRef.current = transcript.slice(0, 600);
        setVoiceTranscript(voiceTranscriptRef.current);
      };
      recognition.onerror = (event) => {
        const code = (event as { error?: string }).error;
        const message =
          code === 'not-allowed' || code === 'service-not-allowed'
            ? '需要允许麦克风权限才能发送语音'
            : code === 'no-speech'
              ? '没有听清，请靠近麦克风后重试'
              : '语音识别暂时不可用，请稍后再试';
        setChatError(message);
        voiceShouldSendRef.current = false;
        finishVoiceCapture(false);
      };
      recognition.onend = () => {
        if (mediaRecorderRef.current)
          finishVoiceCapture(voiceShouldSendRef.current);
      };
      recognition.start();
    } catch (error) {
      releaseVoiceCapture();
      const message =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
          ? '需要允许麦克风权限才能发送语音'
          : '无法启动麦克风，请检查浏览器权限';
      setChatError(message);
    }
  }

  function toggleReminder(key: string) {
    setReminders((current) => {
      const next = !current[key];
      announce(next ? '已开启活动提醒' : '已关闭活动提醒');
      return { ...current, [key]: next };
    });
  }

  function toggleLike(postId: number) {
    setLikedPosts((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    );
  }

  const currentGreeting = '晚上好';

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      orientation="vertical"
      className="mx-auto min-h-screen w-full max-w-[1680px] flex-col gap-0 overflow-x-hidden lg:grid lg:grid-cols-[224px_minmax(0,1fr)]"
    >
      <aside className="z-30 h-0 w-full shrink-0 overflow-visible border-0 bg-transparent text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-auto lg:flex-col lg:border-r lg:border-white/10 lg:bg-[#101b39]">
        <div className="hidden items-center gap-3 px-6 pb-7 pt-7 lg:flex">
          <div className="grid size-10 place-items-center rounded-[14px] bg-[#efb94f] text-[#16213f] shadow-lg shadow-[#efb94f]/15">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-xl font-black tracking-tight">星伴</p>
            <p className="text-xs text-white/48">STAR COMPANION</p>
          </div>
        </div>

        <TabsList
          className="fixed inset-x-3 z-50 !grid !h-[68px] !w-auto !grid-cols-5 !flex-row rounded-[22px] border border-white/10 bg-[#101b39]/95 p-2 shadow-2xl shadow-slate-950/30 backdrop-blur-xl lg:static lg:mx-3 lg:!flex lg:!h-auto lg:!w-auto lg:flex-1 lg:!flex-col lg:justify-start lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-full !w-auto flex-col !justify-center gap-1 rounded-[15px] px-1 text-[11px] font-medium text-white/55 data-active:bg-white/10 data-active:text-[#f5c868] lg:h-11 lg:!w-full lg:flex-none lg:flex-row lg:!justify-start lg:gap-3 lg:px-4 lg:text-[15px]"
              >
                <Icon className="size-[19px]" />
                <span>{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="mx-4 mb-5 hidden rounded-2xl border border-white/10 bg-white/[0.055] p-4 lg:block">
          <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
            <ShieldCheck className="size-4 text-emerald-400" />
            安全陪伴已开启
          </div>
          <p className="text-xs leading-5 text-white/42">
            AI 身份持续标识 · 对话可删除 · 未成年人保护
          </p>
        </div>
      </aside>

      <section className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl sm:h-[72px] sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#101b39] text-[#f3bf58] lg:hidden">
              <Sparkles className="size-[18px]" />
            </div>
            <Dialog open={starDialogOpen} onOpenChange={setStarDialogOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-11 rounded-2xl px-2 hover:bg-slate-100 sm:px-3"
                    aria-label="查看原创角色设定"
                  />
                }
              >
                <span
                  className="grid size-8 place-items-center rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: star.color }}
                >
                  {star.initial}
                </span>
                <span className="text-left">
                  <span className="block text-sm font-bold leading-4">
                    {star.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    原创角色空间
                  </span>
                </span>
                <ChevronDown className="size-4 text-slate-400" />
              </DialogTrigger>
              <DialogContent className="max-w-[460px] rounded-[24px] p-6">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">
                    原创角色设定
                  </DialogTitle>
                  <DialogDescription>
                    星遥是星伴首位完全原创的虚拟明星，不基于任何真人；语音使用
                    MiniMax 官方系统音色。
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 grid gap-3">
                  {stars.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => chooseStar(profile)}
                      className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#e3b14e] hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e3b14e]/25"
                    >
                      <span
                        className="mb-4 grid size-11 place-items-center rounded-2xl text-base font-bold text-white"
                        style={{ backgroundColor: profile.color }}
                      >
                        {profile.initial}
                      </span>
                      <span className="block font-bold">{profile.name}</span>
                      <span className="text-xs text-slate-500">
                        {profile.role}
                      </span>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Badge
              className="hidden bg-emerald-50 text-emerald-700 sm:inline-flex"
              variant="secondary"
            >
              <ShieldCheck /> 原创 IP · 系统音色
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative grid size-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e3b14e]/25"
              aria-label="查看通知"
              onClick={() => announce('你有 2 条未读官方通知')}
            >
              <Bell className="size-5" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-[#e66e5f] ring-2 ring-white" />
            </button>
            <div className="hidden items-center gap-2 rounded-xl bg-[#fff5dd] px-3 py-2 text-sm font-semibold text-[#876018] sm:flex">
              <Flame className="size-4" /> 连续 {streak} 天
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
          <TabsContent value="home" className="space-y-6">
            <section className="flex items-end justify-between gap-4">
              <div>
                <p className="mb-1 text-sm font-semibold text-[#b47720]">
                  {currentGreeting}，星友
                </p>
                <h1 className="text-[clamp(1.65rem,3vw,2.35rem)] font-black tracking-[-0.04em] text-[#17213f]">
                  {star.name}正在等你回来
                </h1>
              </div>
              <p className="hidden text-sm text-slate-500 md:block">
                2026 年 9 月 4 日 · 陪伴第 36 天
              </p>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.48fr)_minmax(330px,0.72fr)]">
              <section className="relative min-h-[500px] overflow-hidden rounded-[26px] bg-[#132143] text-white shadow-[0_28px_70px_-38px_rgba(10,23,55,0.75)] sm:min-h-[540px] sm:rounded-[30px]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_22%,rgba(245,194,94,0.22),transparent_28%),linear-gradient(130deg,rgba(20,36,76,0.25),rgba(7,14,34,0.72))]" />
                <div className="absolute inset-y-0 right-0 w-[62%] overflow-hidden max-md:w-full max-md:opacity-70">
                  <img
                    src="/xingyao-character.png"
                    alt="原创虚拟明星星遥的全身卡通形象"
                    className="companion-float h-full w-full object-contain object-center p-3 sm:p-5"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#132143] via-[#132143]/20 to-transparent md:from-[#132143]/85" />
                </div>

                <div className="relative z-10 flex min-h-[500px] flex-col justify-between p-5 sm:min-h-[540px] sm:p-8 lg:p-10">
                  <div>
                    <Badge
                      className="mb-5 border-white/15 bg-white/10 text-white"
                      variant="outline"
                    >
                      <Bot /> AI 星伴 · 非真人
                    </Badge>
                    <p className="max-w-[420px] text-[clamp(1.45rem,3vw,2.15rem)] font-bold leading-[1.3] tracking-tight">
                      “今天也别急着赶路，我把好心情分你一半。”
                    </p>
                    <p className="mt-3 text-sm text-white/60">
                      — {star.name}的今日陪伴留言
                    </p>
                  </div>

                  <div className="max-w-[520px] rounded-[24px] border border-white/12 bg-[#081128]/72 p-5 backdrop-blur-xl">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/50">手办形态</p>
                        <p className="mt-1 font-bold">晴空星轨 · 成长型</p>
                      </div>
                      <Badge className="bg-[#f2bf5d] text-[#17213f]">
                        Lv.{level}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          key: 'hunger' as StatKey,
                          label: '元气',
                          value: stats.hunger,
                          icon: Utensils,
                        },
                        {
                          key: 'bond' as StatKey,
                          label: '亲密',
                          value: stats.bond,
                          icon: Heart,
                        },
                        {
                          key: 'mood' as StatKey,
                          label: '心情',
                          value: stats.mood,
                          icon: Sparkles,
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.key}
                            className="rounded-2xl bg-white/[0.075] p-3"
                          >
                            <div className="mb-2 flex items-center justify-between text-xs text-white/55">
                              <span className="flex items-center gap-1.5">
                                <Icon className="size-3.5" />
                                {item.label}
                              </span>
                              <span>{item.value}</span>
                            </div>
                            <Progress
                              value={item.value}
                              className="[&_[data-slot=progress-indicator]]:bg-[#efbd59] [&_[data-slot=progress-track]]:bg-white/12"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2.5">
                      <Button
                        className="pulse-soft h-11 flex-1 bg-[#efbd59] px-4 text-[#17213f] hover:bg-[#ffd176]"
                        onClick={() => careFor('hunger', 12, '喂一颗星糖')}
                      >
                        <Utensils /> 喂一颗星糖
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 flex-1 border-white/15 bg-white/[0.06] px-4 text-white hover:bg-white/12 hover:text-white"
                        onClick={() => careFor('mood', 8, '一起听歌')}
                      >
                        <Radio /> 一起听歌
                      </Button>
                      <Button
                        size="icon-lg"
                        variant="outline"
                        className="h-11 border-white/15 bg-white/[0.06] text-white hover:bg-white/12 hover:text-white"
                        onClick={() => setActiveTab('chat')}
                        aria-label="开始聊天"
                      >
                        <MessageCircle />
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="space-y-5">
                <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.8)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        今日陪伴任务
                      </p>
                      <h2 className="mt-1 text-xl font-black text-[#17213f]">
                        完成 {taskProgress}/3
                      </h2>
                    </div>
                    <div className="grid size-11 place-items-center rounded-2xl bg-[#fff4db] text-[#b47720]">
                      <Star className="size-5 fill-current" />
                    </div>
                  </div>
                  <Progress
                    value={(taskProgress / 3) * 100}
                    className="mb-5 [&_[data-slot=progress-indicator]]:bg-[#e6ad43] [&_[data-slot=progress-track]]:h-2"
                  />
                  <div className="space-y-2.5">
                    {[
                      {
                        done: fedToday >= 2,
                        label: '完成两次喂养',
                        reward: '+10 星光',
                      },
                      {
                        done: messages.length > initialMessages.length,
                        label: '说一句悄悄话',
                        reward: '+8 星光',
                      },
                      {
                        done: reminders.concert,
                        label: '开启演出提醒',
                        reward: '+12 星光',
                      },
                    ].map((task) => (
                      <div
                        key={task.label}
                        className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"
                      >
                        <span
                          className={`grid size-7 place-items-center rounded-full ${task.done ? 'bg-emerald-500 text-white' : 'border border-slate-200 bg-white text-slate-300'}`}
                        >
                          <Check className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-semibold ${task.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                          >
                            {task.label}
                          </p>
                          <p className="text-xs text-[#b47720]">
                            {task.reward}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.8)]">
                  <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
                    <div>
                      <p className="text-xs font-semibold text-[#b47720]">
                        下一场官方活动
                      </p>
                      <h2 className="mt-1 font-black text-[#17213f]">
                        上海站预售
                      </h2>
                    </div>
                    <Badge className="bg-rose-50 text-rose-700">8 天后</Badge>
                  </div>
                  <div className="space-y-3 p-5 sm:p-6">
                    <p className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock3 className="size-4 text-slate-400" />9 月 12 日
                      14:00
                    </p>
                    <p className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="size-4 text-slate-400" />
                      上海梅赛德斯奔驰文化中心
                    </p>
                    <Button
                      className="mt-2 h-10 w-full"
                      variant={reminders.concert ? 'secondary' : 'default'}
                      onClick={() => toggleReminder('concert')}
                    >
                      {reminders.concert ? <Check /> : <Bell />}
                      {reminders.concert ? '已开启提醒' : '开启官方提醒'}
                    </Button>
                    <p className="text-center text-[11px] leading-5 text-slate-400">
                      不代抢票；开售时跳转至合作方官方页面
                    </p>
                  </div>
                </section>
              </aside>
            </div>

            <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    官方内容
                  </p>
                  <h2 className="mt-1 text-xl font-black text-[#17213f]">
                    刚刚发生
                  </h2>
                </div>
                <Button variant="ghost" onClick={() => setActiveTab('feed')}>
                  查看全部 <ChevronRight />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {feedItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.title}
                      onClick={() => setActiveTab('feed')}
                      className="group rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e3b14e]/25"
                    >
                      <span
                        className={`mb-4 grid size-10 place-items-center rounded-2xl text-white ${item.accent}`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="mb-1 block text-xs font-semibold text-slate-400">
                        {item.type} · {item.time}
                      </span>
                      <span className="block font-bold text-[#17213f]">
                        {item.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="chat">
            <div className="mx-auto grid max-w-[1180px] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="flex min-h-[calc(100vh-136px)] flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span
                      className="relative grid size-11 place-items-center rounded-2xl text-base font-bold text-white"
                      style={{ backgroundColor: star.color }}
                    >
                      {star.initial}
                      <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-white bg-emerald-500" />
                    </span>
                    <div>
                      <h1 className="font-black text-[#17213f]">
                        和{star.name}说悄悄话
                      </h1>
                      <p className="text-xs text-slate-500">
                        MiniMax 实时生成 · 官方系统音色
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !autoVoice;
                        setAutoVoice(next);
                        if (!next) stopActiveAudio();
                        announce(
                          next
                            ? '已开启 AI 自动语音回复'
                            : '已关闭自动播放，可手动点击收听',
                        );
                      }}
                      className="grid size-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-[#17213f] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e3b14e]/25"
                      aria-label={
                        autoVoice
                          ? '关闭 AI 自动语音回复'
                          : '开启 AI 自动语音回复'
                      }
                      aria-pressed={autoVoice}
                    >
                      {autoVoice ? (
                        <Volume2 className="size-[18px]" />
                      ) : (
                        <VolumeX className="size-[18px]" />
                      )}
                    </button>
                    <Badge
                      className="hidden bg-blue-50 text-blue-700 sm:inline-flex"
                      variant="secondary"
                    >
                      <Bot /> MiniMax 系统音色
                    </Badge>
                  </div>
                </div>

                <div
                  ref={chatScrollRef}
                  className="flex-1 space-y-5 overflow-y-auto bg-[linear-gradient(180deg,#f8faff,#ffffff)] px-4 py-6 sm:px-8"
                >
                  <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    这是原创虚拟角色生成的 AI 对话，不对应任何真人。语音使用
                    MiniMax 官方系统音色，请勿依赖它处理医疗、法律或紧急问题。
                  </div>
                  {messages.length === 0 && (
                    <div className="mx-auto max-w-md py-10 text-center">
                      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-[#17213f] text-[#efbd59]">
                        <Sparkles className="size-5" />
                      </span>
                      <p className="font-bold text-[#17213f]">
                        现在可以开始真实对话
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        打字或点击麦克风说出心情，回复将由 MiniMax
                        实时生成并用语音读给你听。
                      </p>
                    </div>
                  )}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`mx-auto flex max-w-2xl gap-3 ${message.from === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold ${message.from === 'ai' ? 'bg-[#17213f] text-[#efbd59]' : 'bg-slate-200 text-slate-600'}`}
                      >
                        {message.from === 'ai' ? star.initial : '我'}
                      </span>
                      <div
                        className={`max-w-[78%] ${message.from === 'user' ? 'text-right' : ''}`}
                      >
                        <div
                          className={`inline-block rounded-[20px] px-4 py-3 text-left text-[15px] leading-7 ${message.from === 'ai' ? 'rounded-tl-md bg-[#edf2fb] text-[#273454]' : 'rounded-tr-md bg-[#17213f] text-white'}`}
                        >
                          {message.mode === 'voice' && (
                            <div
                              className={`mb-1.5 flex items-center gap-2 text-xs font-semibold ${message.from === 'ai' ? 'text-[#526485]' : 'text-white/70'}`}
                            >
                              <Mic className="size-3.5" />
                              {message.from === 'ai'
                                ? 'AI 语音回复'
                                : `语音消息${message.audioDuration ? ` · ${message.audioDuration} 秒` : ''}`}
                            </div>
                          )}
                          <p>{message.text}</p>
                          {(message.from === 'ai' || message.audioUrl) && (
                            <button
                              type="button"
                              onClick={() => void playMessageAudio(message)}
                              disabled={message.isAudioLoading}
                              className={`mt-2 flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 ${message.from === 'ai' ? 'bg-white/70 text-[#334462] hover:bg-white focus-visible:ring-blue-200' : 'bg-white/12 text-white hover:bg-white/20 focus-visible:ring-white/20'}`}
                              aria-label={
                                playingMessageId === message.id
                                  ? '暂停语音'
                                  : '播放语音'
                              }
                            >
                              {message.isAudioLoading ? (
                                <LoaderCircle className="size-3.5 animate-spin" />
                              ) : playingMessageId === message.id ? (
                                <Pause className="size-3.5" />
                              ) : (
                                <Play className="size-3.5 fill-current" />
                              )}
                              {message.isAudioLoading
                                ? '正在生成语音'
                                : playingMessageId === message.id
                                  ? '暂停'
                                  : '播放语音'}
                            </button>
                          )}
                        </div>
                        <p className="mt-1.5 px-1 text-[11px] text-slate-400">
                          {message.time}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isSending && (
                    <div
                      className="mx-auto flex max-w-2xl gap-3"
                      aria-live="polite"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#17213f] text-[#efbd59]">
                        {star.initial}
                      </span>
                      <div className="flex items-center gap-2 rounded-[20px] rounded-tl-md bg-[#edf2fb] px-4 py-3 text-sm text-slate-500">
                        <LoaderCircle className="size-4 animate-spin" /> MiniMax
                        正在回复…
                      </div>
                    </div>
                  )}
                  {chatError && (
                    <div
                      className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                      role="alert"
                    >
                      {chatError}
                    </div>
                  )}
                </div>

                <form
                  onSubmit={sendMessage}
                  className="border-t border-slate-100 bg-white p-4 sm:p-5"
                >
                  <div
                    className={`mx-auto flex max-w-2xl items-end gap-2 rounded-[20px] border p-2 transition ${isListening ? 'border-rose-300 bg-rose-50 ring-4 ring-rose-100' : 'border-slate-200 bg-slate-50 focus-within:border-[#ddb04f] focus-within:ring-4 focus-within:ring-[#ddb04f]/10'}`}
                  >
                    <Button
                      type="button"
                      size="icon-lg"
                      variant={isListening ? 'destructive' : 'ghost'}
                      className={`size-10 shrink-0 rounded-2xl ${isListening ? 'animate-pulse' : 'text-slate-500'}`}
                      aria-label={
                        isListening ? '结束并发送语音' : '开始语音输入'
                      }
                      disabled={isSending}
                      onClick={
                        isListening
                          ? stopVoiceInput
                          : () => void startVoiceInput()
                      }
                    >
                      {isListening ? <Send /> : <Mic />}
                    </Button>
                    {isListening ? (
                      <div
                        className="flex min-h-10 flex-1 items-center gap-3 overflow-hidden px-1"
                        aria-live="polite"
                      >
                        <span
                          className="flex h-7 items-center gap-1"
                          aria-hidden="true"
                        >
                          {[10, 18, 24, 15, 21].map((height, index) => (
                            <span
                              key={height}
                              className="w-1 animate-pulse rounded-full bg-rose-500"
                              style={{
                                height,
                                animationDelay: `${index * 100}ms`,
                              }}
                            />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-rose-700">
                          {voiceTranscript || '正在听，请开始说话…'}
                        </span>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-rose-500">
                          {voiceSeconds}s
                        </span>
                      </div>
                    ) : (
                      <textarea
                        value={messageInput}
                        onChange={(event) =>
                          setMessageInput(event.target.value)
                        }
                        disabled={isSending}
                        maxLength={600}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        aria-label="输入聊天内容"
                        placeholder="打字，或点麦克风说话…"
                        rows={1}
                        className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-6 outline-none placeholder:text-slate-400"
                      />
                    )}
                    <Button
                      type="submit"
                      size="icon-lg"
                      className="size-10 rounded-2xl"
                      aria-label="发送消息"
                      disabled={
                        isSending || isListening || !messageInput.trim()
                      }
                    >
                      {isSending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-center text-[11px] text-slate-400">
                    语音最长 30 秒 · AI 回复使用“温暖少女”系统音色 ·
                    可随时关闭自动播放
                  </p>
                </form>
              </section>

              <aside className="space-y-5">
                <section className="rounded-[26px] border border-slate-200/80 bg-white p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-2xl bg-[#fff4db] text-[#b47720]">
                      <Heart className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">关系阶段</p>
                      <p className="font-black text-[#17213f]">默契知己</p>
                    </div>
                  </div>
                  <Progress
                    value={stats.bond}
                    className="[&_[data-slot=progress-indicator]]:bg-[#e6ad43] [&_[data-slot=progress-track]]:h-2"
                  />
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    再获得 {100 - stats.bond} 点亲密度，解锁“星夜散步”互动。
                  </p>
                </section>
                <section className="rounded-[26px] border border-slate-200/80 bg-white p-5">
                  <p className="mb-4 text-xs font-semibold text-slate-500">
                    今天记住了
                  </p>
                  <div className="space-y-3">
                    {[
                      '你最近在准备一次重要汇报',
                      '你喜欢在晚上听慢歌',
                      '你希望被温柔地鼓励',
                    ].map((memory) => (
                      <div
                        key={memory}
                        className="flex gap-2.5 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600"
                      >
                        <Sparkles className="mt-1 size-4 shrink-0 text-[#d69b2d]" />
                        {memory}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    className="mt-3 w-full text-slate-500"
                    onClick={() => announce('记忆管理将在设置中打开')}
                  >
                    管理关系记忆 <ChevronRight />
                  </Button>
                </section>
              </aside>
            </div>
          </TabsContent>

          <TabsContent
            value="feed"
            className="mx-auto max-w-[1120px] space-y-6"
          >
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-1 text-sm font-semibold text-[#b47720]">
                  来自工作室与合作方
                </p>
                <h1 className="text-3xl font-black tracking-tight text-[#17213f]">
                  官方动态
                </h1>
              </div>
              <Badge
                className="w-fit bg-emerald-50 text-emerald-700"
                variant="secondary"
              >
                <ShieldCheck /> 已验证来源
              </Badge>
            </section>

            <section className="grid gap-4">
              {feedItems.map((item, index) => {
                const Icon = item.icon;
                const key =
                  index === 0 ? 'movie' : index === 1 ? 'concert' : 'schedule';
                return (
                  <article
                    key={item.title}
                    className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7"
                  >
                    <div className="flex gap-4 sm:gap-5">
                      <span
                        className={`grid size-12 shrink-0 place-items-center rounded-[18px] text-white ${item.accent}`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{item.type}</Badge>
                          <span className="text-xs text-slate-400">
                            {item.time}
                          </span>
                        </div>
                        <h2 className="text-lg font-black text-[#17213f] sm:text-xl">
                          {item.title}
                        </h2>
                        <p className="mt-2 text-[15px] leading-7 text-slate-600">
                          {item.body}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              announce(
                                index === 1
                                  ? '即将跳转至官方合作票务页面'
                                  : '正在打开官方内容',
                              )
                            }
                          >
                            {index === 1 ? <Ticket /> : <Play />}
                            {index === 1 ? '查看官方票务' : '查看详情'}
                          </Button>
                          {index < 2 && (
                            <Button
                              variant="outline"
                              onClick={() => toggleReminder(key)}
                            >
                              {reminders[key] ? <Check /> : <Bell />}
                              {reminders[key] ? '已提醒' : '提醒我'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="rounded-[26px] border border-blue-200/70 bg-blue-50/70 p-5 sm:p-6">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-700" />
                <div>
                  <h2 className="font-bold text-blue-950">票务安全说明</h2>
                  <p className="mt-1 text-sm leading-6 text-blue-800/75">
                    星伴只提供官宣信息、开售提醒和官方合作页面跳转，不自动抢票、不代收支付、不承诺购票结果。请勿在社区交换身份证或付款信息。
                  </p>
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent
            value="community"
            className="mx-auto max-w-[1180px] space-y-6"
          >
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-1 text-sm font-semibold text-[#b47720]">
                  和 28,619 位星友一起
                </p>
                <h1 className="text-3xl font-black tracking-tight text-[#17213f]">
                  粉丝社区
                </h1>
              </div>
              <Button
                onClick={() => announce('发布入口已打开：MVP 暂以演示数据展示')}
              >
                发布动态
              </Button>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-4">
                {communityPosts.map((post) => {
                  const liked = likedPosts.includes(post.id);
                  return (
                    <article
                      key={post.id}
                      className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-2xl bg-[#21365f] text-sm font-bold text-white">
                          {post.initial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[#17213f]">
                            {post.author}{' '}
                            <span className="ml-1 text-xs font-medium text-[#b47720]">
                              Lv.{post.level}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400">{post.time}</p>
                        </div>
                        <Badge variant="secondary">{post.tag}</Badge>
                      </div>
                      <p className="text-[15px] leading-7 text-slate-700">
                        {post.text}
                      </p>
                      <div className="mt-5 flex items-center gap-1 border-t border-slate-100 pt-3">
                        <Button
                          variant="ghost"
                          className={liked ? 'text-rose-600' : 'text-slate-500'}
                          onClick={() => toggleLike(post.id)}
                        >
                          <Heart className={liked ? 'fill-current' : ''} />
                          {post.likes + (liked ? 1 : 0)}
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-slate-500"
                          onClick={() => announce('评论区将在下一步展开')}
                        >
                          <MessageCircle />
                          {post.comments}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </section>

              <aside className="space-y-5">
                <section className="rounded-[26px] border border-slate-200/80 bg-white p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-2xl bg-[#fff4db] text-[#b47720]">
                      <Trophy className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">本周榜单</p>
                      <h2 className="font-black text-[#17213f]">陪伴力排行</h2>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      ['1', '遥光收藏家', '4,820'],
                      ['2', '向光生长', '4,590'],
                      ['3', '小行星 0719', '4,260'],
                      ['18', '你', '2,180'],
                    ].map(([rank, name, score]) => (
                      <div
                        key={name}
                        className={`flex items-center gap-3 rounded-2xl p-3 ${name === '你' ? 'bg-[#fff4db]' : 'bg-slate-50'}`}
                      >
                        <span className="w-6 text-center text-sm font-black text-slate-400">
                          {rank}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-slate-700">
                          {name}
                        </span>
                        <span className="text-xs font-bold text-[#b47720]">
                          {score}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-[26px] bg-[#17213f] p-5 text-white">
                  <p className="text-xs font-semibold text-[#efbd59]">
                    社区守则
                  </p>
                  <h2 className="mt-1 font-bold">真诚表达，也保护彼此</h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    禁止人肉、未授权交易、冒充明星或工作室。争议信息以官方来源为准。
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => announce('已打开完整社区守则')}
                  >
                    查看守则
                  </Button>
                </section>
              </aside>
            </div>
          </TabsContent>

          <TabsContent
            value="profile"
            className="mx-auto max-w-[1120px] space-y-6"
          >
            <section className="overflow-hidden rounded-[30px] bg-[#17213f] p-6 text-white sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="grid size-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#e66e5f] to-[#9b4564] text-xl font-black">
                    星
                  </span>
                  <div>
                    <Badge
                      className="mb-2 bg-white/10 text-white"
                      variant="outline"
                    >
                      核心星友
                    </Badge>
                    <h1 className="text-2xl font-black">我的星球</h1>
                    <p className="mt-1 text-sm text-white/55">
                      与{star.name}相遇的第 36 天
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-5 text-center">
                  <div>
                    <p className="text-2xl font-black text-[#efbd59]">
                      {streak}
                    </p>
                    <p className="text-xs text-white/45">连续天数</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-[#efbd59]">18</p>
                    <p className="text-xs text-white/45">回忆卡</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-[#efbd59]">2,180</p>
                    <p className="text-xs text-white/45">星光值</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl bg-[#fff4db] text-[#b47720]">
                    <Award className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">成长进度</p>
                    <h2 className="font-black text-[#17213f]">
                      等级 {level} · 星光收藏家
                    </h2>
                  </div>
                </div>
                <Progress
                  value={xp}
                  className="[&_[data-slot=progress-indicator]]:bg-[#e6ad43] [&_[data-slot=progress-track]]:h-2"
                />
                <p className="mt-3 text-xs text-slate-500">
                  {xp}/100 经验 · 升级后解锁新的手办动作
                </p>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {['初次相遇', '七日守候', '活动雷达'].map((badge, index) => (
                    <div
                      key={badge}
                      className="rounded-2xl bg-slate-50 p-3 text-center"
                    >
                      <span
                        className={`mx-auto mb-2 grid size-9 place-items-center rounded-full ${index === 2 ? 'bg-slate-200 text-slate-400' : 'bg-[#fff0c8] text-[#b47720]'}`}
                      >
                        <Star className="size-4 fill-current" />
                      </span>
                      <p className="text-xs font-semibold text-slate-600">
                        {badge}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 sm:p-6">
                <div className="mb-2 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                    <LockKeyhole className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">隐私与安全</p>
                    <h2 className="font-black text-[#17213f]">
                      由你决定留下什么
                    </h2>
                  </div>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {[
                    ['关系记忆', '查看、修改或全部删除'],
                    ['对话记录', '默认保存 30 天'],
                    ['未成年人模式', '内容与使用时长保护'],
                    ['数据与授权', '导出数据、撤回同意'],
                  ].map(([title, subtitle]) => (
                    <button
                      type="button"
                      key={title}
                      onClick={() => announce(`正在打开：${title}`)}
                      className="flex w-full items-center gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e3b14e]/20"
                    >
                      <Settings className="size-4 text-slate-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-700">
                          {title}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {subtitle}
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-slate-300" />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  <div>
                    <h2 className="font-bold text-[#17213f]">
                      原创与 AI 身份公开透明
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      星遥为完全原创虚拟角色，不使用任何真人的姓名、肖像或声纹。AI
                      回复由 MiniMax 生成，语音固定使用官方“温暖少女”系统音色。
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => announce('原创角色与 AI 说明已打开')}
                >
                  查看原创说明
                </Button>
              </div>
            </section>
          </TabsContent>
        </main>
      </section>

      <div
        aria-live="polite"
        aria-atomic="true"
        className={`fixed left-1/2 top-20 z-[70] -translate-x-1/2 rounded-full bg-[#17213f] px-4 py-2.5 text-sm font-semibold text-white shadow-xl transition duration-200 ${status ? 'translate-y-0 opacity-100' : '-translate-y-3 pointer-events-none opacity-0'}`}
      >
        {status || '状态更新'}
      </div>
    </Tabs>
  );
}
