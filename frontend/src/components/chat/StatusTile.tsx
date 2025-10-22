import { Loader2, Search, FileSearch, Code, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type StatusType =
  | 'starting'
  | 'web_search'
  | 'file_search'
  | 'code_interpreter'
  | 'generating'
  | 'complete'
  | null;

interface StatusTileProps {
  status: StatusType;
  message?: string;
  details?: string;
  className?: string;
}

const statusConfig = {
  starting: {
    icon: Loader2,
    label: 'Starting generation',
    bgColor: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-400/40',
    textColor: 'text-blue-200',
    iconColor: 'text-blue-400',
    animate: true,
  },
  web_search: {
    icon: Search,
    label: 'Searching the web',
    bgColor: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-400/40',
    textColor: 'text-purple-200',
    iconColor: 'text-purple-400',
    animate: true,
  },
  file_search: {
    icon: FileSearch,
    label: 'Searching files',
    bgColor: 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20',
    borderColor: 'border-emerald-400/40',
    textColor: 'text-emerald-200',
    iconColor: 'text-emerald-400',
    animate: true,
  },
  code_interpreter: {
    icon: Code,
    label: 'Running code',
    bgColor: 'bg-gradient-to-r from-orange-500/20 to-red-500/20',
    borderColor: 'border-orange-400/40',
    textColor: 'text-orange-200',
    iconColor: 'text-orange-400',
    animate: true,
  },
  generating: {
    icon: Sparkles,
    label: 'Generating response',
    bgColor: 'bg-gradient-to-r from-indigo-500/20 to-blue-500/20',
    borderColor: 'border-indigo-400/40',
    textColor: 'text-indigo-200',
    iconColor: 'text-indigo-400',
    animate: true,
  },
  complete: {
    icon: CheckCircle2,
    label: 'Complete',
    bgColor: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-400/40',
    textColor: 'text-green-200',
    iconColor: 'text-green-400',
    animate: false,
  },
};

export function StatusTile({ status, message, details, className = '' }: StatusTileProps) {
  if (!status) return null;

  const config = statusConfig[status];
  const Icon = config.icon;
  const displayMessage = message || config.label;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`
          ${config.bgColor}
          ${config.borderColor}
          border backdrop-blur-xl rounded-2xl px-5 py-4
          shadow-xl max-w-md
          ${className}
        `}
      >
        <div className="flex items-center space-x-4">
          {/* Icon */}
          <div className="flex-shrink-0">
            <Icon
              className={`
                h-6 w-6 ${config.iconColor}
                ${config.animate ? 'animate-pulse' : ''}
              `}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${config.textColor}`}>
              {displayMessage}
            </div>
            {details && (
              <div className="text-xs text-gray-400 mt-1 truncate">
                {details}
              </div>
            )}
          </div>

          {/* Animated dots for active states */}
          {config.animate && (
            <div className="flex space-x-1">
              <motion.div
                className={`w-1.5 h-1.5 rounded-full ${config.iconColor}`}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
              />
              <motion.div
                className={`w-1.5 h-1.5 rounded-full ${config.iconColor}`}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className={`w-1.5 h-1.5 rounded-full ${config.iconColor}`}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              />
            </div>
          )}
        </div>

        {/* Progress bar animation for active states */}
        {config.animate && (
          <motion.div
            className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden"
          >
            <motion.div
              className={`h-full ${config.bgColor.replace('/20', '/50')}`}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
            />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}