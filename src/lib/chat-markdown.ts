/**
 * Keep rich assistant output inside narrow panes without making code and
 * tables unreadable. Inline URLs and code wrap; block content scrolls locally.
 */
export const CHAT_MARKDOWN_LAYOUT =
  "min-w-0 max-w-full [&_a]:break-words [&_code]:break-words [&_code]:whitespace-pre-wrap [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre_code]:whitespace-pre [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto";
