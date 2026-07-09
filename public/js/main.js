document.addEventListener("DOMContentLoaded", function () {

	let logo = document.getElementById("biglogo");

	let covers = document.getElementsByClassName('cover');
	let activeCover = 0;
	let arrows = document.getElementsByClassName("arrow-down");

	document.addEventListener('keydown', function (e) {

		if (e.keyCode == 40) {
			activeCover++;
		}
		else if (e.keyCode == 38) {
			activeCover--;
		}
		else {
			return 0;
		};

		if (activeCover >= covers.length || activeCover < 0) {
			activeCover = 0;
		}

		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		let nextElement = covers[activeCover];
		window.scrollTo(0, nextElement.offsetTop, 'smooth');

	});

	// click listeners for DOWN ARROWS
	for (let item of arrows) {
		item.addEventListener('click', function (e) {
			let nextElement = document.getElementById(this.getAttribute("data-next"));
			window.scrollTo(0, nextElement.offsetTop, 'smooth');
		}, false);
	};

	// animate logo at start
	setTimeout(() => {
		logo.classList.remove('hidden');
	}, 100);

	setTimeout(() => {
		document.getElementById("navBar").classList.remove('pushed');
		document.getElementById("firstArrow").classList.remove('pushed');
	}, 10)



	// VIDEO controls
	//
	// Driven off Bootstrap's own carousel events rather than click handlers on
	// the two arrow buttons. The old code only reacted to the arrows, so
	// clicking an indicator dot (or swiping on a phone) changed the slide while
	// the previous video kept playing underneath.
	let videosSection = document.getElementById("videos");
	let carouselEl = document.getElementById("carouselExampleIndicators");
	let videos = document.getElementsByTagName("video");

	const stopAllVideos = () => {
		for (let video of videos) {
			video.pause();
		}
	}

	if (carouselEl) {
		carouselEl.addEventListener('slide.bs.carousel', stopAllVideos);

		carouselEl.addEventListener('slid.bs.carousel', function (e) {
			let video = e.relatedTarget && e.relatedTarget.querySelector('video');
			if (!video) return;
			// Changing slides is always a user gesture (arrow, dot or swipe), so
			// autoplay is permitted — but a rapid double-click can still abort the
			// play() promise, and an unhandled rejection would show in the console.
			let started = video.play();
			if (started) started.catch(() => { });
		});
	}

	// Each video is hundreds of megabytes. Don't keep one streaming after the
	// visitor has scrolled past the section.
	if (videosSection && 'IntersectionObserver' in window) {
		new IntersectionObserver((entries) => {
			for (let entry of entries) {
				if (!entry.isIntersecting) stopAllVideos();
			}
		}, { threshold: 0 }).observe(videosSection);
	}


	let navLinks = document.getElementsByClassName("nav-link");
	let nabvar = document.getElementById("navbarSupportedContent");

	const closeNavbar = () => nabvar.classList.remove('show');

	let setNavListeners = function () {
		for (let link of navLinks) {
			// The language selector is also a .nav-link, but it opens a dropdown
			// rather than navigating. Collapsing the navbar here would tear that
			// dropdown off the screen the moment it opened.
			if (link.classList.contains('dropdown-toggle')) continue;
			link.addEventListener('click', closeNavbar);
		}
	};

	setNavListeners();

	//translations
	let translations;
	const DEFAULT_LANG = 'pl'; // the language hardcoded in index.html
	let currentLang = DEFAULT_LANG;

	let translationElements = document.querySelectorAll('[data-ts]');
	let langMenu = document.getElementById('langMenu');
	let langCurrent = document.getElementById('langCurrent');

	function applyLanguage(lang) {

		let dictionary = translations && translations.lang[lang];
		if (!dictionary) {
			console.warn(`No translations for "${lang}"`);
			return;
		}

		currentLang = lang;

		// Keep <html lang> honest so screen readers pick the right pronunciation
		// and search engines index the language actually on screen.
		document.documentElement.lang = lang;

		for (let element of translationElements) {
			let key = element.getAttribute('data-ts');
			let translated = dictionary[key];
			if (translated === undefined) {
				console.warn(`Missing ${lang} translation for "${key}"`);
				continue;
			}
			// innerHTML is deliberate: translations.json carries markup such as
			// <span class='redhighlight'> and <a> tags. The file is served from
			// this origin and is not user input.
			element.innerHTML = translated;
		}

		langCurrent.textContent = lang.toUpperCase();

		for (let item of langMenu.querySelectorAll('[data-lang]')) {
			let selected = item.getAttribute('data-lang') === lang;
			item.classList.toggle('active', selected);
			if (selected) {
				item.setAttribute('aria-current', 'true');
			} else {
				item.removeAttribute('aria-current');
			}
		}
	}

	// Only wire up the language menu once translations are in memory —
	// otherwise an early click reads `translations` while it is still undefined.
	fetch('./translations.json')
		.then(response => {
			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status}`);
			}
			return response.json();
		})
		.then(data => {
			translations = data;
			for (let item of langMenu.querySelectorAll('[data-lang]')) {
				item.addEventListener('click', function () {
					applyLanguage(this.getAttribute('data-lang'));
					closeNavbar();
				});
			}
			applyLanguage(DEFAULT_LANG); // marks the current entry in the menu
		})
		.catch(error => console.error('Failed to fetch translations:', error));

});
