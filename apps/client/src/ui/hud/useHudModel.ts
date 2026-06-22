import {
  DAILY_QUESTS,
  FREE_COSMETIC_IDS,
  JUKEBOX_PLAY_COST,
  PETAL_ACTION_COST,
  normalizeChatText,
  normalizePoolState,
  parseJukeboxExternalTrack,
  questProgress,
} from '@social-square/shared';
import { useEffect, useState } from 'react';
import { claimDailyPresence, fetchAccountProfile, logoutAccount } from '../../api/account';
import { createPrivateRoom, joinPrivateRoom } from '../../api/privateRooms';
import { equipCosmetic, fetchShopCatalog, purchaseCosmetic } from '../../api/shop';
import { acceptFriend, fetchFriends, rejectFriend, requestFriend, type FriendSummary } from '../../api/social';
import { eventBus } from '../../eventBus';
import { t } from '../../i18n';
import { useGameStore } from '../../store/gameStore';
import { useUserStore } from '../../store/userStore';
import { fastTravelLocations } from '../../world/locations';
import { disabledButtonStyle, mobileButtonStyle, mobileSheetStyle, smallButtonStyle } from './hudStyles';
import type { AvatarConfig, CosmeticItem, EmoteId, UserProgressSnapshot } from '@social-square/shared';

type MobilePanel = 'actions' | 'chat' | null;

export function useHudModel() {
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
  const progress = useGameStore((s) => s.progress);
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
  const avatarConfig = useUserStore((s) => s.avatarConfig);
  const setUser = useUserStore((s) => s.setUser);
  const setAvatarConfig = useUserStore((s) => s.setAvatarConfig);
  const clearUser = useUserStore((s) => s.clearUser);
  const setPetals = useGameStore((s) => s.setPetals);
  const setProgress = useGameStore((s) => s.setProgress);
  const [chatDraft, setChatDraft] = useState('');
  const [showJukeboxLink, setShowJukeboxLink] = useState(false);
  const [jukeboxUrlDraft, setJukeboxUrlDraft] = useState('');
  const [jukeboxUrlError, setJukeboxUrlError] = useState('');
  const [clockNow, setClockNow] = useState(Date.now());
  const [isCompactHud, setIsCompactHud] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [dailyPresenceMsg, setDailyPresenceMsg] = useState('');
  const [showShop, setShowShop] = useState(false);
  const [shopItems, setShopItems] = useState<CosmeticItem[]>([]);
  const [shopMessage, setShopMessage] = useState('');
  const [unlockedItems, setUnlockedItems] = useState<string[]>([]);
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [socialMessage, setSocialMessage] = useState('');
  const [whisperTarget, setWhisperTarget] = useState<FriendSummary | null>(null);
  const [whisperDraft, setWhisperDraft] = useState('');
  const [inviteCodeDraft, setInviteCodeDraft] = useState('');
  const [privateRoomCode, setPrivateRoomCode] = useState('');
  const [whisperMessages, setWhisperMessages] = useState<Array<{
    id: string;
    fromUserId: string;
    fromUsername: string;
    toUserId: string;
    text: string;
    sentAt: number;
  }>>([]);

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
  const ownedCosmeticIds = new Set([...Array.from(FREE_COSMETIC_IDS), ...unlockedItems]);
  const completedQuestCount = progress
    ? DAILY_QUESTS.filter((quest) => progress.daily.rewardedQuestIds.includes(quest.id)).length
    : 0;
  const progressTitle = progress
    ? DAILY_QUESTS.map((quest) => `${quest.label}: ${Math.min(quest.target, questProgress(progress.daily, quest))}/${quest.target}`).join(' - ')
    : '';
  const jukeboxActive = jukeboxStatus?.playing === true;
  const jukeboxSecondsLeft = jukeboxStatus?.expiresAt
    ? Math.max(0, Math.ceil((jukeboxStatus.expiresAt - clockNow) / 1000))
    : 0;
  const jukeboxTimeLeft = jukeboxSecondsLeft > 0
    ? `${Math.floor(jukeboxSecondsLeft / 60)}:${String(jukeboxSecondsLeft % 60).padStart(2, '0')}`
    : '';
  const jukeboxLabel = jukeboxStatus?.playing
    ? t('hud.jukebox.playing', { title: jukeboxStatus.title, requestedBy: jukeboxStatus.requestedBy ?? '', time: jukeboxTimeLeft })
    : t('hud.jukebox.idle', { cost: JUKEBOX_PLAY_COST });
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
        setProgress(profile.progress);
        setUnlockedItems(profile.unlockedItems);
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
  }, [setAvatarConfig, setPetals, setProgress, setShowAuthForm, setUser, token]);

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

  useEffect(() => {
    const onWhisper = (message: {
      id: string;
      fromUserId: string;
      fromUsername: string;
      toUserId: string;
      text: string;
      sentAt: number;
    }) => {
      setWhisperMessages((current) => [...current, message].slice(-8));
    };
    eventBus.on('whisper-received', onWhisper);
    return () => {
      eventBus.off('whisper-received', onWhisper);
    };
  }, []);

  const handleAuthSuccess = (data: {
    userId: string;
    username: string;
    token: string;
    petals: number;
    avatarConfig: AvatarConfig;
    unlockedItems?: string[];
    progress?: UserProgressSnapshot | null;
  }) => {
    setUser(data.userId, data.username, data.token, data.avatarConfig);
    setAvatarConfig(data.avatarConfig);
    setPetals(data.petals);
    setProgress(data.progress ?? null);
    setUnlockedItems(data.unlockedItems ?? []);
    setShowAuthForm(false);
    eventBus.emit('start-game', data.username);
  };

  const handleExit = () => { eventBus.emit('exit-room'); };

  const handleLogout = () => {
    void logoutAccount(token).finally(() => {
      if (inRoom) eventBus.emit('exit-room');
      clearUser();
      setPetals(0);
      setProgress(null);
      setUnlockedItems([]);
      setFriends([]);
      setWhisperTarget(null);
      setShowFriends(false);
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
      setProgress(result.progress);
      setDailyPresenceMsg(result.awarded
        ? result.levelUp ? `Livello ${result.progress.level}!` : `+${result.petalReward} presenza`
        : 'Gia preso oggi');
    });
  };

  const handleVoiceToggle = () => {
    eventBus.emit('voice-toggle');
    setVoiceMuted(!voiceMuted);
  };

  const openShop = () => {
    setShowShop(true);
    setShopMessage('');
    void fetchShopCatalog().then(setShopItems);
  };

  const openFriends = () => {
    setShowFriends(true);
    setSocialMessage('');
    void fetchFriends(token).then(setFriends);
  };

  const refreshFriends = () => {
    void fetchFriends(token).then(setFriends);
  };

  const addFriendFromMenu = (targetUserId: string) => {
    setSocialMessage('');
    void requestFriend(token, targetUserId).then((friend) => {
      if (!friend) {
        setSocialMessage('Richiesta non inviata');
        return;
      }
      setFriends((current) => [friend, ...current.filter((item) => item.userId !== friend.userId)]);
      setSocialMessage(friend.status === 'accepted' ? 'Amicizia accettata' : 'Richiesta inviata');
      setShowFriends(true);
    });
  };

  const acceptFriendRequest = (targetUserId: string) => {
    void acceptFriend(token, targetUserId).then((ok) => {
      setSocialMessage(ok ? 'Amico aggiunto' : 'Richiesta non trovata');
      refreshFriends();
    });
  };

  const rejectFriendRequest = (targetUserId: string) => {
    void rejectFriend(token, targetUserId).then((ok) => {
      setSocialMessage(ok ? 'Richiesta rifiutata' : 'Richiesta non trovata');
      refreshFriends();
    });
  };

  const sendWhisper = () => {
    const text = normalizeChatText(whisperDraft);
    if (!text || !whisperTarget) return;
    eventBus.emit('whisper-send', { toUserId: whisperTarget.userId, text });
    setWhisperDraft('');
  };

  const enterPrivateRoom = (roomId: string, name: string, code: string) => {
    setPrivateRoomCode(code);
    setSocialMessage(`Stanza ${code}`);
    eventBus.emit('private-room-join', { roomId, name });
  };

  const createInviteRoom = () => {
    void createPrivateRoom(token).then((room) => {
      if (!room) {
        setSocialMessage('Stanza non creata');
        return;
      }
      enterPrivateRoom(room.roomId, room.name, room.code);
    });
  };

  const joinInviteRoom = () => {
    void joinPrivateRoom(token, inviteCodeDraft).then((room) => {
      if (!room) {
        setSocialMessage('Codice non valido');
        return;
      }
      setInviteCodeDraft('');
      enterPrivateRoom(room.roomId, room.name, room.code);
    });
  };

  const buyShopItem = (itemId: string) => {
    if (!token) return;
    setShopMessage('');
    void purchaseCosmetic(token, itemId).then((result) => {
      if (!result) {
        setShopMessage('Petali insufficienti');
        return;
      }
      setPetals(result.petals);
      setUnlockedItems(result.unlockedItems);
      setShopMessage('Sbloccato');
    });
  };

  const equipShopItem = (itemId: string) => {
    if (!token) return;
    setShopMessage('');
    void equipCosmetic(token, itemId).then((result) => {
      if (!result) {
        setShopMessage('Cosmetico bloccato');
        return;
      }
      setAvatarConfig(result.avatarConfig);
      setUnlockedItems(result.unlockedItems);
      eventBus.emit('avatar-updated', result.avatarConfig);
      setShopMessage('Equipaggiato');
    });
  };

  const isShopItemEquipped = (item: CosmeticItem): boolean => {
    if (!item.avatarPatch || !avatarConfig) return false;
    return Object.entries(item.avatarPatch).every(([key, value]) => (
      avatarConfig[key as keyof Pick<AvatarConfig, 'body' | 'outfit' | 'hair' | 'accessory' | 'expression'>] === value
    ));
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
      setJukeboxUrlError(t('jukebox.near'));
      return;
    }
    if (jukeboxActive) {
      setJukeboxUrlError(t('jukebox.locked'));
      return;
    }
    if (petals < JUKEBOX_PLAY_COST) {
      setJukeboxUrlError(t('common.petalsRequired', { cost: JUKEBOX_PLAY_COST }));
      return;
    }
    const url = jukeboxUrlDraft.trim();
    if (!parseJukeboxExternalTrack(url)) {
      setJukeboxUrlError(t('jukebox.invalidUrl'));
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
    ? t('waiter.available').replace(' disponibile al bar', '')
    : waiterStatus?.phase === 'approaching'
      ? waiterQueueSize > 0 ? `Arrivo +${waiterQueueSize}` : 'Arrivo...'
      : waiterStatus?.phase === 'awaiting-order'
        ? waiterIsMine ? 'Scegli' : waiterCanQueue ? t('hud.waiter.queue') : 'Occupato'
        : waiterStatus?.phase === 'to-counter'
          ? t('hud.waiter.counter')
          : waiterStatus?.phase === 'delivering'
            ? 'In consegna'
            : waiterStatus?.phase === 'returning'
              ? 'Rientro'
              : t('waiter.available').replace(' disponibile al bar', '');

  return {
    showAuthForm, showAudioSettings, setShowAudioSettings, isConnected, currentRoomId, roomName, locationName, routeHint, travelTargetName, usersInRoom,
    petals, progress, voiceAvailable, voiceMuted, speakingUsers, heldItem, worldLoading, localAvatarState, jukeboxStatus, showPoolOverlay, chatMessages,
    showWorldMap, setShowWorldMap, userActionMenu, setUserActionMenu, showDebugOverlay, userId, username, token, chatDraft, setChatDraft,
    showJukeboxLink, setShowJukeboxLink, jukeboxUrlDraft, setJukeboxUrlDraft, jukeboxUrlError, setJukeboxUrlError, isCompactHud, mobilePanel, setMobilePanel,
    dailyPresenceMsg, showShop, setShowShop, shopItems, shopMessage, showFriends, setShowFriends, friends, socialMessage, whisperTarget, setWhisperTarget,
    whisperDraft, setWhisperDraft, inviteCodeDraft, setInviteCodeDraft, privateRoomCode, whisperMessages, inRoom, travelOptions, poolActive, poolIsMine,
    poolTimeLeft, ownedCosmeticIds, completedQuestCount, progressTitle, jukeboxActive, jukeboxTimeLeft, jukeboxLabel, debugRows, handleAuthSuccess,
    handleExit, handleLogout, handleDailyPresence, handleVoiceToggle, openShop, openFriends, refreshFriends, addFriendFromMenu, acceptFriendRequest,
    rejectFriendRequest, sendWhisper, createInviteRoom, joinInviteRoom, buyShopItem, equipShopItem, isShopItemEquipped, handleInputChange, emitEmote,
    sendChat, submitJukeboxUrl, waiterAwaitingOrder, waiterCanQueue, canUseJukebox, canUseWaiter, canUsePool, canAffordAction, waiterButtonEnabled,
    waiterLabel, smallButtonStyle, disabledButtonStyle, mobileButtonStyle, mobileSheetStyle,
  };
}
