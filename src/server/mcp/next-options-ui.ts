import type { McpServer } from "@modelcontextprotocol/server";
export const NEXT_OPTIONS_URI = "ui://wander-growth/next-options/v1.html";
export const NEXT_OPTIONS_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark;font:14px system-ui}body{margin:0;padding:10px;background:transparent}#options{display:flex;flex-wrap:wrap;gap:8px}button,textarea{font:inherit;color:inherit;background:light-dark(#fff,#20242c);border:1px solid light-dark(#d1d5db,#596170);border-radius:10px;padding:10px}button{cursor:pointer}button:disabled{opacity:.5}textarea{display:block;box-sizing:border-box;width:100%;margin:10px 0}#status{font-size:12px}button:focus-visible,textarea:focus-visible{outline:2px solid #648cff;outline-offset:2px}</style></head><body><div id="options"></div><form id="edit" hidden><label for="draft">Add your details</label><textarea id="draft" rows="3"></textarea><button type="submit">Send message</button></form><p id="status" role="status"></p><script>
(function(){const root=document.getElementById('options'),form=document.getElementById('edit'),draft=document.getElementById('draft'),status=document.getElementById('status');let ready=false,pending=null,count=0;function send(text){if(!ready||pending)return;pending='send-'+(++count);status.textContent='Sending…';window.parent.postMessage({jsonrpc:'2.0',id:pending,method:'ui/message',params:{role:'user',content:[{type:'text',text}]}},'*')}function render(payload){const options=payload&&payload.data&&payload.data.options;if(!Array.isArray(options))return;root.replaceChildren();form.hidden=true;options.slice(0,3).forEach(o=>{if(typeof o.label!=='string'||typeof o.text!=='string')return;const b=document.createElement('button');b.textContent=(o.kind==='detail'?'✎ ':'')+o.label;b.onclick=()=>{if(o.kind==='detail'){form.hidden=false;draft.value=o.text;draft.focus()}else send(o.text)};root.appendChild(b)})}form.onsubmit=e=>{e.preventDefault();if(draft.value.trim())send(draft.value.trim())};window.addEventListener('message',e=>{if(e.source!==window.parent)return;const m=e.data;if(!m||m.jsonrpc!=='2.0')return;if(m.id==='init'&&m.result){ready=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*')}if(m.id===pending){pending=null;status.textContent=m.error?'Could not send. Try again.':'Message sent.'}if(m.method==='ui/notifications/tool-result')render(m.params&&m.params.structuredContent)});window.parent.postMessage({jsonrpc:'2.0',id:'init',method:'ui/initialize',params:{appInfo:{name:'growth-next-options',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}},'*')})();
</script></body></html>`;
export function registerNextOptionsResource(server: McpServer) {
  server.registerResource(
    "next-options",
    NEXT_OPTIONS_URI,
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: NEXT_OPTIONS_URI,
          mimeType: "text/html;profile=mcp-app",
          text: NEXT_OPTIONS_HTML,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription":
              "Contextual follow-ups. Detail choices open an editable draft before sending.",
          },
        },
      ],
    }),
  );
}
