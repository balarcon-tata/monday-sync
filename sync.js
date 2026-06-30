const BOARD_ID = 18403062987;

const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function getWeekNumber() {
  const nowGT = new Date(new Date().toLocaleString('en-US', {
    timeZone: 'America/Guatemala'
  }));

  const d = new Date(Date.UTC(
    nowGT.getFullYear(),
    nowGT.getMonth(),
    nowGT.getDate()
  ));

  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/_\-\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function pick(raw, normalized, names) {
  for (const name of names) {
    if (raw[name] !== undefined && raw[name] !== '') return raw[name];

    const key = norm(name);
    if (normalized[key] !== undefined && normalized[key] !== '') {
      return normalized[key];
    }
  }

  return '';
}

function toNumber(v) {
  const n = Number(String(v || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toDateOrNull(v) {
  if (!v) return null;

  const s = String(v).trim();

  if (!s || s === '-') return null;

  const direct = new Date(s);
  if (!isNaN(direct)) {
    return direct.toISOString().slice(0, 10);
  }

  const months = {
    ene: 0,
    enero: 0,
    feb: 1,
    febrero: 1,
    mar: 2,
    marzo: 2,
    abr: 3,
    abril: 3,
    may: 4,
    mayo: 4,
    jun: 5,
    junio: 5,
    jul: 6,
    julio: 6,
    ago: 7,
    agosto: 7,
    sep: 8,
    sept: 8,
    septiembre: 8,
    oct: 9,
    octubre: 9,
    nov: 10,
    noviembre: 10,
    dic: 11,
    diciembre: 11
  };

  const m = s.toLowerCase().match(/(\d{1,2})\s+([a-záéíóúñ]+)\.?/i);

  if (m) {
    const day = Number(m[1]);
    const monthName = m[2]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace('.', '')
      .toLowerCase();

    const month = months[monthName];

    if (month !== undefined) {
      const y = new Date().getFullYear();
      return new Date(y, month, day).toISOString().slice(0, 10);
    }
  }

  return null;
}

async function run() {
  const week = getWeekNumber();
  const targetGroup = `SEMANA ${week}`;

  console.log('Buscando:', targetGroup);

  const query = `
    query {
      boards(ids:${BOARD_ID}) {
        columns {
          id
          title
        }

        groups {
          title

          items_page(limit:500) {
            items {
              name

              column_values {
                id
                text
              }
            }
          }
        }
      }
    }
  `;

  const mondayResponse = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_TOKEN
    },
    body: JSON.stringify({ query })
  });

  const mondayData = await mondayResponse.json();

  if (mondayData.errors) {
    console.error('Monday errors:', JSON.stringify(mondayData.errors, null, 2));
    process.exit(1);
  }

  const board = mondayData.data.boards[0];

  const columns = {};

  board.columns.forEach(col => {
    columns[col.id] = col.title;
  });
  console.log(JSON.stringify(columns, null, 2));

  const group = board.groups.find(
    g => g.title.toUpperCase() === targetGroup.toUpperCase()
  );

  if (!group) {
    console.log('No existe grupo:', targetGroup);
    return;
  }

  const rows = group.items_page.items.map(item => {
    const raw = {};
    const normalized = {};

    item.column_values.forEach(c => {
      const title = columns[c.id] || c.id;
      const value = c.text || '';

      raw[title] = value;
      normalized[norm(title)] = value;
    });

    return {
      orden: item.name,

      cliente: pick(raw, normalized, [
        'Ejecutivo',
        'EJECUTIVO'
      ]),

      estilo: pick(raw, normalized, [
        'UNIR ESTILO COLOR',
        'Unir Estilo Color',
        'Estilo/color',
        'Estilo Color'
      ]) || item.name,

      tipo: pick(raw, normalized, [
        'tipo/proyecto',
        'Tipo Proyecto'
      ]),

      cantidad: toNumber(pick(raw, normalized, [
        'Cantidad',
        'Canti...',
        'Canti',
        'TOTAL'
      ])),

      estado: pick(raw, normalized, [
        'ESTADO FABRICACION',
        'Estado Fabricacion'
      ]),

      ex_date: toDateOrNull(pick(raw, normalized, [
        'Ex-date',
        'EX DATE',
        'Ex Date',
        'DESPACHO'
      ])),

      semana: targetGroup
    };
  });

  console.log(rows.length, 'órdenes');
  console.log('Primera fila:', rows[0]);

  await fetch(
    `${SUPABASE_URL}/rest/v1/monday_orders?orden=neq.___nunca___`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal'
      }
    }
  );

  const insertResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/monday_orders`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(rows)
    }
  );

  console.log('Supabase status:', insertResponse.status);

  if (!insertResponse.ok) {
    const txt = await insertResponse.text();
    console.error(txt);
    process.exit(1);
  }
}

run();
