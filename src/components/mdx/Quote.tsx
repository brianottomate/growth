import type React from "react";
import { Quote as QuoteIcon } from "lucide-react";
import Image from "next/image";

interface QuoteProps {
  children: React.ReactNode;
  author?: string;
  role?: string;
  avatar?: string;
}

export function Quote({ children, author, role, avatar }: QuoteProps) {
  return (
    <div className="bg-surface-secondary border-secondary my-8 rounded-lg border p-6">
      <div className="mb-4">
        <QuoteIcon className="text-tertiary h-8 w-8" />
      </div>
      <blockquote className="text-primary text-lg italic">
        {children}
      </blockquote>
      {author && (
        <div className="mt-4 flex items-center gap-3">
          {avatar && (
            <Image
              src={avatar}
              alt={author}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          )}
          <div>
            <div className="text-primary font-semibold">{author}</div>
            {role && <div className="text-secondary text-sm">{role}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
