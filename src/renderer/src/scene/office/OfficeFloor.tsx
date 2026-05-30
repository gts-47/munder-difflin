import { useEffect, useRef } from 'react';
import { Application, Container, Ticker, Texture } from 'pixi.js';
// PixiJS uses new Function() internally, blocked by Electron CSP — this patches it.
import 'pixi.js/unsafe-eval';
import { useStore, type Agent } from '@/store/store';
import { TiledMapRenderer, type TiledMap } from './TiledMapRenderer';
import { Camera } from './Camera';
import { Character } from './Character';
import { getCastFrames, CAST_BY_NAME, hexToNumber, DEFAULT_CHARACTER } from './cast';
import { colors } from '@/design/tokens';

import officeTilesetUrl from '@/assets/tilesets/office-tileset.png?url';
import a5FloorsWallsUrl from '@/assets/tilesets/a5-office-floors-walls.png?url';
import interiorsUrl from '@/assets/tilesets/interiors.png?url';
// .tmj is Tiled JSON; import as raw text (typed by vite/client) and parse.
import officeMapRaw from '@/assets/maps/office.tmj?raw';

const officeMapData = JSON.parse(officeMapRaw) as TiledMap;

// Preferred desks, in claim order. The very first agent always takes the
// private office on the left (the CEO room), then the open-plan PC desks, then
// the remaining named desks. Overflow (conference room, then open floor) is
// computed from map zones at runtime. Matches Tiled spawn-point names.
const PRIMARY_SEAT_NAMES = [
  'desk-ceo',
  'pc-1', 'pc-2', 'pc-3', 'pc-4', 'pc-5', 'pc-6',
  'desk-chief-architect', 'desk-product-manager', 'desk-team-lead',
  'desk-backend-engineer', 'desk-ui-ux-expert', 'desk-data-engineer',
  'desk-project-manager', 'desk-market-researcher', 'desk-agent-organizer',
];

interface Tile { x: number; y: number; }

interface Runtime {
  character: Character;
  seatIndex: number | null;
  waitTile: Tile;
  charName: string;
  prevStatus?: string;
  prevAction?: string;
  prevCarrying?: string;
  prevPrompt?: string;
}

/** Patch the map's external (.tsx) tileset refs with the inline metadata the
 *  renderer needs — mirrors the reference repo's OfficeScene.init(). */
function resolveMap(): TiledMap {
  const m = officeMapData;
  return {
    ...m,
    tilesets: [
      m.tilesets[0], // office-tileset.png (embedded, firstgid 1)
      { firstgid: 513, image: 'a5', imagewidth: 256, imageheight: 512, tilewidth: 16, tileheight: 16, columns: 16, tilecount: 512 } as any,
      { firstgid: 1025, image: 'interiors', imagewidth: 256, imageheight: 1424, tilewidth: 16, tileheight: 16, columns: 16, tilecount: 1424 } as any,
    ],
  };
}

/** Load a texture via an <img> element. Unlike Pixi's Assets.load(), this
 *  handles extension-less data: URLs (Vite inlines small assets like the a5
 *  tileset as base64), which the Assets resolver fails to type-detect. */
function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tex = Texture.from(img);
      tex.source.scaleMode = 'nearest';
      resolve(tex);
    };
    img.onerror = () => reject(new Error('failed to load ' + url.slice(0, 40)));
    img.src = url;
  });
}

/** First few words of the last user prompt, for the desk card. */
function firstWords(prompt: string | undefined, maxWords = 6, maxChars = 42): string {
  if (!prompt) return '';
  const words = prompt.trim().split(/\s+/);
  let out = words.slice(0, maxWords).join(' ');
  const truncatedWords = words.length > maxWords;
  if (out.length > maxChars) out = out.slice(0, maxChars).trimEnd();
  else if (truncatedWords) out += '…';
  return out;
}

export function OfficeFloor() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const mountIdRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);

    const mountId = ++mountIdRef.current;
    const app = new Application();
    appRef.current = app;

    const runtimes = new Map<string, Runtime>();
    const seatClaims = new Set<number>();

    const init = async () => {
      await app.init({
        background: hexNum(colors.ink[900]),
        antialias: false,
        roundPixels: true,
        resolution: 1,
        width: host.clientWidth || 800,
        height: host.clientHeight || 600,
      });
      if (mountIdRef.current !== mountId) { safeDestroy(app); return; }
      while (host.firstChild) host.removeChild(host.firstChild);
      host.appendChild(app.canvas);

      // Load tilesets (order must match resolveMap()'s tileset array)
      const [officeTex, a5Tex, interiorsTex] = await Promise.all(
        [officeTilesetUrl, a5FloorsWallsUrl, interiorsUrl].map(loadTexture),
      );
      if (mountIdRef.current !== mountId) { safeDestroy(app); return; }

      const world = new Container();
      app.stage.addChild(world);

      const mapRenderer = new TiledMapRenderer(resolveMap(), [officeTex, a5Tex, interiorsTex]);
      world.addChild(mapRenderer.getContainer());
      const charLayer = mapRenderer.getCharacterContainer();
      const tileCount = mapRenderer.getContainer().children.reduce(
        (n, c) => n + ((c as Container).children?.length ?? 0), 0);
      console.log(`[OfficeFloor] map ${mapRenderer.width}x${mapRenderer.height}, ${tileCount} tile sprites rendered`);

      const camera = new Camera(world);
      camera.setMapSize(mapRenderer.width * mapRenderer.tileSize, mapRenderer.height * mapRenderer.tileSize);
      camera.setViewSize(app.screen.width, app.screen.height);
      camera.fitToScreen();

      // Build the ordered seat list once: PC desks + named desks first, then
      // conference-room chairs, then open-floor / cafeteria overflow. Each agent
      // claims one and stays there; they never wander off it (except when blocked).
      const seatTiles: Tile[] = [];
      const seatSeen = new Set<string>();
      const addSeat = (t?: Tile) => {
        if (!t) return;
        const k = `${t.x},${t.y}`;
        if (seatSeen.has(k)) return;
        seatSeen.add(k);
        seatTiles.push({ x: t.x, y: t.y });
      };
      for (const name of PRIMARY_SEAT_NAMES) addSeat(mapRenderer.getSpawnPoint(name));
      const addZoneSeats = (zone: string) => {
        const z = mapRenderer.getZone(zone);
        if (!z) return;
        for (let y = z.y; y < z.y + z.height; y++) {
          for (let x = z.x; x < z.x + z.width; x++) {
            if (mapRenderer.isWalkable(x, y)) addSeat({ x, y });
          }
        }
      };
      addZoneSeats('boardroom');       // conference room overflow
      addZoneSeats('open-work-area');  // cafeteria / open-floor overflow

      // Waiting spots near the entrance — where a blocked agent walks to signal
      // it needs the user. Collected as walkable tiles in rings around the door.
      const entrance = mapRenderer.getSpawnPoint('entrance')
        ?? { x: Math.floor(mapRenderer.width / 2), y: mapRenderer.height - 2 };
      const waitTiles: Tile[] = [];
      const waitSeen = new Set<string>();
      for (let radius = 0; radius <= 6 && waitTiles.length < 16; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const x = entrance.x + dx, y = entrance.y + dy;
            const k = `${x},${y}`;
            if (waitSeen.has(k)) continue;
            if (mapRenderer.isWalkable(x, y)) { waitSeen.add(k); waitTiles.push({ x, y }); }
          }
        }
      }
      if (waitTiles.length === 0) waitTiles.push(entrance);

      // Seat 0 is desk-ceo — "Michael's room" — reserved for the god agent.
      // Everyone else claims from seat 1 onward so the corner office stays the
      // orchestrator's throne even if it spawns after other agents.
      const GOD_SEAT = 0;
      const claimSeat = (agent: Agent): number | null => {
        if (agent.isGod) { seatClaims.add(GOD_SEAT); return GOD_SEAT; }
        for (let i = 1; i < seatTiles.length; i++) {
          if (!seatClaims.has(i)) { seatClaims.add(i); return i; }
        }
        return null;
      };

      // Face a seated agent toward their desk (the adjacent non-walkable
      // furniture). Standard desks put the monitor to the north and the chair to
      // the south, so the agent faces 'up' and we see their back — like a real
      // worker. Only a desk directly to the SOUTH (face 'down') puts furniture in
      // front of them, which is the one case the leg-crop tucks legs under.
      const facingForSeat = (t: Tile): 'up' | 'down' | 'left' | 'right' => {
        if (!mapRenderer.isWalkable(t.x, t.y - 1)) return 'up';
        if (!mapRenderer.isWalkable(t.x, t.y + 1)) return 'down';
        if (!mapRenderer.isWalkable(t.x - 1, t.y)) return 'left';
        if (!mapRenderer.isWalkable(t.x + 1, t.y)) return 'right';
        return 'up'; // open-floor overflow seat — no desk, just face away
      };

      const addCharacter = async (agent: Agent) => {
        const charName = CAST_BY_NAME[agent.character] ? agent.character : DEFAULT_CHARACTER;
        const member = CAST_BY_NAME[charName];
        const seatIndex = claimSeat(agent);
        const seatTile: Tile = (seatIndex != null ? seatTiles[seatIndex] : undefined)
          ?? mapRenderer.getSpawnPoint('entrance')
          ?? { x: 2, y: 2 };
        const waitTile = waitTiles[(seatIndex ?? 0) % waitTiles.length];
        const frames = await getCastFrames(charName);
        // Bail if the agent was removed (or scene torn down) while loading.
        if (mountIdRef.current !== mountId) return;
        if (!useStore.getState().agents.some((a) => a.id === agent.id)) {
          if (seatIndex != null) seatClaims.delete(seatIndex);
          return;
        }
        const character = new Character({
          agentId: agent.id,
          mapRenderer,
          frames,
          seatTile,
          seatDirection: facingForSeat(seatTile),
          spawnTile: entrance, // walk in from the office door
          glowColor: hexNum(colors.accent[agent.accent]) ?? hexToNumber(member.shirt),
          onClick: (id) => useStore.getState().select(id),
        });
        character.show(charLayer);
        runtimes.set(agent.id, { character, seatIndex, waitTile, charName });
        applyState(agent, runtimes.get(agent.id)!, true);
      };

      const removeCharacter = (id: string) => {
        const rt = runtimes.get(id);
        if (!rt) return;
        if (rt.seatIndex != null) seatClaims.delete(rt.seatIndex);
        rt.character.hide(0);
        // give the fade-out a moment, then destroy
        setTimeout(() => rt.character.destroy(), 700);
        runtimes.delete(id);
      };

      // Map an agent's store state onto its on-floor character.
      const applyState = (agent: Agent, rt: Runtime, force = false) => {
        const changed = force
          || rt.prevStatus !== agent.status
          || rt.prevAction !== agent.action
          || rt.prevCarrying !== agent.carrying
          || rt.prevPrompt !== agent.lastPrompt;
        if (!changed) return;
        rt.prevStatus = agent.status;
        rt.prevAction = agent.action;
        rt.prevCarrying = agent.carrying;
        rt.prevPrompt = agent.lastPrompt;

        const c = rt.character;
        c.setBaseAlpha(agent.status === 'ghost' ? 0.5 : 1);

        // While working, agents sit at their desk (face toward the user) with a
        // card showing the last prompt we gave them. Blocked → walk to the door
        // and flash "!". Done/idle → wander the office until a new task arrives.
        const promptCard = firstWords(agent.lastPrompt);
        switch (agent.status) {
          case 'working':
          case 'thinking':
            c.setStatusGlyph('none');
            c.sitAtDesk(true);
            if (promptCard) c.showPrompt(promptCard);
            else c.showToolBubble('', '...');
            break;
          case 'waiting':
            // Parked at the desk awaiting god / another agent — not actively
            // working (no focus glow) and NOT at the door (that's reserved for
            // agents that need the human).
            c.setStatusGlyph('none');
            c.sitAtDesk(false);
            c.showToolBubble('', '⏳');
            break;
          case 'blocked':
            c.setStatusGlyph('blocked');
            c.hideToolBubble();
            c.walkToTile(rt.waitTile);
            break;
          case 'success':
            c.setStatusGlyph('success');
            c.hideToolBubble();
            if (agent.isGod) c.sitAtDesk(true); else c.startWandering();
            break;
          case 'ghost':
            c.setStatusGlyph('none');
            c.hideToolBubble();
            c.setIdle();
            break;
          case 'idle':
          default:
            c.setStatusGlyph('none');
            c.hideToolBubble();
            // The god runs the floor from its desk; everyone else wanders when idle.
            if (agent.isGod) { c.sitAtDesk(true); c.showToolBubble('', '☰'); }
            else c.startWandering();
            break;
        }
      };

      const syncAgents = () => {
        const { agents } = useStore.getState();
        const present = new Set(agents.map((a) => a.id));
        for (const id of Array.from(runtimes.keys())) {
          if (!present.has(id)) removeCharacter(id);
        }
        for (const agent of agents) {
          const rt = runtimes.get(agent.id);
          if (!rt) void addCharacter(agent);
          else applyState(agent, rt);
        }
      };

      syncAgents();

      let lastSelected: string | null = useStore.getState().selectedId;
      const unsubscribe = useStore.subscribe((s, prev) => {
        if (s.agents !== prev.agents) syncAgents();
        if (s.selectedId !== lastSelected) {
          lastSelected = s.selectedId;
          const rt = s.selectedId ? runtimes.get(s.selectedId) : undefined;
          if (rt) {
            const p = rt.character.getPixelPosition();
            camera.nudgeToward(p.x, p.y);
          }
        }
      });
      (app as any).__unsub = unsubscribe;

      const onTick = (ticker: Ticker) => {
        const dt = ticker.deltaMS / 1000;
        camera.update(dt);
        for (const rt of runtimes.values()) rt.character.update(dt);
      };
      app.ticker.add(onTick);

      const resize = new ResizeObserver((entries) => {
        for (const e of entries) {
          const { width, height } = e.contentRect;
          if (width === 0 || height === 0) continue;
          app.renderer?.resize(width, height);
          camera.setViewSize(width, height);
        }
      });
      resize.observe(host);
      (app as any).__resize = resize;
    };

    init().catch((err) => {
      if (mountIdRef.current !== mountId) return;
      console.error('[OfficeFloor] init failed:', err);
      const banner = document.createElement('div');
      banner.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'padding:24px;color:#ffd0b5;font-family:monospace;font-size:13px;text-align:center;white-space:pre-wrap;';
      banner.textContent = 'OfficeFloor failed to start:\n' + (err?.stack || err?.message || String(err));
      host.appendChild(banner);
    });

    return () => {
      mountIdRef.current++;
      const a = appRef.current;
      if (a) {
        (a as any).__resize?.disconnect?.();
        try { (a as any).__unsub?.(); } catch { /* noop */ }
        safeDestroy(a);
      }
      appRef.current = null;
      while (host.firstChild) host.removeChild(host.firstChild);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%', height: '100%',
        boxShadow: 'var(--cth-panel-border)',
        overflow: 'hidden',
        imageRendering: 'pixelated',
        background: hex(colors.ink[900]),
      }}
    />
  );
}

function hexNum(n: number): number { return n; }
function hex(n: number): string { return '#' + n.toString(16).padStart(6, '0'); }
function safeDestroy(app: Application) {
  try { app.ticker?.stop(); } catch { /* noop */ }
  try { app.destroy(true, { children: true }); } catch { /* noop */ }
}
