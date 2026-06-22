import { useHudContext } from './HudContext';

export function HudShopModal() {
  const { inRoom, showShop, setShowShop, petals, shopMessage, shopItems, ownedCosmeticIds, isShopItemEquipped, token, buyShopItem, equipShopItem, smallButtonStyle, disabledButtonStyle } = useHudContext();
  return (
    <>
      {inRoom && showShop && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 146,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(6,8,18,0.72)',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: 'min(680px, calc(100vw - 28px))',
            maxHeight: 'min(72vh, 620px)',
            overflowY: 'auto',
            background: 'rgba(12,14,34,0.96)',
            border: '1px solid rgba(150,150,255,0.32)',
            borderRadius: '6px',
            padding: '14px',
            boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                <span style={{ color: '#fff4d0', fontSize: '14px', fontWeight: 700 }}>
                  Shop cosmetici
                </span>
                <span style={{ color: '#ffe14d', fontSize: '11px' }}>
                  {petals} petali
                </span>
              </div>
              <button style={smallButtonStyle} onClick={() => setShowShop(false)}>
                Chiudi
              </button>
            </div>

            {shopMessage && (
              <div style={{
                marginBottom: '10px',
                color: shopMessage.includes('insufficienti') || shopMessage.includes('bloccato') ? '#ff8888' : '#88ffbb',
                fontSize: '11px',
              }}>
                {shopMessage}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '8px',
            }}>
              {shopItems.map((item: any) => {
                const owned = ownedCosmeticIds.has(item.id);
                const equipped = isShopItemEquipped(item);
                const canBuy = token && !owned && petals >= item.price;
                const canEquip = token && owned && Boolean(item.avatarPatch) && !equipped;
                return (
                  <div key={item.id} style={{
                    border: `1px solid ${equipped ? 'rgba(136,255,187,0.48)' : owned ? 'rgba(255,225,77,0.36)' : 'rgba(150,150,255,0.24)'}`,
                    borderRadius: '6px',
                    padding: '10px',
                    background: equipped ? 'rgba(30,120,82,0.16)' : 'rgba(255,255,255,0.045)',
                    minHeight: '118px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                        <span style={{ color: '#e0e0ff', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                        <span style={{ color: '#7777aa', fontSize: '10px' }}>
                          {item.kind}
                        </span>
                      </div>
                      <span style={{ color: owned ? '#88ffbb' : '#ffe14d', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {owned ? equipped ? 'Equip.' : 'Tuo' : `${item.price}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                      <button
                        style={{
                          ...smallButtonStyle,
                          flex: 1,
                          height: '32px',
                          ...(!canBuy ? disabledButtonStyle : {}),
                        }}
                        disabled={!canBuy}
                        onClick={() => buyShopItem(item.id)}
                      >
                        Compra
                      </button>
                      <button
                        style={{
                          ...smallButtonStyle,
                          flex: 1,
                          height: '32px',
                          color: equipped ? '#88ffbb' : '#aaaaff',
                          ...(!canEquip ? disabledButtonStyle : {}),
                        }}
                        disabled={!canEquip}
                        onClick={() => equipShopItem(item.id)}
                      >
                        {item.avatarPatch ? equipped ? 'Equip.' : 'Indossa' : 'N/A'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {shopItems.length === 0 && (
                <span style={{ color: '#7777aa', fontSize: '11px' }}>
                  Catalogo in caricamento...
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
