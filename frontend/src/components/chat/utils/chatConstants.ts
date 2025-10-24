// Chat constants extracted from ChatPage.tsx

export const SEARCH_MESSAGES = [
  "Rummaging through your brain files... 🧠",
  "Shaking the knowledge tree... 🌳",
  "Following the digital breadcrumbs... 🍞",
  "Consulting the data spirits... 👻",
  "Brewing some answer magic... ✨",
  "Digging through the archives... 🕵️",
  "Whispering to the algorithms... 🤫"
] as const;

export const PLACEHOLDER_TEXTS = [
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
] as const;

export const ANIMATION_CSS = `
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes message-appear {
    from { opacity: 0; transform: translateX(-15px) scale(0.95); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }
  .message-appear {
    animation: message-appear 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 10px rgba(59, 130, 246, 0.3); }
    50% { box-shadow: 0 0 25px rgba(59, 130, 246, 0.6); }
  }
  .glow-animation {
    animation: glow 2.5s ease-in-out infinite;
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  .float-animation {
    animation: float 6s ease-in-out infinite;
  }
`;

export const AUTOCOMPLETE_INSTRUCTIONS = "↑↓ Navigate • Tab/Enter Select • Esc Close";

export const AI_DISCLAIMER = "AI responses may contain inaccuracies. Verify important information.";

export const CONTEXT_HELPER_TEXT = "Use @ to reference files and folders";