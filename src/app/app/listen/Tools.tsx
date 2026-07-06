// Tool directory for external listening — social listening services to
// evaluate or integrate, plus LLM / AI-search brand-visibility trackers
// (ChatGPT, Perplexity, Gemini, AI Overviews). Carried over from the v1
// SignalHub when listen-v2 was promoted.
export function Tools() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            LLM listening
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track how Wander appears in AI search results — ChatGPT,
            Perplexity, Gemini, AI Overviews. Coming soon.
          </p>
        </div>
        <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium">🤖 AI Search visibility tracking</p>
          <p className="mt-2">
            Monitor how AI models mention and recommend Wander in their
            responses.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToolCard
            name="Peec.ai"
            href="https://peec.ai/pricing"
            description="Track brand visibility in ChatGPT, Perplexity, Gemini, AI Overviews, Copilot. 2000+ marketing teams. MCP + API."
            tag="evaluate"
          />
          <ToolCard
            name="Profound"
            href="https://www.tryprofound.com/"
            description="Answer Engine Optimization platform. Tracks brand presence and citations across ChatGPT, Perplexity, Gemini, Copilot; agent analytics + conversation insights. Enterprise-leaning."
            tag="evaluate"
          />
          <ToolCard
            name="PromptWatch"
            href="https://promptwatch.com"
            description="Monitor how your brand shows up across LLM answers — prompt-level tracking, share-of-voice, competitor comparison."
            tag="evaluate"
          />
          <ToolCard
            name="Semrush"
            href="https://semrush.com"
            description="SEO incumbent with an AI Toolkit / AI visibility layer — tracks brand mentions and sentiment across ChatGPT, Perplexity, Gemini, AI Overviews. Useful if we already lean on Semrush for SEO."
            tag="evaluate"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Social listening tools
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            External SoMe listening services to evaluate or integrate.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToolCard
            name="Mentionkit"
            href="https://mentionkit.com/pricing"
            description="AI-first. 7 platforms (Reddit, X, LinkedIn, TikTok, Bluesky, YouTube, HN). AI scoring, comment drafts, MCP server, API/webhooks. Auto-keywords from landing page."
            tag="14-day trial"
          />
          <ToolCard
            name="Buska"
            href="https://www.buska.io/pricing"
            description="Broadest coverage: 16–33+ sources incl. Pinterest, Telegram, WhatsApp. AI Reply Studio, ICP profiles. API-only pricing available ($50/1K credits)."
            tag="from $49/mo"
          />
          <ToolCard
            name="Syften"
            href="https://syften.com"
            description="Reddit/HN focused. Boolean filters, Slack-first, <1 min delivery. Solid but basic — no AI scoring or drafts."
            tag="from $20/mo"
            dimmed
          />
          <ToolCard
            name="Alertmouse"
            href="https://alertmouse.com"
            description='By Rand Fishkin (Moz/SparkToro). "What Google Alerts should be" — social + web, better filtering.'
            tag="$10/mo"
          />
          <ToolCard
            name="Octolens"
            href="https://octolens.com"
            description="Only credible LinkedIn keyword monitoring with API/webhook/MCP. Pricey but fills a real gap."
            tag="$119/mo"
          />
          <ToolCard
            name="F5Bot"
            href="https://f5bot.com"
            description="Free Reddit/HN/Lobsters alerts. Already integrated — pipes via Resend inbound webhook into the Reddit room. Manage keywords at f5bot.com/dash."
            tag="free ✓"
          />
          <ToolCard
            name="Reddit Insights"
            href="https://chromewebstore.google.com/detail/reddit-insights/oehlhkdmigpcpcjkpfklbmnppiddhgfi"
            description="Chrome extension that shows account age, karma, and activity inline on any Reddit profile/post — spot the bad eggs (brand-new low-karma accounts, karma farmers) before engaging. Manual vet for now until we wire author trust signals into the feed."
            tag="Chrome · free"
          />
        </div>
      </section>
    </div>
  );
}

function ToolCard({
  name,
  href,
  description,
  tag,
  dimmed,
}: {
  name: string;
  href: string;
  description: string;
  tag: string;
  dimmed?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`group rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground group-hover:underline">
          {name} ↗
        </span>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tag}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </a>
  );
}
