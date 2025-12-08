export function createTweetSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-tweet skeleton-container";

	const header = document.createElement("div");
	header.className = "skeleton-tweet-header";

	const avatar = document.createElement("div");
	avatar.className = "skeleton-loader skeleton-tweet-avatar";
	header.appendChild(avatar);

	const headerInfo = document.createElement("div");
	headerInfo.className = "skeleton-tweet-header-info";

	const name = document.createElement("div");
	name.className = "skeleton-loader skeleton-tweet-name";
	headerInfo.appendChild(name);

	const username = document.createElement("div");
	username.className = "skeleton-loader skeleton-tweet-username";
	headerInfo.appendChild(username);

	header.appendChild(headerInfo);
	skeleton.appendChild(header);

	const content = document.createElement("div");
	content.className = "skeleton-tweet-content";

	for (let i = 0; i < 3; i++) {
		const line = document.createElement("div");
		line.className = "skeleton-loader skeleton-tweet-text";
		content.appendChild(line);
	}

	skeleton.appendChild(content);

	const interactions = document.createElement("div");
	interactions.className = "skeleton-tweet-interactions";

	for (let i = 0; i < 3; i++) {
		const action = document.createElement("div");
		action.className = "skeleton-loader skeleton-tweet-action";
		interactions.appendChild(action);
	}

	skeleton.appendChild(interactions);

	return skeleton;
}

export function createDMConversationSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-dm-conversation skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-loader skeleton-dm-avatar"></div>
		<div class="skeleton-dm-content">
			<div class="skeleton-loader skeleton-dm-name"></div>
			<div class="skeleton-loader skeleton-dm-message"></div>
		</div>
		<div class="skeleton-loader skeleton-dm-time"></div>
	`;
	return skeleton;
}

export function createDMMessageSkeleton(isOwn = false) {
	const skeleton = document.createElement("div");
	skeleton.className = `skeleton-dm-msg skeleton-container${isOwn ? " own" : ""}`;
	const avatar = isOwn
		? ""
		: '<div class="skeleton-loader skeleton-dm-msg-avatar"></div>';
	skeleton.innerHTML = `
		${avatar}
		<div class="skeleton-dm-msg-wrapper">
			<div class="skeleton-loader skeleton-dm-msg-bubble"></div>
			<div class="skeleton-loader skeleton-dm-msg-time"></div>
		</div>
	`;
	return skeleton;
}

export function createCommunitySkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-community skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-loader skeleton-community-banner"></div>
		<div class="skeleton-community-content">
			<div class="skeleton-loader skeleton-community-icon"></div>
			<div class="skeleton-community-info">
				<div class="skeleton-loader skeleton-community-name"></div>
				<div class="skeleton-loader skeleton-community-desc"></div>
				<div class="skeleton-loader skeleton-community-meta"></div>
			</div>
		</div>
	`;
	return skeleton;
}

export function createNotificationSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-notification skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-notification-header">
			<div class="skeleton-loader skeleton-notification-icon"></div>
			<div class="skeleton-loader skeleton-notification-avatar"></div>
		</div>
		<div class="skeleton-notification-content">
			<div class="skeleton-loader skeleton-notification-text"></div>
			<div class="skeleton-loader skeleton-notification-text-short"></div>
		</div>
	`;
	return skeleton;
}

export function createUserSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-user skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-loader skeleton-user-avatar"></div>
		<div class="skeleton-user-info">
			<div class="skeleton-loader skeleton-user-name"></div>
			<div class="skeleton-loader skeleton-user-username"></div>
		</div>
	`;
	return skeleton;
}

export function createNewsSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-news skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-loader skeleton-news-title"></div>
		<div class="skeleton-loader skeleton-news-text"></div>
		<div class="skeleton-loader skeleton-news-text"></div>
		<div class="skeleton-loader skeleton-news-text-short"></div>
	`;
	return skeleton;
}

export function createArticleSkeleton() {
	const skeleton = document.createElement("article");
	skeleton.className = "skeleton-article skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-loader skeleton-article-cover"></div>
		<div class="skeleton-article-body">
			<div class="skeleton-loader skeleton-article-title"></div>
			<div class="skeleton-loader skeleton-article-excerpt"></div>
			<div class="skeleton-loader skeleton-article-excerpt-short"></div>
			<div class="skeleton-article-meta">
				<div class="skeleton-loader skeleton-article-avatar"></div>
				<div class="skeleton-loader skeleton-article-author"></div>
				<div class="skeleton-loader skeleton-article-date"></div>
			</div>
		</div>
	`;
	return skeleton;
}

export function createProfileSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-profile skeleton-container";

	const banner = document.createElement("div");
	banner.className = "skeleton-loader skeleton-profile-banner";
	skeleton.appendChild(banner);

	const card = document.createElement("div");
	card.className = "skeleton-profile-card";

	const avatar = document.createElement("div");
	avatar.className = "skeleton-loader skeleton-profile-avatar";
	card.appendChild(avatar);

	const actions = document.createElement("div");
	actions.className = "skeleton-profile-actions";
	const actionBtn = document.createElement("div");
	actionBtn.className = "skeleton-loader skeleton-profile-action-btn";
	actions.appendChild(actionBtn);
	card.appendChild(actions);

	const info = document.createElement("div");
	info.className = "skeleton-profile-info";

	const nameRow = document.createElement("div");
	nameRow.className = "skeleton-profile-name-row";
	const name = document.createElement("div");
	name.className = "skeleton-loader skeleton-profile-name";
	nameRow.appendChild(name);
	info.appendChild(nameRow);

	const username = document.createElement("div");
	username.className = "skeleton-loader skeleton-profile-username";
	info.appendChild(username);

	const bio = document.createElement("div");
	bio.className = "skeleton-loader skeleton-profile-bio";
	info.appendChild(bio);

	const bio2 = document.createElement("div");
	bio2.className = "skeleton-loader skeleton-profile-bio short";
	info.appendChild(bio2);

	const meta = document.createElement("div");
	meta.className = "skeleton-profile-meta";
	const metaItem1 = document.createElement("div");
	metaItem1.className = "skeleton-loader skeleton-profile-meta-item";
	const metaItem2 = document.createElement("div");
	metaItem2.className = "skeleton-loader skeleton-profile-meta-item";
	meta.appendChild(metaItem1);
	meta.appendChild(metaItem2);
	info.appendChild(meta);

	const stats = document.createElement("div");
	stats.className = "skeleton-profile-stats";
	const stat1 = document.createElement("div");
	stat1.className = "skeleton-loader skeleton-profile-stat";
	const stat2 = document.createElement("div");
	stat2.className = "skeleton-loader skeleton-profile-stat";
	stats.appendChild(stat1);
	stats.appendChild(stat2);
	info.appendChild(stats);

	card.appendChild(info);
	skeleton.appendChild(card);

	const tabs = document.createElement("div");
	tabs.className = "skeleton-profile-tabs";
	for (let i = 0; i < 3; i++) {
		const tab = document.createElement("div");
		tab.className = "skeleton-profile-tab";
		const tabText = document.createElement("div");
		tabText.className = "skeleton-loader skeleton-profile-tab-text";
		tab.appendChild(tabText);
		tabs.appendChild(tab);
	}
	skeleton.appendChild(tabs);

	const tweets = document.createElement("div");
	tweets.className = "skeleton-profile-tweets";
	for (let i = 0; i < 3; i++) {
		tweets.appendChild(createTweetSkeleton());
	}
	skeleton.appendChild(tweets);

	return skeleton;
}

export function createFollowerSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-follower skeleton-container";

	const avatar = document.createElement("div");
	avatar.className = "skeleton-loader skeleton-follower-avatar";
	skeleton.appendChild(avatar);

	const info = document.createElement("div");
	info.className = "skeleton-follower-info";

	const name = document.createElement("div");
	name.className = "skeleton-loader skeleton-follower-name";
	info.appendChild(name);

	const username = document.createElement("div");
	username.className = "skeleton-loader skeleton-follower-username";
	info.appendChild(username);

	skeleton.appendChild(info);

	return skeleton;
}

export function createListSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-list skeleton-container";

	const icon = document.createElement("div");
	icon.className = "skeleton-loader skeleton-list-icon";
	skeleton.appendChild(icon);

	const info = document.createElement("div");
	info.className = "skeleton-list-info";

	const name = document.createElement("div");
	name.className = "skeleton-loader skeleton-list-name";
	info.appendChild(name);

	const desc = document.createElement("div");
	desc.className = "skeleton-loader skeleton-list-desc";
	info.appendChild(desc);

	skeleton.appendChild(info);

	return skeleton;
}

export function showSkeletons(container, skeletonCreator, count = 3) {
	const skeletons = [];
	for (let i = 0; i < count; i++) {
		const skeleton = skeletonCreator();
		container.appendChild(skeleton);
		skeletons.push(skeleton);
	}
	return skeletons;
}

export function removeSkeletons(skeletons) {
	skeletons.forEach((skeleton) => {
		skeleton.remove();
	});
}
