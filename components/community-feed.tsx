'use client';

/* Dynamic visitor uploads and local data URLs are already bounded/compressed. */
/* oxlint-disable next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  COMMUNITY_TAGS,
  CommunityError,
  communityRequest,
  ensureVisitor,
  loadCommunityDraft,
  prepareCommunityImage,
  saveCommunityDraft,
} from '@/lib/community-client';
import type {
  CommunityDraft,
  CommunityFeed as FeedResult,
  CommunityPost,
  DraftImage,
} from '@/lib/community-client';

function emptyDraft(author = ''): CommunityDraft {
  return {
    requestId: crypto.randomUUID(),
    author,
    text: '',
    tag: COMMUNITY_TAGS[0],
    images: [],
  };
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。';
}

export function CommunityFeed() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [scope, setScope] = useState('all');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CommunityDraft | null>(null);
  const [draftStatus, setDraftStatus] = useState('');
  const [publishError, setPublishError] = useState('');
  const [processingImages, setProcessingImages] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [deletePost, setDeletePost] = useState<CommunityPost | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [liking, setLiking] = useState<number[]>([]);
  const [viewer, setViewer] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const feedSequence = useRef(0);
  const submitLock = useRef(false);
  const imageLock = useRef(false);
  const likeLocks = useRef(new Set<number>());
  const saveChain = useRef(Promise.resolve());

  const loadFeed = useCallback(
    async (after?: number) => {
      const sequence = ++feedSequence.current;
      setLoading(true);
      setFeedError('');
      try {
        const query = new URLSearchParams({
          scope,
          tag,
          ...(after ? { cursor: String(after) } : {}),
        });
        const data = await communityRequest<FeedResult>(`?${query}`);
        if (sequence !== feedSequence.current) return;
        setPosts((current) =>
          after
            ? [
                ...current,
                ...data.posts.filter(
                  (post) => !current.some((item) => item.id === post.id),
                ),
              ]
            : data.posts,
        );
        setTotal(data.total);
        setCursor(data.nextCursor);
      } catch (error) {
        if (sequence === feedSequence.current)
          setFeedError(errorMessage(error));
      } finally {
        if (sequence === feedSequence.current) setLoading(false);
      }
    },
    [scope, tag],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFeed();
    }, 0);
    return () => {
      clearTimeout(timer);
      feedSequence.current += 1;
    };
  }, [loadFeed]);
  useEffect(() => {
    let active = true;
    void loadCommunityDraft()
      .then((saved) => {
        if (!active) return;
        const valid =
          saved &&
          typeof saved.text === 'string' &&
          typeof saved.author === 'string' &&
          Array.isArray(saved.images) &&
          COMMUNITY_TAGS.includes(saved.tag as (typeof COMMUNITY_TAGS)[number]);
        setDraft(valid ? saved : emptyDraft());
      })
      .catch(() => {
        if (active) {
          setDraft(emptyDraft());
          setDraftStatus('浏览器草稿存储不可用，请勿关闭或刷新页面。');
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(() => saveCommunityDraft(draft));
      void saveChain.current
        .then(() => setDraftStatus('草稿已保存到此浏览器'))
        .catch(() => setDraftStatus('草稿未能保存到浏览器，请勿刷新页面。'));
    }, 350);
    return () => clearTimeout(timer);
  }, [draft]);

  function updateDraft(update: Partial<CommunityDraft>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
    setDraftStatus('正在保存草稿…');
    setPublishError('');
  }

  async function addImages(files: FileList | null) {
    if (!files || !draft || imageLock.current || publishing || draft.uncertain)
      return;
    if (files.length + draft.images.length > 9) {
      setPublishError('一条动态最多 9 张图片，请减少选择数量。');
      return;
    }
    imageLock.current = true;
    setProcessingImages(true);
    setPublishError('');
    try {
      const prepared: DraftImage[] = [];
      // Sequential decoding bounds memory on mobile browsers.
      for (const file of Array.from(files))
        prepared.push(await prepareCommunityImage(file));
      setDraft((current) =>
        current
          ? { ...current, images: [...current.images, ...prepared] }
          : current,
      );
    } catch (error) {
      setPublishError(errorMessage(error));
    } finally {
      imageLock.current = false;
      setProcessingImages(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function publish() {
    if (!draft || submitLock.current || imageLock.current) return;
    if (!draft.text.trim() && !draft.images.length) {
      setPublishError('先写点什么，或添加一张图片吧。');
      return;
    }
    if (
      Array.from(draft.author.trim()).length < 2 ||
      Array.from(draft.author.trim()).length > 16
    ) {
      setPublishError('请填写 2–16 字的星友昵称。');
      return;
    }
    if (!agreed) {
      setPublishError('请先确认公开发布说明。');
      return;
    }
    submitLock.current = true;
    setPublishing(true);
    setPublishError('');
    try {
      await ensureVisitor();
      // Persist the request ID before sending, allowing safe retries after reload.
      const pending = { ...draft, uncertain: true };
      setDraft(pending);
      try {
        await saveChain.current;
        await saveCommunityDraft(pending);
      } catch {
        /* The open page retains the draft even if storage is unavailable. */
      }
      const data = await communityRequest<{ post: CommunityPost }>('/posts', {
        method: 'POST',
        body: JSON.stringify({
          requestId: draft.requestId,
          author: draft.author,
          text: draft.text,
          tag: draft.tag,
          images: draft.images.map((image) => image.data.split(',')[1]),
        }),
      });
      const cleared = emptyDraft(draft.author);
      // A successful post must not be reported as failed because local draft cleanup failed.
      try {
        await saveCommunityDraft(cleared);
      } catch {
        setDraftStatus('动态已发布，但浏览器草稿清理失败。');
      }
      setDraft(cleared);
      setOpen(false);
      setAgreed(false);
      setNotice('发布成功，星友们现在可以看到你的动态了。');
      setPosts((current) => [
        data.post,
        ...current.filter((post) => post.id !== data.post.id),
      ]);
      setScope('mine');
      setTag('');
      if (scope === 'mine' && !tag) void loadFeed();
    } catch (error) {
      const needsConfirmation =
        error instanceof CommunityError &&
        (error.status === 0 || error.status >= 500);
      setDraft({ ...draft, uncertain: needsConfirmation });
      setPublishError(
        needsConfirmation
          ? '发布结果尚未确认。请点“确认并重试”，会检查同一条动态，不会重复发布。'
          : errorMessage(error),
      );
    } finally {
      submitLock.current = false;
      setPublishing(false);
    }
  }

  async function like(post: CommunityPost) {
    if (likeLocks.current.has(post.id)) return;
    likeLocks.current.add(post.id);
    setLiking((current) => [...current, post.id]);
    try {
      await ensureVisitor();
      const result = await communityRequest<{ liked: boolean; likes: number }>(
        `/posts/${post.id}/like`,
        { method: 'POST', body: JSON.stringify({ liked: !post.liked }) },
      );
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, ...result } : item,
        ),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      likeLocks.current.delete(post.id);
      setLiking((current) => current.filter((id) => id !== post.id));
    }
  }

  async function removePost() {
    if (!deletePost || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await communityRequest(`/posts/${deletePost.id}`, { method: 'DELETE' });
      setPosts((current) =>
        current.filter((item) => item.id !== deletePost.id),
      );
      setTotal((current) => Math.max(0, current - 1));
      setDeletePost(null);
      setNotice('动态已删除，其他访客无法再查看这条动态及其图片。');
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const locked = publishing || processingImages || Boolean(draft?.uncertain);
  const hasDraft = Boolean(draft?.text || draft?.images.length);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-sm font-semibold text-[#b47720]">
            把喜欢，分享给懂你的星友
          </p>
          <h1 className="text-3xl font-black tracking-tight text-[#17213f]">
            粉丝社区
          </h1>
        </div>
        <Button
          onClick={() => {
            setOpen(true);
            setPublishError('');
          }}
          disabled={!draft}
        >
          <Plus />
          {hasDraft ? '继续编辑草稿' : '发布动态'}
        </Button>
      </section>
      {notice && (
        <output className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="关闭提示"
            onClick={() => setNotice('')}
          >
            <X />
          </Button>
        </output>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-4" aria-label="社区动态">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={scope === 'all' ? 'default' : 'ghost'}
                onClick={() => setScope('all')}
                aria-pressed={scope === 'all'}
              >
                最新动态
              </Button>
              <Button
                variant={scope === 'mine' ? 'default' : 'ghost'}
                onClick={() => setScope('mine')}
                aria-pressed={scope === 'mine'}
              >
                我的动态
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label="刷新动态"
                disabled={loading}
                onClick={() => void loadFeed()}
              >
                <RefreshCw className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="按话题筛选">
              {['', ...COMMUNITY_TAGS].map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setTag(item)}
                  aria-pressed={tag === item}
                  className={`rounded-full px-3 py-2 text-xs transition-colors ${tag === item ? 'bg-[#fff1d2] font-semibold text-[#895b16]' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                >
                  {item ? `# ${item}` : '全部话题'}
                </button>
              ))}
            </div>
          </div>
          {feedError && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              {feedError}
              <Button
                variant="outline"
                className="ml-3"
                disabled={loading}
                onClick={() => void loadFeed()}
              >
                重新加载
              </Button>
            </div>
          )}
          {loading && !posts.length && (
            <output className="flex items-center justify-center gap-2 rounded-[24px] bg-white p-12 text-sm text-slate-500">
              <LoaderCircle className="size-5 animate-spin" />
              正在加载星友动态…
            </output>
          )}
          {!loading && !feedError && !posts.length && (
            <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center">
              <ImagePlus className="mx-auto mb-4 size-10 text-[#c49a51]" />
              <h2 className="font-bold text-[#17213f]">
                {scope === 'mine'
                  ? '还没有发布动态'
                  : tag
                    ? '这个话题还在等你开场'
                    : '成为第一位分享的星友'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                记录今天的心情、喜欢的作品，或一次有意义的陪伴。
              </p>
              <Button
                className="mt-5"
                onClick={() => setOpen(true)}
                disabled={!draft}
              >
                写第一条动态
              </Button>
            </div>
          )}
          {posts.map((post) => (
            <article
              key={post.id}
              className="min-w-0 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="mb-4 flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#21365f] text-sm font-bold text-white">
                  {Array.from(post.author)[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-[#17213f]">
                    {post.author}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {post.mine ? '我' : '星友'} · {post.displayId}
                    </span>
                  </p>
                  <time
                    className="text-xs text-slate-400"
                    dateTime={new Date(post.createdAt).toISOString()}
                  >
                    {new Date(post.createdAt).toLocaleString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </time>
                </div>
                {post.mine && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除这条动态"
                    onClick={() => {
                      setDeletePost(post);
                      setDeleteError('');
                    }}
                  >
                    <Trash2 className="size-4 text-slate-400" />
                  </Button>
                )}
              </div>
              <span className="mb-3 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-[#a87625]">
                # {post.tag}
              </span>
              {post.text && (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700 [overflow-wrap:anywhere]">
                  {post.text}
                </p>
              )}
              {!!post.images.length && (
                <div
                  className={`mt-4 grid gap-2 ${post.images.length === 1 ? 'max-w-sm grid-cols-1' : post.images.length === 2 || post.images.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}
                >
                  {post.images.map((src, index) => (
                    <button
                      key={src}
                      type="button"
                      className="aspect-square overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                      aria-label={`查看 ${post.author} 的第 ${index + 1} 张图片`}
                      onClick={() => setViewer({ images: post.images, index })}
                    >
                      <img
                        src={src}
                        alt={`${post.author} 分享的图片 ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <Button
                  variant="ghost"
                  aria-pressed={post.liked}
                  aria-label={post.liked ? '取消点赞' : '点赞'}
                  disabled={liking.includes(post.id)}
                  className={post.liked ? 'text-rose-600' : 'text-slate-500'}
                  onClick={() => void like(post)}
                >
                  <Heart className={post.liked ? 'fill-current' : ''} />
                  {post.likes || '赞'}
                </Button>
                <span className="text-xs text-slate-400">
                  星友分享 · 非官方发布
                </span>
              </div>
            </article>
          ))}
          {cursor && (
            <Button
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => void loadFeed(cursor)}
            >
              {loading ? <LoaderCircle className="animate-spin" /> : null}
              {loading ? '正在加载' : '加载更多动态'}
            </Button>
          )}
          {!loading && !!posts.length && !cursor && (
            <p className="pb-3 text-center text-xs text-slate-400">
              已展示当前筛选的全部 {total} 条动态
            </p>
          )}
        </section>
        <aside className="space-y-4">
          <section className="rounded-[26px] border border-slate-200/80 bg-white p-5">
            <h2 className="font-bold text-[#17213f]">分享的小提示</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-500">
              <p>支持文字与图文动态，最多 2000 字、9 张图片。</p>
              <p>
                图片会自动压缩，并移除相机定位等元数据。点击动态配图可查看大图。
              </p>
              <p>未发布的草稿只保存在当前浏览器，发布后的内容由服务器保存。</p>
            </div>
          </section>
          <section className="rounded-[26px] bg-[#17213f] p-5 text-white">
            <ShieldCheck className="mb-3 size-6 text-[#efbd59]" />
            <h2 className="font-bold">真诚表达，也保护彼此</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              仅分享有权公开的图片。不发布隐私、人肉信息、诈骗交易或辱骂，不冒充明星及工作室。本社区为非官方粉丝交流空间。
            </p>
            <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-6 text-white/60">
              目前使用访客身份，昵称未经实名认证。请保留此浏览器的网站数据；清除数据、切换网站或换设备后，将无法管理原身份发布的动态。
            </p>
          </section>
        </aside>
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!publishing && !processingImages) setOpen(value);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto rounded-3xl p-5 sm:max-w-[640px] sm:p-6"
          showCloseButton={!publishing && !processingImages}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              分享一刻心动
            </DialogTitle>
            <DialogDescription>
              动态公开可见。写下你的故事，让喜欢有回响。
            </DialogDescription>
          </DialogHeader>
          {!draft ? (
            <output>正在恢复草稿…</output>
          ) : (
            <>
              <fieldset
                disabled={locked}
                className="min-w-0 space-y-4 disabled:opacity-65"
              >
                <div>
                  <label
                    className="mb-2 block text-sm font-semibold"
                    htmlFor="community-author"
                  >
                    星友昵称
                  </label>
                  <input
                    id="community-author"
                    autoComplete="off"
                    value={draft.author}
                    maxLength={16}
                    onChange={(event) =>
                      updateDraft({ author: event.target.value })
                    }
                    placeholder="2–16 字，请勿使用官方身份"
                    className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-semibold"
                    htmlFor="community-text"
                  >
                    动态内容
                  </label>
                  <Textarea
                    id="community-text"
                    className="min-h-36 resize-y rounded-xl p-3 text-base"
                    placeholder="今天有什么想和星友分享的？也可以只发图片。"
                    value={draft.text}
                    maxLength={2000}
                    onChange={(event) =>
                      updateDraft({ text: event.target.value })
                    }
                    aria-describedby="community-count"
                  />
                  <p
                    id="community-count"
                    className="mt-1 text-right text-xs text-slate-400"
                  >
                    {draft.text.length} / 2000
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">选择话题</p>
                  <div className="flex flex-wrap gap-2">
                    {COMMUNITY_TAGS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        disabled={locked}
                        aria-pressed={draft.tag === item}
                        onClick={() => updateDraft({ tag: item })}
                        className={`rounded-full border px-3 py-2 text-sm ${draft.tag === item ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500'}`}
                      >
                        # {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      添加图片{' '}
                      <span className="font-normal text-slate-400">
                        {draft.images.length} / 9
                      </span>
                    </p>
                    <span className="text-xs text-slate-400">
                      JPG / PNG / WebP
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {draft.images.map((image, index) => (
                      <div
                        key={image.id}
                        className="relative aspect-square overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
                      >
                        <button
                          type="button"
                          className="h-full w-full"
                          onClick={() =>
                            setViewer({
                              images: draft.images.map((item) => item.data),
                              index,
                            })
                          }
                          aria-label={`预览第 ${index + 1} 张图片`}
                        >
                          <img
                            src={image.data}
                            alt={`待发布图片 ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          disabled={locked}
                          aria-label={`移除第 ${index + 1} 张图片`}
                          className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/65 text-white"
                          onClick={() =>
                            updateDraft({
                              images: draft.images.filter(
                                (item) => item.id !== image.id,
                              ),
                            })
                          }
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    {draft.images.length < 9 && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => fileInput.current?.click()}
                        className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500"
                      >
                        <ImagePlus className="size-6" />
                        添加图片
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(event) => void addImages(event.target.files)}
                    disabled={locked}
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    单张原图最多 10 MB，发布前自动压缩；可一次选择多张图片。
                  </p>
                </div>
              </fieldset>
              {processingImages && (
                <output className="flex items-center gap-2 text-sm text-blue-700">
                  <LoaderCircle className="size-4 animate-spin" />
                  正在处理图片，请稍候…
                </output>
              )}
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  disabled={publishing}
                  className="mt-1 size-4 shrink-0 accent-[#b47720]"
                />
                <span>
                  我确认内容可公开分享，不含他人隐私或未经许可的内容，并遵守社区守则。当前以访客身份发布。
                </span>
              </label>
              {publishError && (
                <p
                  role="alert"
                  className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700"
                >
                  {publishError}
                </p>
              )}
              {draft.uncertain && !publishing && (
                <p className="text-xs leading-5 text-amber-800">
                  上一条发布结果待确认，暂时锁定编辑；确认后再发布新内容。
                </p>
              )}
              <div className="border-t border-slate-100 pt-3">
                <output className="mb-3 text-xs text-slate-400">
                  {draftStatus || '文字与图片草稿保存在此浏览器'}
                </output>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="mr-auto text-slate-400"
                    disabled={locked || !hasDraft}
                    onClick={() => setDiscardOpen(true)}
                  >
                    清空草稿
                  </Button>
                  <Button
                    variant="outline"
                    disabled={publishing || processingImages}
                    onClick={() => setOpen(false)}
                  >
                    稍后再发
                  </Button>
                  <Button
                    onClick={() => void publish()}
                    disabled={
                      publishing ||
                      processingImages ||
                      !agreed ||
                      (!draft.text.trim() && !draft.images.length)
                    }
                  >
                    {publishing ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                    {publishing
                      ? '正在上传并发布…'
                      : draft.uncertain
                        ? '确认并重试'
                        : '公开发布'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空未发布的草稿？</DialogTitle>
            <DialogDescription>
              这会移除草稿文字和所选图片，不影响已经发布的动态。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              继续编辑
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDraft(emptyDraft(draft?.author));
                setDiscardOpen(false);
                setPublishError('');
              }}
            >
              清空草稿
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deletePost)}
        onOpenChange={(value) => {
          if (!value && !deleting) setDeletePost(null);
        }}
      >
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>删除这条动态？</DialogTitle>
            <DialogDescription>
              动态及配图将立即从社区隐藏。页面不支持恢复，服务器备份可能仍保留记录。
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-rose-600">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeletePost(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void removePost()}
            >
              {deleting ? '正在删除…' : '确认删除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(viewer)}
        onOpenChange={(value) => {
          if (!value) setViewer(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>
              图片预览{' '}
              {viewer ? `${viewer.index + 1} / ${viewer.images.length}` : ''}
            </DialogTitle>
            <DialogDescription>查看动态配图</DialogDescription>
          </DialogHeader>
          {viewer && (
            <>
              <img
                src={viewer.images[viewer.index]}
                alt={`动态大图 ${viewer.index + 1}`}
                className="max-h-[68dvh] w-full rounded-xl object-contain"
              />
              {viewer.images.length > 1 && (
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    disabled={viewer.index === 0}
                    onClick={() =>
                      setViewer({ ...viewer, index: viewer.index - 1 })
                    }
                  >
                    <ChevronLeft />
                    上一张
                  </Button>
                  <Button
                    variant="outline"
                    disabled={viewer.index === viewer.images.length - 1}
                    onClick={() =>
                      setViewer({ ...viewer, index: viewer.index + 1 })
                    }
                  >
                    下一张
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
