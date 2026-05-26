const BOARD_ID = 18403062987;

const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function getWeekNumber() {
  const now = new Date();

  const start = new Date(
    now.getFullYear(),
    0,
    1
  );

  const days = Math.floor(
    (now - start) / (24 * 60 * 60 * 1000)
  );

  return Math.ceil(
    (days + start.getDay() + 1) / 7
  );
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

  const mondayResponse =
    await fetch(
      'https://api.monday.com/v2',
      {
        method:'POST',

        headers:{
          'Content-Type':'application/json',
          'Authorization': MONDAY_TOKEN
        },

        body: JSON.stringify({
          query
        })
      }
    );

  const mondayData =
    await mondayResponse.json();

  const board =
    mondayData.data.boards[0];

  const columns = {};

  board.columns.forEach(col => {
    columns[col.id] = col.title;
  });

  const group =
    board.groups.find(
      g =>
        g.title.toUpperCase() ===
        targetGroup.toUpperCase()
    );

  if(!group){

    console.log(
      'No existe grupo:',
      targetGroup
    );

    return;
  }

  const rows =
    group.items_page.items.map(item => {

      const cols = {};

      item.column_values.forEach(c => {

        const title =
          columns[c.id] || c.id;

        cols[title] = c.text;
      });

      return {

        orden:
          item.name,

        cliente:
          cols['Ejecutivo'] || '',

        cantidad:
          Number(
            cols['Cantidad'] || 0
          ),

        estado:
          cols['ESTADO FABRICACION'] || '',

        ex_date:
          cols['DESPACHO'] || null,

        semana:
          targetGroup
      };

    });

  console.log(
    rows.length,
    'órdenes'
  );

  await fetch(
    `${SUPABASE_URL}/rest/v1/monday_orders`,
    {
      method:'DELETE',

      headers:{
        apikey: SUPABASE_KEY,
        Authorization:
          `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const insertResponse =
    await fetch(
      `${SUPABASE_URL}/rest/v1/monday_orders`,
      {
        method:'POST',

        headers:{
          'Content-Type':'application/json',

          apikey: SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          Prefer:
            'return=minimal'
        },

        body: JSON.stringify(rows)
      }
    );

  console.log(
    'Supabase status:',
    insertResponse.status
  );
}

run();
