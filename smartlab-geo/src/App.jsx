import React, { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';
import {
  Activity,
  Cpu,
  DoorOpen,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  LockOpen,
  Power,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  UploadCloud,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

const APK_DIRECT_URL =
  'https://github.com/delfin2492/smartlab-geo/releases/latest/download/SmartLab-GEO.apk';
const PWA_HTTPS_URL = 'https://delfin2492.github.io/smartlab-geo/';

const DEFAULT_CONFIG = {
  wsUrl: 'ws://mqtt.vantara.my.id:9001',
  username: '',
  password: '',
  topicCommand: 'smartlab-geo/door/exit/command',
  topicStatus: 'smartlab-geo/door/exit/status',
  topicAvailability: 'smartlab-geo/door/exit/availability',
  topicIp: 'smartlab-geo/door/exit/ip',
  wemosDirectIp: '',
  autoUnlockOnLaunch: false,
};

function loadConfig() {
  try {
    const raw = localStorage.getItem('smartlab_geo_cfg_v1');
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export default function App() {
  const [config, setConfig] = useState(loadConfig);
  const [formCfg, setFormCfg] = useState(config);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'logs' | 'settings'
  const [showInstallModal, setShowInstallModal] = useState(false);

  const [brokerState, setBrokerState] = useState('connecting'); // 'connected' | 'connecting' | 'disconnected' | 'https_blocked'
  const [relayStatus, setRelayStatus] = useState('OFF');
  const [wemosAvail, setWemosAvail] = useState('online');
  const [wemosIp, setWemosIp] = useState(
    () => localStorage.getItem('smartlab_wemos_ip') || '-'
  );

  const [isPressing, setIsPressing] = useState(false);
  const [unlockCount, setUnlockCount] = useState(
    () => Number(localStorage.getItem('smartlab_unlock_count') || 0)
  );
  const [lastUnlockTime, setLastUnlockTime] = useState(
    () => localStorage.getItem('smartlab_last_unlock') || 'Belum ada'
  );
  const [logs, setLogs] = useState([]);
  const [customPayload, setCustomPayload] = useState('ON');
  const [toastMsg, setToastMsg] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const clientRef = useRef(null);
  const autoTriggeredRef = useRef(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const addLog = (topic, payload, dir = 'RX') => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    setLogs((prev) => [
      {
        id: `${now.getTime()}-${Math.random()}`,
        time,
        topic,
        payload,
        dir,
      },
      ...prev.slice(0, 59),
    ]);
  };

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (clientRef.current) {
      try {
        clientRef.current.end(true);
      } catch {}
    }

    const isHttpsPage = window.location.protocol === 'https:';
    const isWsInsecure = config.wsUrl.trim().toLowerCase().startsWith('ws://');

    if (isHttpsPage && isWsInsecure) {
      setBrokerState('https_blocked');
      addLog(
        'SYSTEM',
        'Halaman HTTPS memblokir ws://. Gunakan Aplikasi APK Android atau izinkan Insecure Content di pengaturan situs browser.',
        'SYS'
      );
    } else {
      setBrokerState('connecting');
    }

    const clientId = `SmartLabGEO_PWA_${Math.random().toString(16).slice(2, 8)}`;
    const options = {
      clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 4000,
    };

    if (config.username) {
      options.username = config.username;
      options.password = config.password;
    }

    let client;
    try {
      client = mqtt.connect(config.wsUrl, options);
      clientRef.current = client;
    } catch (err) {
      setBrokerState('disconnected');
      addLog('ERROR', String(err?.message || err), 'SYS');
      return;
    }

    client.on('connect', () => {
      setBrokerState('connected');
      addLog('SYSTEM', `Terhubung ke ${config.wsUrl}`, 'SYS');

      client.subscribe(
        [config.topicStatus, config.topicAvailability, config.topicIp],
        { qos: 0 }
      );

      const params = new URLSearchParams(window.location.search);
      if (
        !autoTriggeredRef.current &&
        (params.get('action') === 'unlock' || config.autoUnlockOnLaunch)
      ) {
        autoTriggeredRef.current = true;
        setTimeout(() => {
          triggerDoorCommand('ON', true);
        }, 250);
      }
    });

    client.on('reconnect', () => {
      setBrokerState('connecting');
    });

    client.on('close', () => {
      setBrokerState((prev) =>
        prev === 'https_blocked' ? 'https_blocked' : 'disconnected'
      );
    });

    client.on('error', (err) => {
      addLog('MQTT_ERR', err?.message || 'Koneksi gagal', 'SYS');
    });

    client.on('message', (topic, messageBuffer) => {
      const payload = messageBuffer.toString().trim();
      addLog(topic, payload, 'RX');

      if (topic === config.topicStatus) {
        setRelayStatus(payload.toUpperCase());
      } else if (topic === config.topicAvailability) {
        setWemosAvail(payload.toLowerCase());
      } else if (topic === config.topicIp) {
        setWemosIp(payload);
        localStorage.setItem('smartlab_wemos_ip', payload);
      }
    });

    return () => {
      try {
        client.end(true);
      } catch {}
    };
  }, [config]);

  const recordUnlockStats = () => {
    const nextCount = unlockCount + 1;
    const nowTime = new Date().toTimeString().split(' ')[0];
    setUnlockCount(nextCount);
    setLastUnlockTime(nowTime);
    localStorage.setItem('smartlab_unlock_count', String(nextCount));
    localStorage.setItem('smartlab_last_unlock', nowTime);
  };

  const triggerDoorCommand = async (cmd = 'ON', isAutoShortcut = false) => {
    if (navigator.vibrate) {
      navigator.vibrate(cmd === 'ON' ? [40, 30, 60] : [35]);
    }
    setIsPressing(true);
    setTimeout(() => setIsPressing(false), 220);

    const client = clientRef.current;
    if (client && client.connected) {
      client.publish(config.topicCommand, cmd, { qos: 0, retain: false });
      addLog(config.topicCommand, cmd, 'TX');
      if (cmd === 'ON') {
        recordUnlockStats();
        showToast(
          isAutoShortcut
            ? '1-Tap Widget: Membuka Pintu...'
            : 'Perintah BUKA PINTU (ON) terkirim!'
        );
      } else {
        showToast('Perintah KUNCI PINTU (OFF) terkirim!');
      }
      return;
    }

    const targetIp =
      config.wemosDirectIp || (wemosIp !== '-' ? wemosIp : '');
    if (targetIp) {
      try {
        const endpoint = cmd === 'ON' ? 'open' : 'close';
        await fetch(`http://${targetIp}/api/${endpoint}`, {
          method: 'POST',
          mode: 'no-cors',
        });
        addLog(`HTTP://${targetIp}/api/${endpoint}`, cmd, 'TX');
        if (cmd === 'ON') recordUnlockStats();
        showToast(`Terkirim via WiFi Lokal (${targetIp})`);
        return;
      } catch {}
    }

    showToast('Belum terhubung ke MQTT Broker!');
  };

  const handleNativePwaPrompt = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallModal(true);
    }
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('smartlab_geo_cfg_v1', JSON.stringify(formCfg));
    setConfig(formCfg);
    showToast('Konfigurasi disimpan & menghubungkan ulang...');
    setActiveTab('dashboard');
  };

  const isDoorOpen = relayStatus === 'ON';
  const effectiveIp =
    config.wemosDirectIp || (wemosIp !== '-' ? wemosIp : null);

  return (
    <div className="app-viewport">
      <div className="mobile-shell">
        {/* Top App Bar */}
        <header className="top-bar">
          <div className="brand-row">
            <div className="brand-logo">
              <DoorOpen size={22} color="#38bdf8" />
            </div>
            <div>
              <div className="brand-title">SmartLab-GEO</div>
              <div className="brand-subtitle">
                Smart Door & Access Telemetry
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="icon-btn"
              title="Install Aplikasi & Widget di HP"
              onClick={() => setShowInstallModal(true)}
            >
              <Smartphone size={18} />
            </button>
            <button
              className="icon-btn"
              title="Pengaturan Broker & OTA"
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* Live Telemetry Bar */}
        <section className="telemetry-strip">
          <div className="status-item">
            <span
              className={`pulse-dot ${
                brokerState === 'connected'
                  ? 'online'
                  : brokerState === 'connecting'
                  ? 'connecting'
                  : 'offline'
              }`}
            />
            <div style={{ minWidth: 0 }}>
              <div className="status-label">
                {brokerState === 'connected'
                  ? 'MQTT Connected'
                  : brokerState === 'connecting'
                  ? 'Connecting Broker...'
                  : brokerState === 'https_blocked'
                  ? 'Gunakan APK / Allow WS'
                  : 'Broker Disconnected'}
              </div>
              <div className="status-sub">
                {effectiveIp
                  ? `Wemos IP: ${effectiveIp}`
                  : config.wsUrl.replace(/^wss?:\/\//, '')}
              </div>
            </div>
          </div>

          <div
            className={`wemos-badge ${
              wemosAvail === 'online' ? 'online' : 'offline'
            }`}
          >
            <Cpu size={13} />
            <span>WEMOS: {wemosAvail.toUpperCase()}</span>
          </div>
        </section>

        {/* Toast Notification */}
        {toastMsg && (
          <div
            style={{
              margin: '12px 20px 0',
              padding: '11px 14px',
              borderRadius: '14px',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#a7f3d0',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Sparkles size={15} />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* TAB 1: DASHBOARD UTAMA */}
        {activeTab === 'dashboard' && (
          <main className="content-area">
            {/* Hero Tactile Door Unlock Widget */}
            <div className={`hero-stage ${isDoorOpen ? 'is-open' : ''}`}>
              <div className="room-tag">
                <ShieldCheck size={14} color="#38bdf8" />
                <span>LAB GEO • EXIT DOOR ACCESS</span>
              </div>

              <div className="door-orb-wrap">
                <div className="orb-ring" />
                <div className="orb-pulse" />
                <button
                  type="button"
                  onClick={() => triggerDoorCommand('ON')}
                  className={`door-trigger-btn ${isDoorOpen ? 'open' : ''} ${
                    isPressing ? 'pressing' : ''
                  }`}
                >
                  {isDoorOpen ? (
                    <LockOpen size={56} strokeWidth={2.2} />
                  ) : (
                    <KeyRound size={54} strokeWidth={2.2} />
                  )}
                  <span className="door-btn-title">
                    {isDoorOpen ? 'TERBUKA' : 'BUKA PINTU'}
                  </span>
                  <span className="door-btn-caption">
                    {isDoorOpen ? 'Relay Aktif (ON)' : 'Sentuh untuk Buka'}
                  </span>
                </button>
              </div>

              <div className="hero-state-line">
                Status Pintu:{' '}
                <strong
                  style={{
                    color: isDoorOpen ? '#34d399' : '#38bdf8',
                  }}
                >
                  {isDoorOpen ? 'TERBUKA (UNLOCKED)' : 'TERKUNCI (STANDBY)'}
                </strong>
              </div>
            </div>

            {/* Quick Controls Grid */}
            <div className="quick-grid">
              <button
                type="button"
                className="action-card"
                onClick={() => triggerDoorCommand('ON')}
              >
                <div className="action-icon emerald">
                  <Zap size={20} />
                </div>
                <div>
                  <div className="action-title">Trigger Buka</div>
                  <div className="action-desc">Kirim payload ON</div>
                </div>
              </button>

              <button
                type="button"
                className="action-card"
                onClick={() => triggerDoorCommand('OFF')}
              >
                <div className="action-icon rose">
                  <Power size={20} />
                </div>
                <div>
                  <div className="action-title">Kunci Pintu</div>
                  <div className="action-desc">Kirim payload OFF</div>
                </div>
              </button>

              <button
                type="button"
                className="action-card"
                onClick={() => setShowInstallModal(true)}
              >
                <div className="action-icon cyan">
                  <Download size={20} />
                </div>
                <div>
                  <div className="action-title">Install di HP</div>
                  <div className="action-desc">APK & Widget Layar</div>
                </div>
              </button>

              <button
                type="button"
                className="action-card"
                onClick={() => {
                  if (effectiveIp) {
                    window.open(`http://${effectiveIp}/update`, '_blank');
                  } else {
                    setActiveTab('settings');
                    showToast(
                      'Masukkan IP Wemos atau tunggu Wemos mengirim IP via MQTT.'
                    );
                  }
                }}
              >
                <div className="action-icon amber">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <div className="action-title">Update OTA</div>
                  <div className="action-desc">
                    {effectiveIp ? effectiveIp : 'Web Firmware OTA'}
                  </div>
                </div>
              </button>
            </div>

            {/* Telemetry Summary Card */}
            <div className="glass-card">
              <div className="card-header">
                <div className="card-title">
                  <Activity size={16} color="#38bdf8" />
                  <span>Ringkasan Telemetri Pintu</span>
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: '#64748b',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  D5 • Active-LOW
                </span>
              </div>

              <div className="stats-row">
                <div className="stat-box">
                  <div
                    className="stat-value"
                    style={{
                      color: isDoorOpen ? '#34d399' : '#f8fafc',
                    }}
                  >
                    {relayStatus}
                  </div>
                  <div className="stat-label">Status Relay</div>
                </div>

                <div className="stat-box">
                  <div className="stat-value">{unlockCount}x</div>
                  <div className="stat-label">Akses Dibuka</div>
                </div>

                <div className="stat-box">
                  <div className="stat-value">{lastUnlockTime}</div>
                  <div className="stat-label">Terakhir Buka</div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* TAB 2: LIVE MQTT LOGS & TESTER */}
        {activeTab === 'logs' && (
          <main className="content-area">
            <div className="glass-card">
              <div className="card-header">
                <div className="card-title">
                  <Send size={15} color="#38bdf8" />
                  <span>Kirim Perintah MQTT Manual</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="form-input"
                  value={customPayload}
                  onChange={(e) => setCustomPayload(e.target.value)}
                  placeholder="ON atau OFF"
                />
                <button
                  type="button"
                  className="primary-btn"
                  style={{ width: 'auto', padding: '0 18px' }}
                  onClick={() => triggerDoorCommand(customPayload.trim())}
                >
                  Kirim
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ flex: 1 }}>
              <div className="card-header">
                <div className="card-title">
                  <Terminal size={16} color="#34d399" />
                  <span>Live MQTT Traffic Monitor</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  Bersihkan
                </button>
              </div>

              {logs.length === 0 ? (
                <div
                  style={{
                    padding: '36px 12px',
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: '0.78rem',
                  }}
                >
                  Belum ada trafik paket MQTT.
                </div>
              ) : (
                <div className="log-list">
                  {logs.map((item) => (
                    <div key={item.id} className="log-item">
                      <div className="log-meta">
                        <span
                          className={
                            item.dir === 'TX' ? 'badge-tx' : 'badge-rx'
                          }
                        >
                          {item.dir === 'TX'
                            ? 'TX PUBLISH ->'
                            : item.dir === 'RX'
                            ? 'RX MESSAGE <-'
                            : 'SYSTEM'}
                        </span>
                        <span>{item.time}</span>
                      </div>
                      <div style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>
                        <span style={{ color: '#64748b' }}>{item.topic}:</span>{' '}
                        <strong style={{ color: '#f8fafc' }}>
                          {item.payload}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}

        {/* TAB 3: PENGATURAN BROKER, WIDGET & WEB OTA */}
        {activeTab === 'settings' && (
          <main className="content-area">
            <form className="glass-card" onSubmit={handleSaveSettings}>
              <div className="card-header">
                <div className="card-title">
                  <Wifi size={16} color="#38bdf8" />
                  <span>Konfigurasi Koneksi MQTT & Wemos</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  MQTT WebSocket URL (Port 9001 Aktif)
                </label>
                <input
                  className="form-input"
                  value={formCfg.wsUrl}
                  onChange={(e) =>
                    setFormCfg({ ...formCfg, wsUrl: e.target.value })
                  }
                  placeholder="ws://mqtt.vantara.my.id:9001"
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                }}
              >
                <div className="form-group">
                  <label className="form-label">MQTT Username</label>
                  <input
                    className="form-input"
                    value={formCfg.username}
                    onChange={(e) =>
                      setFormCfg({ ...formCfg, username: e.target.value })
                    }
                    placeholder="Kosongkan jika tanpa auth"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">MQTT Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={formCfg.password}
                    onChange={(e) =>
                      setFormCfg({ ...formCfg, password: e.target.value })
                    }
                    placeholder="••••••"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Topic Command</label>
                <input
                  className="form-input"
                  value={formCfg.topicCommand}
                  onChange={(e) =>
                    setFormCfg({ ...formCfg, topicCommand: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Topic Status</label>
                <input
                  className="form-input"
                  value={formCfg.topicStatus}
                  onChange={(e) =>
                    setFormCfg({ ...formCfg, topicStatus: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  IP Lokal Wemos (Opsional - Otomatis terisi via MQTT)
                </label>
                <input
                  className="form-input"
                  value={formCfg.wemosDirectIp}
                  onChange={(e) =>
                    setFormCfg({ ...formCfg, wemosDirectIp: e.target.value })
                  }
                  placeholder={wemosIp !== '-' ? wemosIp : '192.168.1.xxx'}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  margin: '10px 0 16px',
                  fontSize: '0.76rem',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={formCfg.autoUnlockOnLaunch}
                  onChange={(e) =>
                    setFormCfg({
                      ...formCfg,
                      autoUnlockOnLaunch: e.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Mode 1-Tap Widget:</strong> Langsung kirim perintah
                  BUKA PINTU begitu ikon aplikasi di layar HP disentuh.
                </span>
              </label>

              <button type="submit" className="primary-btn">
                <RefreshCw size={16} />
                <span>Simpan & Hubungkan Ulang</span>
              </button>
            </form>

            {/* Web OTA Card */}
            <div className="glass-card">
              <div className="card-header">
                <div className="card-title">
                  <UploadCloud size={16} color="#fbbf24" />
                  <span>Wemos Web OTA Firmware Update</span>
                </div>
              </div>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  lineHeight: 1.5,
                  marginBottom: '12px',
                }}
              >
                Update program Wemos tanpa kabel USB melalui WiFi lokal. Login
                default: user <code>admin</code> / pass <code>admin</code>.
              </p>
              {effectiveIp ? (
                <a
                  href={`http://${effectiveIp}/update`}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={16} />
                  <span>Buka Web OTA ({effectiveIp}/update)</span>
                </a>
              ) : (
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#fbbf24',
                  }}
                >
                  Menunggu Wemos mengirimkan IP lokal ke topic{' '}
                  <code>smartlab-geo/door/exit/ip</code>...
                </div>
              )}
            </div>
          </main>
        )}

        {/* MODAL: INSTALL APLIKASI & WIDGET LANGSUNG DI HP */}
        {showInstallModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              background: 'rgba(2, 6, 23, 0.82)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '18px',
            }}
            onClick={() => setShowInstallModal(false)}
          >
            <div
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '400px',
                background: '#0f172a',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                padding: '20px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 800,
                    fontSize: '0.96rem',
                  }}
                >
                  <Smartphone size={19} color="#38bdf8" />
                  <span>Pasang Aplikasi & Widget di HP</span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 32, height: 32 }}
                  onClick={() => setShowInstallModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Opsi 1: File APK Asli (Tanpa Chrome Badge + Ada Widget Layar Utama Android) */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '16px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#34d399',
                    marginBottom: '6px',
                  }}
                >
                  1. Install Aplikasi Android (.APK) + Widget HP
                </div>
                <p
                  style={{
                    fontSize: '0.73rem',
                    color: '#cbd5e1',
                    lineHeight: 1.45,
                    marginBottom: '12px',
                  }}
                >
                  Agar ter-install sebagai <strong>Aplikasi HP penuh</strong>{' '}
                  (bukan sekadar pintasan Chrome) dan memiliki{' '}
                  <strong>Tombol Widget BUKA PINTU di Layar Depan HP</strong>,
                  unduh file <code>SmartLab-GEO.apk</code> (desain React ini):
                </p>
                <a
                  href={APK_DIRECT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-btn"
                  style={{
                    textDecoration: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <Download size={16} />
                  <span>Download SmartLab-GEO.apk (Langsung)</span>
                </a>
              </div>

              {/* Opsi 2: Scan QR dari HP atau Install WebAPK via HTTPS */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '16px',
                  background: 'rgba(30, 41, 59, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#38bdf8',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <QrCode size={15} />
                  <span>2. Pengguna iPhone (iOS) / Web PWA</span>
                </div>
                <p
                  style={{
                    fontSize: '0.72rem',
                    color: '#94a3b8',
                    lineHeight: 1.45,
                    marginBottom: '10px',
                  }}
                >
                  Buka link HTTPS resmi di Safari iPhone / Chrome HP agar bisa
                  di-install penuh tanpa logo browser:
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(
                      APK_DIRECT_URL
                    )}`}
                    alt="QR Download APK"
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: '10px',
                      background: '#fff',
                      padding: '4px',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontSize: '0.71rem', color: '#cbd5e1' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Scan QR ini dengan kamera HP</strong> untuk
                      langsung men-download <code>SmartLab-GEO.apk</code> ke HP.
                    </div>
                    <a
                      href={PWA_HTTPS_URL}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#38bdf8', fontWeight: 700 }}
                    >
                      Buka Web HTTPS (iOS PWA) &rarr;
                    </a>
                  </div>
                </div>

                {deferredPrompt && (
                  <button
                    type="button"
                    className="primary-btn"
                    style={{ marginTop: '12px' }}
                    onClick={handleNativePwaPrompt}
                  >
                    <Smartphone size={16} />
                    <span>Install Web App Sekarang</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Dock Navigation */}
        <nav className="bottom-nav">
          <button
            type="button"
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Lock size={19} />
            <span>Kontrol Pintu</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={19} />
            <span>Monitor MQTT</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={19} />
            <span>Pengaturan & OTA</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
