import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '星伴｜原创虚拟明星陪伴 MVP',
  description:
    '原创虚拟明星星遥的手办养成、MiniMax AI 对话、系统音色语音、动态提醒与粉丝社区体验。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
