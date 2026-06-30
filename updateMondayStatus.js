const BOARD_ID = 18403062987;
const STATUS_COLUMN_ID = "color_mm1rvtsv"; // ESTADO FABRICACION

const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const STAGE_LABEL_MAP = {
  CUADRE: "CERRADO",
  CERRADO: "CERRADO",
  CORTE: "CORTE",
  PEGADO: "PEGADO",
  CANTOS: "CANTOS",
  COSTURA: "COSTURA",
  QA: "QA",
  BODEGA: "BODEGA",
  TROQUEL: "TROQUEL",
  ESTAMPADO: "ESTAMPADO",
  DESPACHADO: "DESPACHADO",
  PUNTAS: "PUNTAS",
  ATRAQUE: "ATRAQUE",
  LASER: "LASER",
  MANUALIDADES: "MANUALIDADES",
  PARCIAL: "PARCIAL"
};

function clean(v) {
  return String(v || "").trim();
}

function norm(v) {
  return clean(v).toUpperCase();
}

function mondayLabel(etapa) {
  const e = norm(etapa);
  return STAGE_LABEL_MAP[e] || e;
}

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase error ${res.status}: ${txt}`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getPendingScans() {
  return await supabaseFetch(
    "scan_log?select=id,orden,etapa,timestamp,created_at&sync_monday=eq.false&order=timestamp.asc&limit=100",
    { method: "GET" }
  );
}

async function getMondayOrder(orden) {
  const encoded = encodeURIComponent(orden);

  const rows = await supabaseFetch(
    `monday_orders?select=orden,item_id,estado&orden=eq.${encoded}&limit=1`,
    { method: "GET" }
  );

  return rows && rows.length ? rows[0] : null;
}

async function markScanSynced(id) {
  await supabaseFetch(`scan_log?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ sync_monday: true })
  });
}

async function updateMondayStatus(itemId, label) {
  const mutation = `
    mutation {
      change_column_value(
        board_id: ${BOARD_ID},
        item_id: ${itemId},
        column_id: "${STATUS_COLUMN_ID}",
        value: "${JSON.stringify({ label }).replace(/"/g, '\\"')}"
      ) {
        id
      }
    }
  `;

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN
    },
    body: JSON.stringify({ query: mutation })
  });

  const data = await res.json();

  if (!res.ok || data.errors) {
    throw new Error(`Monday error: ${JSON.stringify(data.errors || data)}`);
  }

  return data;
}

async function run() {
  console.log("======================================");
  console.log("Update Monday Status iniciado");
  console.log("======================================");

  if (!MONDAY_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Faltan variables de entorno.");
  }

  const scans = await getPendingScans();

  if (!scans || !scans.length) {
    console.log("No hay escaneos pendientes.");
    return;
  }

  console.log(`Escaneos pendientes: ${scans.length}`);

  for (const scan of scans) {
    const orden = clean(scan.orden);
    const etapa = clean(scan.etapa);
    const label = mondayLabel(etapa);

    try {
      console.log(`Procesando scan ${scan.id}: ${orden} -> ${label}`);

      if (!orden || !etapa) {
        console.log(`Scan ${scan.id} omitido: orden o etapa vacía.`);
        await markScanSynced(scan.id);
        continue;
      }

      const mondayOrder = await getMondayOrder(orden);

      if (!mondayOrder || !mondayOrder.item_id) {
        console.log(`Orden no encontrada en monday_orders: ${orden}`);
        await markScanSynced(scan.id);
        continue;
      }

      await updateMondayStatus(mondayOrder.item_id, label);

      await markScanSynced(scan.id);

      console.log(`OK: ${orden} actualizado a ${label}`);
    } catch (err) {
      console.error(`ERROR scan ${scan.id}:`, err.message);
    }
  }

  console.log("Proceso terminado.");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
