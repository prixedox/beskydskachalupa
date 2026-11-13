import { escapeHtml } from '../escape-html.js';

export { escapeHtml };

export function renderPanel(root, view, on) {
  const { tour, currentId, mode, warnings, status } = view;
  const current = tour.rooms.find((r) => r.id === currentId);
  const names = Object.fromEntries(tour.rooms.map((r) => [r.id, r.name]));
  const targets = tour.rooms.filter((r) => r.id !== currentId);

  root.innerHTML = `
    <h2>Editor prohlídky</h2>
    <label>Název prohlídky <input data-field="title" value="${escapeHtml(tour.title)}" /></label>
    <section>
      <h3>Místnosti</h3>
      <ul class="editor-rooms">
        ${tour.rooms.map((r) => `
          <li><button data-action="select" data-id="${escapeHtml(r.id)}" class="${r.id === currentId ? 'is-current' : ''}">
            ${escapeHtml(r.name)}${r.id === tour.start ? ' ★' : ''}
          </button></li>`).join('')}
      </ul>
    </section>
    <section>
      <h3>${escapeHtml(current.name)}</h3>
      <label>Název <input data-field="name" value="${escapeHtml(current.name)}" /></label>
      <label>Panorama <input data-field="pano" value="${escapeHtml(current.pano)}" /></label>
      <label class="editor-check"><input type="checkbox" data-action="start" ${current.id === tour.start ? 'checked disabled' : ''} /> Výchozí místnost</label>
      <div class="editor-row">
        <select data-field="target">
          ${targets.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('')}
        </select>
        <label class="editor-check"><input type="checkbox" data-field="reverse" checked /> i zpětný</label>
      </div>
      <div class="editor-row">
        <button data-action="add-link">Přidat průchod</button>
        <button data-action="plan">Umístit na plán</button>
        <button data-action="north">Nastavit sever</button>
      </div>
      <ul class="editor-links">
        ${current.links.map((l) => `
          <li>
            → ${escapeHtml(names[l.to])}${l.yaw === null ? ' <em>(neumístěno)</em>' : ''}
            <button data-action="move" data-id="${escapeHtml(l.to)}">Přesunout</button>
            <button data-action="remove" data-id="${escapeHtml(l.to)}">Smazat</button>
          </li>`).join('') || '<li><em>Žádné průchody</em></li>'}
      </ul>
    </section>
    ${mode ? `<p class="editor-status">${escapeHtml(status)} <button data-action="cancel">Zrušit</button></p>` : status ? `<p class="editor-status">${escapeHtml(status)}</p>` : ''}
    <section>
      <h3>Kontrola</h3>
      <ul class="editor-warnings">
        ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('') || '<li>Vše v pořádku</li>'}
      </ul>
    </section>
    <div class="editor-row">
      <button data-action="export">Export tour.json</button>
      <label class="editor-file">Import <input type="file" accept="application/json,.json" data-field="import" /></label>
      <button data-action="discard">Zahodit koncept</button>
    </div>`;

  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      switch (btn.dataset.action) {
        case 'select': return on.selectRoom(id);
        case 'add-link': {
          const toId = root.querySelector('[data-field="target"]').value;
          const reverse = root.querySelector('[data-field="reverse"]').checked;
          return toId ? on.startAddLink(toId, reverse) : undefined;
        }
        case 'move': return on.startMoveLink(id);
        case 'remove': return on.removeLink(id);
        case 'plan': return on.startPlan();
        case 'north': return on.setNorth();
        case 'cancel': return on.cancel();
        case 'export': return on.exportJson();
        case 'discard': return on.discardDraft();
      }
    });
  });
  root.querySelector('[data-action="start"]').addEventListener('change', () => on.setStart());
  root.querySelector('[data-field="name"]').addEventListener('change', (e) => on.rename(e.target.value.trim()));
  root.querySelector('[data-field="title"]').addEventListener('change', (e) => on.setTitle(e.target.value.trim()));
  root.querySelector('[data-field="pano"]').addEventListener('change', (e) => on.setPano(e.target.value.trim()));
  root.querySelector('[data-field="import"]').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) on.importJson(file);
  });
}
