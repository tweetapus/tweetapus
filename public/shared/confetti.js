export default (element, config = {}) => {
	var defaults = {
		gravity: 10,
		particle_count: 75,
		particle_size: 1,
		explosion_power: 25,
		fade: false,
	};
	var CONFIG = Object.assign({}, defaults, config);

	var canvas = document.createElement("canvas");
	var ctx = canvas.getContext("2d");
	canvas.width = 2 * window.innerWidth;
	canvas.height = 2 * window.innerHeight;
	canvas.style.position = "fixed";
	canvas.style.top = "0";
	canvas.style.left = "0";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	canvas.style.margin = "0";
	canvas.style.padding = "0";
	canvas.style.zIndex = "999999999";
	canvas.style.pointerEvents = "none";
	document.body.appendChild(canvas);

	var particles = [];

	function Vec(x, y) {
		this.x = x || 0;
		this.y = y || 0;
	}

	function Particle(origin) {
		this.size = new Vec(
			(16 * Math.random() + 4) * CONFIG.particle_size,
			(4 * Math.random() + 4) * CONFIG.particle_size,
		);
		this.position = new Vec(
			origin.x - this.size.x / 2,
			origin.y - this.size.y / 2,
		);
		this.velocity = generateVelocity();
		this.rotation = 360 * Math.random();
		this.rotation_speed = 10 * (Math.random() - 0.5);
		this.hue = 360 * Math.random();
		this.opacity = 100;
		this.lifetime = Math.random() + 0.25;
	}
	Particle.prototype.update = function (dt) {
		this.velocity.y +=
			CONFIG.gravity * (this.size.y / (10 * CONFIG.particle_size)) * dt;
		this.velocity.x += 25 * (Math.random() - 0.5) * dt;
		this.velocity.y *= 0.98;
		this.velocity.x *= 0.98;
		this.position.x += this.velocity.x;
		this.position.y += this.velocity.y;
		this.rotation += this.rotation_speed;
		if (CONFIG.fade) this.opacity -= this.lifetime;
	};
	Particle.prototype.outOfBounds = function () {
		return this.position.y - 2 * this.size.x > 2 * window.innerHeight;
	};
	Particle.prototype.draw = function () {
		ctx.save();
		ctx.beginPath();
		ctx.translate(
			this.position.x + this.size.x / 2,
			this.position.y + this.size.y / 2,
		);
		ctx.rotate((this.rotation * Math.PI) / 180);
		ctx.rect(-this.size.x / 2, -this.size.y / 2, this.size.x, this.size.y);
		ctx.fillStyle = `hsla(${this.hue}deg, 90%, 65%, ${this.opacity}%)`;
		ctx.fill();
		ctx.restore();
	};

	function generateVelocity() {
		var x = Math.random() - 0.5;
		var y = Math.random() - 0.7;
		var len = Math.sqrt(x * x + y * y);
		x /= len;
		y /= len;
		return new Vec(
			x * (Math.random() * CONFIG.explosion_power),
			y * (Math.random() * CONFIG.explosion_power),
		);
	}

	var rect = element.getBoundingClientRect();
	var origin = new Vec(
		2 * (rect.left + rect.width / 2),
		2 * (rect.top + rect.height / 2),
	);

	for (let i = 0; i < CONFIG.particle_count; i++) {
		particles.push(new Particle(origin));
	}

	var lastTime = performance.now();
	function animate(time) {
		var dt = (time - lastTime) / 1000;
		lastTime = time;
		ctx.clearRect(0, 0, 2 * window.innerWidth, 2 * window.innerHeight);

		for (let i = particles.length - 1; i >= 0; i--) {
			particles[i].update(dt);
			if (particles[i].outOfBounds()) {
				particles.splice(i, 1);
			} else {
				particles[i].draw();
			}
		}

		if (particles.length > 0) {
			requestAnimationFrame(animate);
		} else {
			canvas.remove();
		}
	}
	requestAnimationFrame(animate);
};
