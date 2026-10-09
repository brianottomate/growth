import "server-only";
import { growthResultSummary } from "@/lib/growth-result-summary";
import { GROWTH_PUBLIC_ORIGIN } from "./config";
import { widgetDocument } from "./widget-shell";

export function compactResultDocument(kind: string) {
  return widgetDocument(
    `growth-${kind}`,
    String.raw`
.compact{border:1px solid var(--line);border-radius:12px;background:var(--bg);padding:12px;font-size:12px}.compact h3{font-size:12px;font-weight:600}.compact .description,.compact .detail,.compact .note{color:var(--muted);margin-top:4px}.compact .facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.compact .facts span{background:var(--soft);padding:4px 8px;border-radius:6px}.compact .row{display:flex;align-items:flex-start;gap:12px;margin-top:12px}.compact .thumb{width:48px;height:48px;border-radius:8px;object-fit:cover;flex:none}.compact .copy{flex:1;min-width:0}.compact .title,.compact .detail{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.compact .nav{font-size:12px;padding:0;border:0;border-radius:0;background:transparent;text-decoration:underline;text-underline-offset:2px;margin-top:8px}.compact .choice{margin-top:8px;font-size:12px}.compact .note{margin-top:12px}
`,
    `var project=${growthResultSummary.toString()};var kind=${JSON.stringify(kind)},growthOrigin=${JSON.stringify(GROWTH_PUBLIC_ORIGIN)};` +
      String.raw`
function navigation(path){var button=el('button','nav','Open in Growth');button.type='button';button.onclick=function(){var url=new URL(path,growthOrigin).toString();if(!mcpReady&&window.openai&&typeof window.openai.openExternal==='function'){window.openai.openExternal({href:url});return}window.parent.postMessage({jsonrpc:'2.0',id:'open-'+(++seq),method:'ui/open-link',params:{url:url}},'*')};return button}
function render(value){var summary=project(kind,value),card=el('section','compact');card.setAttribute('aria-label',summary.title);card.appendChild(el('h3','',summary.title));card.appendChild(el('p','description',summary.description));if(summary.facts.length){var facts=el('div','facts');summary.facts.forEach(function(f){facts.appendChild(el('span','',f))});card.appendChild(facts)}summary.rows.forEach(function(row){var item=el('article','row');if(row.thumbnail){var thumb=image(row.thumbnail,row.title);if(thumb){thumb.className='thumb';item.appendChild(thumb)}}var copy=el('div','copy');copy.appendChild(el('p','title',row.title));if(row.detail)copy.appendChild(el('p','detail',row.detail));if(row.href)copy.appendChild(navigation(row.href));item.appendChild(copy);card.appendChild(item)});if(summary.note)card.appendChild(el('p','note',summary.note));card.appendChild(navigation(summary.href));root.appendChild(card)}
`,
  );
}
