import DOMPurify from "../../shared/assets/js/dompurify.js";
import { marked } from "../../shared/assets/js/marked.js";
import {
	applyAvatarOutline,
	createVerificationBadge,
} from "../../shared/badge-utils.js";
import {
	convertToWebPAvatar,
	convertToWebPBanner,
	isConvertibleImage,
} from "../../shared/image-utils.js";
import {
	createFollowerSkeleton,
	createProfileSkeleton,
	createTweetSkeleton,
	removeSkeletons,
	showSkeletons,
} from "../../shared/skeleton-utils.js";
import {
	observeTabContainer,
	updateTabIndicator,
} from "../../shared/tab-indicator.js";
import toastQueue from "../../shared/toasts.js";
import { createModal, createPopup } from "../../shared/ui-utils.js";
import query from "./api.js";
import getUser, { authToken } from "./auth.js";
import switchPage, { updatePageTitle } from "./pages.js";
import { addTweetToTimeline, createTweetElement } from "./tweets.js";

const BADGE_DOMPURIFY_CONFIG = {
	ALLOWED_TAGS: [
		"b",
		"i",
		"u",
		"s",
		"a",
		"p",
		"br",
		"marquee",
		"strong",
		"em",
		"code",
		"pre",
		"blockquote",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"ul",
		"ol",
		"li",
		"span",
		"big",
		"sub",
		"sup",
		"del",
		"hr",
		"img",
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
		"div",
	],
	ALLOWED_ATTR: [
		"href",
		"target",
		"rel",
		"class",
		"src",
		"alt",
		"width",
		"height",
		"style",
	],
};

const attachCheckmarkPopup = (badgeEl, type) => {
	if (!badgeEl) return;
	const message =
		type === "gold"
			? "This user has a gold checkmark and is verified."
			: type === "gray"
				? "This user has a gray checkmark and is verified"
				: "This user is verified.";
	const showPopup = (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		createPopup({
			items: [
				{
					title: message,
					onClick: () => {},
				},
			],
			triggerElement: badgeEl,
		});
	};
	badgeEl.addEventListener("click", showPopup);
	badgeEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") showPopup(e);
	});
};

const handleCustomBadgeAction = (badge, badgeEl, userId, username) => {
	const type = badge?.action_type || "none";
	if (type === "url") {
		const url = badge?.action_value || "";
		if (url && /^https?:\/\//i.test(url)) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
		return;
	}
	if (type === "modal") {
		let config = {};
		try {
			config = JSON.parse(badge?.action_value || "{}");
		} catch {
			config = { content: badge?.action_value || "" };
		}
		const wrapper = document.createElement("div");
		wrapper.className = "badge-modal-content";
		if (config.css) {
			const styleEl = document.createElement("style");
			styleEl.textContent = config.css;
			wrapper.appendChild(styleEl);
		}
		const contentDiv = document.createElement("div");
		if (config.content) {
			if (badge?.allow_raw_html) {
				if (typeof marked !== "undefined") {
					contentDiv.innerHTML = marked.parse(config.content);
				} else {
					contentDiv.innerHTML = config.content;
				}
			} else if (typeof marked !== "undefined") {
				contentDiv.innerHTML = DOMPurify.sanitize(
					marked.parse(config.content),
					BADGE_DOMPURIFY_CONFIG,
				);
			} else {
				contentDiv.innerHTML = DOMPurify.sanitize(
					config.content.replace(/\n/g, "<br>"),
					BADGE_DOMPURIFY_CONFIG,
				);
			}
		}
		wrapper.appendChild(contentDiv);
		const { modal: modalEl, close } = createModal({
			title: config.title || badge?.name || "Badge",
			content: wrapper,
		});
		if (config.js) {
			try {
				const fn = new Function(
					"modalEl",
					"badge",
					"userId",
					"username",
					"closeModal",
					config.js,
				);
				fn(modalEl, badge, userId, username, close);
			} catch (err) {
				console.error("Badge modal JS error:", err);
			}
		}
		return;
	}
	if (type === "popup") {
		let config = {};
		try {
			config = JSON.parse(badge?.action_value || "{}");
		} catch {
			config = { entries: [] };
		}
		const entries = config.entries || [];
		if (entries.length === 0) return;
		const popupEl = document.createElement("div");
		popupEl.className = "badge-popup-menu";
		if (config.title) {
			const titleEl = document.createElement("div");
			titleEl.className = "badge-popup-title";
			titleEl.textContent = config.title;
			popupEl.appendChild(titleEl);
		}
		entries.forEach((entry) => {
			const item = document.createElement("button");
			item.className = "badge-popup-item";
			item.type = "button";
			if (entry.icon) {
				const icon = document.createElement("i");
				icon.className = entry.icon.startsWith("bi-")
					? `bi ${entry.icon}`
					: entry.icon;
				item.appendChild(icon);
			}
			const labelSpan = document.createElement("span");
			labelSpan.textContent = entry.label || "";
			item.appendChild(labelSpan);
			item.addEventListener("click", () => {
				popupEl.remove();
				if (entry.type === "js" && entry.value) {
					try {
						const fn = new Function("badge", "userId", "username", entry.value);
						fn(badge, userId, username);
					} catch (err) {
						console.error("Badge popup JS error:", err);
					}
				} else if (entry.type === "url" && entry.value) {
					if (/^https?:\/\//i.test(entry.value)) {
						window.open(entry.value, "_blank", "noopener,noreferrer");
					}
				}
			});
			popupEl.appendChild(item);
		});
		document.body.appendChild(popupEl);
		const rect = badgeEl.getBoundingClientRect();
		popupEl.style.position = "fixed";
		popupEl.style.top = `${rect.bottom + 4}px`;
		popupEl.style.left = `${rect.left}px`;
		popupEl.style.zIndex = "10000";
		const closePopup = (e) => {
			if (!popupEl.contains(e.target) && e.target !== badgeEl) {
				popupEl.remove();
				document.removeEventListener("click", closePopup);
			}
		};
		setTimeout(() => document.addEventListener("click", closePopup), 0);
		return;
	}
	if (type === "client_js") {
		try {
			const fn = new Function(
				"badge",
				"badgeEl",
				"userId",
				"username",
				badge?.action_value || "",
			);
			fn(badge, badgeEl, userId, username);
		} catch (err) {
			console.error("Badge JS failed", err);
		}
	}
};

const renderCustomBadge = (badge, userId, username) => {
	const badgeEl = document.createElement("span");
	badgeEl.className = "custom-badge";
	badgeEl.title = badge?.name || "Custom Badge";
	badgeEl.tabIndex = 0;

	if (badge?.svg_content) {
		badgeEl.innerHTML = badge.svg_content;
		const svg = badgeEl.querySelector("svg");
		if (svg) {
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.style.verticalAlign = "middle";
		}
	} else if (badge?.image_url) {
		const img = document.createElement("img");
		img.src = badge.image_url;
		img.alt = badge?.name || "Badge";
		img.width = 16;
		img.height = 16;
		img.style.verticalAlign = "middle";
		img.draggable = false;
		badgeEl.appendChild(img);
	}

	if ((badge?.action_type || "none") !== "none") {
		badgeEl.addEventListener("click", (e) => {
			e.stopPropagation();
			e.preventDefault();
			handleCustomBadgeAction(badge, badgeEl, userId, username);
		});
		badgeEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handleCustomBadgeAction(badge, badgeEl, userId, username);
			}
		});
	}

	return badgeEl;
};

let currentProfile = null;
let currentPosts = [];
let currentReplies = [];
let currentMedia = [];
let currentUsername = null;
let currentAffiliates = [];
let isLoadingPosts = false;
let isLoadingReplies = false;
let isLoadingMedia = false;
let hasMorePosts = true;
let hasMoreReplies = true;
let hasMoreMedia = true;
let postsObserver = null;
let repliesObserver = null;
let mediaObserver = null;
let avatarChangedForTweet = false;
let pendingAvatarTweetUrl = null;
let isAvatarTweetPromptOpen = false;
let checkmarkOutlinePicker = null;
let avatarOutlinePicker = null;

const escapeHTML = (str) =>
	str ? str.split("").join("").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

const countries =
	"AFAfghanistan;ALAlbania;DZAlgeria;ASAmerican Samoa;ADAndorra;AOAngola;AGAntigua and Barbuda;ARArgentina;AMArmenia;AWAruba;AUAustralia;ATAustria;AZAzerbaijan;BSBahamas;BHBahrain;BDBangladesh;BBBarbados;BYBelarus;BEBelgium;BZBelize;BJBenin;BMBermuda;BTBhutan;BOBolivia;BABosnia and Herzegovina;BWBotswana;BRBrazil;BNBrunei Darussalam;BGBulgaria;BFBurkina Faso;BIBurundi;KHCambodia;CMCameroon;CACanada;CVCape Verde;KYCayman Islands;CFCentral African Republic;TDChad;CLChile;CNChina;COColombia;KMComoros;CGRepublic of the Congo;CDDemocratic Republic of the Congo;CKCook Islands;CRCosta Rica;CIIvory Coast;HRCroatia;CUCuba;CYCyprus;CZCzech Republic;DKDenmark;DJDjibouti;DMDominica;DODominican Republic;ECEcuador;EGEgypt;SVEl Salvador;GQEquatorial Guinea;EREritrea;EEEstonia;ETEthiopia;FOFaroe Islands;FJFiji;FIFinland;FRFrance;GFFrench Guiana;PFFrench Polynesia;GAGabon;GMGambia;GEGeorgia;DEGermany;GHGhana;GIGibraltar;GRGreece;GLGreenland;GDGrenada;GPGuadeloupe;GUGuam;GTGuatemala;GNGuinea;GWGuinea-Bissau;GYGuyana;HTHaiti;HNHonduras;HKHong Kong;HUHungary;ISIceland;INIndia;IDIndonesia;IRIran;IQIraq;IEIreland;ILIsrael;ITItaly;JMJamaica;JPJapan;JOJordan;KZKazakhstan;KEKenya;KIKiribati;KPNorth Korea;KRSouth Korea;KWKuwait;KGKyrgyzstan;LALao People's Democratic Republic;LVLatvia;LBLebanon;LSLesotho;LRLiberia;LYLibya;LILiechtenstein;LTLithuania;LULuxembourg;MOMacao;MGMadagascar;MWMalawi;MYMalaysia;MVMaldives;MLMali;MTMalta;MHMarshall Islands;MQMartinique;MRMauritania;MUMauritius;YTMayotte;MXMexico;FMMicronesia, Federated States of;MDMoldova, Republic of;MCMonaco;MNMongolia;MAMorocco;MZMozambique;MMMyanmar;NANamibia;NRNauru;NPNepal;NLNetherlands;NCNew Caledonia;NZNew Zealand;NINicaragua;NENiger;NGNigeria;MKNorth Macedonia;MPNorthern Mariana Islands;NONorway;OMOman;PKPakistan;PWPalau;PSState of Palestine;PAPanama;PGPapua New Guinea;PYParaguay;PEPeru;PHPhilippines;PLPoland;PTPortugal;PRPuerto Rico;QAQatar;REReunion;RORomania;RURussia;RWRwanda;KNSaint Kitts and Nevis;LCSaint Lucia;VCSaint Vincent and the Grenadines;WSSamoa;SMSan Marino;STSao Tome and Principe;SASaudi Arabia;SNSenegal;SCSeychelles;SLSierra Leone;SGSingapore;SKSlovakia;SISlovenia;SBSolomon Islands;SOSomalia;ZASouth Africa;ESSpain;LKSri Lanka;SDSudan;SRSuriname;SZEswatini;SESweden;CHSwitzerland;SYSyrian Arab Republic;TWTaiwan;TJTajikistan;TZTanzania;THThailand;TLTimor-Leste;TGTogo;TOTonga;TTTrinidad and Tobago;TNTunisia;TRTurkey;TMTurkmenistan;TCTurks and Caicos Islands;TVTuvalu;UGUganda;UAUkraine;AEUnited Arab Emirates;GBUnited Kingdom;USUSA;UYUruguay;UZUzbekistan;VUVanuatu;VEVenezuela;VNVietnam;VGVirgin Islands, British;VIVirgin Islands;WFWallis and Futuna;EHWestern Sahara;YEYemen;ZMZambia;ZWZimbabwe;AXAland Islands;BQBonaire, Sint Eustatius and Saba;CWCuraçao;GGGuernsey;IMIsle of Man;JEJersey;MEMontenegro;MFSaint Martin;RSSerbia;SXSint Maarten;SSSouth Sudan;XKKosovo;XXUnknown".split(
		";",
	);

const continentNames = {
	AF: "Africa",
	AN: "Antarctica",
	AS: "Asia",
	EU: "Europe",
	NA: "North America",
	OC: "Oceania",
	SA: "South America",
};

const getLocationDisplay = (data) => {
	if (!data) return "Unknown";

	if (data.continent && !data.country) {
		return continentNames[data.continent] || data.continent || "Unknown";
	}

	if (data.country) {
		const countryName =
			countries
				.find((country) => country.startsWith(data.country?.toUpperCase()))
				?.slice(2) || data.country;

		if (data.city) {
			return `${data.city}, ${countryName}`;
		}
		return countryName;
	}

	return "Unknown";
};

export default async function openProfile(username) {
	currentUsername = username;

	switchPage("profile", {
		path: `/@${username}`,
		title: `@${username}`,
		recoverState: async () => {
			const profileContainer = document.getElementById("profileContainer");
			profileContainer.style.display = "block";

			const existingContent = profileContainer.innerHTML;
			profileContainer.innerHTML = "";

			const skeleton = createProfileSkeleton();
			profileContainer.appendChild(skeleton);

			const data = await query(`/profile/${username}`);

			skeleton.remove();
			profileContainer.innerHTML = existingContent;

			if (data.error) {
				if (data.error === "User is suspended") {
					const pd = data.profile || {};
					const suspendedData = {
						profile: {
							username,
							name: pd.name || username,
							avatar: pd.avatar || null,
							banner: pd.banner || null,
							suspended: true,
							created_at: pd.created_at || null,
							post_count: pd.post_count || 0,
							following_count: pd.following_count || 0,
							follower_count: pd.follower_count || 0,
						},
						posts: [],
						replies: [],
						isFollowing: false,
						isOwnProfile: false,
					};

					currentProfile = suspendedData;
					renderProfile(suspendedData);
					setupEditProfileListeners();
					return;
				}

				toastQueue.add(`<h1>${escapeHTML(data.error)}</h1>`);
				return null;
			}

			currentProfile = data;
			renderProfile(data);
			setupEditProfileListeners();

			if (data.profile?.name) {
				updatePageTitle("profile", {
					title: `${data.profile.name} (@${username})`,
				});
			}

			if (!data.isOwnProfile && authToken) {
				loadFollowersYouKnow(username);
			}

			const affiliatesData = await query(`/profile/${username}/affiliates`);
			if (!affiliatesData.error && affiliatesData.affiliates) {
				currentAffiliates = affiliatesData.affiliates;
			} else {
				currentAffiliates = [];
			}

			const affiliatesTabBtn = document.querySelector(
				'.profile-tab-btn[data-tab="affiliates"]',
			);
			if (affiliatesTabBtn) {
				if (currentAffiliates.length > 0) {
					affiliatesTabBtn.style.display = "block";
					affiliatesTabBtn.textContent = `Affiliates`;
				} else {
					affiliatesTabBtn.style.display = "none";
				}
			}
		},
	});
}

async function loadFollowersYouKnow(username) {
	const container = document.getElementById("followersYouKnowContainer");
	if (!container) return;

	container.innerHTML = "";
	container.style.display = "none";

	try {
		const data = await query(`/profile/${username}/followers-you-know`);
		if (
			data.error ||
			!data.followersYouKnow ||
			data.followersYouKnow.length === 0
		) {
			return;
		}

		container.style.display = "flex";

		const avatarsContainer = document.createElement("div");
		avatarsContainer.className = "followers-you-know-avatars";

		const displayCount = Math.min(data.followersYouKnow.length, 3);
		for (let i = 0; i < displayCount; i++) {
			const user = data.followersYouKnow[i];
			const avatar = document.createElement("img");
			avatar.src = user.avatar || "/public/shared/assets/default-avatar.svg";
			avatar.alt = user.name || user.username;
			avatar.className = "followers-you-know-avatar";
			const radius =
				user.avatar_radius !== null && user.avatar_radius !== undefined
					? `${user.avatar_radius}px`
					: user.gold || user.gray
						? "4px"
						: "50px";
			avatar.style.borderRadius = radius;
			avatarsContainer.appendChild(avatar);
		}

		const textSpan = document.createElement("span");
		textSpan.className = "followers-you-know-text";

		if (data.count === 1) {
			textSpan.textContent = `Followed by ${data.followersYouKnow[0].name || data.followersYouKnow[0].username}`;
		} else if (data.count === 2) {
			textSpan.textContent = `Followed by ${data.followersYouKnow[0].name || data.followersYouKnow[0].username} and ${data.followersYouKnow[1].name || data.followersYouKnow[1].username}`;
		} else {
			const othersCount = data.count - 2;
			textSpan.textContent = `Followed by ${data.followersYouKnow[0].name || data.followersYouKnow[0].username}, ${data.followersYouKnow[1].name || data.followersYouKnow[1].username}, and ${othersCount} other${othersCount > 1 ? "s" : ""} you follow`;
		}

		container.appendChild(avatarsContainer);
		container.appendChild(textSpan);

		container.addEventListener("click", () => {
			showFollowersList(username, "mutuals");
		});
	} catch (err) {
		console.error("Error loading followers you know:", err);
	}
}

const renderAffiliates = () => {
	const container = document.getElementById("profileAffiliatesContainer");
	if (!container) return;

	container.innerHTML = "";

	if (!currentAffiliates || currentAffiliates.length === 0) {
		const empty = document.createElement("div");
		empty.className = "profile-empty-state";

		const title = document.createElement("h3");
		title.textContent = "No affiliates yet";

		const message = document.createElement("p");
		message.textContent =
			"When accounts mark themselves as your affiliate, they will appear here.";

		empty.appendChild(title);
		empty.appendChild(message);
		container.appendChild(empty);
		return;
	}

	currentAffiliates.forEach((aff) => {
		const card = document.createElement("div");
		card.className = "profile-affiliate-card";

		const avatar = document.createElement("img");
		avatar.className = "affiliate-avatar";
		avatar.src = aff.avatar || "/public/shared/assets/default-avatar.svg";
		avatar.alt = aff.name || aff.username;

		const affRadiusValue =
			aff.avatar_radius !== null && aff.avatar_radius !== undefined
				? `${aff.avatar_radius}px`
				: aff.gold || aff.gray
					? "4px"
					: "50%";
		avatar.style.borderRadius = affRadiusValue;

		if (aff.gray) {
			applyAvatarOutline(
				avatar,
				aff.avatar_outline || "",
				affRadiusValue || "4px",
				2,
			);
		} else {
			applyAvatarOutline(avatar, "", affRadiusValue, 2);
		}

		card.appendChild(avatar);

		const info = document.createElement("div");
		info.className = "affiliate-info";

		const nameRow = document.createElement("div");
		nameRow.className = "affiliate-name-row";

		const nameEl = document.createElement("span");
		nameEl.textContent = aff.name || aff.username;
		nameRow.appendChild(nameEl);

		if (aff.gold) {
			const goldBadge = document.createElement("span");
			goldBadge.innerHTML =
				'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="#D4AF37"/><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
			nameRow.appendChild(goldBadge);
		} else if (aff.gray) {
			const grayBadge = createVerificationBadge({
				type: "gray",
				checkmarkOutline: aff.checkmark_outline || "",
				size: 16,
			});
			nameRow.appendChild(grayBadge);
		} else if (aff.verified) {
			const verifiedBadge = document.createElement("span");
			verifiedBadge.innerHTML =
				'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.56667 5.74669C2.46937 5.30837 2.48431 4.85259 2.61011 4.42158C2.73591 3.99058 2.9685 3.59832 3.28632 3.28117C3.60413 2.96402 3.99688 2.73225 4.42814 2.60735C4.85941 2.48245 5.31523 2.46847 5.75334 2.56669C5.99448 2.18956 6.32668 1.8792 6.71931 1.66421C7.11194 1.44923 7.55237 1.33655 8.00001 1.33655C8.44764 1.33655 8.88807 1.44923 9.28071 1.66421C9.67334 1.8792 10.0055 2.18956 10.2467 2.56669C10.6855 2.46804 11.1421 2.48196 11.574 2.60717C12.006 2.73237 12.3992 2.96478 12.7172 3.28279C13.0352 3.6008 13.2677 3.99407 13.3929 4.42603C13.5181 4.85798 13.532 5.31458 13.4333 5.75336C13.8105 5.9945 14.1208 6.32669 14.3358 6.71933C14.5508 7.11196 14.6635 7.55239 14.6635 8.00002C14.6635 8.44766 14.5508 8.88809 14.3358 9.28072C14.1208 9.67336 13.8105 10.0056 13.4333 10.2467C13.5316 10.6848 13.5176 11.1406 13.3927 11.5719C13.2678 12.0032 13.036 12.3959 12.7189 12.7137C12.4017 13.0315 12.0094 13.2641 11.5784 13.3899C11.1474 13.5157 10.6917 13.5307 10.2533 13.4334C10.0125 13.8119 9.68006 14.1236 9.28676 14.3396C8.89346 14.5555 8.45202 14.6687 8.00334 14.6687C7.55466 14.6687 7.11322 14.5555 6.71992 14.3396C6.32662 14.1236 5.99417 13.8119 5.75334 13.4334C5.31523 13.5316 4.85941 13.5176 4.42814 13.3927C3.99688 13.2678 3.60413 13.036 3.28632 12.7189C2.9685 12.4017 2.73591 12.0095 2.61011 11.5785C2.48431 11.1475 2.46937 10.6917 2.56667 10.2534C2.18664 10.0129 1.87362 9.68014 1.65671 9.28617C1.4398 8.8922 1.32605 8.44976 1.32605 8.00002C1.32605 7.55029 1.4398 7.10785 1.65671 6.71388C1.87362 6.31991 2.18664 5.9872 2.56667 5.74669Z" fill="var(--primary)"/><path d="M6 8.00002L7.33333 9.33335L10 6.66669" stroke="var(--primary-fg)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
			nameRow.appendChild(verifiedBadge);
		}

		info.appendChild(nameRow);

		const usernameEl = document.createElement("span");
		usernameEl.className = "affiliate-username";
		usernameEl.textContent = `@${aff.username}`;
		info.appendChild(usernameEl);

		card.appendChild(info);
		card.addEventListener("click", async () => {
			const { default: openProfile } = await import("./profile.js");
			openProfile(aff.username);
		});

		container.appendChild(card);
	});
};

const renderPosts = async (posts, isReplies = false) => {
	const container = document.getElementById("profilePostsContainer");
	if (!container) return;

	if (!posts || posts.length === 0) {
		const emptyMessage = isReplies
			? {
					title: "No replies yet",
					message: "When they reply to someone, it'll show up here.",
				}
			: {
					title: "No posts yet",
					message: "When they xeet something, it'll show up here.",
				};

		container.innerHTML = `
      <div class="profile-empty-state">
        <img src="/public/shared/assets/img/cats/sad_cat_small.png" alt="Sad cat" draggable="false">

        <h3>${emptyMessage.title}</h3>
        <p>${emptyMessage.message}</p>
      </div>
    `;
		return;
	}

	container.innerHTML = "";

	for (const post of posts) {
		const tweetElement = createTweetElement(post, {
			clickToOpen: true,
		});

		if (post.content_type === "retweet") {
			const retweetIndicator = document.createElement("div");
			retweetIndicator.className = "retweet-indicator";
			retweetIndicator.innerHTML = `
			<svg width="16" height="19" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
				<span>${
					currentProfile?.profile?.name || currentProfile?.profile?.username
				} retweeted</span>
			`;
			tweetElement.insertBefore(retweetIndicator, tweetElement.firstChild);
		}

		container.appendChild(tweetElement);
	}

	if (isReplies && hasMoreReplies) {
		const sentinel = document.createElement("div");
		sentinel.className = "scroll-sentinel";
		sentinel.style.height = "1px";
		container.appendChild(sentinel);
	} else if (!isReplies && hasMorePosts) {
		const sentinel = document.createElement("div");
		sentinel.className = "scroll-sentinel";
		sentinel.style.height = "1px";
		container.appendChild(sentinel);
	}
};

const renderMediaGrid = async (posts) => {
	const container = document.getElementById("profilePostsContainer");
	if (!container) return;

	if (!posts || posts.length === 0) {
		container.innerHTML = `
      <div class="profile-empty-state">
        <img src="/public/shared/assets/img/cats/sad_cat_small.png" alt="Sad cat" draggable="false">

        <h3>No media yet</h3>
        <p>When they post images or videos, they'll show up here.</p>
      </div>
    `;
		return;
	}

	container.innerHTML = "";
	let mediaCount = 0;

	for (const post of posts) {
		const attachments = post.attachments || [];
		const mediaAttachments = attachments.filter(
			(att) =>
				att.file_type?.startsWith("image/") ||
				att.file_type?.startsWith("video/"),
		);

		if (mediaAttachments.length === 0) continue;

		for (const attachment of mediaAttachments) {
			const mediaItem = document.createElement("div");
			mediaItem.className = "media-grid-item";
			mediaItem.style.cursor = "pointer";

			if (attachment.file_type?.startsWith("image/")) {
				const img = document.createElement("img");
				img.src = attachment.file_url;
				img.alt = "Media";
				img.loading = "lazy";
				img.style.cssText =
					"width: 100%; height: 100%; object-fit: cover; display: block;";
				mediaItem.appendChild(img);
			} else if (attachment.file_type?.startsWith("video/")) {
				const video = document.createElement("video");
				video.src = attachment.file_url;
				video.style.cssText =
					"width: 100%; height: 100%; object-fit: cover; display: block;";
				video.muted = true;
				video.loop = true;
				video.playsInline = true;

				const playIcon = document.createElement("div");
				playIcon.style.cssText =
					"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; background: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center; pointer-events: none;";
				playIcon.innerHTML =
					'<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

				mediaItem.style.position = "relative";
				mediaItem.appendChild(video);
				mediaItem.appendChild(playIcon);

				mediaItem.addEventListener("mouseenter", () =>
					video.play().catch(() => {}),
				);
				mediaItem.addEventListener("mouseleave", () => {
					video.pause();
					video.currentTime = 0;
				});
			}

			mediaItem.addEventListener("click", async () => {
				const { default: openTweet } = await import("./tweet.js");
				openTweet(post);
			});

			container.appendChild(mediaItem);
			mediaCount++;
		}
	}

	if (mediaCount === 0) {
		container.innerHTML = `
      <div class="profile-empty-state">
        <img src="/public/shared/assets/img/cats/sad_cat_small.png" alt="Sad cat" draggable="false">

        <h3>No media yet</h3>
        <p>When they post images or videos, they'll show up here.</p>
      </div>
    `;
		return;
	}

	if (hasMoreMedia) {
		const sentinel = document.createElement("div");
		sentinel.className = "scroll-sentinel";
		sentinel.style.cssText = "grid-column: 1 / -1; height: 1px;";
		container.appendChild(sentinel);
	}
};

const loadMoreReplies = async () => {
	if (isLoadingReplies || !hasMoreReplies || !currentUsername) return;

	isLoadingReplies = true;

	const lastReply = currentReplies[currentReplies.length - 1];
	if (!lastReply) {
		isLoadingReplies = false;
		return;
	}

	const { error, replies } = await query(
		`/profile/${currentUsername}/replies?before=${lastReply.id}&limit=20`,
	);

	if (error) {
		toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
		isLoadingReplies = false;
		return;
	}

	if (!replies || replies.length === 0) {
		hasMoreReplies = false;
		isLoadingReplies = false;
		return;
	}

	currentReplies = [...currentReplies, ...replies];

	if (replies.length < 20) {
		hasMoreReplies = false;
	}

	const container = document.getElementById("profilePostsContainer");
	const sentinel = container.querySelector(".scroll-sentinel");
	if (sentinel) sentinel.remove();

	for (const reply of replies) {
		const tweetElement = createTweetElement(reply, {
			clickToOpen: true,
		});
		container.appendChild(tweetElement);
	}

	if (hasMoreReplies) {
		const newSentinel = document.createElement("div");
		newSentinel.className = "scroll-sentinel";
		newSentinel.style.height = "1px";
		container.appendChild(newSentinel);
	}

	isLoadingReplies = false;

	if (hasMoreReplies) {
		setupRepliesInfiniteScroll();
	}
};

const loadMoreMedia = async () => {
	if (isLoadingMedia || !hasMoreMedia || !currentUsername) return;

	isLoadingMedia = true;

	const lastMedia = currentMedia[currentMedia.length - 1];
	if (!lastMedia) {
		isLoadingMedia = false;
		return;
	}

	const { error, media } = await query(
		`/profile/${currentUsername}/media?before=${lastMedia.id}&limit=20`,
	);

	if (error) {
		toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
		isLoadingMedia = false;
		return;
	}

	if (!media || media.length === 0) {
		hasMoreMedia = false;
		isLoadingMedia = false;
		return;
	}

	currentMedia = [...currentMedia, ...media];

	if (media.length < 20) {
		hasMoreMedia = false;
	}

	const container = document.getElementById("profilePostsContainer");
	const sentinel = container.querySelector(".scroll-sentinel");
	if (sentinel) sentinel.remove();

	for (const post of media) {
		const attachments = post.attachments || [];
		const mediaAttachments = attachments.filter(
			(att) =>
				att.file_type?.startsWith("image/") ||
				att.file_type?.startsWith("video/"),
		);

		if (mediaAttachments.length === 0) continue;

		for (const attachment of mediaAttachments) {
			const mediaItem = document.createElement("div");
			mediaItem.className = "media-grid-item";
			mediaItem.style.cursor = "pointer";

			if (attachment.file_type?.startsWith("image/")) {
				const img = document.createElement("img");
				img.src = attachment.file_url;
				img.alt = "Media";
				img.loading = "lazy";
				img.style.cssText =
					"width: 100%; height: 100%; object-fit: cover; display: block;";
				mediaItem.appendChild(img);
			} else if (attachment.file_type?.startsWith("video/")) {
				const video = document.createElement("video");
				video.src = attachment.file_url;
				video.style.cssText =
					"width: 100%; height: 100%; object-fit: cover; display: block;";
				video.muted = true;
				video.loop = true;
				video.playsInline = true;

				const playIcon = document.createElement("div");
				playIcon.style.cssText =
					"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; background: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center; pointer-events: none;";
				playIcon.innerHTML =
					'<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

				mediaItem.style.position = "relative";
				mediaItem.appendChild(video);
				mediaItem.appendChild(playIcon);

				mediaItem.addEventListener("mouseenter", () =>
					video.play().catch(() => {}),
				);
				mediaItem.addEventListener("mouseleave", () => {
					video.pause();
					video.currentTime = 0;
				});
			}

			mediaItem.addEventListener("click", async () => {
				const { default: openTweet } = await import("./tweet.js");
				openTweet(post);
			});

			container.appendChild(mediaItem);
		}
	}

	if (hasMoreMedia) {
		const newSentinel = document.createElement("div");
		newSentinel.className = "scroll-sentinel";
		newSentinel.style.cssText = "grid-column: 1 / -1; height: 1px;";
		container.appendChild(newSentinel);
	}

	isLoadingMedia = false;

	if (hasMoreMedia) {
		setupMediaInfiniteScroll();
	}
};

const loadMorePosts = async () => {
	if (isLoadingPosts || !hasMorePosts || !currentUsername) return;

	isLoadingPosts = true;

	const lastPost = currentPosts[currentPosts.length - 1];
	if (!lastPost) {
		isLoadingPosts = false;
		return;
	}

	const { error, posts } = await query(
		`/profile/${currentUsername}/posts?before=${lastPost.id}&limit=10`,
	);

	if (error) {
		toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
		isLoadingPosts = false;
		return;
	}

	if (!posts || posts.length === 0) {
		hasMorePosts = false;
		isLoadingPosts = false;
		return;
	}

	currentPosts = [...currentPosts, ...posts];

	if (posts.length < 10) {
		hasMorePosts = false;
	}

	const container = document.getElementById("profilePostsContainer");
	const sentinel = container.querySelector(".scroll-sentinel");
	if (sentinel) sentinel.remove();

	for (const post of posts) {
		const tweetElement = createTweetElement(post, {
			clickToOpen: true,
		});

		if (post.content_type === "retweet") {
			const retweetIndicator = document.createElement("div");
			retweetIndicator.className = "retweet-indicator";
			retweetIndicator.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.53001 7.81595C3.49179 4.73911 6.43281 2.5 9.91173 2.5C13.1684 2.5 15.9537 4.46214 17.0852 7.23684L17.6179 8.67647M17.6179 8.67647L18.5002 4.26471M17.6179 8.67647L13.6473 6.91176M17.4995 12.1841C16.5378 15.2609 13.5967 17.5 10.1178 17.5C6.86118 17.5 4.07589 15.5379 2.94432 12.7632L2.41165 11.3235M2.41165 11.3235L1.5293 15.7353M2.41165 11.3235L6.38224 13.0882" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
				<span>${
					currentProfile?.profile?.name || currentProfile?.profile?.username
				} retweeted</span>
			`;
			tweetElement.insertBefore(retweetIndicator, tweetElement.firstChild);
		}
		container.appendChild(tweetElement);
	}

	if (hasMorePosts) {
		const newSentinel = document.createElement("div");
		newSentinel.className = "scroll-sentinel";
		newSentinel.style.height = "1px";
		container.appendChild(newSentinel);
	}

	isLoadingPosts = false;

	if (hasMorePosts) {
		setupPostsInfiniteScroll();
	}
};

const setupRepliesInfiniteScroll = () => {
	if (repliesObserver) {
		repliesObserver.disconnect();
	}

	requestAnimationFrame(() => {
		const sentinel = document.querySelector(".scroll-sentinel");
		if (!sentinel || !hasMoreReplies) return;

		repliesObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !isLoadingReplies && hasMoreReplies) {
					loadMoreReplies();
				}
			},
			{
				rootMargin: "200px",
			},
		);

		repliesObserver.observe(sentinel);
	});
};

const setupMediaInfiniteScroll = () => {
	if (mediaObserver) {
		mediaObserver.disconnect();
	}

	requestAnimationFrame(() => {
		const sentinel = document.querySelector(".scroll-sentinel");
		if (!sentinel || !hasMoreMedia) return;

		mediaObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !isLoadingMedia && hasMoreMedia) {
					loadMoreMedia();
				}
			},
			{
				rootMargin: "200px",
			},
		);

		mediaObserver.observe(sentinel);
	});
};

const setupPostsInfiniteScroll = () => {
	if (postsObserver) {
		postsObserver.disconnect();
	}

	requestAnimationFrame(() => {
		const sentinel = document.querySelector(".scroll-sentinel");
		if (!sentinel || !hasMorePosts) return;

		postsObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !isLoadingPosts && hasMorePosts) {
					loadMorePosts();
				}
			},
			{
				rootMargin: "200px",
			},
		);

		postsObserver.observe(sentinel);
	});
};

const switchTab = async (tabName) => {
	const postsContainer = document.getElementById("profilePostsContainer");
	const affiliatesContainer = document.getElementById(
		"profileAffiliatesContainer",
	);

	if (postsObserver) {
		postsObserver.disconnect();
		postsObserver = null;
	}
	if (repliesObserver) {
		repliesObserver.disconnect();
		repliesObserver = null;
	}
	if (mediaObserver) {
		mediaObserver.disconnect();
		mediaObserver = null;
	}

	if (postsContainer) postsContainer.classList.add("hidden");
	if (affiliatesContainer) affiliatesContainer.classList.add("hidden");

	if (tabName === "posts") {
		if (postsContainer) postsContainer.classList.remove("hidden");
		postsContainer.classList.remove("media-grid");
		renderPosts(currentPosts, false);
		setupPostsInfiniteScroll();
	} else if (tabName === "replies") {
		if (postsContainer) postsContainer.classList.remove("hidden");
		postsContainer.classList.remove("media-grid");
		if (currentReplies.length === 0 && currentUsername) {
			document.getElementById("profilePostsContainer").innerHTML = "";
			const skeletons = showSkeletons(postsContainer, createTweetSkeleton, 3);
			hasMoreReplies = true;

			let { error, replies } = await query(
				`/profile/${currentUsername}/replies?limit=20`,
			);

			removeSkeletons(skeletons);

			if (error) {
				toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
				replies = [];
			}

			currentReplies = replies || [];
			if (currentReplies.length < 20) {
				hasMoreReplies = false;
			}
		}

		renderPosts(currentReplies, true);
		setupRepliesInfiniteScroll();
	} else if (tabName === "media") {
		if (postsContainer) postsContainer.classList.remove("hidden");
		postsContainer.classList.add("media-grid");
		if (currentMedia.length === 0 && currentUsername) {
			document.getElementById("profilePostsContainer").innerHTML = "";
			hasMoreMedia = true;

			let { error, media } = await query(
				`/profile/${currentUsername}/media?limit=20`,
			);

			if (error) {
				toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
				media = [];
			}

			currentMedia = media || [];
			if (currentMedia.length < 20) {
				hasMoreMedia = false;
			}
		}

		renderMediaGrid(currentMedia);
		setupMediaInfiniteScroll();
	} else if (tabName === "affiliates") {
		if (affiliatesContainer) affiliatesContainer.classList.remove("hidden");
		renderAffiliates();
	}
};

const renderProfile = (data) => {
	const { profile, posts, isFollowing, isOwnProfile } = data;

	const suspended = !!profile.suspended;
	const restricted = !!profile.restricted;

	const headerNameEl = document.getElementById("profileHeaderName");
	const headerCountEl = document.getElementById("profileHeaderPostCount");
	if (headerNameEl) headerNameEl.textContent = profile.name || profile.username;
	const displayNameEl = document.getElementById("profileDisplayName");
	if (displayNameEl)
		displayNameEl.textContent = profile.name || profile.username;
	if (headerCountEl)
		headerCountEl.textContent = `${profile.post_count || 0} posts`;

	const profileContainerEl = document.getElementById("profileContainer");
	if (profileContainerEl)
		profileContainerEl.classList.toggle("suspended", suspended);
	if (profileContainerEl)
		profileContainerEl.classList.toggle("restricted", restricted);
	if (profileContainerEl)
		profileContainerEl.classList.toggle(
			"restricted-self",
			restricted && isOwnProfile,
		);

	const existingBanner = profileContainerEl?.querySelector(
		".restricted-account-banner",
	);
	if (restricted && !suspended) {
		if (!existingBanner) {
			const banner = document.createElement("div");
			banner.className = "restricted-account-banner small-restricted-banner";
			banner.innerHTML = `
				<div class="restricted-banner-inner">
					<div class="restricted-banner-text">
						<strong>Account restricted.</strong> They can browse content, but not interact with it.
					</div>
				</div>
			`;
			const profileCardEl = profileContainerEl.querySelector(".profile-card");
			if (profileCardEl?.parentNode) {
				profileCardEl.insertAdjacentElement("afterend", banner);
			} else {
				const profileBannerEl =
					profileContainerEl.querySelector(".profile-banner");
				if (profileBannerEl?.parentNode) {
					profileBannerEl.insertAdjacentElement("afterend", banner);
				} else {
					profileContainerEl.insertBefore(
						banner,
						profileContainerEl.firstChild,
					);
				}
			}
		}
	} else if (existingBanner) {
		existingBanner.remove();
	}

	const bannerElement = document.querySelector(".profile-banner");
	if (bannerElement) {
		bannerElement.style.display = "block";
		if (profile.banner && !suspended) {
			bannerElement.style.backgroundImage = `url(${profile.banner})`;
			bannerElement.style.backgroundSize = "cover";
			bannerElement.style.backgroundPosition = "center";
			bannerElement.style.backgroundRepeat = "no-repeat";
			bannerElement.style.height = "200px";
		} else {
			bannerElement.style.backgroundImage = "none";
			bannerElement.style.height = "58px";
		}
	}

	const avatarImg = document.getElementById("profileAvatar");
	if (avatarImg) {
		const avatarRadiusValue =
			profile.avatar_radius !== null && profile.avatar_radius !== undefined
				? `${profile.avatar_radius}px`
				: profile.gold || profile.gray
					? "4px"
					: "50%";

		if (suspended) {
			avatarImg.src =
				"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
			avatarImg.alt = "";
			avatarImg.dataset.suspended = "true";
			avatarImg.style.pointerEvents = "none";
			avatarImg.style.objectFit = "cover";
			avatarImg.style.opacity = "1";
			avatarImg.style.borderRadius = avatarRadiusValue;
		} else {
			delete avatarImg.dataset.suspended;
			avatarImg.src =
				profile.avatar || "/public/shared/assets/default-avatar.svg";
			avatarImg.alt = profile.name || profile.username;
			avatarImg.style.pointerEvents = "";
			avatarImg.style.objectFit = "cover";
			avatarImg.style.opacity = "";
			avatarImg.style.borderRadius = avatarRadiusValue;
			if (profile.gray) {
				applyAvatarOutline(
					avatarImg,
					profile.avatar_outline || "",
					avatarRadiusValue,
					3,
				);
			} else {
				applyAvatarOutline(avatarImg, "", avatarRadiusValue, 3);
			}
		}
	}

	const profileNameEl = document.getElementById("profileHeaderName");
	if (profileNameEl) {
		profileNameEl.textContent = profile.name || profile.username;
		const existingBadge = profileNameEl.querySelector(".verification-badge");

		if (!suspended && (profile.verified || profile.gold || profile.gray)) {
			const badgeType = profile.gold
				? "gold"
				: profile.gray
					? "gray"
					: "verified";
			if (!existingBadge) {
				const verificationBadge = createVerificationBadge({
					type: badgeType,
					checkmarkOutline: profile.gray ? profile.checkmark_outline || "" : "",
					size: 16,
				});
				profileNameEl.appendChild(verificationBadge);
			} else {
				const newBadge = createVerificationBadge({
					type: badgeType,
					checkmarkOutline: profile.gray ? profile.checkmark_outline || "" : "",
					size: 16,
				});
				existingBadge.replaceWith(newBadge);
			}
		} else if (existingBadge) {
			existingBadge.remove();
		}
	}

	const mainDisplayNameEl = document.getElementById("profileDisplayName");
	if (mainDisplayNameEl) {
		const existingMainBadge = mainDisplayNameEl.querySelector(
			".verification-badge",
		);

		if (!suspended && (profile.verified || profile.gold || profile.gray)) {
			const badgeType = profile.gold
				? "gold"
				: profile.gray
					? "gray"
					: "verified";
			if (!existingMainBadge) {
				const verificationBadge = createVerificationBadge({
					type: badgeType,
					checkmarkOutline: profile.gray ? profile.checkmark_outline || "" : "",
					size: 16,
				});
				attachCheckmarkPopup(verificationBadge, badgeType);
				const followsBadge =
					mainDisplayNameEl.querySelector(".follows-me-badge");
				if (followsBadge) {
					mainDisplayNameEl.insertBefore(verificationBadge, followsBadge);
				} else {
					mainDisplayNameEl.appendChild(verificationBadge);
				}
			} else {
				const newBadge = createVerificationBadge({
					type: badgeType,
					checkmarkOutline: profile.gray ? profile.checkmark_outline || "" : "",
					size: 16,
				});
				attachCheckmarkPopup(newBadge, badgeType);
				existingMainBadge.replaceWith(newBadge);
			}
		} else if (existingMainBadge) {
			existingMainBadge.remove();
		}

		const existingCustomBadges =
			mainDisplayNameEl.querySelectorAll(".custom-badge");
		for (const b of existingCustomBadges) {
			b.remove();
		}

		if (!suspended && data.customBadges && data.customBadges.length > 0) {
			const followsBadge = mainDisplayNameEl.querySelector(".follows-me-badge");
			for (const badge of data.customBadges) {
				const badgeEl = renderCustomBadge(badge, profile.id, profile.username);
				if (followsBadge) {
					mainDisplayNameEl.insertBefore(badgeEl, followsBadge);
				} else {
					mainDisplayNameEl.appendChild(badgeEl);
				}
			}
		}

		const existingMainAffWith = mainDisplayNameEl.querySelector(
			".role-badge.affiliate-with",
		);
		if (!suspended && profile.affiliate && profile.affiliate_with_profile) {
			if (!existingMainAffWith) {
				const aff = profile.affiliate_with_profile;
				const affElMain = document.createElement("a");
				affElMain.href = `/@${aff.username}`;
				affElMain.className = "role-badge affiliate-with";
				affElMain.title = `Affiliated with @${aff.username}`;

				affElMain.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					openProfile(aff.username);
				});

				const affElImage = document.createElement("img");
				affElImage.src =
					aff.avatar || "/public/shared/assets/default-avatar.svg";
				affElImage.draggable = false;
				affElImage.alt = aff.name || aff.username;
				affElImage.className = "affiliate-with-avatar";
				affElMain.appendChild(affElImage);

				const followsBadge =
					mainDisplayNameEl.querySelector(".follows-me-badge");
				if (followsBadge)
					mainDisplayNameEl.insertBefore(affElMain, followsBadge);
				else mainDisplayNameEl.appendChild(affElMain);

				const imgMain = affElMain.querySelector("img");
				if (imgMain) {
					imgMain.style.width = "20px";
					imgMain.style.height = "20px";
					imgMain.style.objectFit = "cover";
					if (aff.avatar_radius !== null && aff.avatar_radius !== undefined) {
						const rawRadius = Number(aff.avatar_radius);
						const safeRadius = Number.isFinite(rawRadius)
							? Math.max(0, Math.min(100, rawRadius))
							: 0;
						imgMain.style.setProperty(
							"border-radius",
							`${safeRadius}px`,
							"important",
						);
					} else if (aff.gold || aff.gray) {
						imgMain.style.setProperty("border-radius", "4px", "important");
					} else {
						imgMain.style.setProperty("border-radius", "50%", "important");
					}
				}
			}
		} else if ((!profile.affiliate || suspended) && existingMainAffWith) {
			existingMainAffWith.remove();
		}
	}

	const usernameEl = document.getElementById("profileUsername");
	if (usernameEl) {
		usernameEl.textContent = `@${profile.username}`;
		const existingLabels = usernameEl.querySelectorAll(".profile-label");
		existingLabels.forEach((l) => {
			l.remove();
		});
		if (!suspended) {
			if (profile.label_type) {
				const labelEl = document.createElement("span");
				labelEl.className = `profile-label label-${profile.label_type}`;
				labelEl.textContent =
					profile.label_type.charAt(0).toUpperCase() +
					profile.label_type.slice(1);
				usernameEl.appendChild(labelEl);
			}
			if (profile.label_automated) {
				const automatedEl = document.createElement("span");
				automatedEl.className = "profile-label label-automated";
				automatedEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`;
				usernameEl.appendChild(automatedEl);
			}
		}
	}

	if (profileContainerEl)
		profileContainerEl.dataset.profileUsername = profile.username;

	const blockedBanner = document.getElementById("profileBlockedBanner");
	if (blockedBanner) {
		if (profile.blockedByProfile) {
			blockedBanner.style.display = "flex";
			if (profileContainerEl)
				profileContainerEl.dataset.blockedByProfile = "true";
		} else {
			blockedBanner.style.display = "none";
			if (profileContainerEl)
				delete profileContainerEl.dataset.blockedByProfile;
		}
	}

	const tabNav = document.querySelector(".profile-tab-nav");
	if (tabNav) tabNav.style.display = suspended ? "none" : "flex";

	if (currentProfile?.followsMe && !isOwnProfile && !suspended) {
		const createFollowsBadge = () => {
			const el = document.createElement("span");
			el.className = "follows-me-badge";
			el.textContent = "Follows you";
			return el;
		};

		const displayNameEl = document.getElementById("profileDisplayName");
		if (displayNameEl && !displayNameEl.querySelector(".follows-me-badge")) {
			displayNameEl.appendChild(createFollowsBadge());
		}
	}

	const pronounsEl = document.getElementById("profilePronouns");
	if (pronounsEl) {
		pronounsEl.textContent = profile.pronouns || "";
		pronounsEl.style.display = profile.pronouns ? "block" : "none";
	}

	const bioEl = document.getElementById("profileBio");
	const metaEl = document.getElementById("profileMeta");
	const suspendedNotice = document.getElementById("profileSuspendedNotice");
	if (suspended) {
		if (bioEl) {
			bioEl.textContent = "";
			bioEl.style.display = "none";
		}
		if (metaEl) metaEl.innerHTML = "";
		if (suspendedNotice) suspendedNotice.style.display = "block";
	} else {
		if (bioEl) {
			const bioText = profile.bio || "";
			bioEl.innerHTML = "";
			if (bioText) {
				const mentionRegex = /@([a-zA-Z0-9_]+)/g;
				const urlRegex = /(https?:\/\/[^\s]+)/g;
				let processedBio = bioText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
				processedBio = processedBio.replace(urlRegex, (url) => {
					const displayUrl = url.length > 40 ? `${url.slice(0, 37)}…` : url;
					return `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayUrl}</a>`;
				});
				processedBio = processedBio.replace(
					mentionRegex,
					(_match, username) => {
						return `<a href="/@${username}" class="bio-mention">@${username}</a>`;
					},
				);
				bioEl.innerHTML = processedBio;
				bioEl.querySelectorAll(".bio-mention").forEach((link) => {
					link.addEventListener("click", (e) => {
						e.preventDefault();
						const username = link.getAttribute("href").slice(2);
						import("./profile.js").then(({ default: openProfile }) => {
							openProfile(username);
						});
					});
				});
			}
			bioEl.style.display = bioText ? "block" : "none";
		}
		if (suspendedNotice) suspendedNotice.style.display = "none";
	}

	const followersCountEl = document.getElementById("profileFollowerCount");
	const followingCountEl = document.getElementById("profileFollowingCount");
	if (followersCountEl)
		followersCountEl.textContent = profile.follower_count || 0;
	if (followingCountEl)
		followingCountEl.textContent = profile.following_count || 0;

	const followersLink = document.getElementById("profileFollowersLink");
	const followingLink = document.getElementById("profileFollowingLink");
	if (suspended) {
		if (followersLink) followersLink.style.display = "none";
		if (followingLink) followingLink.style.display = "none";
	} else {
		if (followersLink) {
			followersLink.style.display = "inline-block";
			followersLink.onclick = () =>
				showFollowersList(profile.username, "followers");
		}
		if (followingLink) {
			followingLink.style.display = "inline-block";
			followingLink.onclick = () =>
				showFollowersList(profile.username, "following");
		}
	}

	const meta = [];
	if (!suspended) {
		if (profile.location)
			meta.push(
				`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-icon lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg> ${escapeHTML(
					profile.location,
				)}`,
			);

		if (profile.website) {
			const url = profile.website.startsWith("http")
				? profile.website
				: `https://${profile.website}`;
			meta.push(
				`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> <a href="${escapeHTML(
					url,
				)}" target="_blank" rel="noopener noreferrer">${escapeHTML(
					profile.website.startsWith("https://")
						? profile.website.replace("https://", "")
						: profile.website.startsWith("http://")
							? profile.website.replace("http://", "")
							: profile.website,
				)}</a>`,
			);
		}

		const joinedDate = new Date(profile.created_at);
		if (!Number.isNaN(joinedDate.getTime())) {
			meta.push(
				`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg> <span class="tweeta-joindate">Joined ${joinedDate.toLocaleDateString(
					"en-US",
					{ month: "long", year: "numeric" },
				)} <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" style="margin-bottom: -3px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg></span>`,
			);
		}
	}
	if (metaEl)
		metaEl.innerHTML = meta
			.map((item) => `<div class="profile-meta-item">${item}</div>`)
			.join("");

	metaEl
		?.querySelector(".profile-meta-item:has(.tweeta-joindate)")
		?.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();

			metaEl.querySelector(
				".profile-meta-item:has(.tweeta-joindate) svg",
			).outerHTML =
				`<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_z9k8 {transform-origin: center;animation: spinner_StKS 0.75s infinite linear;}@keyframes spinner_StKS {100% {transform: rotate(360deg);}}</style><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="white"></path><path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" class="spinner_z9k8" fill="white"></path></svg>`;

			const transparencyReport = await query(
				`/transparency/${profile.username}`,
			);

			metaEl.querySelector(
				".profile-meta-item:has(.tweeta-joindate) svg",
			).outerHTML =
				`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg>`;

			const hasLimitedLocation =
				(transparencyReport.login?.continent &&
					!transparencyReport.login?.country) ||
				(transparencyReport.creation?.continent &&
					!transparencyReport.creation?.country);

			const modalContent = document.createElement("div");
			modalContent.className = "modal-body";
			modalContent.innerHTML = `
					${
						hasLimitedLocation
							? `<div style="padding: 12px 16px; margin-bottom: 16px; border: 1px solid rgba(255, 193, 7); border-radius: 8px; color: var(--text-primary);">
						<div style="display: flex; align-items: center; gap: 8px;">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 193, 7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
							Location country hidden
						</div>
					</div>`
							: ""
					}
					<div class="transparency-items">
            ${
							profile.verified
								? `<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge-check-icon lucide-badge-check"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>
						<div class="transparency-data"><strong>Verified account</strong></div></div>`
								: ""
						}

			${
				transparencyReport.creation?.vpn &&
				!transparencyReport.creation?.suppress_vpn_warning
					? `<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-alert-icon lucide-shield-alert"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
						<div class="transparency-data"><strong>Created from a datacenter IP</strong></div></div>`
					: ""
			}

            ${
							transparencyReport.creation?.country === "T1"
								? `<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-alert-icon lucide-shield-alert"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
						<div class="transparency-data"><strong>Created from the Tor network</strong></div></div>`
								: ""
						}

					${
						transparencyReport.login &&
						transparencyReport.login.country !== "T1"
							? `<div class="transparency-item">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin-icon lucide-pin"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg> <div class="transparency-data"><strong>Last login location</strong>
							<span>${getLocationDisplay(transparencyReport.login)}${transparencyReport.login.country && !transparencyReport.login.continent ? `<img src="/public/shared/assets/img/flags/${transparencyReport.login.country.toLowerCase()}.svg" class="flag" alt="${transparencyReport.login.country}" width="16" height="16" onerror="this.remove()">` : ""}</span>

						${transparencyReport.login.latitude ? `<img draggable="false" alt="Apple Map" class="map" src="https://external-content.duckduckgo.com/ssv2/?scale=3&lang=en-US&colorScheme=dark&format=png&size=360x157&spn=36,36&center=${encodeURIComponent(`${transparencyReport.login.latitude},${transparencyReport.login.longitude}`)}&annotations=${encodeURIComponent(JSON.stringify([{ point: `${transparencyReport.login.latitude},${transparencyReport.login.longitude}`, color: "AC97FF" }]))}"}>` : ""}</div></div>

			${
				transparencyReport.login?.vpn &&
				!transparencyReport.login?.suppress_vpn_warning
					? `<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-alert-icon lucide-shield-alert"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
						<div class="transparency-data"><strong>Last login from a datacenter IP</strong></div></div>`
					: ""
			}

<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock-icon lucide-clock"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>
						<div class="transparency-data"><strong>Last login timezone</strong> ${
							transparencyReport.login.timezone || "Unknown"
						}</div></div>`
							: ""
					}

            ${
							transparencyReport.login?.country === "T1"
								? `<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-alert-icon lucide-shield-alert"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
						<div class="transparency-data"><strong>Last login from the Tor network</strong></div></div>`
								: ""
						}

${
	transparencyReport.creation && transparencyReport.creation.country !== "T1"
		? `	<div class="transparency-item">
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-icon lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
		<div class="transparency-data">
							<strong>Account creation location</strong>
							<span>${getLocationDisplay(transparencyReport.creation)}${transparencyReport.creation.country && !transparencyReport.creation.continent ? `<img src="/public/shared/assets/img/flags/${transparencyReport.creation.country.toLowerCase()}.svg" alt="${transparencyReport.creation.country}" width="16" height="16" style="margin-left: 4px;" onerror="this.remove()">` : ""}</span>

							${transparencyReport.creation.latitude && transparencyReport.creation.longitude ? `<img draggable="false" alt="Apple Map" class="map" src="https://external-content.duckduckgo.com/ssv2/?scale=3&lang=en-US&colorScheme=dark&format=png&size=360x157&spn=36,36&center=${encodeURIComponent(`${transparencyReport.creation.latitude},${transparencyReport.creation.longitude}`)}&annotations=${encodeURIComponent(JSON.stringify([{ point: `${transparencyReport.creation.latitude},${transparencyReport.creation.longitude}`, color: "AC97FF" }]))}"}>` : ""}</div></div>

						<div class="transparency-item">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history-icon lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
						<div class="transparency-data">
							<strong>Creation timezone</strong> ${
								transparencyReport.creation?.timezone || "Unknown"
							}
						</div></div>`
		: ``
}

<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-plus-icon lucide-calendar-plus"><path d="M16 19h6"/><path d="M16 2v4"/><path d="M19 16v6"/><path d="M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5"/><path d="M3 10h18"/><path d="M8 2v4"/></svg>
						<div class="transparency-data"><strong>Account created</strong>${(
							new Date(profile.created_at)
						).toLocaleDateString("en-US", {
							month: "long",
							year: "numeric",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})}</div></div>


<div class="transparency-item"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-plus-icon lucide-calendar-plus"><path d="M16 19h6"/><path d="M16 2v4"/><path d="M19 16v6"/><path d="M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5"/><path d="M3 10h18"/><path d="M8 2v4"/></svg>
						<div class="transparency-data"><strong>IP ASN</strong><a href="javascript:" class="request-asn">Show</a></div></div>
					</div>
			`;

			createModal({
				title: `@${profile.username}`,
				content: modalContent,
				closeOnOverlayClick: true,
			});

			const asnLink = modalContent.querySelector(".request-asn");
			asnLink.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();

				const loadingState = document.createElement("span");
				loadingState.textContent = "Loading…";
				asnLink.replaceWith(loadingState);

				const { name, id } = await query(`/transparency/${profile.id}/asn`);

				if (!id) {
					loadingState.textContent = "Unknown";
					return;
				}

				const asnLink2 = document.createElement("a");
				asnLink2.href = `https://ipinfo.io/AS${id}`;
				asnLink2.target = "_blank";
				asnLink2.textContent = name || "Unknown";
				loadingState.replaceWith(asnLink2);
			});
		});

	if (isOwnProfile) {
		const editBtn = document.getElementById("editProfileBtn");
		const followBtn = document.getElementById("followBtn");
		const dmBtn = document.getElementById("profileDmBtn");
		const dropdown = document.getElementById("profileDropdown");
		if (editBtn) editBtn.style.display = "block";
		if (followBtn) followBtn.style.display = "none";
		if (dmBtn) dmBtn.style.display = "none";
		if (dropdown) dropdown.style.display = "none";
	} else if (authToken) {
		const editBtn = document.getElementById("editProfileBtn");
		const followBtn = document.getElementById("followBtn");
		const dmBtn = document.getElementById("profileDmBtn");
		const dropdown = document.getElementById("profileDropdown");
		const notificationDropdown = document.getElementById(
			"profileNotificationDropdown",
		);
		if (editBtn) editBtn.style.display = "none";
		if (followBtn) followBtn.style.display = "block";
		if (dmBtn) dmBtn.style.display = "flex";
		if (dropdown) dropdown.style.display = "block";
		if (notificationDropdown) {
			notificationDropdown.style.display = isFollowing ? "block" : "none";
		}
		updateFollowButton(isFollowing, profile.blockedProfile);
		setupNotificationButton(profile.username, profile.notifyTweets || false);
		setupDmButton(profile.username);
		setupProfileDropdownButton();
		try {
			const dmBtnCheck = document.getElementById("profileDmBtn");
			const pc = document.getElementById("profileContainer");
			const isBlocked = pc?.dataset?.blockedByProfile === "true";
			if (dmBtnCheck) {
				if (isBlocked) {
					dmBtnCheck.disabled = true;
					dmBtnCheck.setAttribute("aria-disabled", "true");
					dmBtnCheck.classList.add("blocked-interaction");
					dmBtnCheck.title = "You have been blocked by this user";
				} else {
					dmBtnCheck.disabled = false;
					dmBtnCheck.removeAttribute("aria-disabled");
					dmBtnCheck.classList.remove("blocked-interaction");
					dmBtnCheck.title = "";
				}
			}
		} catch {}
	} else {
		const dmBtn = document.getElementById("profileDmBtn");
		const dropdown = document.getElementById("profileDropdown");
		if (dmBtn) dmBtn.style.display = "flex";
		if (dropdown) dropdown.style.display = "none";
	}

	if (suspended) {
		const editBtn = document.getElementById("editProfileBtn");
		const followBtn = document.getElementById("followBtn");
		const dmBtn = document.getElementById("profileDmBtn");
		const dropdown = document.getElementById("profileDropdown");
		if (editBtn) editBtn.style.display = "none";
		if (followBtn) followBtn.style.display = "none";
		if (dmBtn) dmBtn.style.display = "none";
		if (dropdown) dropdown.style.display = "none";
	}

	currentPosts = posts;
	currentReplies = [];
	currentMedia = [];
	hasMorePosts = posts && posts.length >= 20;
	hasMoreReplies = true;
	hasMoreMedia = true;
	currentAffiliates = Array.isArray(data.affiliates)
		? [...data.affiliates]
		: [];
	if (currentProfile) currentProfile.affiliates = currentAffiliates;

	const affiliatesContainer = document.getElementById(
		"profileAffiliatesContainer",
	);
	if (affiliatesContainer) {
		affiliatesContainer.innerHTML = "";
		affiliatesContainer.classList.add("hidden");
	}

	document.querySelectorAll(".profile-tab-btn").forEach((btn) => {
		btn.classList.remove("active");
	});
	const postTabBtn = document.querySelector(
		'.profile-tab-btn[data-tab="posts"]',
	);
	if (postTabBtn) postTabBtn.classList.add("active");

	const tabContainer = document.querySelector(".profile-tab-nav");
	if (tabContainer && postTabBtn) {
		observeTabContainer(tabContainer);
		setTimeout(() => {
			updateTabIndicator(tabContainer, postTabBtn);
		}, 50);
	}

	const affiliatesTabBtn = document.querySelector(
		'.profile-tab-btn[data-tab="affiliates"]',
	);
	if (affiliatesTabBtn) {
		if (!suspended && currentAffiliates.length > 0) {
			affiliatesTabBtn.style.display = "block";
			affiliatesTabBtn.textContent = `Affiliates`;
		} else {
			affiliatesTabBtn.style.display = "none";
			affiliatesTabBtn.classList.remove("active");
		}
	}

	switchTab("posts");
	if (profileContainerEl) profileContainerEl.style.display = "block";
};

function updateFollowButton(isFollowing, isBlocked) {
	const btn = document.getElementById("followBtn");
	const notificationDropdown = document.getElementById(
		"profileNotificationDropdown",
	);

	if (!btn) return;

	// Reset styles
	btn.style.backgroundColor = "";
	btn.style.color = "";
	btn.style.border = "";
	btn.onmouseenter = null;
	btn.onmouseleave = null;

	if (isBlocked) {
		btn.textContent = "Blocked";
		btn.className = "profile-btn profile-btn-blocked";
		btn.style.backgroundColor = "var(--error, #f4212e)";
		btn.style.color = "white";
		btn.style.border = "1px solid var(--error, #f4212e)";

		btn.onmouseenter = () => {
			btn.textContent = "Unblock";
		};
		btn.onmouseleave = () => {
			btn.textContent = "Blocked";
		};

		btn.onclick = async () => {
			if (!authToken) return;

			const result = await query("/blocking/unblock", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId: currentProfile.profile.id }),
			});

			if (result.success) {
				if (currentProfile?.profile) {
					currentProfile.profile.blockedProfile = false;
				}
				updateFollowButton(false, false);
			} else {
				toastQueue.add(`<h1>${result.error || "Failed to unblock"}</h1>`);
			}
		};
		return;
	}

	if (isFollowing) {
		btn.textContent = "Following";
		btn.className = "profile-btn profile-btn-following";

		if (notificationDropdown) {
			notificationDropdown.style.display = "block";
		}

		btn.onclick = async () => {
			if (!authToken) {
				toastQueue.add(`<h1>Log in to follow users</h1>`);
				return;
			}

			const { success } = await query(`/profile/${currentUsername}/follow`, {
				method: "DELETE",
			});

			if (!success) {
				return toastQueue.add(`<h1>Failed to unfollow user</h1>`);
			}

			updateFollowButton(false);
			if (notificationDropdown) {
				notificationDropdown.style.display = "none";
			}
			const count = document.getElementById("profileFollowerCount");
			count.textContent = Math.max(0, parseInt(count.textContent, 10) - 1);
		};
	} else {
		btn.textContent = "Follow";
		btn.className = "profile-btn profile-btn-primary profile-btn-follow";

		if (notificationDropdown) {
			notificationDropdown.style.display = "none";
		}

		btn.onclick = async () => {
			if (!authToken) {
				toastQueue.add(`<h1>Log in to follow users</h1>`);
				return;
			}

			try {
				const pc = document.getElementById("profileContainer");
				const isBlocked = pc?.dataset?.blockedByProfile === "true";
				if (isBlocked) {
					toastQueue.add(`<h1>You have been blocked by this user</h1>`);
					return;
				}
			} catch {}

			const { success } = await query(`/profile/${currentUsername}/follow`, {
				method: "POST",
			});

			if (!success) {
				return toastQueue.add(`<h1>Failed to follow user</h1>`);
			}
			updateFollowButton(true);
			if (notificationDropdown) {
				notificationDropdown.style.display = "block";
			}
			setupNotificationButton(currentUsername, false);
			const count = document.getElementById("profileFollowerCount");
			count.textContent = parseInt(count.textContent, 10) + 1;
		};
	}
}

function setupNotificationButton(username, initialNotifyState) {
	const btn = document.getElementById("profileNotificationBtn");
	if (!btn) return;

	let notifyTweets = initialNotifyState;

	const updateBellIcon = (active) => {
		if (active) {
			btn.classList.add("notifications-active");
			btn.title = "Turn off tweet notifications";
		} else {
			btn.classList.remove("notifications-active");
			btn.title = "Turn on tweet notifications";
		}
	};

	updateBellIcon(notifyTweets);

	btn.onclick = async (e) => {
		e.stopPropagation();

		const { modal, close: closeModal } = createModal({});
		modal.classList.add("notification-settings-modal");

		const content = document.createElement("div");
		content.style.cssText = `
      padding: 1.5rem;
    `;

		const title = document.createElement("h3");
		title.textContent = `Notifications for @${username}`;
		title.style.cssText = `
      margin: 0 0 1rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    `;

		const option1 = document.createElement("label");
		option1.style.cssText = `
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      cursor: pointer;
      border-radius: 8px;
      margin-bottom: 0.5rem;
      transition: background 0.2s;
    `;
		option1.onmouseenter = () => {
			option1.style.background =
				"var(--btn-secondary-hover-bg, rgba(255, 255, 255, 0.05))";
		};
		option1.onmouseleave = () => {
			option1.style.background = "transparent";
		};

		const radio1 = document.createElement("input");
		radio1.type = "radio";
		radio1.name = "notifyType";
		radio1.value = "all";
		radio1.checked = notifyTweets;

		const label1Text = document.createElement("div");
		label1Text.innerHTML = `
      <div style="font-weight: 500;">All tweets</div>
      <div style="font-size: 0.875rem; color: var(--text-muted);">Get notified for all tweets and replies</div>
    `;

		option1.appendChild(radio1);
		option1.appendChild(label1Text);

		const option2 = document.createElement("label");
		option2.style.cssText = option1.style.cssText;
		option2.onmouseenter = () => {
			option2.style.background =
				"var(--btn-secondary-hover-bg, rgba(255, 255, 255, 0.05))";
		};
		option2.onmouseleave = () => {
			option2.style.background = "transparent";
		};

		const radio2 = document.createElement("input");
		radio2.type = "radio";
		radio2.name = "notifyType";
		radio2.value = "none";
		radio2.checked = !notifyTweets;

		const label2Text = document.createElement("div");
		label2Text.innerHTML = `
      <div style="font-weight: 500;">Off</div>
      <div style="font-size: 0.875rem; color: var(--text-muted);">Don't get notified for tweets</div>
    `;

		option2.appendChild(radio2);
		option2.appendChild(label2Text);

		const saveBtn = document.createElement("button");
		saveBtn.textContent = "Save";
		saveBtn.className = "profile-btn profile-btn-primary";
		saveBtn.style.cssText = `
      width: 100%;
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: 100px;
    `;

		saveBtn.onclick = async () => {
			const newNotifyState = radio1.checked;

			const result = await query(`/profile/${username}/notify-tweets`, {
				method: "POST",
				body: JSON.stringify({ notify: newNotifyState }),
			});

			if (result.success) {
				notifyTweets = newNotifyState;
				updateBellIcon(notifyTweets);
				toastQueue.add(`<h1>Notification settings updated</h1>`);
				closeModal();
			} else {
				toastQueue.add(`<h1>Failed to update settings</h1>`);
			}
		};

		content.appendChild(title);
		content.appendChild(option1);
		content.appendChild(option2);
		content.appendChild(saveBtn);
		modal.appendChild(content);

		modal.onclick = (e) => {
			if (e.target === modal) {
				closeModal();
			}
		};
	};
}

function setupDmButton(username) {
	const btn = document.getElementById("profileDmBtn");
	if (!btn) return;

	btn.onclick = async () => {
		try {
			const pc = document.getElementById("profileContainer");
			const isBlocked = pc?.dataset?.blockedByProfile === "true";
			if (isBlocked) {
				toastQueue.add(`<h1>You have been blocked by this user</h1>`);
				return;
			}
		} catch {}

		const { openOrCreateConversation } = await import("./dm.js");
		openOrCreateConversation(username);
	};
}

function setupProfileDropdownButton() {
	const btn = document.getElementById("profileDropdownBtn");
	if (!btn) return;

	btn.onclick = () => {
		handleProfileDropdown(btn);
	};
}

const showEditModal = async () => {
	if (!currentProfile) return;

	const { profile } = currentProfile;
	document.getElementById("editDisplayName").value = profile.name || "";
	document.getElementById("editBio").value = profile.bio || "";
	document.getElementById("editPronouns").value = profile.pronouns || "";
	document.getElementById("editLocation").value = profile.location || "";
	document.getElementById("editWebsite").value = profile.website || "";
	document.getElementById("editLabelType").value = profile.label_type || "";
	document.getElementById("editLabelAutomated").checked =
		profile.label_automated || false;

	const affiliateRemoveSection = document.getElementById(
		"affiliateRemoveSection",
	);
	if (affiliateRemoveSection) {
		if (profile.affiliate && profile.affiliate_with) {
			affiliateRemoveSection.style.display = "block";
		} else {
			affiliateRemoveSection.style.display = "none";
		}
	}

	const grayOutlinesSection = document.getElementById("grayOutlinesSection");
	const checkmarkOutlineContainer = document.getElementById(
		"checkmarkOutlinePickerContainer",
	);
	const avatarOutlineContainer = document.getElementById(
		"avatarOutlinePickerContainer",
	);
	if (grayOutlinesSection) {
		const { createGradientPicker } = await import(
			"../../shared/gradient-picker.js"
		);

		if (profile.gray) {
			grayOutlinesSection.style.display = "block";
			if (checkmarkOutlineContainer) {
				checkmarkOutlineContainer.innerHTML = "";
				checkmarkOutlinePicker = createGradientPicker({
					initialValue: profile.checkmark_outline || "",
					id: "editCheckmarkOutlinePicker",
				});
				checkmarkOutlineContainer.appendChild(checkmarkOutlinePicker.element);
			}
			if (avatarOutlineContainer) {
				avatarOutlineContainer.innerHTML = "";
				avatarOutlinePicker = createGradientPicker({
					initialValue: profile.avatar_outline || "",
					id: "editAvatarOutlinePicker",
				});
				avatarOutlineContainer.appendChild(avatarOutlinePicker.element);
			}
		} else {
			grayOutlinesSection.style.display = "none";
			checkmarkOutlinePicker = null;
			avatarOutlinePicker = null;
		}
	}

	updateEditAvatarDisplay();

	const avatarRadiusControls = document.getElementById("avatarRadiusControls");
	const radiusInput = document.getElementById("radius-input");
	const presetSquare = document.getElementById("radius-preset-square");
	const presetDefault = document.getElementById("radius-preset-default");
	if (profile.gold || profile.gray) {
		avatarRadiusControls.style.display = "block";
	} else {
		avatarRadiusControls.style.display = "none";
	}
	const currentRadius =
		profile.avatar_radius !== null && profile.avatar_radius !== undefined
			? profile.avatar_radius
			: profile.gold || profile.gray
				? 4
				: 50;
	radiusInput.value = currentRadius;
	const avatarImg = document.getElementById("edit-current-avatar");
	const avatarPreviewContainer = document.querySelector(".avatar-preview");
	if (avatarImg) avatarImg.style.borderRadius = `${currentRadius}px`;
	if (avatarPreviewContainer)
		avatarPreviewContainer.style.borderRadius = `${currentRadius}px`;

	if (!(profile.gold || profile.gray)) {
		radiusInput.disabled = true;
		presetSquare.disabled = true;
		presetDefault.disabled = true;
	} else {
		radiusInput.disabled = false;
		presetSquare.disabled = false;
		presetDefault.disabled = false;
	}

	presetSquare?.addEventListener("click", () => {
		radiusInput.value = 4;
		const avatarImg = document.getElementById("edit-current-avatar");
		const avatarPreviewContainer = document.querySelector(".avatar-preview");
		if (avatarImg) avatarImg.style.borderRadius = `4px`;
		if (avatarPreviewContainer)
			avatarPreviewContainer.style.borderRadius = `4px`;
	});

	presetDefault?.addEventListener("click", () => {
		radiusInput.value = 50;
		const avatarImg = document.getElementById("edit-current-avatar");
		const avatarPreviewContainer = document.querySelector(".avatar-preview");
		if (avatarImg) avatarImg.style.borderRadius = `50px`;
		if (avatarPreviewContainer)
			avatarPreviewContainer.style.borderRadius = `50px`;
	});

	radiusInput?.addEventListener("input", () => {
		const val = parseInt(radiusInput.value, 10);
		if (Number.isNaN(val)) return;
		const avatarImg = document.getElementById("edit-current-avatar");
		const avatarPreviewContainer = document.querySelector(".avatar-preview");
		if (avatarImg) avatarImg.style.borderRadius = `${val}px`;
		if (avatarPreviewContainer)
			avatarPreviewContainer.style.borderRadius = `${val}px`;
	});

	updateEditBannerDisplay();

	updateCharCounts();
	const modalEl = document.getElementById("editProfileModal");
	modalEl.classList.add("show");

	modalEl.setAttribute("role", "dialog");
	modalEl.setAttribute("aria-modal", "true");
	modalEl.setAttribute("aria-hidden", "false");
	document.querySelectorAll(".main-content, nav").forEach((el) => {
		el.setAttribute("aria-hidden", "true");
	});

	const tabBtns = modalEl.querySelectorAll(".edit-profile-tab-btn");
	const tabContents = modalEl.querySelectorAll(".edit-profile-tab-content");

	tabBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			const targetTab = btn.dataset.tab;

			tabBtns.forEach((b) => {
				b.classList.remove("active");
			});
			btn.classList.add("active");

			tabContents.forEach((content) => {
				if (content.id === `${targetTab}Tab`) {
					content.classList.remove("hidden");
				} else {
					content.classList.add("hidden");
				}
			});
		});
	});

	const escHandler = (e) => {
		if (e.key === "Escape") closeEditModal();
	};
	modalEl._escHandler = escHandler;
	document.addEventListener("keydown", escHandler);
};

const closeEditModal = () => {
	const modalEl = document.getElementById("editProfileModal");
	modalEl.classList.remove("show");

	modalEl.setAttribute("aria-hidden", "true");
	document.querySelectorAll(".main-content, nav").forEach((el) => {
		el.removeAttribute("aria-hidden");
	});

	if (modalEl._escHandler) {
		document.removeEventListener("keydown", modalEl._escHandler);
		delete modalEl._escHandler;
	}
};

const updateCharCounts = () => {
	const fields = [
		{ id: "editDisplayName", countId: "displayNameCount" },
		{ id: "editBio", countId: "bioCount" },
		{ id: "editPronouns", countId: "pronounsCount" },
		{ id: "editLocation", countId: "locationCount" },
		{ id: "editWebsite", countId: "websiteCount" },
	];

	fields.forEach((field) => {
		const input = document.getElementById(field.id);
		const counter = document.getElementById(field.countId);
		if (input && counter) {
			counter.textContent = input.value.length;
		}
	});
};

const updateEditBannerDisplay = () => {
	if (!currentProfile) return;

	const { profile } = currentProfile;
	const bannerPreview = document.getElementById("edit-current-banner");
	const removeBtn = document.getElementById("edit-remove-banner");

	if (bannerPreview) {
		if (profile.banner) {
			bannerPreview.style.backgroundImage = `url(${profile.banner})`;
			bannerPreview.style.backgroundSize = "cover";
			bannerPreview.style.backgroundPosition = "center";
			bannerPreview.style.backgroundRepeat = "no-repeat";
		} else {
			bannerPreview.style.backgroundImage = "none";
			bannerPreview.style.backgroundColor = "var(--bg-secondary)";
		}
	}

	if (removeBtn) {
		removeBtn.style.display = profile.banner ? "inline-block" : "none";
	}
};

const handleEditBannerUpload = async (file) => {
	if (!file) return;

	if (file.size > 10 * 1024 * 1024) {
		toastQueue.add(
			`<h1>File too large</h1><p>Please choose an image smaller than 10MB.</p>`,
		);
		return;
	}

	if (!isConvertibleImage(file)) {
		toastQueue.add(
			`<h1>Invalid file type</h1><p>Please upload a valid image file (JPEG, PNG, GIF, WebP, etc.).</p>`,
		);
		return;
	}

	const changeBtn = document.getElementById("edit-change-banner");
	if (changeBtn) {
		changeBtn.disabled = true;
		changeBtn.textContent = "Processing...";
	}

	try {
		let processedFile = file;
		try {
			const cropResult = await openImageCropper(file, {
				aspect: 3,
				size: 1500,
			});
			if (cropResult === CROP_CANCELLED) {
				if (changeBtn) {
					changeBtn.disabled = false;
					changeBtn.textContent = "Change Banner";
				}
				return;
			}
			processedFile = cropResult || file;
		} catch (err) {
			console.warn("Cropper error, using original file:", err);
			processedFile = file;
		}

		const webpFile = await convertToWebPBanner(processedFile, 1500, 500, 0.8);

		if (changeBtn) {
			changeBtn.textContent = "Uploading...";
		}

		const formData = new FormData();
		formData.append("banner", webpFile);

		const result = await query(
			`/profile/${currentProfile.profile.username}/banner`,
			{
				method: "POST",
				body: formData,
			},
		);

		if (result.success) {
			currentProfile.profile.banner = result.banner;
			updateEditBannerDisplay();
			const profileBanner = document.querySelector(".profile-banner");
			if (profileBanner) {
				profileBanner.style.backgroundImage = `url(${result.banner})`;
				profileBanner.style.backgroundSize = "cover";
				profileBanner.style.backgroundPosition = "center";
				profileBanner.style.backgroundRepeat = "no-repeat";
			}
			toastQueue.add(
				`<h1>Banner updated!</h1><p>Your profile banner has been uploaded and changed.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Upload failed</h1><p>${
					result.error || "Failed to upload banner"
				}</p>`,
			);
		}
	} catch (error) {
		console.error("Banner upload error:", error);
		toastQueue.add(
			`<h1>Processing error</h1><p>Failed to process image: ${error.message}</p>`,
		);
	} finally {
		if (changeBtn) {
			changeBtn.disabled = false;
			changeBtn.textContent = "Change Banner";
		}
	}
};

const handleEditBannerRemoval = async () => {
	const removeBtn = document.getElementById("edit-remove-banner");
	if (removeBtn) {
		removeBtn.disabled = true;
		removeBtn.textContent = "Removing...";
	}

	try {
		const result = await query(
			`/profile/${currentProfile.profile.username}/banner`,
			{
				method: "DELETE",
			},
		);

		if (result.success) {
			currentProfile.profile.banner = null;
			updateEditBannerDisplay();

			const profileBanner = document.querySelector(".profile-banner");
			if (profileBanner) {
				profileBanner.style.backgroundImage = "none";
				profileBanner.style.backgroundColor = "var(--bg-secondary)";
			}
			toastQueue.add(
				`<h1>Banner removed</h1><p>Your profile banner has been reset to default.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Failed to remove banner</h1><p>${
					result.error || "An error occurred"
				}</p>`,
			);
		}
	} catch (error) {
		console.error("Banner removal error:", error);
		toastQueue.add(
			`<h1>Network error</h1><p>Failed to remove banner. Please try again.</p>`,
		);
	} finally {
		if (removeBtn) {
			removeBtn.disabled = false;
			removeBtn.textContent = "Remove Banner";
		}
	}
};

const updateEditAvatarDisplay = () => {
	if (!currentProfile) return;

	const { profile } = currentProfile;
	const avatarImg = document.getElementById("edit-current-avatar");
	const removeBtn = document.getElementById("edit-remove-avatar");
	const avatarPreviewContainer = document.querySelector(".avatar-preview");

	if (avatarImg) {
		const avatarSrc =
			profile.avatar || `/public/shared/assets/default-avatar.svg`;
		avatarImg.src = avatarSrc;
		avatarImg.alt = profile.name || profile.username;
	}

	if (avatarPreviewContainer) {
		if (profile.avatar_radius !== null && profile.avatar_radius !== undefined) {
			avatarPreviewContainer.style.borderRadius = `${profile.avatar_radius}px`;
			if (avatarImg)
				avatarImg.style.borderRadius = `${profile.avatar_radius}px`;
		} else if (profile.gold || profile.gray) {
			avatarPreviewContainer.style.borderRadius = `4px`;
			if (avatarImg) avatarImg.style.borderRadius = `4px`;
		} else {
			avatarPreviewContainer.style.borderRadius = `50px`;
			if (avatarImg) avatarImg.style.borderRadius = `50px`;
		}
	}

	if (removeBtn) {
		removeBtn.style.display = profile.avatar ? "inline-block" : "none";
	}
};

const handleEditAvatarUpload = async (file) => {
	if (!file) return;

	const { default: openImageCropper, CROP_CANCELLED } = await import(
		"../../shared/image-cropper.js"
	);

	if (file.size > 5 * 1024 * 1024) {
		toastQueue.add(
			`<h1>File too large</h1><p>Please choose an image smaller than 5MB.</p>`,
		);
		return;
	}

	if (!isConvertibleImage(file)) {
		toastQueue.add(
			`<h1>Invalid file type</h1><p>Please upload a valid image file (JPEG, PNG, GIF, WebP, etc.).</p>`,
		);
		return;
	}

	const changeBtn = document.getElementById("edit-change-avatar");
	if (changeBtn) {
		changeBtn.disabled = true;
		changeBtn.textContent = "Processing...";
	}

	try {
		let uploadFile = null;
		if (
			file.type === "image/gif" &&
			(currentProfile?.profile?.gold || currentProfile?.profile?.gray)
		) {
			uploadFile = file;
		} else {
			let processedFile = file;
			try {
				const cropResult = await openImageCropper(file, {
					aspect: 1,
					size: 250,
				});
				if (cropResult === CROP_CANCELLED) {
					if (changeBtn) {
						changeBtn.disabled = false;
						changeBtn.textContent = "Change Avatar";
					}
					return;
				}
				processedFile = cropResult || file;
			} catch (err) {
				console.warn("Cropper error, using original file:", err);
				processedFile = file;
			}

			const webpFile = await convertToWebPAvatar(processedFile, 250, 0.8);
			uploadFile = webpFile;
		}

		if (changeBtn) {
			changeBtn.textContent = "Uploading...";
		}

		const formData = new FormData();
		formData.append("avatar", uploadFile);

		const result = await query(
			`/profile/${currentProfile.profile.username}/avatar`,
			{
				method: "POST",
				body: formData,
			},
		);

		if (result.success) {
			currentProfile.profile.avatar = result.avatar;
			avatarChangedForTweet = true;
			pendingAvatarTweetUrl = result.avatar;
			updateEditAvatarDisplay();
			const profileAvatar = document.getElementById("profileAvatar");
			if (profileAvatar) {
				profileAvatar.src = result.avatar;
				if (
					currentProfile.profile.avatar_radius !== null &&
					currentProfile.profile.avatar_radius !== undefined
				) {
					profileAvatar.style.borderRadius = `${currentProfile.profile.avatar_radius}px`;
				} else if (currentProfile.profile.gold || currentProfile.profile.gray) {
					profileAvatar.style.borderRadius = `4px`;
				} else {
					profileAvatar.style.borderRadius = `50px`;
				}
			}
			toastQueue.add(
				`<h1>Avatar updated!</h1><p>Your profile picture has been uploaded and changed.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Upload failed</h1><p>${
					result.error || "Failed to upload avatar"
				}</p>`,
			);
		}
	} catch (error) {
		console.error("Avatar upload error:", error);
		toastQueue.add(
			`<h1>Processing error</h1><p>Failed to process image: ${error.message}</p>`,
		);
	} finally {
		if (changeBtn) {
			changeBtn.disabled = false;
			changeBtn.textContent = "Change Avatar";
		}
	}
};

const handleEditAvatarRemoval = async () => {
	const removeBtn = document.getElementById("edit-remove-avatar");
	if (removeBtn) {
		removeBtn.disabled = true;
		removeBtn.textContent = "Removing...";
	}

	try {
		const result = await query(
			`/profile/${currentProfile.profile.username}/avatar`,
			{
				method: "DELETE",
			},
		);

		if (result.success) {
			currentProfile.profile.avatar = null;
			avatarChangedForTweet = false;
			pendingAvatarTweetUrl = null;
			updateEditAvatarDisplay();
			const profileAvatar = document.getElementById("profileAvatar");
			if (profileAvatar) {
				profileAvatar.src = `/public/shared/assets/default-avatar.svg`;
				if (
					currentProfile.profile.avatar_radius !== null &&
					currentProfile.profile.avatar_radius !== undefined
				) {
					profileAvatar.style.borderRadius = `${currentProfile.profile.avatar_radius}px`;
				} else if (currentProfile.profile.gold || currentProfile.profile.gray) {
					profileAvatar.style.borderRadius = `4px`;
				} else {
					profileAvatar.style.borderRadius = `50px`;
				}
			}
			toastQueue.add(
				`<h1>Avatar removed</h1><p>Your profile picture has been reset to default.</p>`,
			);
		} else {
			toastQueue.add(
				`<h1>Failed to remove avatar</h1><p>${
					result.error || "An error occurred"
				}</p>`,
			);
		}
	} catch (error) {
		console.error("Avatar removal error:", error);
		toastQueue.add(
			`<h1>Network error</h1><p>Failed to remove avatar. Please try again.</p>`,
		);
	} finally {
		if (removeBtn) {
			removeBtn.disabled = false;
			removeBtn.textContent = "Remove Avatar";
		}
	}
};

const getDeviceSource = () =>
	/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
		? "mobile_web"
		: "desktop_web";

const getFileExtension = (mimeType, fallbackUrl = "") => {
	if (mimeType.includes("png")) return "png";
	if (mimeType.includes("gif")) return "gif";
	if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
	if (mimeType.includes("bmp")) return "bmp";
	if (mimeType.includes("svg")) return "svg";
	if (mimeType.includes("avif")) return "avif";
	if (mimeType.includes("heic")) return "heic";
	if (mimeType.includes("heif")) return "heif";
	const match = fallbackUrl.split("?")[0]?.match(/\.([a-z0-9]+)$/i);
	if (match?.[1]) return match[1];
	return "webp";
};

const postNewProfilePicTweet = async (avatarUrl) => {
	const fetchOptions = { credentials: "include" };
	if (authToken) {
		fetchOptions.headers = {
			Authorization: `Bearer ${authToken}`,
		};
	}

	const imageResponse = await fetch(avatarUrl, fetchOptions);
	if (!imageResponse.ok) {
		throw new Error("Failed to load profile picture");
	}

	const imageBlob = await imageResponse.blob();
	if (!imageBlob || imageBlob.size === 0) {
		throw new Error("Profile picture unavailable");
	}

	const mimeType = imageBlob.type || "image/webp";
	const extension = getFileExtension(mimeType, avatarUrl);
	const fileName = `new-profile-${Date.now()}.${extension}`;
	const file = new File([imageBlob], fileName, {
		type: mimeType,
		lastModified: Date.now(),
	});

	const uploadForm = new FormData();
	uploadForm.append("file", file);

	const uploadResult = await query("/upload", {
		method: "POST",
		body: uploadForm,
	});

	if (!uploadResult?.success || !uploadResult.file) {
		throw new Error(uploadResult?.error || "Failed to upload image");
	}

	const { tweet, error } = await query("/tweets/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			content: "#NewProfilePic",
			files: [uploadResult.file],
			source: getDeviceSource(),
			reply_restriction: "everyone",
		}),
	});

	if (!tweet) {
		throw new Error(error || "Failed to post tweet");
	}

	try {
		addTweetToTimeline(tweet, true);
	} catch {}

	return tweet;
};

const openNewAvatarTweetPrompt = (avatarUrl) => {
	if (!avatarUrl || isAvatarTweetPromptOpen) return;
	isAvatarTweetPromptOpen = true;

	const content = document.createElement("div");
	content.className = "new-avatar-tweet-modal";

	const message = document.createElement("p");
	message.textContent = "Tweet your new profile picture with #NewProfilePic?";
	content.appendChild(message);

	const preview = document.createElement("img");
	preview.src = avatarUrl;
	preview.alt = "New profile picture preview";
	preview.setAttribute("loading", "lazy");
	content.appendChild(preview);

	const actions = document.createElement("div");
	actions.className = "new-avatar-actions";

	const noButton = document.createElement("button");
	noButton.type = "button";
	noButton.className = "profile-btn";
	noButton.textContent = "No thanks";

	const yesButton = document.createElement("button");
	yesButton.type = "button";
	yesButton.className = "profile-btn profile-btn-primary";
	yesButton.textContent = "Tweet it";

	actions.appendChild(noButton);
	actions.appendChild(yesButton);
	content.appendChild(actions);

	let isPosting = false;
	const modal = createModal({
		title: "Share your new look?",
		content,
		className: "new-avatar-modal",
		onClose: () => {
			isAvatarTweetPromptOpen = false;
			avatarChangedForTweet = false;
			pendingAvatarTweetUrl = null;
		},
	});

	noButton.addEventListener("click", () => {
		modal.close();
	});

	yesButton.addEventListener("click", async () => {
		if (isPosting) return;
		isPosting = true;
		const originalLabel = yesButton.textContent;
		yesButton.disabled = true;
		noButton.disabled = true;
		yesButton.textContent = "Posting…";

		try {
			await postNewProfilePicTweet(avatarUrl);
			toastQueue.add(`<h1>Tweet sent!</h1><p>Your #NewProfilePic is live.</p>`);
			modal.close();
		} catch (error) {
			const errorMessage =
				error?.message && typeof error.message === "string"
					? escapeHTML(error.message)
					: "Failed to post tweet";
			toastQueue.add(`<h1>Tweet failed</h1><p>${errorMessage}</p>`);
			yesButton.disabled = false;
			noButton.disabled = false;
			yesButton.textContent = originalLabel;
			isPosting = false;
		}
	});
};

const saveProfile = async (event) => {
	event.preventDefault();

	if (!localStorage.getItem("authToken")) {
		switchPage("timeline", { path: "/" });
		return;
	}

	if (!currentProfile || !currentProfile.profile) return;

	const formData = {
		name: document.getElementById("editDisplayName").value.trim(),
		bio: document.getElementById("editBio").value.trim(),
		pronouns: document.getElementById("editPronouns").value.trim(),
		location: document.getElementById("editLocation").value.trim(),
		website: document.getElementById("editWebsite").value.trim(),
		label_type: document.getElementById("editLabelType").value || null,
		label_automated: document.getElementById("editLabelAutomated").checked,
	};

	const avatarRadiusControls = document.getElementById("avatarRadiusControls");
	const radiusInput = document.getElementById("radius-input");
	if (avatarRadiusControls && avatarRadiusControls.style.display !== "none") {
		const val = parseInt(radiusInput.value, 10);
		if (!Number.isNaN(val)) {
			const origProfile = currentProfile.profile || {};
			const originalRadius =
				origProfile.avatar_radius !== null &&
				origProfile.avatar_radius !== undefined
					? origProfile.avatar_radius
					: origProfile.gold
						? 4
						: 50;

			if (val !== originalRadius) {
				formData.avatar_radius = val;
			}
		}
	}

	const grayOutlinesSection = document.getElementById("grayOutlinesSection");
	if (
		grayOutlinesSection &&
		grayOutlinesSection.style.display !== "none" &&
		currentProfile.profile.gray
	) {
		const checkmarkOutline = checkmarkOutlinePicker?.getValue() || null;
		const avatarOutline = avatarOutlinePicker?.getValue() || null;

		const origProfile = currentProfile.profile || {};
		if (
			checkmarkOutline !== origProfile.checkmark_outline ||
			avatarOutline !== origProfile.avatar_outline
		) {
			try {
				await query(`/profile/${currentProfile.profile.username}/outlines`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						checkmark_outline: checkmarkOutline,
						avatar_outline: avatarOutline,
					}),
				});
			} catch (outlineErr) {
				console.error("Outline update error:", outlineErr);
			}
		}
	}

	try {
		const result = await query(`/profile/${currentProfile.profile.username}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(formData),
		});

		if (result?.success) {
			if (result.profile) {
				currentProfile = { ...(currentProfile || {}), profile: result.profile };
				try {
					renderProfile({
						profile: result.profile,
						posts: currentPosts,
						isFollowing: false,
						isOwnProfile: true,
					});
					setupEditProfileListeners();
				} catch (_err) {
					openProfile(currentProfile.profile.username);
				}
			} else {
				openProfile(currentProfile.profile.username);
			}

			closeEditModal();
			toastQueue.add(
				`<h1>Profile Updated!</h1><p>Your profile has been successfully updated</p>`,
			);
			if (avatarChangedForTweet && pendingAvatarTweetUrl) {
				openNewAvatarTweetPrompt(pendingAvatarTweetUrl);
			}
		} else {
			toastQueue.add(
				`<h1>Update Failed</h1><p>${
					result.error || "Failed to update profile"
				}</p>`,
			);
		}
	} catch (error) {
		console.error("Profile update error:", error);
		toastQueue.add(`<h1>Update Failed</h1><p>Failed to update profile</p>`);
	}
};

document.querySelector(".back-button").addEventListener("click", (e) => {
	e.preventDefault();
	history.back();
});

window.addEventListener("DOMContentLoaded", () => {
	setupProfileTabListeners();
});

const setupProfileTabListeners = () => {
	document.querySelectorAll(".profile-tab-btn").forEach((btn) => {
		if (btn._hasTabListener) return;
		btn._hasTabListener = true;
		btn.addEventListener("click", () => {
			document.querySelectorAll(".profile-tab-btn").forEach((b) => {
				b.classList.remove("active");
			});
			btn.classList.add("active");

			const tabContainer = document.querySelector(".profile-tab-nav");
			if (tabContainer) {
				updateTabIndicator(tabContainer, btn);
			}

			switchTab(btn.dataset.tab);
		});
	});
};

const setupEditProfileListeners = () => {
	setupProfileTabListeners();

	const editBtn = document.getElementById("editProfileBtn");
	const closeBtn = document.getElementById("closeEditModalBtn");
	const cancelBtn = document.getElementById("cancelEditBtn");
	const form = document.getElementById("editProfileForm");

	if (editBtn && !editBtn._hasEditListener) {
		editBtn.addEventListener("click", showEditModal);
		editBtn._hasEditListener = true;
	}
	if (closeBtn && !closeBtn._hasCloseListener) {
		closeBtn.addEventListener("click", closeEditModal);
		closeBtn._hasCloseListener = true;
	}
	if (cancelBtn && !cancelBtn._hasCancelListener) {
		cancelBtn.addEventListener("click", closeEditModal);
		cancelBtn._hasCancelListener = true;
	}
	if (form && !form._hasSubmitListener) {
		form.addEventListener("submit", saveProfile);
		form._hasSubmitListener = true;
	}
};

[
	"editDisplayName",
	"editBio",
	"editPronouns",
	"editLocation",
	"editWebsite",
].forEach((id) => {
	const element = document.getElementById(id);
	if (element) {
		element.addEventListener("input", updateCharCounts);
	}
});

const editChangeAvatarBtn = document.getElementById("edit-change-avatar");
const editAvatarUpload = document.getElementById("edit-avatar-upload");
const editRemoveAvatarBtn = document.getElementById("edit-remove-avatar");
const editAvatarPreview = document.querySelector(".avatar-preview");

editChangeAvatarBtn?.addEventListener("click", () => {
	editAvatarUpload?.click();
});

editAvatarPreview?.addEventListener("click", () => {
	editAvatarUpload?.click();
});

editAvatarUpload?.addEventListener("change", (e) => {
	const file = e.target.files[0];
	if (file) {
		handleEditAvatarUpload(file);
	}
	e.target.value = "";
});

editRemoveAvatarBtn?.addEventListener("click", handleEditAvatarRemoval);

const editChangeBannerBtn = document.getElementById("edit-change-banner");
const editBannerUpload = document.getElementById("edit-banner-upload");
const editRemoveBannerBtn = document.getElementById("edit-remove-banner");
const editBannerPreview = document.querySelector(".banner-preview");

editChangeBannerBtn?.addEventListener("click", () => {
	editBannerUpload?.click();
});

editBannerPreview?.addEventListener("click", () => {
	editBannerUpload?.click();
});

editBannerUpload?.addEventListener("change", (e) => {
	const file = e.target.files[0];
	if (file) {
		handleEditBannerUpload(file);
	}
	e.target.value = "";
});

editRemoveBannerBtn?.addEventListener("click", handleEditBannerRemoval);

document
	.getElementById("removeAffiliateBtn")
	?.addEventListener("click", async () => {
		if (
			!confirm(
				"Are you sure you want to remove your affiliate badge? This action cannot be undone.",
			)
		) {
			return;
		}

		try {
			const { success, error } = await query("/profile/remove-affiliate", {
				method: "DELETE",
			});

			if (error) {
				toastQueue.add(`<h1>${escapeHTML(error)}</h1>`);
				return;
			}

			if (success) {
				toastQueue.add("<h1>Affiliate badge removed successfully</h1>");

				if (currentProfile?.profile) {
					currentProfile.profile.affiliate = false;
					currentProfile.profile.affiliate_with = null;
					currentProfile.profile.affiliate_with_profile = null;
				}

				const affiliateRemoveSection = document.getElementById(
					"affiliateRemoveSection",
				);
				if (affiliateRemoveSection) {
					affiliateRemoveSection.style.display = "none";
				}

				renderProfile(currentProfile);
				setupEditProfileListeners();
			}
		} catch (_err) {
			toastQueue.add("<h1>Failed to remove affiliate badge</h1>");
		}
	});

export const handleProfileDropdown = (triggerEl) => {
	getUser()
		.then(async (currentUser) => {
			try {
				const baseItems = [
					{
						title: "Copy link",
						icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
						onClick: () => {
							const profileUrl = `${location.origin}/@${currentUsername}`;

							navigator.clipboard.writeText(profileUrl);
						},
					},
					{
						id: "request-affiliate",
						icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18.6471 15.3333V18.6667M18.6471 18.6667L18.6471 22M18.6471 18.6667H22M18.6471 18.6667H15.2941M3 22C3 17.7044 6.69722 14.2222 11.258 14.2222C12.0859 14.2222 12.8854 14.3369 13.6394 14.5505M16.4118 6.44444C16.4118 8.89904 14.4102 10.8889 11.9412 10.8889C9.47214 10.8889 7.47059 8.89904 7.47059 6.44444C7.47059 3.98985 9.47214 2 11.9412 2C14.4102 2 16.4118 3.98985 16.4118 6.44444Z"></path></svg>`,
						title: `Invite to be your affiliate`,
						onClick: async () => {
							try {
								const result = await query(
									`/profile/${currentProfile.profile.username}/affiliate`,
									{ method: "POST" },
								);
								if (result?.success) {
									toastQueue.add(
										`<h1>Request sent</h1><p>Your affiliate request has been sent.</p>`,
									);
								} else {
									toastQueue.add(
										`<h1>Failed</h1><p>${
											result.error || "Failed to send request"
										}</p>`,
									);
								}
							} catch (err) {
								console.error("Affiliate request error:", err);
								toastQueue.add(`<h1>Network error</h1><p>Please try again</p>`);
							}
						},
					},
				];

				const items = baseItems;

				if (!currentProfile?.profile?.blockedProfile) {
					items.push({
						id: "block-user",
						icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
						title: `Block`,
						onClick: async () => {
							try {
								if (
									!confirm(
										`Do you want to block @${currentProfile.profile.username}?`,
									)
								)
									return;

								const result = await query("/blocking/block", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({ userId: currentProfile.profile.id }),
								});

								if (result.success) {
									currentProfile.profile.blockedProfile = true;
									updateFollowButton(false, true);
									toastQueue.add(`<h1>User blocked</h1>`);
								} else {
									toastQueue.add(
										`<h1>You can't block this user</h1><p>${result.error || "Failed to block"}</p>`,
									);
								}
							} catch (err) {
								console.error("Block error:", err);
								toastQueue.add(`<h1>Network error. Please try again.</h1>`);
							}
						},
					});

					items.push({
						id: "report-user",
						icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flag-icon lucide-flag"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>`,
						title: `Report`,
						onClick: async () => {
							const { showReportModal } = await import(
								"../../shared/report-modal.js"
							);
							showReportModal({
								type: "user",
								id: currentProfile.profile.id,
								username: currentProfile.profile.username,
							});
						},
					});
				} else {
					items.push({
						id: "unblock-user",
						icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="15" y1="9" x2="9" y2="15"></line></svg>`,
						title: `Unblock`,
						onClick: async () => {
							try {
								const result = await query("/blocking/unblock", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({ userId: currentProfile.profile.id }),
								});

								if (result.success) {
									currentProfile.profile.blockedProfile = false;
									updateFollowButton(false, false);
									toastQueue.add(`<h1>User unblocked</h1>`);
								} else {
									toastQueue.add(
										`<h1>${result.error || "Failed to unblock"}</h1>`,
									);
								}
							} catch (err) {
								console.error("Unblock error:", err);
								toastQueue.add(`<h1>Network error. Please try again.</h1>`);
							}
						},
					});
				}

				createPopup({
					triggerElement: triggerEl,
					items,
				});
				if (
					currentUser &&
					currentProfile &&
					currentProfile.profile &&
					currentUser.id === currentProfile.profile.id
				) {
					const openAffModal = async () => {
						try {
							const res = await query(`/profile/affiliate-requests`, {
								headers: { Authorization: `Bearer ${authToken}` },
							});

							if (res.error) {
								toastQueue.add(`<h1>Error</h1><p>${escapeHTML(res.error)}</p>`);
								return;
							}

							const requests = res.requests || [];
							const content = document.createElement("div");
							content.className = "affiliate-requests-list";

							if (requests.length === 0) {
								const empty = document.createElement("div");
								empty.textContent = "No pending affiliate requests";
								content.appendChild(empty);
							} else {
								requests.forEach((r) => {
									const item = document.createElement("div");
									item.className = "affiliate-request-item";

									const avatar = document.createElement("img");
									avatar.src = r.avatar || "/public/shared/default-avatar.svg";
									avatar.alt = r.name || r.username;
									avatar.style.width = "40px";
									avatar.style.height = "40px";
									avatar.style.borderRadius = "6px";
									avatar.style.objectFit = "cover";
									avatar.style.marginRight = "10px";

									const info = document.createElement("div");
									info.style.flex = "1";
									const title = document.createElement("div");
									title.textContent = r.name || r.username;
									const uname = document.createElement("div");
									uname.textContent = `@${r.username}`;
									uname.style.opacity = "0.7";
									info.appendChild(title);
									info.appendChild(uname);

									const actions = document.createElement("div");

									const approveBtn = document.createElement("button");
									approveBtn.textContent = "Approve";
									approveBtn.className = "profile-btn profile-btn-primary";
									approveBtn.style.marginRight = "8px";
									approveBtn.onclick = async () => {
										approveBtn.disabled = true;
										const result = await query(
											`/profile/affiliate-requests/${r.id}/approve`,
											{
												method: "POST",
												headers: { Authorization: `Bearer ${authToken}` },
											},
										);
										if (result?.success) {
											const newAffiliate = result.affiliate || {
												id: r.requester_id,
												username: r.username,
												name: r.name,
												avatar: r.avatar,
												verified: r.verified,
												gold: r.gold,
												avatar_radius: r.avatar_radius,
												bio: r.bio,
											};
											if (!currentProfile.affiliates) {
												currentProfile.affiliates = [];
											}
											const exists = currentProfile.affiliates.some(
												(aff) => aff.id === newAffiliate.id,
											);
											if (!exists) {
												currentProfile.affiliates.push(newAffiliate);
											}
											currentAffiliates = currentProfile.affiliates;
											renderProfile(currentProfile);
											setupEditProfileListeners();
											item.remove();
											toastQueue.add(
												`<h1>Approved</h1><p>Affiliate badge granted</p>`,
											);
										} else {
											toastQueue.add(
												`<h1>Failed</h1><p>${result.error || "Failed"}</p>`,
											);
											approveBtn.disabled = false;
										}
									};

									const denyBtn = document.createElement("button");
									denyBtn.textContent = "Deny";
									denyBtn.className = "profile-btn";
									denyBtn.onclick = async () => {
										denyBtn.disabled = true;
										const result = await query(
											`/profile/affiliate-requests/${r.id}/deny`,
											{
												method: "POST",
												headers: { Authorization: `Bearer ${authToken}` },
											},
										);
										if (result?.success) {
											item.remove();
											toastQueue.add(`<h1>Denied</h1>`);
										} else {
											toastQueue.add(
												`<h1>Failed</h1><p>${result.error || "Failed"}</p>`,
											);
											denyBtn.disabled = false;
										}
									};

									actions.appendChild(approveBtn);
									actions.appendChild(denyBtn);

									item.style.display = "flex";
									item.style.alignItems = "center";
									item.style.justifyContent = "space-between";
									item.style.marginBottom = "8px";
									const left = document.createElement("div");
									left.style.display = "flex";
									left.style.alignItems = "center";
									left.appendChild(avatar);
									left.appendChild(info);
									item.appendChild(left);
									item.appendChild(actions);

									content.appendChild(item);
								});
							}

							createModal({
								title: "Affiliate Requests",
								content,
								className: "modal-overlay",
							});
						} catch (err) {
							console.error("Error loading affiliate requests:", err);
							toastQueue.add(`<h1>Error</h1><p>Please try again</p>`);
						}
					};

					if (currentProfile.profile.affiliate) {
						items.push({
							id: "remove-affiliate-badge",
							icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l7-7-7-7"/></svg>`,
							title: "Remove affiliate badge",
							onClick: async () => {
								const result = await query(
									`/profile/${currentProfile.profile.username}/affiliate`,
									{ method: "DELETE" },
								);
								if (result?.success) {
									currentProfile.profile.affiliate = false;
									currentProfile.profile.affiliate_with = null;
									delete currentProfile.profile.affiliate_with_profile;
									renderProfile(currentProfile);
									setupEditProfileListeners();
									toastQueue.add(`<h1>Affiliate badge removed</h1>`);
								} else {
									toastQueue.add(
										`<h1>Failed</h1><p>${
											result?.error || "Unable to update affiliate badge"
										}</p>`,
									);
								}
							},
						});
					}

					items.push({
						id: "manage-affiliates",
						icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18.6471 15.3333V18.6667M18.6471 18.6667L18.6471 22M18.6471 18.6667H22M18.6471 18.6667H15.2941M3 22C3 17.7044 6.69722 14.2222 11.258 14.2222C12.0859 14.2222 12.8854 14.3369 13.6394 14.5505M16.4118 6.44444C16.4118 8.89904 14.4102 10.8889 11.9412 10.8889C9.47214 10.8889 7.47059 8.89904 7.47059 6.44444C7.47059 3.98985 9.47214 2 11.9412 2C14.4102 2 16.4118 3.98985 16.4118 6.44444Z"></path></svg>`,
						title: "Manage affiliate requests",
						onClick: openAffModal,
					});
				}
			} catch (err) {
				console.error("Error building profile dropdown:", err);
				createPopup({
					triggerElement: triggerEl,
					items: [
						{
							title: "Copy link",
							icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,

							onClick: () => {
								const profileUrl = `${location.origin}/@${currentUsername}`;

								navigator.clipboard.writeText(profileUrl);
							},
						},
					],
				});
			}
		})
		.catch((err) => {
			console.error("Error fetching current user for dropdown:", err);
			createPopup({
				triggerElement: triggerEl,
				items: [
					{
						title: "Copy link",
						icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,

						onClick: () => {
							const profileUrl = `${location.origin}/@${currentUsername}`;

							navigator.clipboard.writeText(profileUrl);
						},
					},
				],
			});
		});
};

document.getElementById("editProfileModal").addEventListener("click", (e) => {
	if (e.target === e.currentTarget) closeEditModal();
});

function createUserListItem(user, onClickCallback) {
	const followerItem = document.createElement("div");
	followerItem.className = "follower-item";
	followerItem.dataset.username = user.username;

	const avatar = document.createElement("img");
	avatar.src = user.avatar || "/public/shared/assets/default-avatar.svg";
	avatar.alt = user.name || user.username;
	avatar.className = "follower-avatar";
	const radius =
		user.avatar_radius !== null && user.avatar_radius !== undefined
			? `${user.avatar_radius}px`
			: user.gold || user.gray
				? "4px"
				: "50px";
	avatar.style.borderRadius = radius;

	const followerInfo = document.createElement("div");
	followerInfo.className = "follower-info";

	const followerName = document.createElement("div");
	followerName.className = "follower-name";
	followerName.textContent = user.name || `@${user.username}`;

	const followerUsername = document.createElement("div");
	followerUsername.className = "follower-username";
	followerUsername.textContent = `@${user.username}`;

	if (!user.name) {
		followerUsername.style.display = "none";
	}

	followerInfo.appendChild(followerName);
	followerInfo.appendChild(followerUsername);

	followerItem.appendChild(avatar);
	followerItem.appendChild(followerInfo);

	followerItem.addEventListener("click", onClickCallback);

	return followerItem;
}

async function showFollowersList(username, initialType = "followers") {
	const modalContent = document.createElement("div");
	modalContent.className = "followers-modal-container";

	const tabNav = document.createElement("div");
	tabNav.className = "followers-modal-tabs tab-nav";

	const tabs = [
		{ id: "followers", label: "Followers" },
		{ id: "following", label: "Following" },
		{ id: "mutuals", label: "Followers you know" },
	];

	tabs.forEach((tab) => {
		const tabBtn = document.createElement("button");
		tabBtn.className = `followers-modal-tab${tab.id === initialType ? " active" : ""}`;
		tabBtn.dataset.tab = tab.id;
		tabBtn.textContent = tab.label;
		tabNav.appendChild(tabBtn);
	});

	const listContainer = document.createElement("div");
	listContainer.className = "followers-list-container";

	const followersList = document.createElement("div");
	followersList.className = "followers-list";
	listContainer.appendChild(followersList);

	modalContent.appendChild(tabNav);
	modalContent.appendChild(listContainer);

	const modal = createModal({
		title: `@${username}`,
		content: modalContent,
		className: "followers-modal-overlay",
	});

	let currentTab = initialType;

	const loadTabContent = async (type) => {
		followersList.innerHTML = "";

		let count = 0;
		if (type === "followers") {
			count = currentProfile?.profile?.follower_count || 0;
		} else if (type === "following") {
			count = currentProfile?.profile?.following_count || 0;
		}

		const initialSkeletonCount = Math.min(Math.max(count, 1), 20);
		const skeletons = showSkeletons(
			followersList,
			createFollowerSkeleton,
			initialSkeletonCount,
		);

		try {
			let users = [];
			let endpoint = "";
			let mutualCount = 0;

			if (type === "followers") {
				endpoint = `/profile/${username}/followers`;
				const data = await query(endpoint);
				if (data.error) throw new Error(data.error);
				users = data.followers || [];
			} else if (type === "following") {
				endpoint = `/profile/${username}/following`;
				const data = await query(endpoint);
				if (data.error) throw new Error(data.error);
				users = data.following || [];
			} else if (type === "mutuals") {
				endpoint = `/profile/${username}/followers-you-know`;
				const data = await query(endpoint);
				if (data.error) throw new Error(data.error);
				users = data.followersYouKnow || [];
				mutualCount = data.count || 0;

				removeSkeletons(skeletons);
				const correctSkeletonCount = Math.min(Math.max(mutualCount, 1), 20);
				if (correctSkeletonCount !== initialSkeletonCount) {
					const newSkeletons = showSkeletons(
						followersList,
						createFollowerSkeleton,
						correctSkeletonCount,
					);
					removeSkeletons(newSkeletons);
				}
			} else {
				removeSkeletons(skeletons);
			}

			if (type !== "mutuals") {
				removeSkeletons(skeletons);
			}

			if (users.length === 0) {
				const emptyDiv = document.createElement("div");
				emptyDiv.className = "empty-followers";
				if (type === "mutuals") {
					emptyDiv.textContent = "No mutual followers";
				} else {
					emptyDiv.textContent = `No ${type} yet`;
				}
				followersList.appendChild(emptyDiv);
			} else {
				users.forEach((user) => {
					const item = createUserListItem(user, () => {
						modal.close();
						openProfile(user.username);
					});
					followersList.appendChild(item);
				});
			}
		} catch (error) {
			console.error(`Error loading ${type}:`, error);
			removeSkeletons(skeletons);
			const errorDiv = document.createElement("div");
			errorDiv.className = "empty-followers";
			errorDiv.textContent = `Failed to load ${type}`;
			followersList.appendChild(errorDiv);
		}
	};

	tabNav.addEventListener("click", (e) => {
		const tabBtn = e.target.closest(".followers-modal-tab");
		if (!tabBtn) return;

		const newTab = tabBtn.dataset.tab;
		if (newTab === currentTab) return;

		tabNav.querySelectorAll(".followers-modal-tab").forEach((t) => {
			t.classList.remove("active");
		});
		tabBtn.classList.add("active");
		currentTab = newTab;

		updateTabIndicator(tabNav, tabBtn);
		loadTabContent(newTab);
	});

	setTimeout(() => {
		const activeTab = tabNav.querySelector(".active");
		if (activeTab) {
			updateTabIndicator(tabNav, activeTab);
		}
	}, 50);

	loadTabContent(initialType);
}

export { openProfile };
