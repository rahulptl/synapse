import { useMediaQuery } from '@/hooks/useMediaQuery';
import KnowledgePage from './KnowledgePage';
import MobileKnowledgePage from './MobileKnowledgePage';

/**
 * Responsive wrapper that switches between desktop and mobile knowledge pages
 * Breakpoint: 768px (tablets and below show mobile version)
 */
export default function ResponsiveKnowledgePage() {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return isMobile ? <MobileKnowledgePage /> : <KnowledgePage />;
}
