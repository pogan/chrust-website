// Zachowanie podstrony /anatema. Bez zależności, bez inline-scriptów (CSP jak na
// stronie głównej). Każdy fragment jest osłonięty sprawdzeniem obecności
// elementu, więc ten sam plik może wisieć na każdej z podstron.

document.addEventListener('DOMContentLoaded', function () {

	// --- Scroll-reveal ---------------------------------------------------------
	var revealables = document.querySelectorAll('.reveal');
	if (revealables.length) {
		if (!('IntersectionObserver' in window)) {
			revealables.forEach(function (el) { el.classList.add('is-visible'); });
		} else {
			var io = new IntersectionObserver(function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						entry.target.classList.add('is-visible');
						io.unobserve(entry.target);
					}
				});
			}, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
			revealables.forEach(function (el) { io.observe(el); });
		}
	}

	// --- Przedsprzedaż -------------------------------------------------------------
	var buy = document.getElementById('buy');
	if (!buy) return;

	var UNIT = 180;
	var MAX = 10;
	var qty = 1;

	var qtyVal = document.getElementById('qty-val');
	var amount = document.getElementById('buy-amount');
	var dec = document.getElementById('qty-dec');
	var inc = document.getElementById('qty-inc');
	var consent = document.getElementById('consent');
	var errorEl = document.getElementById('buy-error');

	function render() {
		qtyVal.textContent = String(qty);
		amount.textContent = (UNIT * qty) + ' zł';
		dec.disabled = qty <= 1;
		inc.disabled = qty >= MAX;
	}

	function syncBuyEnabled() {
		buy.disabled = !(consent && consent.checked);
	}

	dec.addEventListener('click', function () { if (qty > 1) { qty--; render(); } });
	inc.addEventListener('click', function () { if (qty < MAX) { qty++; render(); } });
	if (consent) consent.addEventListener('change', syncBuyEnabled);

	buy.addEventListener('click', function () {
		if (buy.disabled) return;
		buy.disabled = true;
		buy.textContent = 'Przekierowanie do płatności…';
		if (errorEl) errorEl.textContent = '';

		fetch('/anatema/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ qty: qty })
		})
			.then(function (res) {
				return res.json().catch(function () { return {}; }).then(function (data) {
					if (!res.ok || !data.url) {
						throw new Error(data.error || 'Nie udało się rozpocząć płatności.');
					}
					return data.url;
				});
			})
			.then(function (url) {
				window.location.href = url;
			})
			.catch(function (err) {
				if (errorEl) errorEl.textContent = err.message;
				buy.disabled = false;
				buy.textContent = 'Zamawiam w przedsprzedaży';
				syncBuyEnabled();
			});
	});

	render();
	syncBuyEnabled();
});
