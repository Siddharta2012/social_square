import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AudioSettingsModalProps {
  onClose: () => void;
  onInputChange?: (deviceId: string) => void;
}

const canSetSinkId = typeof HTMLAudioElement !== 'undefined' &&
  'setSinkId' in HTMLAudioElement.prototype;

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  onClose,
  onInputChange,
}) => {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [level, setLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  // ── Device enumeration ────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputs(devices.filter((d) => d.kind === 'audioinput'));
    setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
  }, []);

  // ── Mic stream & level meter ──────────────────────────────────────────────

  const startMeter = useCallback(async (deviceId?: string) => {
    // Stop any previous stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(rafRef.current);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      setPermissionDenied(false);

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        setLevel(Math.min(100, (avg / 128) * 200)); // normalize to 0-100
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Populate device labels now that permission is granted
      await loadDevices();
    } catch {
      setPermissionDenied(true);
    }
  }, [loadDevices]);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadDevices();
    void startMeter();
    return () => { stopMeter(); };
  }, [loadDevices, startMeter, stopMeter]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInputChange = async (deviceId: string) => {
    setSelectedInput(deviceId);
    await startMeter(deviceId);
    onInputChange?.(deviceId);
  };

  const handleOutputTest = async () => {
    if (testingOutput) return;
    setTestingOutput(true);

    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.8);

      // Route to selected output via a silent <audio> element with setSinkId
      if (canSetSinkId && selectedOutput) {
        const el = document.createElement('audio');
        const dest = ctx.createMediaStreamDestination();
        gain.connect(dest);
        el.srcObject = dest.stream;
        await (el as any).setSinkId(selectedOutput);
        void el.play();
        setTimeout(() => { el.pause(); el.srcObject = null; }, 1000);
      }

      setTimeout(() => {
        void ctx.close();
        setTestingOutput(false);
      }, 900);
    } catch {
      setTestingOutput(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const levelColor = level > 70 ? '#ff8844' : level > 30 ? '#44ff88' : '#2a8a55';

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,5,20,0.75)',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'auto',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div style={{
        background: 'rgba(18,18,48,0.98)',
        border: '1px solid rgba(100,100,220,0.35)',
        borderRadius: '10px',
        padding: '28px 32px',
        width: '360px',
        fontFamily: 'monospace',
        color: '#e0e0ff',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <span style={{ fontSize: '14px', color: '#aaaaff', fontWeight: 'bold' }}>
            ⚙️ Impostazioni Audio
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#666699',
            fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px',
          }}>✕</button>
        </div>

        {permissionDenied ? (
          <p style={{ color: '#ff7777', fontSize: '12px', margin: '0 0 16px' }}>
            ⚠ Accesso al microfono negato. Abilita il permesso nelle impostazioni del browser.
          </p>
        ) : (
          <>
            {/* Input selector */}
            <Section label="Microfono">
              <Select
                value={selectedInput}
                options={inputs}
                onChange={(v) => { void handleInputChange(v); }}
                placeholder="Microfono predefinito"
              />
              {/* Level meter */}
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '10px', color: '#555588', marginBottom: '4px' }}>
                  Livello ingresso
                </div>
                <div style={{
                  height: '8px', borderRadius: '4px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(100,100,200,0.2)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${level}%`,
                    background: levelColor,
                    borderRadius: '4px',
                    transition: 'width 60ms linear, background 200ms',
                    boxShadow: level > 5 ? `0 0 6px ${levelColor}88` : 'none',
                  }} />
                </div>
              </div>
            </Section>

            {/* Output selector */}
            <Section label="Altoparlante" style={{ marginTop: '20px' }}>
              {canSetSinkId ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={selectedOutput}
                      options={outputs}
                      onChange={setSelectedOutput}
                      placeholder="Altoparlante predefinito"
                    />
                  </div>
                  <button
                    onClick={() => { void handleOutputTest(); }}
                    disabled={testingOutput}
                    style={{
                      marginTop: '1px',
                      padding: '8px 12px',
                      background: testingOutput
                        ? 'rgba(68,136,255,0.1)'
                        : 'rgba(68,136,255,0.18)',
                      border: '1px solid rgba(68,136,255,0.45)',
                      borderRadius: '4px',
                      color: '#88aaff',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      cursor: testingOutput ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {testingOutput ? '♪ …' : '▶ Test'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#555588', margin: 0 }}>
                  Selezione output non supportata da questo browser.
                </p>
              )}
            </Section>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: '24px', textAlign: 'right' }}>
          <button onClick={onClose} style={{
            padding: '8px 20px',
            background: 'rgba(68,255,136,0.15)',
            border: '1px solid rgba(68,255,136,0.4)',
            borderRadius: '4px',
            color: '#44ff88',
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
          }}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Section: React.FC<{
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ label, children, style }) => (
  <div style={style}>
    <div style={{ fontSize: '10px', color: '#666699', marginBottom: '6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {label}
    </div>
    {children}
  </div>
);

const Select: React.FC<{
  value: string;
  options: MediaDeviceInfo[];
  onChange: (v: string) => void;
  placeholder: string;
}> = ({ value, options, onChange, placeholder }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%',
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(100,100,200,0.35)',
      borderRadius: '4px',
      color: '#e0e0ff',
      fontFamily: 'monospace',
      fontSize: '12px',
      outline: 'none',
      cursor: 'pointer',
    }}
  >
    <option value="">{placeholder}</option>
    {options.map((d) => (
      <option key={d.deviceId} value={d.deviceId}>
        {d.label || `Dispositivo ${d.deviceId.slice(0, 8)}`}
      </option>
    ))}
  </select>
);
