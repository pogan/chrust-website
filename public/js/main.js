document.addEventListener("DOMContentLoaded", function () {

	let logo = document.getElementById("biglogo");

	let covers = document.getElementsByClassName('cover');
	let activeCover = 0;
	let arrows = document.getElementsByClassName("arrow-down");

	// HELPER check if element is visible in viewport
	const isVisibleInViewport = (element) => {
		const rect = element.getBoundingClientRect()
		return (
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
			rect.right <= (window.innerWidth || document.documentElement.clientWidth)
		)
	}

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
	let video1 = document.getElementById("videos_tempo");
	let controlsR = document.getElementById("videos_control_r");
	let controlsL = document.getElementById("videos_control_l");
	let videos = document.getElementsByTagName("video");

	const stopAllVideos = () => {
		for (let i in videos) {
			try { videos[i].pause() } catch { }
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
		for (i in navLinks) {
			if (isNaN(i)) return;
			navLinks[i].addEventListener('click', function (e) {
				nabvar.classList.remove('show');
			});
		}
	};

	setNavListeners();

	//translations
	let translations;

	function fetchTranslations() {
		fetch('./translations.json')
			.then(response => {
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}
				return response.json();
			})
			.then(data => { translations = data })
			.catch(error => console.error('Failed to fetch data:', error));
	}

	let currentLang = 'pl';
	fetchTranslations();

	let translationElements = document.querySelectorAll('[data-ts]');

	function reTranslate(data) {

		if (currentLang == 'pl') { currentLang = 'en' } else if (currentLang == 'en') { currentLang = 'pl' } else { currentLang = 'pl' };


		for (i in translationElements) {
			if (isNaN(i)) return;

			let key = translationElements[i].getAttribute('data-ts');
			translationElements[i].innerHTML = translations.lang[currentLang][key];

		}


	}

	// reTranslate();


	document.getElementById('langChangeButton').addEventListener('click', reTranslate);

});
