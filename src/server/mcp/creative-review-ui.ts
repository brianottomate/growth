import "server-only";
import { growthResultSummary } from "@/lib/growth-result-summary";
import { GROWTH_PUBLIC_ORIGIN } from "./config";
import { widgetDocument } from "./widget-shell";

/**
 * The creative review card. The composition is the thing under review, so it
 * gets the card's width rather than a thumbnail beside a line; the ad's
 * headline and description sit under it the way Meta shows them.
 */
export const CREATIVE_REVIEW_URI = "ui://wander-growth/creative-review/v2.html";

export const CREATIVE_REVIEW_HTML = widgetDocument(
  "growth-creative",
  String.raw`
body{padding:4px}#handoff:empty{display:none}.creative{overflow:hidden}.creative-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 14px}.creative-head .eyebrow{margin:0 0 5px}.creative-head h1{font-size:19px}.creative-badges{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;flex:none;padding-top:2px}.creative-stage{display:grid;place-items:center;padding:0 20px 16px}.creative-image{display:block;width:100%;max-width:440px;aspect-ratio:1;object-fit:cover;border-radius:14px;border:1px solid var(--line);background:var(--soft)}.image-fallback{width:100%;max-width:440px;aspect-ratio:1;display:grid;place-items:center;border:1px dashed var(--line);border-radius:14px;color:var(--muted);font-size:12px}.creative-meta{padding:0 20px 14px}.creative-headline{font-size:13px;font-weight:600}.creative-description{margin-top:3px;color:var(--muted);font-size:12px}.creative-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;background:var(--soft);border-top:1px solid var(--line)}.creative-campaign{min-width:0;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.creative-open{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:550;padding:9px 13px;border-radius:9px;white-space:nowrap}.creative-open .icon{display:inline-flex}.creative-open svg{width:14px;height:14px;transform:rotate(-45deg)}@media(max-width:360px){.creative-head{padding:16px 16px 12px}.creative-stage{padding:0 16px 14px}.creative-meta{padding:0 16px 12px}.creative-actions{padding:12px 16px}}`,
  `var project=${growthResultSummary.toString()},growthOrigin=${JSON.stringify(GROWTH_PUBLIC_ORIGIN)};` +
    String.raw`
function navigate(path,label){var button=el('button','creative-open primary');button.type='button';button.appendChild(el('span','action-label',label||'View creative'));button.appendChild(icon('arrow'));button.onclick=function(){var url=new URL(path,growthOrigin).toString();if(!mcpReady&&window.openai&&typeof window.openai.openExternal==='function'){window.openai.openExternal({href:url});return}window.parent.postMessage({jsonrpc:'2.0',id:'open-'+(++seq),method:'ui/open-link',params:{url:url}},'*')};return button}
function render(value){var summary=project('creative',value),row=summary.rows[0]||{},panel=el('section','panel creative');panel.setAttribute('aria-label',summary.title);
var head=el('div','creative-head'),copy=el('div','');copy.appendChild(el('p','eyebrow','Wander Growth · Creative'));copy.appendChild(el('h1','',summary.title));head.appendChild(copy);if(summary.facts.length){var badges=el('div','creative-badges');summary.facts.forEach(function(fact){badges.appendChild(badge(fact))});head.appendChild(badges)}panel.appendChild(head);
if(row.thumbnail){var stage=el('div','creative-stage'),img=image(row.thumbnail,summary.title);if(img){img.className='creative-image';stage.appendChild(img);panel.appendChild(stage)}}
var meta=el('div','creative-meta');meta.appendChild(el('p','creative-headline',summary.description));if(row.detail)meta.appendChild(el('p','creative-description',row.detail));panel.appendChild(meta);
var actions=el('div','creative-actions');actions.appendChild(el('span','creative-campaign',row.title||'Not in a campaign'));actions.appendChild(navigate(summary.href,summary.linkLabel));panel.appendChild(actions);root.appendChild(panel)}
`,
);
