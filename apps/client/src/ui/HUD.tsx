import { HudContext } from './hud/HudContext';
import { HudDesktopActionBar } from './hud/HudDesktopActionBar';
import { HudFloatingPanels } from './hud/HudFloatingPanels';
import { HudFriendsModal } from './hud/HudFriendsModal';
import { HudMobileActionBar } from './hud/HudMobileActionBar';
import { HudShopModal } from './hud/HudShopModal';
import { HudStatusBars } from './hud/HudStatusBars';
import { HudSystemOverlays } from './hud/HudSystemOverlays';
import { HudWorldMapModal } from './hud/HudWorldMapModal';
import { useHudModel } from './hud/useHudModel';

export const HUD = () => {
  const hud = useHudModel();

  return (
    <HudContext.Provider value={hud}>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', fontFamily: 'monospace',
      }}>
        <HudStatusBars />
        <HudDesktopActionBar />
        <HudMobileActionBar />
        <HudWorldMapModal />
        <HudShopModal />
        <HudFriendsModal />
        <HudFloatingPanels />
        <HudSystemOverlays />
      </div>
    </HudContext.Provider>
  );
};
