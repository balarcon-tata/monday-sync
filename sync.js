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

function getCol(cols, names) {
  for (const name of names) {
    const key = norm(name);
    if (cols[key] !== undefined && cols[key] !== '') {
      return cols[key];
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

  const d = new Date(s);
  if (!isNaN(d)) {
    return d.toISOString().slice(0, 10);
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

  console.log('Columnas detectadas:', columns);

  const group = board.groups.find(
    g => g.title.toUpperCase() === targetGroup.toUpperCase()
  );

  if (!group) {
    console.log('No existe grupo:', targetGroup);
    return;
  }

  const rows = group.items_page.items.map(item => {
    const cols = {};

    item.column_values.forEach(c => {
      const title = columns[c.id] || c.id;
      cols[norm(title)] = c.text || '';
    });

    return {
      orden: item.name,

      cliente: getCol(cols, [
        'Ejecutivo'
      ]),

      estilo: getCol(cols, [
        'Estilo/color',
        'Estilo Color',
        'Name'
      ]) || item.name,

      tipo: getCol(cols, [
        'tipo/proyecto',
        'Tipo Proyecto'
      ]),

      cantidad: toNumber(getCol(cols, [
        'Cantidad',
        'Canti...',
        'CANTI',
        'TOTAL'
      ])),

      estado: getCol(cols, [
        'ESTADO FABRICACION',
        'Estado Fabricacion'
      ]),

      ex_date: toDateOrNull(getCol(cols, [
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
