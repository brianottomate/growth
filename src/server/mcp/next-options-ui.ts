import { widgetDocument } from "./widget-shell";
export const NEXT_OPTIONS_URI = "ui://wander-growth/next-options/v1.html";
export const NEXT_OPTIONS_HTML = widgetDocument(
  "growth-next-options",
  String.raw`
.choices{display:flex;flex-wrap:wrap;gap:8px}.choice{font-size:12px;padding:7px 10px;border-radius:9px;text-align:left;max-width:100%;overflow-wrap:anywhere}.draft-form{border:1px solid var(--line);border-radius:12px;background:var(--soft);padding:12px;margin-top:12px}.draft-form[hidden]{display:none}.draft-form label{font-size:12px;font-weight:600}.draft-form textarea{display:block;resize:vertical;min-height:80px;width:100%;margin:8px 0 12px;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg);font-size:12px;line-height:1.6}.draft-form .row{display:flex;justify-content:space-between;gap:8px}.draft-form .row button{font-size:11px}
`,
  String.raw`
function render(value){var options=value&&value.data&&value.data.options;if(!Array.isArray(options)){empty('No follow-up choices','Useful next steps will appear after the response.');return}var choices=el('div','choices'),form=el('form','draft-form');form.hidden=true;var label=el('label','','Add your details');label.htmlFor='draft';var draft=el('textarea','');draft.id='draft';draft.rows=3;var controls=el('div','row'),cancel=el('button','','Cancel'),submit=el('button','primary','Send message');cancel.type='button';cancel.onclick=function(){form.hidden=true};submit.type='submit';submit.dataset.handoff='true';submit.disabled=!ready;controls.appendChild(cancel);controls.appendChild(submit);form.appendChild(label);form.appendChild(draft);form.appendChild(controls);form.onsubmit=function(event){event.preventDefault();if(draft.value.trim())send(draft.value.trim())};options.slice(0,3).forEach(function(option){var button=el('button','choice',option.label);button.type='button';if(option.kind!=='detail'){button.dataset.handoff='true';button.disabled=!ready||!!pending}button.onclick=function(){if(option.kind==='detail'){form.hidden=false;draft.value=option.text;draft.focus()}else send(option.text)};choices.appendChild(button)});root.appendChild(choices);root.appendChild(form);}
`,
);
