import{G as e,W as t,i as n,n as r,r as i,t as a}from"./index-xdJQaCX2.js";var o=(e,t)=>Number(e.toFixed(t)),s=e=>Math.min(1,Math.max(0,e));function c(e,t){if(!e.rooms.some(e=>e.id===t))throw Error(`Neznámá místnost: ${t}`)}function l(e,t,n){return c(e,t),{...e,rooms:e.rooms.map(e=>e.id===t?n(e):e)}}function u(e,t,n,{yaw:r,pitch:i},{reverse:a=!1}={}){if(t===n)throw Error(`Průchod nemůže vést do stejné místnosti.`);c(e,n);let o=l(e,t,e=>({...e,links:[...e.links.filter(e=>e.to!==n),{to:n,yaw:r,pitch:i}]}));return a&&(o=l(o,n,e=>e.links.some(e=>e.to===t)?e:{...e,links:[...e.links,{to:t,yaw:null,pitch:0}]})),o}function d(e,t,n){return l(e,t,e=>({...e,links:e.links.filter(e=>e.to!==n)}))}function f(e,t,n,{yaw:r,pitch:i}){return l(e,t,e=>({...e,links:e.links.map(e=>e.to===n?{...e,yaw:r,pitch:i}:e)}))}function p(e,t,[n,r]){return l(e,t,e=>({...e,planPos:[s(n),s(r)]}))}function m(e,t,n){return l(e,t,e=>({...e,northOffset:i(-n)}))}function h(e,t,n){let r={};for(let e of[`name`,`pano`,`preview`])typeof n[e]==`string`&&n[e].length>0&&(r[e]=n[e]);return l(e,t,e=>({...e,...r}))}function g(e,t){return c(e,t),{...e,start:t}}function _(e,t){let n=typeof t==`string`?t.trim():``;return n?{...e,title:n}:e}function v(e){let t=Object.fromEntries(e.rooms.map(e=>[e.id,e.name])),n=[];for(let r of e.rooms)for(let e of r.links)e.yaw===null&&n.push(`Místnost ${r.name}: průchod do ${t[e.to]} nemá umístění`);for(let t of e.rooms)t.links.length===0&&n.push(`Místnost ${t.name} nemá žádný průchod`);for(let r of e.rooms)for(let i of r.links)e.rooms.find(e=>e.id===i.to)?.links.some(e=>e.to===r.id)||n.push(`Průchod ${r.name} → ${t[i.to]} nemá zpětný průchod`);if(e.plan)for(let t of e.rooms)t.planPos||n.push(`Místnost ${t.name} není umístěna na plánu`);return n}function y(e){return{title:e.title,start:e.start,plan:e.plan,rooms:e.rooms.map(e=>({id:e.id,name:e.name,pano:e.pano,...e.preview?{preview:e.preview}:{},...e.planPos?{planPos:e.planPos.map(e=>o(e,4))}:{},...e.floor?{floor:e.floor}:{},northOffset:o(e.northOffset,3),...e.startYaw?{startYaw:o(e.startYaw,3)}:{},...e.fixedView?{fixedView:!0}:{},links:e.links.map(e=>e.yaw===null?{to:e.to,pitch:o(e.pitch,3)}:{to:e.to,yaw:o(e.yaw,3),pitch:o(e.pitch,3)})})),exterior:e.exterior}}var b=e=>`tour-edit:${e}`;function x(t,n){try{let r=t.getItem(b(n));return r?e(JSON.parse(r)).tour:null}catch{return null}}function S(e,t,n){try{return e.setItem(b(t),JSON.stringify(n)),!0}catch{return!1}}function C(e,t){try{e.removeItem(b(t))}catch{}}function w(e,t,r){let{tour:i,currentId:a,mode:o,warnings:s,status:c}=t,l=i.rooms.find(e=>e.id===a),u=Object.fromEntries(i.rooms.map(e=>[e.id,e.name])),d=i.rooms.filter(e=>e.id!==a);e.innerHTML=`
    <h2>Editor prohlídky</h2>
    <label>Název prohlídky <input data-field="title" value="${n(i.title)}" /></label>
    <section>
      <h3>Místnosti</h3>
      <ul class="editor-rooms">
        ${i.rooms.map(e=>`
          <li><button data-action="select" data-id="${n(e.id)}" class="${e.id===a?`is-current`:``}">
            ${n(e.name)}${e.id===i.start?` ★`:``}
          </button></li>`).join(``)}
      </ul>
    </section>
    <section>
      <h3>${n(l.name)}</h3>
      <label>Název <input data-field="name" value="${n(l.name)}" /></label>
      <label>Panorama <input data-field="pano" value="${n(l.pano)}" /></label>
      <label class="editor-check"><input type="checkbox" data-action="start" ${l.id===i.start?`checked disabled`:``} /> Výchozí místnost</label>
      <div class="editor-row">
        <select data-field="target">
          ${d.map(e=>`<option value="${n(e.id)}">${n(e.name)}</option>`).join(``)}
        </select>
        <label class="editor-check"><input type="checkbox" data-field="reverse" checked /> i zpětný</label>
      </div>
      <div class="editor-row">
        <button data-action="add-link">Přidat průchod</button>
        <button data-action="plan">Umístit na plán</button>
        <button data-action="north">Nastavit sever</button>
      </div>
      <ul class="editor-links">
        ${l.links.map(e=>`
          <li>
            → ${n(u[e.to])}${e.yaw===null?` <em>(neumístěno)</em>`:``}
            <button data-action="move" data-id="${n(e.to)}">Přesunout</button>
            <button data-action="remove" data-id="${n(e.to)}">Smazat</button>
          </li>`).join(``)||`<li><em>Žádné průchody</em></li>`}
      </ul>
    </section>
    ${o?`<p class="editor-status">${n(c)} <button data-action="cancel">Zrušit</button></p>`:c?`<p class="editor-status">${n(c)}</p>`:``}
    <section>
      <h3>Kontrola</h3>
      <ul class="editor-warnings">
        ${s.map(e=>`<li>${n(e)}</li>`).join(``)||`<li>Vše v pořádku</li>`}
      </ul>
    </section>
    <div class="editor-row">
      <button data-action="export">Export tour.json</button>
      <label class="editor-file">Import <input type="file" accept="application/json,.json" data-field="import" /></label>
      <button data-action="discard">Zahodit koncept</button>
    </div>`,e.querySelectorAll(`button[data-action]`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.id;switch(t.dataset.action){case`select`:return r.selectRoom(n);case`add-link`:{let t=e.querySelector(`[data-field="target"]`).value,n=e.querySelector(`[data-field="reverse"]`).checked;return t?r.startAddLink(t,n):void 0}case`move`:return r.startMoveLink(n);case`remove`:return r.removeLink(n);case`plan`:return r.startPlan();case`north`:return r.setNorth();case`cancel`:return r.cancel();case`export`:return r.exportJson();case`discard`:return r.discardDraft()}})}),e.querySelector(`[data-action="start"]`).addEventListener(`change`,()=>r.setStart()),e.querySelector(`[data-field="name"]`).addEventListener(`change`,e=>r.rename(e.target.value.trim())),e.querySelector(`[data-field="title"]`).addEventListener(`change`,e=>r.setTitle(e.target.value.trim())),e.querySelector(`[data-field="pano"]`).addEventListener(`change`,e=>r.setPano(e.target.value.trim())),e.querySelector(`[data-field="import"]`).addEventListener(`change`,e=>{let t=e.target.files?.[0];t&&r.importJson(t)})}function T(){try{return window.localStorage}catch{return{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}}}function E({houseId:n,baseUrl:i,tour:o,container:s,headerEl:c}){let l=T(),b=x(l,n),E=o;b&&JSON.stringify(y(b))!==JSON.stringify(y(o))&&window.confirm(`Máte rozpracovanou verzi prohlídky. Obnovit ji?`)&&(E=b),a(c,`Editor – ${E.title}`),document.body.classList.add(`is-editing`);let D=document.createElement(`aside`);D.className=`editor-panel`,document.body.append(D);let O={currentId:E.start,mode:null,target:null,reverse:!0,moveTarget:null,status:``},k=r({container:s,tour:E,baseUrl:i,startRoom:E.start,onRoomChange:e=>{O.currentId=e,L()}});function A(e,t=``){E=e,S(l,n,E),O.mode=null,O.status=t,a(c,`Editor – ${E.title}`),k.reload(E,O.currentId),L()}function j(e,t){try{A(e(),t)}catch(e){O.status=e.message,L()}}function M(e,t){O.mode=e,O.status=t,L()}k.viewer.addEventListener(`click`,({data:e})=>{if(e.rightclick)return;let t={yaw:e.yaw,pitch:e.pitch};O.mode===`add-link`?j(()=>u(E,O.currentId,O.target,t,{reverse:O.reverse}),`Průchod přidán.`):O.mode===`move-link`&&j(()=>f(E,O.currentId,O.moveTarget,t),`Průchod přesunut.`)});function N(){if(!E.plan){O.status=`Prohlídka nemá plán (spusťte render-plan).`,L();return}let e=document.createElement(`div`);e.className=`plan-picker`;let t=document.createElement(`img`);t.src=i+E.plan.image,t.alt=`Plán`;let n=document.createElement(`div`);n.className=`plan-picker__wrap`,n.append(t);for(let e of E.rooms){if(!e.planPos)continue;let t=document.createElement(`span`);t.className=`plan-picker__dot${e.id===O.currentId?` is-current`:``}`,t.style.left=`${e.planPos[0]*100}%`,t.style.top=`${e.planPos[1]*100}%`,t.title=e.name,n.append(t)}let r=()=>{e.remove(),O.mode=null,L()};t.addEventListener(`click`,n=>{let r=t.getBoundingClientRect(),i=[(n.clientX-r.left)/r.width,(n.clientY-r.top)/r.height];e.remove(),j(()=>p(E,O.currentId,i),`Pozice na plánu uložena.`)}),e.addEventListener(`click`,t=>{t.target===e&&r()}),e.append(n),document.body.append(e)}function P(){let e=new Blob([JSON.stringify(y(E),null,2)+`
`],{type:`application/json`}),t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`tour.json`,t.click(),setTimeout(()=>URL.revokeObjectURL(t.href),1e3),O.status=`Uloženo. Soubor nahraďte v public/houses/${n}/tour.json.`,L()}async function F(n){try{let{tour:t}=e(JSON.parse(await n.text()));O.currentId=t.start,A(t,`Importováno.`)}catch(e){O.status=e instanceof t?e.message:`Soubor není platný JSON.`,L()}}let I={selectRoom:e=>k.tour.setCurrentNode(e),setTitle:e=>j(()=>_(E,e)),setPano:e=>j(()=>h(E,O.currentId,{pano:e})),rename:e=>j(()=>h(E,O.currentId,{name:e})),setStart:()=>j(()=>g(E,O.currentId),`Výchozí místnost nastavena.`),startAddLink:(e,t)=>{O.target=e,O.reverse=t,M(`add-link`,`Klikněte v panoramatu na průchod.`)},startMoveLink:e=>{O.moveTarget=e,M(`move-link`,`Klikněte v panoramatu na novou pozici průchodu.`)},removeLink:e=>j(()=>d(E,O.currentId,e),`Průchod smazán.`),startPlan:()=>{M(`plan`,`Klikněte na plánu na pozici místnosti.`),N()},setNorth:()=>j(()=>m(E,O.currentId,k.viewer.getPosition().yaw),`Sever nastaven (pohled = horní strana plánu).`),cancel:()=>M(null,``),exportJson:P,importJson:F,discardDraft:()=>{window.confirm(`Zahodit rozpracované změny a načíst uloženou verzi?`)&&(C(l,n),O.currentId=o.start,E=o,a(c,`Editor – ${E.title}`),k.reload(E,O.currentId),O.status=`Koncept zahozen.`,L())}};function L(){E.rooms.some(e=>e.id===O.currentId)||(O.currentId=E.start),w(D,{tour:E,currentId:O.currentId,mode:O.mode,moveTarget:O.moveTarget,warnings:v(E),status:O.status},I)}L()}export{E as startEditor};