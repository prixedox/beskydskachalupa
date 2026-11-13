import './styles.css';
import { loadTour, findMissingPanoramas, withoutRooms, TourError } from './tour-loader.js';
import { createViewer } from './viewer/viewer.js';
import { renderHeader, showError, openLightbox } from './viewer/ui.js';

const DEFAULT_HOUSE = 'trojanovice';

async function main() {
  const container = document.getElementById('app');
  const headerEl = document.getElementById('header');
  const params = new URLSearchParams(location.search);
  const houseId = params.get('house') || DEFAULT_HOUSE;
  const baseUrl = `${import.meta.env.BASE_URL}houses/${houseId}/`;

  try {
    let tour = await loadTour(houseId, baseUrl);

    if (params.has('edit')) {
      const { startEditor } = await import('./editor/editor.js');
      startEditor({ houseId, baseUrl, tour, container, headerEl });
      return;
    }

    // A missing file can come back as the dev server's index.html, hence the catch.
    const model = await fetch(`${baseUrl}model.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    if (params.get('view') === '3d') {
      if (!model) throw new TourError('3D model tohoto domu není k dispozici.');
      renderHeader(headerEl, tour.title);
      const { start3d } = await import('./model3d/viewer3d.js');
      start3d({ container, model, tour, baseUrl, houseId, startRoom: params.get('room') || tour.start });
      return;
    }

    const missing = await findMissingPanoramas(tour, baseUrl);
    if (missing.length > 0) {
      missing.forEach((id) => console.warn(`Panorama místnosti ${id} chybí, místnost skryta.`));
      tour = withoutRooms(tour, missing);
    }

    renderHeader(headerEl, tour.title);
    const requested = params.get('room');
    const startRoom = tour.rooms.some((r) => r.id === requested) ? requested : tour.start;
    const extraButtons = tour.exterior.length > 0
      ? [{ id: 'exterior', title: 'Exteriér', content: 'Exteriér', className: 'exterior-button', onClick: () => openLightbox(tour.exterior.map((p) => baseUrl + p)) }]
      : [];
    if (model) {
      extraButtons.push({
        id: 'model3d',
        title: '3D model domu',
        content: '3D',
        className: 'exterior-button',
        onClick: () => {
          const url = new URL(location.href);
          url.searchParams.set('view', '3d');
          url.searchParams.set('house', houseId);
          const room = handle.currentRoom();
          if (room) url.searchParams.set('room', room);
          location.href = url.toString();
        },
      });
    }

    const handle = createViewer({
      container,
      tour,
      baseUrl,
      startRoom,
      extraButtons,
      onRoomChange: (id) => {
        const url = new URL(location.href);
        url.searchParams.set('room', id);
        history.replaceState(null, '', url);
      },
    });
  } catch (e) {
    console.error(e);
    showError(container, e instanceof TourError ? e.message : 'Něco se pokazilo. Zkuste stránku načíst znovu.');
  }
}

main();
