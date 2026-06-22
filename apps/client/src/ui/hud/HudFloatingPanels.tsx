import { CHAT_MAX_LENGTH, ORDER_ITEMS, PETAL_ACTION_COST, normalizeChatText, orderItemLabel } from '@social-square/shared';
import { eventBus } from '../../eventBus';
import { t } from '../../i18n';
import { PoolOverlay } from '../PoolOverlay';
import { useHudContext } from './HudContext';

export function HudFloatingPanels() {
  const { inRoom, showPoolOverlay, isCompactHud, showJukeboxLink, setShowJukeboxLink, submitJukeboxUrl, jukeboxUrlDraft, setJukeboxUrlDraft, setJukeboxUrlError, jukeboxUrlError, smallButtonStyle, canUseJukebox, jukeboxActive, disabledButtonStyle, userActionMenu, setUserActionMenu, addFriendFromMenu, setWhisperTarget, currentRoomId, setShowFriends, heldItem, chatMessages, chatDraft, setChatDraft, sendChat, waiterAwaitingOrder, canUseWaiter, canAffordAction } = useHudContext();
  return (
    <>
      {inRoom && showPoolOverlay && (
        <PoolOverlay isCompact={isCompactHud} />
      )}

      {inRoom && showJukeboxLink && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitJukeboxUrl();
          }}
          style={{
            position: 'absolute',
            right: isCompactHud ? '8px' : '16px',
            left: isCompactHud ? '8px' : undefined,
            bottom: isCompactHud ? '112px' : '52px',
            zIndex: 126,
            width: isCompactHud ? 'auto' : 'min(360px, calc(100vw - 32px))',
            background: 'rgba(10,10,30,0.94)',
            border: '1px solid rgba(150,150,255,0.35)',
            borderRadius: '6px',
            padding: '9px',
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: '7px',
            alignItems: 'center',
            pointerEvents: 'auto',
            boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
          }}
        >
          <input
            value={jukeboxUrlDraft}
            onChange={(event) => {
              setJukeboxUrlDraft(event.target.value);
              setJukeboxUrlError('');
            }}
            placeholder="https://youtube.com/watch?v=..."
            style={{
              minWidth: 0,
              height: '28px',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(150,150,255,0.32)',
              borderRadius: '4px',
              color: '#e0e0ff',
              fontFamily: 'monospace',
              fontSize: '11px',
              padding: '0 8px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
            disabled={!canUseJukebox || jukeboxActive}
          >
            Suona
          </button>
          <button
            type="button"
            style={smallButtonStyle}
            onClick={() => {
              setShowJukeboxLink(false);
              setJukeboxUrlError('');
            }}
          >
            X
          </button>
          {jukeboxUrlError && (
            <span style={{
              gridColumn: '1 / -1',
              color: '#ff8888',
              fontSize: '10px',
            }}>
              {jukeboxUrlError}
            </span>
          )}
        </form>
      )}

      {inRoom && userActionMenu && (
        <div style={{
          position: 'absolute',
          right: isCompactHud ? '8px' : '16px',
          left: isCompactHud ? '8px' : undefined,
          top: isCompactHud ? '58px' : '54px',
          zIndex: 145,
          background: 'rgba(10,10,30,0.94)',
          border: '1px solid rgba(150,150,255,0.32)',
          borderRadius: '6px',
          padding: '9px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          pointerEvents: 'auto',
          boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
        }}>
          <span style={{ color: '#fff4d0', fontSize: '11px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userActionMenu.username}
          </span>
          <button
            style={smallButtonStyle}
            onClick={() => eventBus.emit('voice-user-mute', userActionMenu.userId, !userActionMenu.muted)}
          >
            {userActionMenu.muted ? 'Togli muto' : 'Muta'}
          </button>
          <button
            style={smallButtonStyle}
            onClick={() => addFriendFromMenu(userActionMenu.userId)}
          >
            Amico
          </button>
          <button
            style={smallButtonStyle}
            onClick={() => {
              setWhisperTarget({
                userId: userActionMenu.userId,
                username: userActionMenu.username,
                status: 'accepted',
                online: true,
                roomId: currentRoomId,
              });
              setShowFriends(true);
              setUserActionMenu(null);
            }}
          >
            Whisper
          </button>
          <button style={smallButtonStyle} onClick={() => setUserActionMenu(null)}>
            Chiudi
          </button>
        </div>
      )}

      {/* Held-item prompt — centered above the bottom bar */}
      {inRoom && heldItem && (
        <div style={{
          position: 'absolute', bottom: isCompactHud ? '64px' : '52px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10,10,30,0.9)',
          border: '1px solid rgba(255,225,77,0.5)',
          borderRadius: '6px',
          padding: '6px 14px',
          color: '#fff4d0',
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>{heldItem === 'beer' ? '🍺' : '🥨'}</span>
          {isCompactHud ? (
            <span>Apri Azioni per usare {heldItem === 'beer' ? 'birra' : 'pretzel'}</span>
          ) : (
            <>
              {t('hud.press')}
              <kbd style={{
                background: 'rgba(255,225,77,0.18)',
                border: '1px solid rgba(255,225,77,0.6)',
                borderRadius: '3px',
                padding: '1px 7px',
                color: '#ffe14d',
                fontWeight: 'bold',
              }}>B</kbd>
              per {heldItem === 'beer' ? 'bere' : 'mangiare'}
            </>
          )}
        </div>
      )}

      {/* Chat */}
      {inRoom && !isCompactHud && (
        <div style={{
          position: 'absolute',
          left: '16px',
          bottom: heldItem ? '96px' : '52px',
          width: 'min(360px, calc(100vw - 32px))',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {chatMessages.length > 0 && (
            <div style={{
              maxHeight: '118px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: '4px',
              pointerEvents: 'none',
            }}>
              {chatMessages.slice(-4).map((message: any) => (
                <div key={message.id} style={{
                  background: 'rgba(10,10,30,0.78)',
                  border: '1px solid rgba(150,150,255,0.16)',
                  borderRadius: '5px',
                  padding: '4px 7px',
                  color: '#e0e0ff',
                  fontSize: '11px',
                  lineHeight: 1.35,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                }}>
                  <span style={{ color: '#88ffbb', fontWeight: 'bold' }}>{message.username}</span>
                  <span style={{ color: '#7777aa' }}>:</span>{' '}
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              sendChat();
            }}
            style={{ display: 'flex', gap: '6px' }}
          >
            <input
              value={chatDraft}
              maxLength={CHAT_MAX_LENGTH}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="Scrivi..."
              style={{
                flex: 1,
                minWidth: 0,
                height: '30px',
                boxSizing: 'border-box',
                background: 'rgba(10,10,30,0.88)',
                border: '1px solid rgba(150,150,255,0.32)',
                borderRadius: '4px',
                color: '#e0e0ff',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '0 9px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!normalizeChatText(chatDraft)}
              style={{
                ...smallButtonStyle,
                height: '30px',
                opacity: normalizeChatText(chatDraft) ? 1 : 0.48,
                cursor: normalizeChatText(chatDraft) ? 'pointer' : 'default',
              }}
            >
              Invia
            </button>
          </form>
        </div>
      )}

      {/* Order menu */}
      {inRoom && waiterAwaitingOrder && (
        <div style={{
          position: 'absolute',
          right: isCompactHud ? '8px' : '16px',
          left: isCompactHud ? '8px' : undefined,
          bottom: isCompactHud ? '112px' : '52px',
          zIndex: 120,
          background: 'rgba(10,10,30,0.92)',
          border: '1px solid rgba(255,225,77,0.42)',
          borderRadius: '6px',
          padding: '8px',
          display: 'flex',
          gap: '7px',
          alignItems: 'center',
          pointerEvents: 'auto',
          boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        }}>
          <span style={{ color: '#fff4d0', fontSize: '11px' }}>
            {t('hud.order', { cost: PETAL_ACTION_COST })}
          </span>
          {ORDER_ITEMS.map((item) => (
            <button
              key={item.id}
              style={{
                ...smallButtonStyle,
                color: '#ffe14d',
                borderColor: 'rgba(255,225,77,0.45)',
                ...(!canUseWaiter || !canAffordAction ? disabledButtonStyle : {}),
              }}
              disabled={!canUseWaiter || !canAffordAction}
              title={!canUseWaiter
                ? t('hud.waiter.near')
                : !canAffordAction
                  ? t('common.petalsRequired', { cost: PETAL_ACTION_COST })
                  : t('common.petalsRequired', { cost: PETAL_ACTION_COST })}
              onClick={() => {
                if (canUseWaiter && canAffordAction) eventBus.emit('waiter-order', item.id);
              }}
            >
              {orderItemLabel(item.id)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
