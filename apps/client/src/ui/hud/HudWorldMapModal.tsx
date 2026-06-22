import { eventBus } from '../../eventBus';
import { useHudContext } from './HudContext';

export function HudWorldMapModal() {
  const { inRoom, showWorldMap, setShowWorldMap, travelOptions, locationName, smallButtonStyle } = useHudContext();
  return (
    <>
      {inRoom && showWorldMap && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(6,8,18,0.72)',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: 'min(620px, calc(100vw - 32px))',
            background: 'rgba(12,14,34,0.96)',
            border: '1px solid rgba(150,150,255,0.32)',
            borderRadius: '6px',
            padding: '14px',
            boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#fff4d0', fontSize: '14px', fontWeight: 700 }}>
                Mappa paese
              </span>
              <button style={smallButtonStyle} onClick={() => setShowWorldMap(false)}>
                Chiudi
              </button>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '8px',
            }}>
              {travelOptions.map((location: any) => (
                <button
                  key={location.id}
                  style={{
                    ...smallButtonStyle,
                    height: '68px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    gap: '3px',
                    color: location.name === locationName ? '#ffe14d' : '#aaaaff',
                    borderColor: location.name === locationName ? 'rgba(255,225,77,0.5)' : 'rgba(150,150,255,0.35)',
                  }}
                  onClick={() => {
                    setShowWorldMap(false);
                    eventBus.emit('fast-travel', location.id);
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{location.name}</span>
                  <span style={{ color: '#7777aa', fontSize: '9px', lineHeight: 1.25 }}>
                    {location.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
