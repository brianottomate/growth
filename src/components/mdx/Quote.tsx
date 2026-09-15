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
    <div className="my-8 rounded-lg border border-secondary bg-surface-secondary p-6">
      <div className="mb-4">
        <QuoteIcon className="h-8 w-8 text-tertiary" />
      </div>
      <blockquote className="text-lg text-primary italic">
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
            <div className="font-semibold text-primary">{author}</div>
            {role && <div className="text-sm text-secondary">{role}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
