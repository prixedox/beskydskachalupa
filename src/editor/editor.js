import { createViewer } from '../viewer/viewer.js';
import { renderHeader } from '../viewer/ui.js';
import { validateTour, TourError } from '../tour-loader.js';
import {
  addLink, removeLink, moveLink, setPlanPos, setNorth, setRoomProps, setStart, setTitle, validate, toJSON,
} from './editor-state.js';
import { readDraft, writeDraft, clearDraft } from './draft.js';
import { renderPanel } from './editor-panel.js';

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

export function startEditor({ houseId, baseUrl, tour: served, container, headerEl }) {
  const storage = safeStorage();
  const draft = readDraft(storage, houseId);
  let tour = served;
  if (draft && JSON.stringify(toJSON(draft)) !== JSON.stringify(toJSON(served))
      && window.confirm('Máte rozpracovanou verzi prohlídky. Obnovit ji?')) {
    tour = draft;
  }

  renderHeader(headerEl, `Editor – ${tour.title}`);
  document.body.classList.add('is-editing');
  const panelEl = document.createElement('aside');
  panelEl.className = 'editor-panel';
  document.body.append(panelEl);

  const ui = { currentId: tour.start, mode: null, target: null, reverse: true, moveTarget: null, status: '' };
  const handle = createViewer({
    container,
    tour,
    baseUrl,
    startRoom: tour.start,
    onRoomChange: (id) => {
      ui.currentId = id;
      render();
    },
  });

  function commit(next, status = '') {
    tour = next;
    writeDraft(storage, houseId, tour);
    ui.mode = null;
    ui.status = status;
    renderHeader(headerEl, `Editor – ${tour.title}`);
    handle.reload(tour, ui.currentId);
    render();
  }

  function tryCommit(fn, status) {
    try {
      commit(fn(), status);
    } catch (e) {
      ui.status = e.message;
      render();
    }
  }

  function setMode(mode, status) {
    ui.mode = mode;
    ui.status = status;
    render();
  }

  handle.viewer.addEventListener('click', ({ data }) => {
    if (data.rightclick) return;
    const pos = { yaw: data.yaw, pitch: data.pitch };
    if (ui.mode === 'add-link') {
      tryCommit(() => addLink(tour, ui.currentId, ui.target, pos, { reverse: ui.reverse }), 'Průchod přidán.');
    } else if (ui.mode === 'move-link') {
      tryCommit(() => moveLink(tour, ui.currentId, ui.moveTarget, pos), 'Průchod přesunut.');
    }
  });

  function openPlanPicker() {
    if (!tour.plan) {
      ui.status = 'Prohlídka nemá plán (spusťte render-plan).';
      render();
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'plan-picker';
    const img = document.createElement('img');
    img.src = baseUrl + tour.plan.image;
    img.alt = 'Plán';
    const wrap = document.createElement('div');
    wrap.className = 'plan-picker__wrap';
    wrap.append(img);
    for (const r of tour.rooms) {
      if (!r.planPos) continue;
      const dot = document.createElement('span');
      dot.className = `plan-picker__dot${r.id === ui.currentId ? ' is-current' : ''}`;
      dot.style.left = `${r.planPos[0] * 100}%`;
      dot.style.top = `${r.planPos[1] * 100}%`;
      dot.title = r.name;
      wrap.append(dot);
    }
    const close = () => {
      overlay.remove();
      ui.mode = null;
      render();
    };
    img.addEventListener('click', (e) => {
      const rect = img.getBoundingClientRect();
      const pos = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
      overlay.remove();
      tryCommit(() => setPlanPos(tour, ui.currentId, pos), 'Pozice na plánu uložena.');
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.append(wrap);
    document.body.append(overlay);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(toJSON(tour), null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tour.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ui.status = `Uloženo. Soubor nahraďte v public/houses/${houseId}/tour.json.`;
    render();
  }

  async function importJson(file) {
    try {
      const { tour: imported } = validateTour(JSON.parse(await file.text()));
      ui.currentId = imported.start;
      commit(imported, 'Importováno.');
    } catch (e) {
      ui.status = e instanceof TourError ? e.message : 'Soubor není platný JSON.';
      render();
    }
  }

  const handlers = {
    selectRoom: (id) => handle.tour.setCurrentNode(id),
    setTitle: (title) => tryCommit(() => setTitle(tour, title)),
    setPano: (pano) => tryCommit(() => setRoomProps(tour, ui.currentId, { pano })),
    rename: (name) => tryCommit(() => setRoomProps(tour, ui.currentId, { name })),
    setStart: () => tryCommit(() => setStart(tour, ui.currentId), 'Výchozí místnost nastavena.'),
    startAddLink: (toId, reverse) => {
      ui.target = toId;
      ui.reverse = reverse;
      setMode('add-link', 'Klikněte v panoramatu na průchod.');
    },
    startMoveLink: (toId) => {
      ui.moveTarget = toId;
      setMode('move-link', 'Klikněte v panoramatu na novou pozici průchodu.');
    },
    removeLink: (toId) => tryCommit(() => removeLink(tour, ui.currentId, toId), 'Průchod smazán.'),
    startPlan: () => {
      setMode('plan', 'Klikněte na plánu na pozici místnosti.');
      openPlanPicker();
    },
    setNorth: () => tryCommit(
      () => setNorth(tour, ui.currentId, handle.viewer.getPosition().yaw),
      'Sever nastaven (pohled = horní strana plánu).',
    ),
    cancel: () => setMode(null, ''),
    exportJson,
    importJson,
    discardDraft: () => {
      if (!window.confirm('Zahodit rozpracované změny a načíst uloženou verzi?')) return;
      clearDraft(storage, houseId);
      ui.currentId = served.start;
      tour = served;
      renderHeader(headerEl, `Editor – ${tour.title}`);
      handle.reload(tour, ui.currentId);
      ui.status = 'Koncept zahozen.';
      render();
    },
  };

  function render() {
    if (!tour.rooms.some((r) => r.id === ui.currentId)) ui.currentId = tour.start;
    renderPanel(panelEl, { tour, currentId: ui.currentId, mode: ui.mode, moveTarget: ui.moveTarget, warnings: validate(tour), status: ui.status }, handlers);
  }

  render();
}
