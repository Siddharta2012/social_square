import React, { useEffect, useState } from 'react';
import {
  CHAT_MAX_LENGTH,
  JUKEBOX_PLAY_COST,
  ORDER_ITEMS,
  PETAL_ACTION_COST,
  POOL_PLAY_COST,
  normalizeChatText,
  normalizePoolState,
  orderItemLabel,
  parseJukeboxExternalTrack,
} from '@social-square/shared';
import type { AvatarConfig, EmoteId } from '@social-square/shared';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import { AuthForm } from './AuthForm';
import { VoiceControls } from './VoiceControls';
import { AudioSettingsModal } from './AudioSettingsModal';
import { PoolOverlay } from './PoolOverlay';
import { eventBus } from '../eventBus';
import { fastTravelLocations } from '../world/locations';
import { claimDailyPresence, fetchAccountProfile, logoutAccount } from '../api/account';

type MobilePanel = 'actions' | 'chat' | null;

export const HUD: React.FC = () => {
  const showAuthForm = useGameStore((s) => s.showAuthForm);
  const setShowAuthForm = useGameStore((s) => s.setShowAuthForm);
  const showAudioSettings = useGameStore((s) => s.showAudioSettings);
  const setShowAudioSettings = useGameStore((s) => s.setShowAudioSettings);
  const isConnected = useGameStore((s) => s.isConnected);
  const currentRoomId = useGameStore((s) => s.currentRoomId);
  const roomName = useGameStore((s) => s.roomName);
  const locationName = useGameStore((s) => s.locationName);
  const routeHint = useGameStore((s) => s.routeHint);
  const travelTargetName = useGameStore((s) => s.travelTargetName);
  const usersInRoom = useGameStore((s) => s.usersInRoom);
  const petals = useGameStore((s) => s.petals);
  const voiceAvailable = useGameStore((s) => s.voiceAvailable);
  const voiceMuted = useGameStore((s) => s.voiceMuted);
  const speakingUsers = useGameStore((s) => s.speakingUsers);
  const setVoiceMuted = useGameStore((s) => s.setVoiceMuted);
  const heldItem = useGameStore((s) => s.heldItem);
  const worldLoading = useGameStore((s) => s.worldLoading);
  const localAvatarState = useGameStore((s) => s.localAvatarState);
  const jukeboxStatus = useGameStore((s) => s.jukeboxStatus);
  const poolStatus = useGameStore((s) => s.poolStatus);
  const showPoolOverlay = useGameStore((s) => s.showPoolOverlay);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const waiterStatus = useGameStore((s) => s.waiterStatus);
  const actionAvailability = useGameStore((s) => s.actionAvailability);
  const showWorldMap = useGameStore((s) => s.showWorldMap);
  const setShowWorldMap = useGameStore((s) => s.setShowWorldMap);
  const userActionMenu = useGameStore((s) => s.userActionMenu);
  const setUserActionMenu = useGameStore((s) => s.setUserActionMenu);
  const showDebugOverlay = useGameStore((s) => s.showDebugOverlay);
  const worldDebugMetrics = useGameStore((s) => s.worldDebugMetrics);
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const token = useUserStore((s) => s.token);
  const setUser = useUserStore((s) => s.setUser);
  const setAvatarConfig = useUserStore((s) => s.setAvatarConfig);
  const clearUser = useUserStore((s) => s.clearUser);
  const setPetals = useGameStore((s) => s.setPetals);
  const [chatDraft, setChatDraft] = useState('');
  const [showJukeboxLink, setShowJukeboxLink] = useState(false);
  const [jukeboxUrlDraft, setJukeboxUrlDraft] = useState('');
  const [jukeboxUrlError, setJukeboxUrlError] = useState('');
  const [clockNow, setClockNow] = useState(Date.now());
  const [isCompactHud, setIsCompactHud] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [dailyPresenceMsg, setDailyPresenceMsg] = useState('');

  const inRoom = currentRoomId !== null;
  const travelOptions = fastTravelLocations();
  const pool = normalizePoolState(poolStatus);
  const poolActive = pool.phase === 'waiting' || pool.phase === 'playing';
  const poolIsMine = pool.players.some((player) => player.userId === userId);
  const poolSecondsLeft = pool.expiresAt && poolActive
    ? Math.max(0, Math.ceil((pool.expiresAt - clockNow) / 1000))
    : 0;
  const poolTimeLeft = poolSecondsLeft > 0
    ? `${Math.floor(poolSecondsLeft / 60)}:${String(poolSecondsLeft % 60).padStart(2, '0')}`
    : '';
  const jukeboxActive = jukeboxStatus?.playing === true;
  const jukeboxSecondsLeft = jukeboxStatus?.expiresAt
    ? Math.max(0, Math.ceil((jukeboxStatus.expiresAt - clockNow) / 1000))
    : 0;
  const jukeboxTimeLeft = jukeboxSecondsLeft > 0
    ? `${Math.floor(jukeboxSecondsLeft / 60)}:${String(jukeboxSecondsLeft % 60).padStart(2, '0')}`
    : '';
  const jukeboxLabel = jukeboxStatus?.playing
    ? `${jukeboxStatus.title}${jukeboxStatus.requestedBy ? ` di ${jukeboxStatus.requestedBy}` : ''}${jukeboxTimeLeft ? ` ${jukeboxTimeLeft}` : ''}`
    : `Jukebox ${JUKEBOX_PLAY_COST} petali`;
  const debugRows = worldDebugMetrics
    ? [
      ['fps', worldDebugMetrics.fps || '-'],
      ['frame', `${worldDebugMetrics.frameMs}ms`],
      ['loc', worldDebugMetrics.locationName ?? '-'],
      ['route', worldDebugMetrics.routeHint ?? '-'],
      ['load', worldDebugMetrics.worldLoading ?? '-'],
      ['tile', worldDebugMetrics.localTile ?? '-'],
      ['stream', `${worldDebugMetrics.activeSectors}/${worldDebugMetrics.loadedSectors}/${worldDebugMetrics.inFlightSectors}`],
      ['world', `${worldDebugMetrics.worldSectors} map / ${worldDebugMetrics.renderedSectors} draw`],
      ['decor', `${worldDebugMetrics.decorations} obj / ${worldDebugMetrics.lights} luci`],
      ['iso', `${worldDebugMetrics.isoObjects}${worldDebugMetrics.isoDirty ? ' dirty' : ''}`],
      ...Object.entries(worldDebugMetrics.extra).map(([key, value]) => [key, String(value ?? '-')]),
    ] as Array<[string, string | number]>
    : [];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('authToken');
    const authError = params.get('authError');
    const shouldStart = params.get('start') === '1';
    const nextToken = callbackToken ?? token;

    if (authError) {
      console.error('[Auth]', authError);
      params.delete('authError');
      window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
      return;
    }

    if (!nextToken) return;
    let cancelled = false;
    void fetchAccountProfile(nextToken)
      .then((profile) => {
        if (cancelled) return;
        setUser(profile.userId, profile.username, nextToken, profile.avatarConfig);
        setAvatarConfig(profile.avatarConfig);
        setPetals(profile.petals);
        setShowAuthForm(false);
        if (callbackToken) {
          params.delete('authToken');
          params.delete('start');
          window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
        }
        if (shouldStart) eventBus.emit('start-game', profile.username);
      })
      .catch(() => {
        if (!cancelled) useUserStore.getState().clearUser();
      });

    return () => { cancelled = true; };
  }, [setAvatarConfig, setPetals, setShowAuthForm, setUser, token]);

  useEffect(() => {
    if (!jukeboxActive && !poolActive) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [jukeboxActive, poolActive]);

  useEffect(() => {
    const updateLayoutMode = () => {
      const compact = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
      setIsCompactHud(compact);
      if (!compact) setMobilePanel(null);
    };

    updateLayoutMode();
    window.addEventListener('resize', updateLayoutMode);
    return () => window.removeEventListener('resize', updateLayoutMode);
  }, []);

  const handleAuthSuccess = (data: {
    userId: string;
    username: string;
    token: string;
    petals: number;
    avatarConfig: AvatarConfig;
  }) => {
    setUser(data.userId, data.username, data.token, data.avatarConfig);
    setAvatarConfig(data.avatarConfig);
    setPetals(data.petals);
    setShowAuthForm(false);
    eventBus.emit('start-game', data.username);
  };

  const handleExit = () => { eventBus.emit('exit-room'); };

  const handleLogout = () => {
    void logoutAccount(token).finally(() => {
      if (inRoom) eventBus.emit('exit-room');
      clearUser();
      setPetals(0);
      setShowAuthForm(true);
      setMobilePanel(null);
    });
  };

  const handleDailyPresence = () => {
    setDailyPresenceMsg('');
    void claimDailyPresence(token).then((result) => {
      if (!result) {
        setDailyPresenceMsg('Non disponibile');
        return;
      }
      setPetals(result.petals);
      setDailyPresenceMsg(result.awarded ? '+100 presenza' : 'Gia preso oggi');
    });
  };

  const handleVoiceToggle = () => {
    eventBus.emit('voice-toggle');
    setVoiceMuted(!voiceMuted);
  };

  const handleInputChange = (deviceId: string) => {
    eventBus.emit('audio-input-change', deviceId);
  };

  const emitEmote = (emoteId: EmoteId) => {
    eventBus.emit('emote', emoteId);
  };

  const sendChat = () => {
    const text = normalizeChatText(chatDraft);
    if (!text) return;
    eventBus.emit('chat-send', text);
    setChatDraft('');
  };

  const submitJukeboxUrl = () => {
    if (!canUseJukebox) {
      setJukeboxUrlError('Avvicinati al jukebox');
      return;
    }
    if (jukeboxActive) {
      setJukeboxUrlError('Jukebox in corso');
      return;
    }
    if (petals < JUKEBOX_PLAY_COST) {
      setJukeboxUrlError(`Servono ${JUKEBOX_PLAY_COST} petali`);
      return;
    }
    const url = jukeboxUrlDraft.trim();
    if (!parseJukeboxExternalTrack(url)) {
      setJukeboxUrlError('Link YouTube non valido');
      return;
    }

    eventBus.emit('jukebox-play-url', url);
    setJukeboxUrlDraft('');
    setJukeboxUrlError('');
    setShowJukeboxLink(false);
  };

  const waiterIsMine = waiterStatus?.customerId === userId;
  const waiterCanCall = !waiterStatus || waiterStatus.phase === 'idle' || waiterStatus.phase === 'delivered';
  const waiterQueueSize = waiterStatus?.queue?.length ?? 0;
  const waiterAwaitingOrder = waiterStatus?.phase === 'awaiting-order' && waiterIsMine;
  const waiterAlreadyWaiting = waiterIsMine && !waiterCanCall && !waiterAwaitingOrder;
  const waiterCanQueue = Boolean(waiterStatus && !waiterCanCall && !waiterIsMine);
  const canUseJukebox = actionAvailability.nearJukebox;
  const canUseWaiter = actionAvailability.nearWaiter;
  const canUsePool = actionAvailability.nearPool;
  const canAffordAction = petals >= PETAL_ACTION_COST;
  const waiterButtonEnabled = canUseWaiter && !waiterAwaitingOrder && !waiterAlreadyWaiting && (waiterCanCall || waiterCanQueue);
  const waiterLabel = waiterCanCall
    ? 'Cameriere'
    : waiterStatus?.phase === 'approaching'
      ? waiterQueueSize > 0 ? `Arrivo +${waiterQueueSize}` : 'Arrivo...'
      : waiterStatus?.phase === 'awaiting-order'
        ? waiterIsMine ? 'Scegli' : waiterCanQueue ? 'Mettiti in coda' : 'Occupato'
        : waiterStatus?.phase === 'to-counter'
          ? 'Al bancone'
          : waiterStatus?.phase === 'delivering'
            ? 'In consegna'
            : waiterStatus?.phase === 'returning'
              ? 'Rientro'
              : 'Cameriere';

  const smallButtonStyle: React.CSSProperties = {
    background: 'rgba(150,150,255,0.1)',
    border: '1px solid rgba(150,150,255,0.35)',
    color: '#aaaaff',
    fontFamily: 'monospace',
    fontSize: '11px',
    height: '28px',
    padding: '0 9px',
    cursor: 'pointer',
    borderRadius: '3px',
  };

  const disabledButtonStyle: React.CSSProperties = {
    opacity: 0.44,
    cursor: 'default',
  };

  const mobileButtonStyle: React.CSSProperties = {
    ...smallButtonStyle,
    flex: 1,
    minWidth: 0,
    height: '42px',
    padding: '0 6px',
    fontSize: '10px',
    borderRadius: '5px',
  };

  const mobileSheetStyle: React.CSSProperties = {
    position: 'absolute',
    left: '8px',
    right: '8px',
    bottom: '60px',
    zIndex: 132,
    maxHeight: '46vh',
    overflowY: 'auto',
    background: 'rgba(8,10,24,0.94)',
    border: '1px solid rgba(150,150,255,0.34)',
    borderRadius: '8px',
    padding: '10px',
    pointerEvents: 'auto',
    boxShadow: '0 14px 34px rgba(0,0,0,0.42)',
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', fontFamily: 'monospace',
    }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: isCompactHud ? '8px' : 0,
        left: isCompactHud ? '8px' : 0,
        right: isCompactHud ? '8px' : 0,
        padding: isCompactHud ? '7px 10px' : '8px 16px',
        background: 'rgba(10,10,30,0.85)',
        backdropFilter: 'blur(4px)',
        color: '#e0e0ff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: isCompactHud ? '8px' : undefined,
        fontSize: isCompactHud ? '11px' : '12px',
        borderBottom: '1px solid rgba(100,100,200,0.2)',
        borderRadius: isCompactHud ? '7px' : 0,
        pointerEvents: 'auto',
      }}>
        <span style={{
          fontWeight: 'bold',
          color: '#8888ff',
          letterSpacing: '0.05em',
          display: isCompactHud ? 'none' : 'inline',
        }}>
          Social Square
        </span>

        {inRoom && (locationName || roomName) && (
          <div style={{
            position: isCompactHud ? 'static' : 'absolute',
            left: isCompactHud ? undefined : '50%',
            transform: isCompactHud ? undefined : 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCompactHud ? 'flex-start' : 'center',
            gap: '1px',
            minWidth: 0,
            flex: isCompactHud ? 1 : undefined,
            pointerEvents: 'none',
          }}>
            <span style={{
              color: '#fff4d0',
              fontSize: isCompactHud ? '12px' : '13px',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isCompactHud ? '52vw' : undefined,
            }}>
              {locationName ?? roomName}
            </span>
            <span style={{
              color: routeHint ? '#88ffbb' : '#7777aa',
              fontSize: '9px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isCompactHud ? '52vw' : undefined,
            }}>
              {routeHint ?? 'location'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: isCompactHud ? '6px' : '12px' }}>
          {inRoom && (
            <span style={{
              color: '#ffe14d',
              fontSize: '11px',
              border: '1px solid rgba(255,225,77,0.28)',
              background: 'rgba(255,225,77,0.08)',
              padding: '3px 7px',
              borderRadius: '3px',
            }}>
              Petali {petals}
            </span>
          )}
          {inRoom && !isCompactHud && (
            <span style={{ color: '#8888aa', fontSize: '11px' }}>
              {usersInRoom} {usersInRoom === 1 ? 'utente' : 'utenti'}
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px',
            color: isConnected ? '#44ff88' : inRoom ? '#ff4444' : '#555588',
          }}>
            <span style={{
              display: 'inline-block',
              width: '7px', height: '7px', borderRadius: '50%',
              background: isConnected ? '#44ff88' : inRoom ? '#ff4444' : '#333355',
              boxShadow: isConnected ? '0 0 6px #44ff88aa' : 'none',
            }} />
            {isCompactHud ? '' : isConnected ? (username ?? 'connesso') : inRoom ? 'disconnesso' : ''}
          </span>
        </div>
      </div>

      {/* Bottom bar — solo in stanza */}
      {inRoom && speakingUsers.length > 0 && (
        <div style={{
          position: 'absolute',
          top: isCompactHud ? '58px' : '50px',
          right: isCompactHud ? '8px' : '16px',
          zIndex: 124,
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          pointerEvents: 'none',
          maxWidth: isCompactHud ? 'calc(100vw - 16px)' : '260px',
        }}>
          {speakingUsers.map((speaker) => {
            const side = speaker.pan < -0.22 ? 'L' : speaker.pan > 0.22 ? 'R' : 'C';
            return (
              <div key={speaker.userId} style={{
                display: 'grid',
                gridTemplateColumns: '18px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: '7px',
                background: 'rgba(10,10,30,0.82)',
                border: '1px solid rgba(136,255,187,0.32)',
                borderRadius: '5px',
                padding: '5px 7px',
                color: '#dfffee',
                fontSize: '10px',
                boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
              }}>
                <span style={{ color: '#88ffbb', fontWeight: 700 }}>{side}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {speaker.username}
                </span>
                <span style={{ color: '#88aabb' }}>{speaker.distance.toFixed(1)}m</span>
              </div>
            );
          })}
        </div>
      )}

      {inRoom && (jukeboxActive || (poolActive && poolTimeLeft)) && (
        <div style={{
          position: 'absolute',
          top: isCompactHud ? '58px' : '50px',
          left: isCompactHud ? '8px' : '16px',
          zIndex: 123,
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          pointerEvents: 'none',
          maxWidth: isCompactHud ? 'calc(100vw - 16px)' : '420px',
        }}>
          {jukeboxActive && jukeboxTimeLeft && (
            <div style={{
              color: '#fff4d0',
              background: 'rgba(20,18,42,0.88)',
              border: '1px solid rgba(255,244,208,0.26)',
              borderRadius: '5px',
              padding: '5px 8px',
              fontSize: '11px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
            }}>
              Jukebox {jukeboxTimeLeft}
            </div>
          )}
          {poolActive && poolTimeLeft && (
            <div style={{
              color: poolIsMine ? '#bfffe4' : '#d8dcff',
              background: 'rgba(10,24,22,0.88)',
              border: '1px solid rgba(120,255,190,0.26)',
              borderRadius: '5px',
              padding: '5px 8px',
              fontSize: '11px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
            }}>
              Biliardo {poolTimeLeft}
            </div>
          )}
        </div>
      )}

      {inRoom && !isCompactHud && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '8px 16px',
          background: 'rgba(10,10,30,0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          borderTop: '1px solid rgba(100,100,200,0.2)',
          pointerEvents: 'auto',
        }}>
          <span style={{ color: '#555588' }}>
            Clicca su un tile per muoverti &nbsp;·&nbsp; Scroll per zoom
          </span>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              color: jukeboxStatus?.blocked ? '#ffcc88' : '#aaaadd',
              minWidth: 0, maxWidth: '260px',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {jukeboxLabel}
              </span>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox || jukeboxActive}
                title={canUseJukebox ? `${JUKEBOX_PLAY_COST} petali` : 'Avvicinati al jukebox'}
                onClick={() => eventBus.emit('jukebox-toggle')}
              >
                Avvia
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox || jukeboxActive}
                title={canUseJukebox ? `${JUKEBOX_PLAY_COST} petali` : 'Avvicinati al jukebox'}
                onClick={() => eventBus.emit('jukebox-next')}
              >
                Next
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox || jukeboxActive}
                title={canUseJukebox ? 'Incolla link YouTube' : 'Avvicinati al jukebox'}
                onClick={() => {
                  setJukeboxUrlError('');
                  setShowJukeboxLink(!showJukeboxLink);
                }}
              >
                Link
              </button>
            </div>

            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button style={smallButtonStyle} onClick={() => emitEmote('wave')}>Saluta</button>
              <button style={smallButtonStyle} onClick={() => emitEmote('dance')}>Balla</button>
              <button style={smallButtonStyle} onClick={() => emitEmote('clap')}>Applauso</button>
              <button style={smallButtonStyle} onClick={() => setShowWorldMap(!showWorldMap)}>
                Mappa
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUsePool ? disabledButtonStyle : {}) }}
                disabled={!canUsePool}
                title={canUsePool ? `${POOL_PLAY_COST} petali` : 'Avvicinati al biliardo'}
                onClick={() => eventBus.emit('pool-open')}
              >
                Biliardo
              </button>
              <button style={smallButtonStyle} onClick={handleDailyPresence} title={dailyPresenceMsg || 'Bonus presenza'}>
                Presenza
              </button>
              <button
                style={{
                  ...smallButtonStyle,
                  color: waiterAwaitingOrder ? '#ffe14d' : '#aaaaff',
                  borderColor: waiterAwaitingOrder ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
                  opacity: waiterButtonEnabled ? 1 : 0.44,
                  cursor: waiterButtonEnabled ? 'pointer' : 'default',
                }}
                disabled={!waiterButtonEnabled}
                title={canUseWaiter ? waiterCanQueue ? 'Mettiti in coda' : 'Chiama il cameriere' : 'Avvicinati al cameriere'}
                onClick={() => {
                  if (waiterButtonEnabled) eventBus.emit('waiter-call');
                }}
              >
                {waiterLabel}
              </button>
              {localAvatarState === 'sit' && (
                <button style={smallButtonStyle} onClick={() => eventBus.emit('leave-seat')}>
                  Alzati
                </button>
              )}
            </div>

            {/* Audio settings gear */}
            <button
              onClick={() => setShowAudioSettings(true)}
              title="Impostazioni audio"
              style={{
                background: showAudioSettings
                  ? 'rgba(150,150,255,0.25)'
                  : 'rgba(150,150,255,0.1)',
                border: '1px solid rgba(150,150,255,0.35)',
                color: '#aaaaff',
                fontFamily: 'monospace',
                fontSize: '14px',
                width: '32px', height: '28px',
                cursor: 'pointer', borderRadius: '3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(150,150,255,0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = showAudioSettings ? 'rgba(150,150,255,0.25)' : 'rgba(150,150,255,0.1)')}
            >
              ⚙
            </button>

            <VoiceControls
              available={voiceAvailable}
              muted={voiceMuted}
              onToggle={handleVoiceToggle}
            />

            <button
              onClick={handleExit}
              style={{
                background: 'rgba(255,80,80,0.15)',
                border: '1px solid rgba(255,80,80,0.4)',
                color: '#ff8888', fontFamily: 'monospace', fontSize: '11px',
                padding: '4px 14px', cursor: 'pointer', borderRadius: '3px',
                letterSpacing: '0.05em',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,80,80,0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,80,80,0.15)')}
            >
              Esci
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(150,150,255,0.1)',
                border: '1px solid rgba(150,150,255,0.35)',
                color: '#aaaaff', fontFamily: 'monospace', fontSize: '11px',
                padding: '4px 10px', cursor: 'pointer', borderRadius: '3px',
              }}
            >
              Account
            </button>
          </div>
        </div>
      )}

      {inRoom && isCompactHud && (
        <>
          <div style={{
            position: 'absolute',
            left: '8px',
            right: '8px',
            bottom: '8px',
            zIndex: 131,
            display: 'flex',
            gap: '6px',
            pointerEvents: 'auto',
          }}>
            <button
              style={{
                ...mobileButtonStyle,
                color: mobilePanel === 'actions' ? '#ffe14d' : '#aaaaff',
                borderColor: mobilePanel === 'actions' ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
              }}
              onClick={() => setMobilePanel(mobilePanel === 'actions' ? null : 'actions')}
            >
              Azioni
            </button>
            <button
              style={{
                ...mobileButtonStyle,
                color: mobilePanel === 'chat' ? '#ffe14d' : '#aaaaff',
                borderColor: mobilePanel === 'chat' ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
              }}
              onClick={() => setMobilePanel(mobilePanel === 'chat' ? null : 'chat')}
            >
              Chat
            </button>
            <button
              style={mobileButtonStyle}
              onClick={() => {
                setMobilePanel(null);
                setShowWorldMap(!showWorldMap);
              }}
            >
              Mappa
            </button>
            <button
              style={mobileButtonStyle}
              onClick={() => {
                setMobilePanel(null);
                setShowAudioSettings(true);
              }}
            >
              Audio
            </button>
          </div>

          {mobilePanel === 'actions' && (
            <div style={mobileSheetStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '9px',
              }}>
                <span style={{ color: '#fff4d0', fontSize: '12px', fontWeight: 700 }}>
                  Azioni
                </span>
                <button style={smallButtonStyle} onClick={() => setMobilePanel(null)}>
                  Chiudi
                </button>
              </div>

              {heldItem && (
                <button
                  style={{
                    ...smallButtonStyle,
                    width: '100%',
                    height: '40px',
                    marginBottom: '8px',
                    color: '#ffe14d',
                    borderColor: 'rgba(255,225,77,0.48)',
                  }}
                  onClick={() => eventBus.emit('consume-held-item')}
                >
                  Usa {heldItem === 'beer' ? 'birra' : 'pretzel'}
                </button>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <button style={smallButtonStyle} onClick={() => emitEmote('wave')}>Saluta</button>
                <button style={smallButtonStyle} onClick={() => emitEmote('dance')}>Balla</button>
                <button style={smallButtonStyle} onClick={() => emitEmote('clap')}>Applauso</button>
              </div>

              <button
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginBottom: '8px',
                  color: dailyPresenceMsg.startsWith('+') ? '#ffe14d' : '#aaaaff',
                }}
                onClick={handleDailyPresence}
              >
                {dailyPresenceMsg || 'Bonus presenza'}
              </button>

              <button
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginBottom: '8px',
                  ...(!canUsePool ? disabledButtonStyle : {}),
                }}
                disabled={!canUsePool}
                onClick={() => {
                  setMobilePanel(null);
                  eventBus.emit('pool-open');
                }}
              >
                Biliardo
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <button
                  style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                  disabled={!canUseJukebox || jukeboxActive}
                  onClick={() => eventBus.emit('jukebox-toggle')}
                >
                  Jukebox
                </button>
                <button
                  style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                  disabled={!canUseJukebox || jukeboxActive}
                  onClick={() => eventBus.emit('jukebox-next')}
                >
                  Next
                </button>
                <button
                  style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                  disabled={!canUseJukebox || jukeboxActive}
                  onClick={() => {
                    setJukeboxUrlError('');
                    setMobilePanel(null);
                    setShowJukeboxLink(!showJukeboxLink);
                  }}
                >
                  Link
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: localAvatarState === 'sit' ? '1fr 1fr' : '1fr', gap: '6px' }}>
                <button
                  style={{
                    ...smallButtonStyle,
                    height: '36px',
                    color: waiterAwaitingOrder ? '#ffe14d' : '#aaaaff',
                    borderColor: waiterAwaitingOrder ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
                    opacity: waiterButtonEnabled ? 1 : 0.44,
                    cursor: waiterButtonEnabled ? 'pointer' : 'default',
                  }}
                  disabled={!waiterButtonEnabled}
                  onClick={() => {
                    if (waiterButtonEnabled) eventBus.emit('waiter-call');
                  }}
                >
                  {waiterLabel}
                </button>
                {localAvatarState === 'sit' && (
                  <button style={{ ...smallButtonStyle, height: '36px' }} onClick={() => eventBus.emit('leave-seat')}>
                    Alzati
                  </button>
                )}
              </div>

              {jukeboxStatus?.playing && (
                <div style={{
                  marginTop: '8px',
                  color: '#aaaadd',
                  fontSize: '10px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {jukeboxLabel}
                </div>
              )}

              <button
                onClick={handleExit}
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginTop: '9px',
                  color: '#ff8888',
                  borderColor: 'rgba(255,80,80,0.42)',
                  background: 'rgba(255,80,80,0.14)',
                }}
              >
                Esci
              </button>
              <button
                onClick={handleLogout}
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginTop: '7px',
                }}
              >
                Cambia account
              </button>
            </div>
          )}

          {mobilePanel === 'chat' && (
            <div style={mobileSheetStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}>
                <span style={{ color: '#fff4d0', fontSize: '12px', fontWeight: 700 }}>
                  Chat
                </span>
                <button style={smallButtonStyle} onClick={() => setMobilePanel(null)}>
                  Chiudi
                </button>
              </div>

              <div style={{
                maxHeight: '24vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                marginBottom: '8px',
              }}>
                {chatMessages.length === 0 && (
                  <span style={{ color: '#7777aa', fontSize: '11px' }}>Nessun messaggio</span>
                )}
                {chatMessages.slice(-8).map((message) => (
                  <div key={message.id} style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(150,150,255,0.16)',
                    borderRadius: '5px',
                    padding: '5px 7px',
                    color: '#e0e0ff',
                    fontSize: '11px',
                    lineHeight: 1.35,
                  }}>
                    <span style={{ color: '#88ffbb', fontWeight: 'bold' }}>{message.username}</span>
                    <span style={{ color: '#7777aa' }}>:</span>{' '}
                    <span>{message.text}</span>
                  </div>
                ))}
              </div>

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
                    height: '38px',
                    boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(150,150,255,0.32)',
                    borderRadius: '5px',
                    color: '#e0e0ff',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    padding: '0 10px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!normalizeChatText(chatDraft)}
                  style={{
                    ...smallButtonStyle,
                    height: '38px',
                    opacity: normalizeChatText(chatDraft) ? 1 : 0.48,
                    cursor: normalizeChatText(chatDraft) ? 'pointer' : 'default',
                  }}
                >
                  Invia
                </button>
              </form>
            </div>
          )}
        </>
      )}

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
              {travelOptions.map((location) => (
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
              Premi
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
              {chatMessages.slice(-4).map((message) => (
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
            Ordina - {PETAL_ACTION_COST} petali
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
                ? 'Avvicinati al cameriere'
                : !canAffordAction
                  ? `Servono ${PETAL_ACTION_COST} petali`
                  : `${PETAL_ACTION_COST} petali`}
              onClick={() => {
                if (canUseWaiter && canAffordAction) eventBus.emit('waiter-order', item.id);
              }}
            >
              {orderItemLabel(item.id)}
            </button>
          ))}
        </div>
      )}

      {/* World loading feedback */}
      {worldLoading === 'initial' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 150,
          display: 'flex', flexDirection: 'column', gap: '14px',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,8,20,0.95)',
          color: '#aaaaff', fontFamily: 'monospace', fontSize: '14px',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: '28px', height: '28px',
            border: '3px solid rgba(120,120,255,0.25)',
            borderTopColor: '#8888ff',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          Caricamento mondo...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {worldLoading === 'streaming' && (
        <div style={{
          position: 'absolute', top: '48px', right: '12px', zIndex: 150,
          background: 'rgba(10,10,30,0.85)',
          border: '1px solid rgba(120,120,255,0.3)',
          borderRadius: '4px', padding: '5px 10px',
          color: '#8888cc', fontFamily: 'monospace', fontSize: '11px',
          pointerEvents: 'none',
        }}>
          {travelTargetName ? `Verso ${travelTargetName}...` : 'Caricamento area...'}
        </div>
      )}

      {inRoom && showDebugOverlay && (
        <div style={{
          position: 'absolute',
          top: '52px',
          left: '12px',
          zIndex: 151,
          minWidth: '220px',
          maxWidth: 'min(340px, calc(100vw - 24px))',
          background: 'rgba(4,6,14,0.86)',
          border: '1px solid rgba(120,200,255,0.35)',
          borderRadius: '4px',
          padding: '8px 9px',
          color: '#bfe8ff',
          fontFamily: 'monospace',
          fontSize: '10px',
          pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '5px',
            color: '#fff4d0',
            fontWeight: 700,
          }}>
            <span>Performance</span>
            <span>F3</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: '3px 8px' }}>
            {debugRows.map(([label, value]) => (
              <React.Fragment key={label}>
                <span style={{ color: '#6f94aa' }}>{label}</span>
                <span style={{
                  color: '#d7f5ff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {value}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Auth form overlay */}
      {showAuthForm && <AuthForm onSuccess={handleAuthSuccess} />}

      {/* Audio settings modal */}
      {showAudioSettings && (
        <AudioSettingsModal
          onClose={() => setShowAudioSettings(false)}
          onInputChange={handleInputChange}
        />
      )}
    </div>
  );
};
