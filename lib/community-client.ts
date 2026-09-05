export const COMMUNITY_TAGS = [
  '日常分享',
  '养成记录',
  '作品讨论',
  '活动互助',
] as const;
export type CommunityPost = {
  id: number;
  author: string;
  displayId: string;
  text: string;
  tag: string;
  createdAt: number;
  mine: boolean;
  images: string[];
  likes: number;
  liked: boolean;
};
export type DraftImage = { id: string; name: string; data: string };
export type CommunityDraft = {
  requestId: string;
  author: string;
  text: string;
  tag: string;
  images: DraftImage[];
  uncertain?: boolean;
};
export type CommunityFeed = {
  posts: CommunityPost[];
  total: number;
  nextCursor: number | null;
};
const TOKEN_KEY = 'xingban-community-visitor-v1';

export class CommunityError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function visitorToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export async function communityRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = visitorToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api/community${path}`, {
      ...options,
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new CommunityError(
      '网络连接中断，请检查网络后重试。草稿不会被清空。',
      0,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new CommunityError('社区返回结果异常，请重试确认', 502);
  if (!response.ok)
    throw new CommunityError(
      'error' in body && typeof body.error === 'string'
        ? body.error
        : '社区暂不可用，请稍后重试',
      response.status,
    );
  return body as T;
}

let creatingSession: Promise<string> | null = null;
export async function ensureVisitor() {
  const existing = visitorToken();
  if (existing) return existing;
  if (!creatingSession) {
    creatingSession = (async () => {
      // Check persistent credential storage before creating a server identity.
      try {
        localStorage.setItem(TOKEN_KEY + '-check', '1');
        localStorage.removeItem(TOKEN_KEY + '-check');
      } catch {
        throw new Error('请允许浏览器保存网站数据，以便管理你发布的动态。');
      }
      const result = await communityRequest<{ token: string }>('/session', {
        method: 'POST',
        body: '{}',
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      return result.token;
    })().finally(() => {
      creatingSession = null;
    });
  }
  return creatingSession;
}

// IndexedDB holds only the unpublished, device-local draft, never the feed.
async function draftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('xingban-community-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadCommunityDraft(): Promise<
  CommunityDraft | undefined
> {
  const db = await draftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('drafts')
        .objectStore('drafts')
        .get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveCommunityDraft(draft: CommunityDraft) {
  const db = await draftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(draft, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function prepareCommunityImage(file: File): Promise<DraftImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 JPG、PNG 或 WebP 图片；HEIC 请先转换为 JPG。');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('单张原图不能超过 10 MB。');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 60_000_000)
      throw new Error('图片尺寸过大，请选择较小的图片。');
    const scale = Math.min(
      1,
      1600 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Re-encoding strips camera/location metadata and bounds upload memory.
    let quality = 0.86;
    let data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > 1_398_100 && quality > 0.4) {
      quality -= 0.12;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    if (!data.startsWith('data:image/jpeg;base64,') || data.length > 1_398_100)
      throw new Error('图片压缩后仍过大，请选择较小的图片。');
    return { id: crypto.randomUUID(), name: file.name, data };
  } catch (error) {
    if (error instanceof Error && error.name !== 'EncodingError') throw error;
    throw new Error('图片无法读取，请选择其他图片。');
  } finally {
    URL.revokeObjectURL(url);
  }
}
