// /anatema/orders — logowanie jest w panelu /kierownik (vamude-kit); tu tylko
// wylogowanie i usuwanie zamówień.
document.addEventListener('DOMContentLoaded', function () {
	var logoutBtn = document.getElementById('orders-logout');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', function () {
			fetch('/kierownik/wyloguj', { method: 'POST', headers: { Accept: 'application/json' } }).then(function () {
				window.location.href = '/kierownik';
			});
		});
	}

	Array.prototype.forEach.call(document.querySelectorAll('.orders__delete'), function (btn) {
		btn.addEventListener('click', function () {
			var sessionId = btn.getAttribute('data-session-id');
			if (!sessionId) return;
			if (!window.confirm('Na pewno usunąć to zamówienie? Tej operacji nie można cofnąć.')) return;

			btn.disabled = true;
			fetch('/anatema/orders/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId: sessionId }),
			})
				.then(function (r) {
					return r.json().then(function (data) {
						return { ok: r.ok && data.ok, error: data.error };
					});
				})
				.then(function (result) {
					if (result.ok) {
						window.location.reload();
					} else {
						btn.disabled = false;
						window.alert(result.error || 'Nie udało się usunąć zamówienia.');
					}
				})
				.catch(function () {
					btn.disabled = false;
					window.alert('Błąd sieci. Spróbuj ponownie.');
				});
		});
	});
});
