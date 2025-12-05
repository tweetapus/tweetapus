import query from "./api.js";

const LANGUAGE_NAMES = {
	eng: "English",
	spa: "Spanish",
	fra: "French",
	deu: "German",
	ita: "Italian",
	por: "Portuguese",
	nld: "Dutch",
	pol: "Polish",
	rus: "Russian",
	jpn: "Japanese",
	zho: "Chinese",
	kor: "Korean",
	ara: "Arabic",
	hin: "Hindi",
	tur: "Turkish",
	vie: "Vietnamese",
	tha: "Thai",
	ind: "Indonesian",
	ces: "Czech",
	ukr: "Ukrainian",
	ron: "Romanian",
	hun: "Hungarian",
	ell: "Greek",
	heb: "Hebrew",
	swe: "Swedish",
	dan: "Danish",
	fin: "Finnish",
	nor: "Norwegian",
	cat: "Catalan",
	bul: "Bulgarian",
	hrv: "Croatian",
	slk: "Slovak",
	lit: "Lithuanian",
	lav: "Latvian",
	est: "Estonian",
	slv: "Slovenian",
	fas: "Persian",
	und: "Unknown",
};

const ISO639_3_TO_1 = {
	eng: "en",
	spa: "es",
	fra: "fr",
	deu: "de",
	ita: "it",
	por: "pt",
	nld: "nl",
	pol: "pl",
	rus: "ru",
	jpn: "ja",
	zho: "zh",
	kor: "ko",
	ara: "ar",
	hin: "hi",
	tur: "tr",
	vie: "vi",
	tha: "th",
	ind: "id",
	ces: "cs",
	ukr: "uk",
	ron: "ro",
	hun: "hu",
	ell: "el",
	heb: "he",
	swe: "sv",
	dan: "da",
	fin: "fi",
	nor: "no",
	cat: "ca",
	bul: "bg",
	hrv: "hr",
	slk: "sk",
	lit: "lt",
	lav: "lv",
	est: "et",
	slv: "sl",
	fas: "fa",
};

async function detectLanguage(text) {
	if (!text || text.trim().length < 50) {
		return { lang: "und", confidence: 0 };
	}

	const cleanText = text
		.replace(/@\w+/g, "")
		.replace(/#\w+/g, "")
		.replace(/https?:\/\/[^\s]+/g, "")
		.replace(/:\w+:/g, "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.trim();

	if (cleanText.length < 50) {
		return { lang: "und", confidence: 0 };
	}

	const franc = await loadFranc();
	if (!franc) {
		return { lang: "und", confidence: 0 };
	}

	const detected = franc.franc(cleanText, {
		minLength: 30,
		only: [
			"eng",
			"spa",
			"fra",
			"deu",
			"ita",
			"por",
			"nld",
			"pol",
			"rus",
			"jpn",
			"zho",
			"kor",
			"ara",
			"hin",
			"tur",
			"vie",
			"ind",
			"ukr",
		],
	});

	return { lang: detected, confidence: detected !== "und" ? 0.85 : 0 };
}

function getLanguageName(langCode) {
	return LANGUAGE_NAMES[langCode] || langCode;
}

function getIso1Code(iso3Code) {
	return ISO639_3_TO_1[iso3Code] || iso3Code;
}

async function translateText(text, sourceLang, targetLang = "en") {
	const sourceIso1 = getIso1Code(sourceLang);

	const result = await query("/translate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text: text,
			source: sourceIso1,
			target: targetLang,
		}),
	});

	if (result.error) {
		throw new Error(result.error);
	}

	return result.translatedText;
}

function createTranslateButton(tweet, contentElement, detectedLang) {
	const translateContainer = document.createElement("div");
	translateContainer.className = "tweet-translate-container";

	const translateBtn = document.createElement("button");
	translateBtn.type = "button";
	translateBtn.className = "tweet-translate-btn";
	translateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-languages-icon lucide-languages"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg> Translate tweet`;

	let isTranslated = false;
	let originalContent = null;

	translateBtn.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();

		if (isTranslated) {
			contentElement.innerHTML = originalContent;
			translateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-languages-icon lucide-languages"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg> Translate tweet`;
			isTranslated = false;
			return;
		}

		translateBtn.disabled = true;
		translateBtn.innerHTML = `
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <style>
            .spinner_z9k8 {
              transform-origin: center;
              animation: spinner_StKS 0.75s infinite linear;
            }

            @keyframes spinner_StKS {
              100% {
                transform: rotate(360deg);
              }
            }
          </style>
          <path
            d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z"
            opacity=".25"
            fill="currentColor"
          />
          <path
            d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
            class="spinner_z9k8"
            fill="currentColor"
          />
        </svg> Translating tweet…`;

		try {
			const translated = await translateText(tweet.content, detectedLang, "en");

			originalContent = contentElement.innerHTML;

			const translatedDiv = document.createElement("div");
			translatedDiv.className = "tweet-translated-content";
			translatedDiv.textContent = translated;

			contentElement.innerHTML = "";
			contentElement.appendChild(translatedDiv);

			translateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-languages-icon lucide-languages"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg> Show original (${getLanguageName(detectedLang)})`;
			isTranslated = true;
		} catch (err) {
			console.error("Translation error:", err);
			translateBtn.textContent = "Translation failed. Try again";
		}

		translateBtn.disabled = false;
	});

	translateContainer.appendChild(translateBtn);
	return translateContainer;
}

export async function maybeAddTranslation(tweet, tweetElement, contentElement) {
	const cleanText = tweet.content
		.replace(/@\w+/g, "")
		.replace(/#\w+/g, "")
		.replace(/https?:\/\/[^\s]+/g, "")
		.replace(/:\w+:/g, "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.trim();

	if (!cleanText || cleanText.trim().length < 20) {
		return;
	}

	const { detectAll } = await import(
		"https://unpkg.com/tinyld@1.3.4/dist/tinyld.normal.browser.js"
	);

	const detection = detectAll(cleanText)?.[0];

	if (
		!detection?.lang ||
		["en", "und"].includes(detection?.lang) ||
		detection.accuracy < 0.5
	)
		return;

	const translateContainer = createTranslateButton(
		tweet,
		contentElement,
		detection?.lang,
	);

	const factCheck = tweetElement.querySelector(".fact-check-banner");
	if (factCheck) {
		factCheck.insertAdjacentElement("beforebegin", translateContainer);
	} else {
		contentElement.insertAdjacentElement("afterend", translateContainer);
	}
}
