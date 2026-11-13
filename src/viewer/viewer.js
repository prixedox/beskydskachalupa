import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { MapPlugin } from '@photo-sphere-viewer/map-plugin';
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import '@photo-sphere-viewer/map-plugin/index.css';
import '@photo-sphere-viewer/gallery-plugin/index.css';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import { tourToNodes, arrivalYaw, planAnchor, floorRoom } from './nodes.js';

const LANG = {
  zoom: 'Přiblížení',
  zoomOut: 'Oddálit',
  zoomIn: 'Přiblížit',
  moveUp: 'Nahoru',
  moveDown: 'Dolů',
  moveLeft: 'Vlevo',
  moveRight: 'Vpravo',
  fullscreen: 'Celá obrazovka',
  close: 'Zavřít',
  twoFingers: 'Pro posun použijte dva prsty',
  ctrlZoom: 'Pro přiblížení použijte Ctrl + kolečko',
  loadError: 'Panorama se nepodařilo načíst',
  gallery: 'Místnosti',
  gyroscope: 'Gyroskop',
  map: 'Plánek',
  mapMaximize: 'Zvětšit',
  mapMinimize: 'Zmenšit',
  mapNorth: 'Sever',
  mapReset: 'Obnovit',
};

const PHONE = window.matchMedia('(max-width: 600px)');
// Minimap box in px; zoom (percent of the plan image's own size) scales with it so the
// whole house fits either way.
// On a big screen the user can drag the minimap's edge; that size is kept for next time.
const MIN_MINIMAP = 160;
const SIZE_KEY = 'tour-minimap-size';
function storedSize() {
  try {
    const size = Number(localStorage.getItem(SIZE_KEY));
    return size >= MIN_MINIMAP ? size : null;
  } catch {
    return null; // storage blocked (private mode)
  }
}
let chosenSize = storedSize();
const minimapSize = () => (PHONE.matches ? 140 : chosenSize ?? 260);
const minimapZoom = () => (10 * minimapSize()) / 260;
// A swipe across the screen turns the view by what the screen shows, and a phone held
// upright shows a narrow slice, so looking around took a dozen swipes. Turn faster there.
const moveSpeed = () => (PHONE.matches ? 2.5 : 1);
// The plan image has wide margins (dimension lines, carport), so overfill the screen a bit.
const OPEN_PLAN_FILL = 1.3;
// One floor of a plan with several is cropped tight; leave room for the tabs and toolbar.
const OPEN_FLOOR_FILL = 0.9;

function linkElement(link) {
  const el = document.createElement('div');
  el.className = 'tour-link';
  el.dataset.to = link.nodeId;
  el.innerHTML = '<span class="tour-link__ring"></span>';
  return el;
}

export function createViewer({ container, tour, baseUrl, startRoom, onRoomChange, extraButtons = [] }) {
  const hasPlan = Boolean(tour.plan);
  // The minimap stays centred on the middle of the current floor; only the pin moves between
  // rooms. A tour that starts off the plan (garden) opens on the floor of its first placed room.
  const onPlan = (r) => Boolean(r.planPos);
  const firstSpot = tour.rooms.find((r) => r.id === startRoom && onPlan(r)) ?? tour.rooms.find(onPlan);
  // Floors drawn side by side in the plan image; the plan shows one of them at a time.
  const floors = tour.plan?.floors ?? [];
  const multi = floors.length > 1;
  let viewFloor = firstSpot?.floor ?? null;
  let anchor = hasPlan && firstSpot ? planAnchor(tour, viewFloor) : null;
  const plugins = [
    MarkersPlugin,
    [GalleryPlugin, { hideOnClick: true, thumbnailSize: { width: 160, height: 90 } }],
    GyroscopePlugin,
  ];
  if (hasPlan) {
    plugins.push([MapPlugin, {
      static: true,
      position: 'bottom left',
      size: `${minimapSize()}px`,
      shape: 'square',
      minimizeOnHotspotClick: true,
      spotStyle: { size: 14, color: '#c8a36a', hoverColor: '#ffffff', borderSize: 2, borderColor: '#ffffff' },
      coneColor: '#c8a36a',
      coneSize: 50,
      defaultZoom: minimapZoom(),
      minZoom: 5,
      ...(anchor ? { center: anchor } : {}),
    }]);
  }
  plugins.push([VirtualTourPlugin, {
    positionMode: 'manual',
    renderMode: '2d',
    nodes: tourToNodes(tour, baseUrl),
    startNodeId: startRoom,
    preload: true,
    arrowStyle: { element: linkElement, size: { width: 56, height: 56 } },
    transitionOptions: (toNode, fromNode, fromLink) => ({
      effect: 'fade',
      speed: 1500,
      rotation: true,
      showLoader: true,
      ...(fromLink && fromNode
        ? { rotateTo: { yaw: arrivalYaw(fromLink.position.yaw, fromNode.data, toNode.data), pitch: 0 } }
        : {}),
    }),
    ...(hasPlan ? { map: { imageUrl: baseUrl + tour.plan.image, size: { width: tour.plan.width, height: tour.plan.height }, recenter: false } } : {}),
  }]);

  const navbar = ['zoom', 'move', 'gallery', 'gyroscope', ...extraButtons, 'caption', 'fullscreen'];

  const viewer = new Viewer({
    container,
    lang: LANG,
    loadingTxt: 'Načítání…',
    defaultZoomLvl: 30,
    moveSpeed: moveSpeed(),
    defaultYaw: tour.rooms.find((r) => r.id === startRoom)?.startYaw ?? 0,
    touchmoveTwoFingers: false,
    mousewheelCtrlKey: false,
    navbar,
    plugins,
  });

  // Phone rotated, or the window resized across the breakpoint.
  PHONE.addEventListener('change', () => viewer.setOption('moveSpeed', moveSpeed()));

  // An iPhone has no real fullscreen: the viewer then only fills its own window, and for a
  // tour embedded in a page that is the small frame. Stretch that frame over the whole page
  // instead and give it back on exit. Works when the page is on the same site as the tour.
  let frameBefore = null;
  viewer.addEventListener('fullscreen', ({ fullscreenEnabled }) => {
    const frame = window.frameElement;
    if (!frame || document.fullscreenElement) return;
    const page = frame.ownerDocument.documentElement;
    if (fullscreenEnabled && !frameBefore) {
      frameBefore = { frame: frame.style.cssText, scroll: page.style.overflow };
      const fill = { position: 'fixed', inset: '0', width: '100%', height: '100%', margin: '0', 'max-width': 'none', 'max-height': 'none', 'border-radius': '0', 'z-index': '2147483647' };
      for (const [name, value] of Object.entries(fill)) frame.style.setProperty(name, value, 'important');
      page.style.overflow = 'hidden';
    } else if (!fullscreenEnabled && frameBefore) {
      frame.style.cssText = frameBefore.frame;
      page.style.overflow = frameBefore.scroll;
      frameBefore = null;
    }
  });

  const vt = viewer.getPlugin(VirtualTourPlugin);
  const map = hasPlan ? viewer.getPlugin(MapPlugin) : null;

  // The opened (maximised) plan keeps the minimap's zoom by default, which leaves it tiny
  // on a big screen; zoom it to fill the view instead, and back when it is minimised.
  const openZoom = () => {
    const { clientWidth: w, clientHeight: h } = viewer.container;
    const part = multi && floors.find((f) => f.name === viewFloor);
    const fit = Math.min(w / (part ? part.width : tour.plan.width), h / tour.plan.height);
    return fit * (part ? OPEN_FLOOR_FILL : OPEN_PLAN_FILL) * 100;
  };
  map?.addEventListener('view-changed', ({ view }) => {
    map.setZoom(view === 'maximized' ? openZoom() : minimapZoom());
  });

  // The minimap re-centres on the current room after it closes from full size; pan it back
  // to the middle of the floor. setCenter(x, false) moves only the pin, not the view.
  const mapEl = viewer.container.querySelector('.psv-map');
  const isOpen = () => mapEl.classList.contains('psv-map--maximized');
  // The opened plan of a single floor follows the current room; with several floors it
  // stays on the floor being looked at, like the minimap.
  const showFloor = () => {
    const room = map.config.center;
    if (!anchor || !room || (isOpen() && !multi)) return;
    map.setCenter(anchor);
    map.setCenter(room, false);
  };
  mapEl?.addEventListener('transitionend', (e) => {
    // Buttons inside the map fade too; while the plan is open only its own resize counts,
    // so the plan does not jump back when someone has dragged it.
    if (isOpen() && e.target !== mapEl) return;
    showFloor();
  });

  // Tabs to go to another floor: each leads to that floor's default room.
  const tabs = multi && mapEl ? document.createElement('div') : null;
  const lookAtFloor = (name) => {
    viewFloor = name;
    anchor = planAnchor(tour, name);
    tabs?.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.floor === name));
    if (multi && isOpen()) map.setZoom(openZoom());
    showFloor();
  };
  if (tabs) {
    tabs.className = 'floor-tabs';
    for (const { name } of floors) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.dataset.floor = name;
      button.classList.toggle('is-active', name === viewFloor);
      tabs.append(button);
    }
    tabs.addEventListener('click', (e) => {
      const name = e.target.dataset.floor;
      if (!name) return;
      // Show the floor at once, then walk to its room, facing that room's own view.
      lookAtFloor(name);
      const room = floorRoom(tour, name);
      if (room && room.id !== vt.getCurrentNode()?.id) vt.setCurrentNode(room.id, { rotateTo: { yaw: room.startYaw, pitch: 0 } });
    });
    // The map must not take a press on a tab for a drag or a click on the plan.
    for (const type of ['mousedown', 'touchstart', 'click']) tabs.addEventListener(type, (e) => e.stopPropagation());
    mapEl.append(tabs);
  }

  if (map && mapEl) {
    const applySize = () => {
      map.setOptions({ size: `${minimapSize()}px`, defaultZoom: minimapZoom() });
      if (!isOpen()) map.setZoom(minimapZoom());
    };
    // Phone rotated or window resized across the breakpoint.
    PHONE.addEventListener('change', applySize);

    // The minimap sits in the bottom left corner, so its top and right edges are free:
    // drag either to resize it.
    const maxSize = () => Math.max(MIN_MINIMAP, Math.min(viewer.container.clientWidth, viewer.container.clientHeight) - 80);
    for (const edge of ['top', 'right']) {
      const grip = document.createElement('div');
      grip.className = `map-resize map-resize--${edge}`;
      grip.addEventListener('pointerdown', (down) => {
        down.preventDefault();
        grip.setPointerCapture(down.pointerId);
        mapEl.classList.add('is-resizing');
        const start = minimapSize();
        const move = (e) => {
          const grown = edge === 'top' ? down.clientY - e.clientY : e.clientX - down.clientX;
          chosenSize = Math.round(Math.min(maxSize(), Math.max(MIN_MINIMAP, start + grown)));
          applySize();
        };
        const stop = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', stop);
          grip.removeEventListener('pointercancel', stop);
          mapEl.classList.remove('is-resizing');
          try {
            localStorage.setItem(SIZE_KEY, String(minimapSize()));
          } catch {
            // storage blocked (private mode): the size lasts until the page is closed
          }
          showFloor();
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', stop);
        grip.addEventListener('pointercancel', stop);
      });
      // The map must not take the drag for panning the plan.
      for (const type of ['pointerdown', 'mousedown', 'touchstart']) grip.addEventListener(type, (e) => e.stopPropagation());
      mapEl.append(grip);
    }

    // A click or tap on the opened plan closes it. Picking a room closes it too (the map
    // does that itself); dragging the plan or pinching it does not.
    let press = null;
    mapEl.addEventListener('pointerdown', (e) => {
      press = isOpen() && e.isPrimary && e.target.tagName === 'CANVAS' ? { x: e.clientX, y: e.clientY } : null;
    });
    mapEl.addEventListener('pointerup', (e) => {
      if (!press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      press = null;
      // After the map has handled the same click, which may be on a room.
      if (moved < 6) setTimeout(() => map.minimize());
    });

    // On a phone the minimap is too small to aim at a room dot or the corner button, so a
    // tap anywhere on the small map opens the full plan (rooms are picked there).
    let tap = null;
    mapEl.addEventListener('touchstart', (e) => {
      const small = PHONE.matches && !mapEl.classList.contains('psv-map--maximized');
      tap = small && e.target.tagName === 'CANVAS' ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { capture: true, passive: true });
    mapEl.addEventListener('touchend', (e) => {
      if (!tap) return;
      const t = e.changedTouches[0];
      const moved = Math.hypot(t.clientX - tap.x, t.clientY - tap.y);
      tap = null;
      if (moved > 10) return;
      e.stopPropagation();
      e.preventDefault();
      map.maximize();
    }, { capture: true });
  }

  vt.addEventListener('node-changed', ({ node }) => {
    if (map) {
      map.setOptions({ rotation: node.data.northOffset });
      // Rooms that are not on the plan (garden, drone view) have no pin to show. The plugin
      // shows the map itself once the plan image loads, so hide it with a style instead.
      mapEl.style.visibility = node.map ? '' : 'hidden';
      if (node.map) lookAtFloor(node.data.floor);
    }
    onRoomChange?.(node.id);
  });

  return {
    viewer,
    tour: vt,
    map,
    currentRoom: () => vt.getCurrentNode()?.id,
    reload(nextTour, roomId) {
      // getCurrentNode() is null during a transition, so the caller supplies the room.
      const target = nextTour.rooms.some((r) => r.id === roomId) ? roomId : nextTour.start;
      vt.setNodes(tourToNodes(nextTour, baseUrl), target);
    },
    destroy: () => viewer.destroy(),
  };
}
