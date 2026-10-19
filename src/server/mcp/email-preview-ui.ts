import "server-only";
import { growthResultSummary } from "@/lib/growth-result-summary";
import { widgetDocument } from "./widget-shell";
import { GROWTH_PUBLIC_ORIGIN } from "./config";

export const EMAIL_PREVIEW_HTML = widgetDocument(
  "growth-email",
  String.raw`
.email-meta{padding:16px;border-bottom:1px solid var(--line)}.email-meta h2{font-size:17px;margin:8px 0}.email-facts{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.email-stage{overflow:hidden;background:#f7f7f7}.email-viewport{margin:0 auto;overflow:hidden;max-width:100%;height:640px}.email-frame{display:block;border:0;transform-origin:top left;height:640px}.email-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}.email-toolbar button{font-size:11px;padding:5px 9px}.email-toolbar .devices{display:flex;gap:4px}.email-toolbar [aria-pressed=true]{background:var(--soft);font-weight:600}.email-footer{padding:12px 16px;border-top:1px solid var(--line)}.email-footer p{font-size:11px;color:var(--muted);margin-bottom:8px}.email-expanded{position:fixed;inset:0;z-index:10;overflow:auto;background:var(--bg)}.email-expanded .email-viewport{height:calc(100vh - 65px)}
`,
  `var project=${growthResultSummary.toString()},growthOrigin=${JSON.stringify(GROWTH_PUBLIC_ORIGIN)};` +
    String.raw`
var emailObserver=null;
function render(value){
 if(emailObserver)emailObserver.disconnect();
 var summary=project('email',value),data=value&&value.data||{},preview=data.preview||{};
 var card=el('section','panel');card.setAttribute('aria-label','Email preview');
 var meta=el('header','email-meta');meta.appendChild(el('p','muted small',summary.description));meta.appendChild(el('h2','',summary.title));
 var facts=el('div','email-facts');summary.facts.forEach(function(fact){facts.appendChild(el('span','badge',fact))});meta.appendChild(facts);card.appendChild(meta);
 if(preview.html){
 var toolbar=el('div','email-toolbar'),devices=el('div','devices'),phone=el('button','','Phone'),desktop=el('button','','Desktop'),expand=el('button','','Expand preview');
 [phone,desktop,expand].forEach(function(b){b.type='button'});devices.append(phone,desktop);toolbar.append(devices,expand);card.appendChild(toolbar);
 var stage=el('div','email-stage'),viewport=el('div','email-viewport'),frame=el('iframe','email-frame');frame.title='Rendered email';frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');
 // Tool HTML is isolated from the widget and host, including edited simulator payloads.
 var policy='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' https://fonts.googleapis.com; img-src https: data:; font-src https: data:; form-action \'none\'; base-uri \'none\'">';
 frame.srcdoc=String(preview.html).replace(/<head[^>]*>/i,function(head){return head+policy});viewport.appendChild(frame);stage.appendChild(viewport);card.appendChild(stage);
 var width=375;function resize(){var available=stage.clientWidth,scale=Math.min(1,available/width);viewport.style.width=Math.min(width,available)+'px';frame.style.width=width+'px';frame.style.height=(card.classList.contains('email-expanded')?Math.max(400,window.innerHeight-65):640)/scale+'px';frame.style.transform='scale('+scale+')';phone.setAttribute('aria-pressed',String(width===375));desktop.setAttribute('aria-pressed',String(width===680))}
 phone.onclick=function(){width=375;resize()};desktop.onclick=function(){width=680;resize()};expand.onclick=function(){card.classList.toggle('email-expanded');expand.textContent=card.classList.contains('email-expanded')?'Close expanded preview':'Expand preview';resize()};
 emailObserver=new ResizeObserver(resize);emailObserver.observe(stage);
 }
 var footer=el('footer','email-footer');(preview.warnings||[]).forEach(function(w){footer.appendChild(el('p','',w))});var open=el('button','','Open email in Growth');open.type='button';open.onclick=function(){window.parent.postMessage({jsonrpc:'2.0',id:'open-'+(++seq),method:'ui/open-link',params:{url:new URL(summary.href,growthOrigin).href}},'*')};footer.appendChild(open);card.appendChild(footer);root.appendChild(card);
 if(!preview.html)meta.appendChild(el('p','sub','Full preview unavailable. Open the email in Growth.'));
}
`,
);
