import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Folder } from 'lucide-react';
import type { HashtagInfo, Message, Conversation } from '../types/chat';

// Parse @ references from input message (now for both folders and files)
export const parseAtRefs = (message: string): string[] => {
  // Handle both quoted names (@"About Me") and unquoted (@About)
  const atRefRegex = /@"([^"]+)"|@(\S+)/g;
  const atRefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = atRefRegex.exec(message)) !== null) {
    // Use group 1 for quoted names, group 2 for unquoted
    const refName = match[1] || match[2];
    atRefs.push(refName);
  }

  return atRefs;
};

// Render message with highlighted hashtags
export const renderMessageWithHashtags = (
  message: string,
  hashtagInfo?: HashtagInfo
): string | React.ReactNode[] => {
  if (!hashtagInfo || hashtagInfo.detected_hashtags.length === 0) {
    return message;
  }

  const hashtagRegex = /#([\w\-_]+)/g;
  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = hashtagRegex.exec(message)) !== null) {
    // Add text before hashtag
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index));
    }

    const hashtagName = match[1];
    const isRecognized = hashtagInfo.recognized_folders.some(f => f.name === hashtagName);

    // Add highlighted hashtag
    parts.push(
      <Badge
        key={match.index}
        variant={isRecognized ? "default" : "secondary"}
        className={`mx-1 ${isRecognized ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
      >
        <Folder className="h-3 w-3 mr-1" />
        #{hashtagName}
      </Badge>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }

  return parts;
};

export const getConversationDefaultTitle = (
  conversation?: Conversation,
  messages?: Message[]
): string => {
  const normalizedTitle = conversation?.title?.trim();
  if (normalizedTitle && normalizedTitle.toLowerCase() !== 'new conversation') {
    return normalizedTitle;
  }

  const firstAssistantMessage = messages?.find(msg => msg.role === 'assistant');
  if (firstAssistantMessage?.content) {
    return `Chat Insight: ${firstAssistantMessage.content.split('\n')[0].slice(0, 80)}`;
  }

  const firstUserMessage = messages?.find(
    msg => msg.role !== 'assistant' && msg.role !== 'system'
  );
  if (firstUserMessage?.content) {
    return `Chat Thread: ${firstUserMessage.content.split('\n')[0].slice(0, 80)}`;
  }

  const referenceTimestamp =
    conversation?.created_at || messages?.[0]?.created_at || new Date().toISOString();
  return `Conversation ${new Date(referenceTimestamp).toLocaleString()}`;
};

export const buildConversationTranscript = (messages: Message[]): string => {
  if (messages.length === 0) {
    return '';
  }

  return messages
    .map((msg) => {
      const roleLabel =
        msg.role === 'assistant'
          ? 'Assistant'
          : msg.role === 'system'
            ? 'System'
            : 'You';
      const timestamp = new Date(msg.created_at).toLocaleString();
      const body = msg.content?.trim() ?? '';
      return `${roleLabel} (${timestamp})\n${body}`;
    })
    .join('\n\n');
};

// Get a random search message
export const getRandomSearchMessage = (): string => {
  const searchMessages = [
    "Rummaging through your brain files... 🧠",
    "Shaking the knowledge tree... 🌳",
    "Following the digital breadcrumbs... 🍞",
    "Consulting the data spirits... 👻",
    "Brewing some answer magic... ✨",
    "Digging through the archives... 🕵️",
    "Whispering to the algorithms... 🤫"
  ];
  return searchMessages[Math.floor(Math.random() * searchMessages.length)];
};

// Get a random placeholder text
export const getRandomPlaceholderText = (): string => {
  const placeholderTexts = [
    "Ask me anything... I don't bite! 🤖",
    "Scratch your brain, I'll scratch mine... 🧠✨",
    "What's cooking in that brilliant mind? 💭",
    "Ready to explore your knowledge galaxy? 🚀",
    "Let's turn questions into answers! ⚡",
    "Your thoughts + My processing = Magic! ✨",
    "Curiosity called, I answered! 📞",
    "Ask away, I'm all ears... well, all code! 👂",
    "What mysteries shall we unravel today? 🔮",
    "Feed me questions, I'll serve wisdom! 🍽️"
  ];
  return placeholderTexts[Math.floor(Math.random() * placeholderTexts.length)];
};