import mqtt from 'mqtt';

const DEFAULT_HOST = process.env.MQTT_HOST || 'mqtt.vantara.my.id';
const DEFAULT_PORT = Number(process.env.MQTT_PORT || 1883);

const TOPIC_COMMAND = 'smartlab-geo/door/exit/command';
const TOPIC_STATUS = 'smartlab-geo/door/exit/status';
const TOPIC_AVAILABILITY = 'smartlab-geo/door/exit/availability';
const TOPIC_IP = 'smartlab-geo/door/exit/ip';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const host = req.query?.host || req.body?.host || DEFAULT_HOST;
  const port = Number(req.query?.port || req.body?.port || DEFAULT_PORT);
  const username = req.body?.username || process.env.MQTT_USERNAME || '';
  const password = req.body?.password || process.env.MQTT_PASSWORD || '';

  const clientId = `SmartLabGEO_Vercel_${Math.random().toString(16).slice(2, 9)}`;
  const connectUrl = `mqtt://${host}:${port}`;

  if (req.method === 'POST') {
    const command = String(req.body?.command || 'ON').trim().toUpperCase();
    const topic = req.body?.topic || TOPIC_COMMAND;

    return new Promise((resolve) => {
      let finished = false;
      const done = (code, data) => {
        if (finished) return;
        finished = true;
        try {
          client.end(true);
        } catch {}
        res.status(code).json(data);
        resolve();
      };

      const client = mqtt.connect(connectUrl, {
        clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 0,
        ...(username ? { username, password } : {}),
      });

      const timer = setTimeout(() => {
        done(504, { ok: false, error: 'Timeout connecting to MQTT broker' });
      }, 4500);

      client.on('connect', () => {
        client.publish(topic, command, { qos: 0, retain: false }, (err) => {
          clearTimeout(timer);
          if (err) {
            done(500, { ok: false, error: err.message });
          } else {
            done(200, { ok: true, topic, command });
          }
        });
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        done(502, { ok: false, error: err.message || 'MQTT Error' });
      });
    });
  }

  return new Promise((resolve) => {
    let finished = false;
    const state = {
      ok: true,
      broker: `${host}:${port}`,
      status: null,
      availability: null,
      ip: null,
    };

    const done = (code, data) => {
      if (finished) return;
      finished = true;
      try {
        client.end(true);
      } catch {}
      res.status(code).json(data);
      resolve();
    };

    const client = mqtt.connect(connectUrl, {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 0,
      ...(username ? { username, password } : {}),
    });

    const timeout = setTimeout(() => {
      done(200, state);
    }, 1200);

    client.on('connect', () => {
      client.subscribe([TOPIC_STATUS, TOPIC_AVAILABILITY, TOPIC_IP], { qos: 0 }, (err) => {
        if (err) {
          clearTimeout(timeout);
          done(500, { ok: false, error: err.message });
          return;
        }
        setTimeout(() => {
          clearTimeout(timeout);
          done(200, state);
        }, 420);
      });
    });

    client.on('message', (topic, message) => {
      const val = message.toString().trim();
      if (topic === TOPIC_STATUS) state.status = val.toUpperCase();
      else if (topic === TOPIC_AVAILABILITY) state.availability = val.toLowerCase();
      else if (topic === TOPIC_IP) state.ip = val;

      if (state.status !== null && state.availability !== null && state.ip !== null) {
        clearTimeout(timeout);
        done(200, state);
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      done(502, { ok: false, error: err.message || 'MQTT Error' });
    });
  });
}
