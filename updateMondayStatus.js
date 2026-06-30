const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function run() {
  console.log("======================================");
  console.log("Update Monday Status iniciado");
  console.log("======================================");

  console.log("Monday Token:", MONDAY_TOKEN ? "OK" : "NO ENCONTRADO");
  console.log("Supabase URL:", SUPABASE_URL ? "OK" : "NO ENCONTRADA");
  console.log("Supabase Key:", SUPABASE_KEY ? "OK" : "NO ENCONTRADA");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
