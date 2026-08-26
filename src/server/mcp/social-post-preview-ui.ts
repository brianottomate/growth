import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";

export const SOCIAL_POST_PREVIEW_URI =
  "ui://wander-growth/social-post-preview/v1.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export const SOCIAL_POST_PREVIEW_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{color-scheme:light dark;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}html,body{margin:0;min-width:0;background:transparent;color:light-dark(#111827,#f8fafc)}body{padding:12px}#root{display:grid;gap:12px}.heading{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:2px 2px 0}.eyebrow{margin:0 0 3px;color:light-dark(#6b7280,#94a3b8);font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}h1{margin:0;font-size:17px;line-height:1.2;letter-spacing:-.02em}.count{flex:none;border:1px solid light-dark(#e5e7eb,#334155);border-radius:999px;padding:4px 8px;color:light-dark(#4b5563,#cbd5e1);font-size:11px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,292px),1fr));gap:12px;align-items:start}.post{overflow:hidden;border:1px solid light-dark(#e5e7eb,#334155);border-radius:18px;background:#fff;color:#111827;box-shadow:0 10px 28px rgba(15,23,42,.08)}.post-head{display:flex;align-items:center;gap:9px;padding:12px 13px 10px}.avatar{display:grid;width:34px;height:34px;flex:none;place-items:center;overflow:hidden;border-radius:50%;background:linear-gradient(135deg,#dbeafe,#ede9fe);color:#4338ca;font-size:13px;font-weight:800}.avatar img{width:100%;height:100%;object-fit:cover}.identity{min-width:0;flex:1}.name,.handle{overflow:hidden;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.name{font-size:13px;font-weight:750}.handle{color:#6b7280;font-size:11px}.platform{display:grid;width:25px;height:25px;flex:none;place-items:center;border-radius:8px;background:#111827;color:#fff;font-size:12px;font-weight:800}.platform.instagram{background:radial-gradient(circle at 30% 110%,#ffd600 0 24%,#ff7a00 25% 43%,#ff0169 44% 62%,#d300c5 63% 78%,#7638fa 79%)}.copy,.caption{padding:0 13px 12px;font-size:13px;line-height:1.46;white-space:pre-wrap;overflow-wrap:anywhere}.caption{font-size:12.5px}.caption strong{margin-right:5px}.url{color:#2563eb}.media{position:relative;overflow:hidden;border-top:1px solid #eef0f3;background:#f3f4f6}.post.instagram .media{aspect-ratio:1/1}.post.x .media{margin:0 13px 2px;aspect-ratio:16/9;border:1px solid #e5e7eb;border-radius:14px}.media img{width:100%;height:100%;display:block;object-fit:cover}.media img.failed{display:none}.media:has(img.failed)::after{content:"Media preview unavailable";position:absolute;inset:0;display:grid;place-items:center;color:#9ca3af;font-size:12px}.actions{display:flex;align-items:center;justify-content:space-between;padding:11px 14px 9px;color:#4b5563}.actions span{font-size:18px;line-height:1}.status{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #f0f1f3;padding:9px 13px 10px;color:#6b7280;font-size:10.5px}.status-badge{border-radius:999px;background:#ecfdf5;padding:3px 7px;color:#047857;font-weight:700;text-transform:capitalize}.empty{border:1px dashed light-dark(#d1d5db,#475569);border-radius:16px;padding:30px 18px;color:light-dark(#6b7280,#94a3b8);text-align:center}@media(max-width:420px){body{padding:8px}.grid{gap:10px}}
  </style>
</head>
<body>
  <main id="root"><div class="empty">Preparing social post previews…</div></main>
  <script>
    (function(){
      var root=document.getElementById("root"),initialized=false,initializeId="wander-social-preview-init";
      function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined&&text!==null)node.textContent=String(text);return node}
      function addCopy(target,value){String(value||"").split(/(https?:\/\/\S+)/g).forEach(function(part){target.appendChild(el("span",/^https?:\/\//.test(part)?"url":"",part))})}
      function formatTime(value){if(!value)return"Date not set";var date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(date)}
      function identity(post){return post.channel.displayName||post.brand.name||"Brand"}
      function handle(post){var value=post.channel.handle||"";return value?(value.charAt(0)==="@"?value:"@"+value):post.platform}
      function addHeader(card,post){var header=el("div","post-head"),avatar=el("div","avatar",identity(post).slice(0,1).toUpperCase()),details=el("div","identity"),platform=el("div","platform "+post.platform,post.platform==="instagram"?"◎":post.platform==="x"?"X":post.platform.slice(0,2).toUpperCase());if(post.brand.logo&&/^https:\/\//.test(post.brand.logo)){var logo=document.createElement("img");logo.src=post.brand.logo;logo.alt="";logo.addEventListener("error",function(){logo.remove()});avatar.textContent="";avatar.appendChild(logo)}details.appendChild(el("div","name",identity(post)));details.appendChild(el("div","handle",handle(post)));header.appendChild(avatar);header.appendChild(details);header.appendChild(platform);card.appendChild(header)}
      function addMedia(card,post){var media=post.media&&post.media[0];if(!media)return;var source=media.type==="video"&&media.thumbnail?media.thumbnail:media.url;if(!/^https:\/\//.test(source||""))return;var frame=el("div","media"),image=document.createElement("img");image.src=source;image.alt="";image.addEventListener("error",function(){image.className="failed"});frame.appendChild(image);card.appendChild(frame)}
      function addActions(card,platform){var actions=el("div","actions"),icons=platform==="instagram"?["♡","◯","⌁","▱"]:["◯","↻","♡","⇧"];icons.forEach(function(icon){actions.appendChild(el("span","",icon))});card.appendChild(actions)}
      function addStatus(card,post){var status=el("div","status");status.appendChild(el("span","status-badge",post.status));status.appendChild(el("span","",formatTime(post.scheduledAt||post.publishedAt)));card.appendChild(status)}
      function buildCard(post){var card=el("article","post "+post.platform);addHeader(card,post);if(post.platform==="instagram"){addMedia(card,post);addActions(card,post.platform);var caption=el("div","caption");caption.appendChild(el("strong","",handle(post).replace(/^@/,"")));addCopy(caption,post.text);card.appendChild(caption)}else{var copy=el("div","copy");addCopy(copy,post.text);card.appendChild(copy);addMedia(card,post);addActions(card,post.platform)}addStatus(card,post);return card}
      function render(payload){var posts=payload&&payload.data&&Array.isArray(payload.data.posts)?payload.data.posts:null;if(!posts)return;root.textContent="";var heading=el("header","heading"),titles=el("div","");titles.appendChild(el("p","eyebrow","Wander Growth preview"));titles.appendChild(el("h1","","Social posts"));heading.appendChild(titles);heading.appendChild(el("span","count",posts.length+(posts.length===1?" post":" posts")));root.appendChild(heading);var grid=el("section","grid");posts.forEach(function(post){grid.appendChild(buildCard(post))});root.appendChild(grid)}
      window.addEventListener("openai:set_globals",function(event){var globals=event.detail&&event.detail.globals;if(globals&&globals.toolOutput)render(globals.toolOutput)});
      window.addEventListener("message",function(event){var message=event.data;if(!message||message.jsonrpc!=="2.0")return;if(message.id===initializeId&&message.result){initialized=true;var theme=message.result.hostContext&&message.result.hostContext.theme;if(theme)document.documentElement.dataset.theme=theme;window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*")}if(message.method==="ui/notifications/tool-result")render(message.params&&message.params.structuredContent)});
      if(window.openai&&window.openai.toolOutput)render(window.openai.toolOutput);
      window.parent.postMessage({jsonrpc:"2.0",id:initializeId,method:"ui/initialize",params:{appInfo:{name:"wander-growth-social-post-preview",version:"1.0.0"},appCapabilities:{availableDisplayModes:["inline"]},protocolVersion:"2026-01-26"}},"*");
      if(typeof ResizeObserver!=="undefined")new ResizeObserver(function(){if(initialized)window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}},"*")}).observe(document.documentElement);
    })();
  </script>
</body>
</html>`;

export function registerSocialPostPreviewResource(
  server: McpServer,
  resourceDomains: string[],
) {
  server.registerResource(
    "social-post-preview",
    SOCIAL_POST_PREVIEW_URI,
    {
      title: "Social post previews",
      description:
        "Platform-aware visual previews for Wander Growth social posts.",
      mimeType: MCP_APP_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: SOCIAL_POST_PREVIEW_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: SOCIAL_POST_PREVIEW_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains },
            },
            "openai/widgetDescription":
              "Shows selected Wander Growth posts as familiar platform previews with copy, media, handle, status, and scheduled time.",
          },
        },
      ],
    }),
  );
}
