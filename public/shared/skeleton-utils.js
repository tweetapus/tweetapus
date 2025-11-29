export function createTweetSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-tweet skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-tweet-header">
		  <div class="skeleton-loader skeleton-tweet-avatar"></div>
		  <div class="skeleton-tweet-header-container">
			  <div class="skeleton-loader skeleton-tweet-name"></div>
			  <div class="skeleton-loader skeleton-tweet-username"></div>
			</div>
		</div>
		<div class="skeleton-tweet-content">
			<div class="skeleton-loader skeleton-tweet-text"></div>
			<div class="skeleton-loader skeleton-tweet-text"></div>
			<div class="skeleton-loader skeleton-tweet-text"></div>
			<div class="skeleton-tweet-actions">
				<div class="skeleton-loader skeleton-tweet-action"></div>
				<div class="skeleton-loader skeleton-tweet-action"></div>
				<div class="skeleton-loader skeleton-tweet-action"></div>
			</div>
		</div>
	`;
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

export function createProfileSkeleton() {
	const skeleton = document.createElement("div");
	skeleton.className = "skeleton-profile-header skeleton-container";
	skeleton.innerHTML = `
		<div class="skeleton-loader skeleton-profile-banner"></div>
		<div class="skeleton-profile-info">
			<div class="skeleton-loader skeleton-profile-avatar"></div>
			<div class="skeleton-loader skeleton-profile-name"></div>
			<div class="skeleton-loader skeleton-profile-username"></div>
			<div class="skeleton-loader skeleton-profile-bio"></div>
			<div class="skeleton-loader skeleton-profile-bio"></div>
			<div class="skeleton-profile-stats">
				<div class="skeleton-loader skeleton-profile-stat"></div>
				<div class="skeleton-loader skeleton-profile-stat"></div>
			</div>
		</div>
	`;
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
	skeletons.forEach((skeleton) => { skeleton.remove(); });
}
