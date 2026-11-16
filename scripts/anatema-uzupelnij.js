// Jednorazowe uzupełnienie data/anatema-orders.jsonl: dla zamówień bez imienia
// i nazwiska pobiera sesję ze Stripe i wpisuje imię, nazwisko oraz adres wysyłki
// (patrz orderRow w anatema.js). Domyślnie tylko pokazuje, co by zmienił;
// zapisuje dopiero z --zapisz (wcześniej kopia pliku obok, z sufiksem .bak-DATA).
//
//   node scripts/anatema-uzupelnij.js            # podgląd
//   node scripts/anatema-uzupelnij.js --zapisz   # zapis
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
const { orderRow } = require('../anatema');

const FILE = path.join(__dirname, '..', 'data', 'anatema-orders.jsonl');
const write = process.argv.includes('--zapisz');

async function main() {
	if (!process.env.STRIPE_SECRET_KEY) throw new Error('brak STRIPE_SECRET_KEY w .env');
	const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
	const lines = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
	const rows = lines.map((l) => JSON.parse(l));

	let changed = 0;
	for (const row of rows) {
		if (row.name) continue;
		const session = await stripe.checkout.sessions.retrieve(row.sessionId, {
			expand: ['line_items', 'shipping_cost.shipping_rate', 'customer_details.tax_ids'],
		});
		const fresh = orderRow(session);
		if (!fresh.name) {
			console.log(`${row.ts} ${row.sessionId}: Stripe też nie ma imienia i nazwiska`);
			continue;
		}
		console.log(`${row.ts} ${row.sessionId}: ${fresh.name} | ${row.address || '—'} -> ${fresh.address || '—'}`);
		row.name = fresh.name;
		row.address = fresh.address;
		changed++;
	}

	console.log(`Do uzupełnienia: ${changed} z ${rows.length} zamówień.`);
	if (!write || !changed) {
		if (changed) console.log('Podgląd - nic nie zapisano. Zapis: --zapisz');
		return;
	}
	const backup = `${FILE}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
	fs.copyFileSync(FILE, backup);
	fs.writeFileSync(`${FILE}.tmp`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
	fs.renameSync(`${FILE}.tmp`, FILE);
	console.log(`Zapisano. Kopia poprzedniej wersji: ${path.basename(backup)}`);
}

main().catch((err) => {
	console.error('anatema-uzupelnij:', err.message);
	process.exit(1);
});
