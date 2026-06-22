import { CHAT_MAX_LENGTH, normalizeChatText } from '@social-square/shared';
import { useHudContext } from './HudContext';

export function HudFriendsModal() {
  const { inRoom, showFriends, setShowFriends, friends, socialMessage, isCompactHud, smallButtonStyle, refreshFriends, createInviteRoom, inviteCodeDraft, setInviteCodeDraft, privateRoomCode, disabledButtonStyle, joinInviteRoom, acceptFriendRequest, rejectFriendRequest, setWhisperTarget, whisperTarget, whisperMessages, userId, whisperDraft, setWhisperDraft, sendWhisper } = useHudContext();
  return (
    <>
      {inRoom && showFriends && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 147,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(6,8,18,0.72)',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: 'min(700px, calc(100vw - 28px))',
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
                  Amici
                </span>
                <span style={{ color: '#7777aa', fontSize: '11px' }}>
                  {friends.filter((friend: any) => friend.status === 'accepted' && friend.online).length} online
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={smallButtonStyle} onClick={refreshFriends}>
                  Aggiorna
                </button>
                <button style={smallButtonStyle} onClick={() => setShowFriends(false)}>
                  Chiudi
                </button>
              </div>
            </div>

            {socialMessage && (
              <div style={{
                color: socialMessage.includes('non') ? '#ff8888' : '#88ffbb',
                fontSize: '11px',
                marginBottom: '10px',
              }}>
                {socialMessage}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: isCompactHud ? '1fr' : 'auto minmax(120px, 180px) auto',
              gap: '7px',
              alignItems: 'center',
              marginBottom: '10px',
              padding: '8px',
              border: '1px solid rgba(150,150,255,0.22)',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
            }}>
              <button style={{ ...smallButtonStyle, height: '32px' }} onClick={createInviteRoom}>
                Crea privata
              </button>
              <input
                value={inviteCodeDraft}
                maxLength={6}
                onChange={(event) => setInviteCodeDraft(event.target.value.toUpperCase())}
                placeholder={privateRoomCode || 'CODICE'}
                style={{
                  minWidth: 0,
                  height: '32px',
                  boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(150,150,255,0.32)',
                  borderRadius: '4px',
                  color: '#e0e0ff',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  padding: '0 8px',
                  outline: 'none',
                  textTransform: 'uppercase',
                }}
              />
              <button
                style={{
                  ...smallButtonStyle,
                  height: '32px',
                  ...(!inviteCodeDraft.trim() ? disabledButtonStyle : {}),
                }}
                disabled={!inviteCodeDraft.trim()}
                onClick={joinInviteRoom}
              >
                Entra
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isCompactHud ? '1fr' : 'minmax(220px, 1fr) minmax(240px, 1fr)',
              gap: '10px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {friends.map((friend: any) => (
                  <div key={friend.userId} style={{
                    border: '1px solid rgba(150,150,255,0.22)',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.045)',
                    padding: '8px',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '8px',
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                      <span style={{ color: '#e0e0ff', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {friend.username}
                      </span>
                      <span style={{ color: friend.online ? '#88ffbb' : '#7777aa', fontSize: '10px' }}>
                        {friend.status === 'accepted'
                          ? friend.online ? `online in ${friend.roomId}` : 'offline'
                          : friend.status === 'pending_incoming' ? 'richiesta ricevuta' : 'richiesta inviata'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {friend.status === 'pending_incoming' && (
                        <>
                          <button style={smallButtonStyle} onClick={() => acceptFriendRequest(friend.userId)}>
                            OK
                          </button>
                          <button style={smallButtonStyle} onClick={() => rejectFriendRequest(friend.userId)}>
                            No
                          </button>
                        </>
                      )}
                      {friend.status === 'accepted' && (
                        <button style={smallButtonStyle} onClick={() => setWhisperTarget(friend)}>
                          Whisper
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {friends.length === 0 && (
                  <span style={{ color: '#7777aa', fontSize: '11px' }}>
                    Nessun amico ancora.
                  </span>
                )}
              </div>

              <div style={{
                border: '1px solid rgba(150,150,255,0.22)',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.04)',
                padding: '9px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minHeight: '210px',
              }}>
                <span style={{ color: '#fff4d0', fontSize: '12px', fontWeight: 700 }}>
                  {whisperTarget ? `Whisper: ${whisperTarget.username}` : 'Whisper'}
                </span>
                <div style={{ flex: 1, minHeight: '90px', maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {whisperMessages.length === 0 && (
                    <span style={{ color: '#7777aa', fontSize: '11px' }}>Nessun whisper recente.</span>
                  )}
                  {whisperMessages.map((message: any) => (
                    <div key={message.id} style={{
                      color: message.fromUserId === userId ? '#88ffbb' : '#e0e0ff',
                      background: 'rgba(10,10,30,0.58)',
                      border: '1px solid rgba(150,150,255,0.16)',
                      borderRadius: '5px',
                      padding: '5px 7px',
                      fontSize: '11px',
                      lineHeight: 1.35,
                    }}>
                      <span style={{ color: '#fff4d0' }}>{message.fromUserId === userId ? 'Tu' : message.fromUsername}</span>
                      <span style={{ color: '#7777aa' }}>:</span>{' '}
                      <span>{message.text}</span>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendWhisper();
                  }}
                  style={{ display: 'flex', gap: '6px' }}
                >
                  <input
                    value={whisperDraft}
                    maxLength={CHAT_MAX_LENGTH}
                    disabled={!whisperTarget}
                    onChange={(event) => setWhisperDraft(event.target.value)}
                    placeholder={whisperTarget ? 'Messaggio privato...' : 'Scegli un amico'}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: '32px',
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
                    disabled={!whisperTarget || !normalizeChatText(whisperDraft)}
                    style={{
                      ...smallButtonStyle,
                      height: '32px',
                      ...(!whisperTarget || !normalizeChatText(whisperDraft) ? disabledButtonStyle : {}),
                    }}
                  >
                    Invia
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
