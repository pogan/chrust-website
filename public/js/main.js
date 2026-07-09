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
	}, 1000)



	// VIDEO controls
	let controlsR = document.getElementById("videos_control_r");
	let controlsL = document.getElementById("videos_control_l");
	let videos = document.getElementsByTagName("video");

	const stopAllVideos = () => {
		for (let video of videos) {
			video.pause();
		}
	}

	controlsR.addEventListener('click', function (e) {
		stopAllVideos();
		let nextVideoId = document.getElementsByClassName("carousel-item active")[0].getAttribute('next-video');
		document.getElementById(nextVideoId).play();
	});
	controlsL.addEventListener('click', stopAllVideos);


	let navLinks = document.getElementsByClassName("nav-link");
	let nabvar = document.getElementById("navbarSupportedContent");

	let setNavListeners = function () {
		for (let link of navLinks) {
			link.addEventListener('click', function (e) {
				nabvar.classList.remove('show');
			});
		}
	};

	setNavListeners();

	//translations
	let translations;
	let currentLang = 'pl';

	let translationElements = document.querySelectorAll('[data-ts]');
	let langChangeButton = document.getElementById('langChangeButton');

	function reTranslate(e) {

		e.preventDefault();

		if (currentLang == 'pl') { currentLang = 'en' } else { currentLang = 'pl' };

		for (let element of translationElements) {
			let key = element.getAttribute('data-ts');
			let translated = translations.lang[currentLang][key];
			if (translated === undefined) {
				console.warn(`Missing ${currentLang} translation for "${key}"`);
				continue;
			}
			// innerHTML is deliberate: translations.json carries markup such as
			// <span class='redhighlight'> and <a> tags. The file is served from
			// this origin and is not user input.
			element.innerHTML = translated;
		}

	}

	// Only wire up the language button once translations are in memory —
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
			langChangeButton.addEventListener('click', reTranslate);
		})
		.catch(error => console.error('Failed to fetch translations:', error));

});
