import { useMediaQuery } from '@/hooks/useMediaQuery';
import ChatPage from './ChatPage';
import MobileChatPage from './MobileChatPage';

/**
 * Responsive wrapper that switches between desktop and mobile chat pages
 * Breakpoint: 768px (tablets and below show mobile version)
 */
export default function ResponsiveChatPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return isMobile ? <MobileChatPage /> : <ChatPage />;
}