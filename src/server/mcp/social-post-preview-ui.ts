import "server-only";
import { GROWTH_PUBLIC_ORIGIN } from "./config";
import { widgetDocument } from "./widget-shell";
export const SOCIAL_POST_PREVIEW_URI =
  "ui://wander-growth/social-post-preview/v1.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const SOCIAL_POST_PREVIEW_HTML = widgetDocument(
  "growth-social-post-preview",
  String.raw`
.summary{border:1px solid var(--line);border-radius:12px;background:var(--bg);padding:12px}.summary-title{font-size:12px;font-weight:600;margin-bottom:12px}.posts{display:grid;gap:12px}.post{display:flex;align-items:flex-start;gap:12px;min-width:0}.thumb{width:48px;height:48px;object-fit:cover;border-radius:8px;flex:none}.post-copy{min-width:0;flex:1}.post-label{font-size:12px;font-weight:600}.excerpt{font-size:12px;color:var(--muted);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.open-post{font-size:12px;border:0;border-radius:0;background:transparent;padding:0;margin-top:4px;text-decoration:underline;text-underline-offset:2px}
`,
  `var growthOrigin=${JSON.stringify(GROWTH_PUBLIC_ORIGIN)};` +
    String.raw`
function render(value){var posts=value&&value.data&&value.data.posts;if(!Array.isArray(posts)||!posts.length){empty('No social posts','Choose exact posts to preview.');return}var summary=el('section','summary');summary.setAttribute('aria-label','Social posts');summary.appendChild(el('p','summary-title',posts.length+' social '+(posts.length===1?'post':'posts')));var list=el('div','posts');posts.forEach(function(post){var row=el('article','post'),first=(post.media||[])[0],source=first&&(first.thumbnail||(first.type!=='video'?first.url:null)),thumb=image(source,post.brand.name+' creative');if(thumb){thumb.className='thumb';row.appendChild(thumb)}var copy=el('div','post-copy');copy.appendChild(el('p','post-label',(post.platform==='x'?'X':post.platform)+' · '+String(post.status).replace(/_/g,' ')));copy.appendChild(el('p','excerpt',post.text||'No caption yet'));var open=el('button','open-post','Open in Growth');open.type='button';open.onclick=function(){var href=typeof post.href==='string'&&post.href.indexOf('/app/')===0?post.href:'/app/feed-v5';var url=new URL(href,growthOrigin).toString();if(!mcpReady&&window.openai&&typeof window.openai.openExternal==='function'){window.openai.openExternal({href:url});return}window.parent.postMessage({jsonrpc:'2.0',id:'open-'+(++seq),method:'ui/open-link',params:{url:url}},'*')};copy.appendChild(open);row.appendChild(copy);list.appendChild(row)});summary.appendChild(list);root.appendChild(summary)}
`,
);
