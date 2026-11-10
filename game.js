(function () {
  "use strict";

  var CIRCLE_RADIUS = 32;
  var SHOW_CORRECT_TIME = 2000;
  var FLASH_DURATION = 400;
  var AREA_PADDING = 50;
  var LEVEL_DONE_DELAY = 1500;

  function getMemorizeTime(level) {
    // 3 másodperc + minden szinttel 800ms, max 15 másodpercig nő
    return Math.min(3000 + (level - 1) * 800, 15000);
  }

  // ---------- DOM ----------
  var el = {
    flash: document.getElementById("flash"),
    confetti: document.getElementById("confetti"),
    level: document.getElementById("level"),
    count: document.getElementById("count"),
    lastChance: document.getElementById("lastChance"),
    phase: document.getElementById("phase"),
    area: document.getElementById("area"),
    bar: document.getElementById("bar"),
    gameOver: document.getElementById("gameOver"),
    bestLevel: document.getElementById("bestLevel"),
    bestCount: document.getElementById("bestCount"),
    newGame: document.getElementById("newGame"),
  };

  // ---------- State ----------
  var state = {
    level: 1,
    circles: [],
    phase: "memorize", // memorize | play | correct | showCorrect | gameOver
    nextExpected: 1,
    retryUsed: false,
    bestLevel: 1,
    clicked: {},
  };

  var phaseTimer = null;
  var flashTimer = null;
  var confettiFrame = 0;
  var confettiPieces = [];
  var circleButtons = [];

  function circleCount() {
    return state.level + 2;
  }

  // ---------- Generation ----------
  function generateCircles(count, areaWidth, areaHeight) {
    var circles = [];
    var numbers = [];
    for (var n = 1; n <= count; n++) numbers.push(n);

    for (var i = numbers.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = numbers[i];
      numbers[i] = numbers[j];
      numbers[j] = t;
    }

    function randPos() {
      return {
        x: AREA_PADDING + Math.random() * (areaWidth - 2 * AREA_PADDING),
        y: AREA_PADDING + Math.random() * (areaHeight - 2 * AREA_PADDING),
      };
    }

    var maxAttempts = 500;
    for (var k = 0; k < count; k++) {
      var placed = false;
      for (var attempt = 0; attempt < maxAttempts; attempt++) {
        var p = randPos();
        var overlaps = circles.some(function (c) {
          var dx = c.x - p.x;
          var dy = c.y - p.y;
          return Math.sqrt(dx * dx + dy * dy) < CIRCLE_RADIUS * 2.5;
        });
        if (!overlaps) {
          circles.push({ id: k, x: p.x, y: p.y, number: numbers[k] });
          placed = true;
          break;
        }
      }
      if (!placed) {
        var q = randPos();
        circles.push({ id: k, x: q.x, y: q.y, number: numbers[k] });
      }
    }
    return circles;
  }

  // ---------- Sounds ----------
  var audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playErrorSound() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio not available
    }
  }

  function playSuccessSound() {
    try {
      var ctx = getAudio();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio not available
    }
  }

  // ---------- Effects ----------
  function flash(color) {
    clearTimeout(flashTimer);
    el.flash.className = "flash " + color;
    el.flash.hidden = false;
    flashTimer = setTimeout(function () {
      el.flash.hidden = true;
    }, FLASH_DURATION);
  }

  var CONFETTI_COLORS = [
    "#ff0", "#f0f", "#0ff", "#f00", "#0f0", "#00f", "#ff8800", "#ff0088",
  ];

  function startConfetti(count) {
    stopConfetti();
    for (var i = 0; i < count; i++) {
      var size = Math.random() * 8 + 4;
      var node = document.createElement("div");
      node.className = "confetti-piece";
      node.style.width = size + "px";
      node.style.height = size * 1.5 + "px";
      node.style.backgroundColor =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      el.confetti.appendChild(node);
      confettiPieces.push({
        node: node,
        x: 50 + Math.random() * 40 - 20,
        y: -10,
        rotation: Math.random() * 360,
        dx: (Math.random() - 0.5) * 4,
        dy: Math.random() * 3 + 2,
      });
    }
    drawConfetti();
    confettiFrame = requestAnimationFrame(animateConfetti);
  }

  function drawConfetti() {
    for (var i = 0; i < confettiPieces.length; i++) {
      var c = confettiPieces[i];
      c.node.style.left = c.x + "%";
      c.node.style.top = c.y + "%";
      c.node.style.transform = "rotate(" + c.rotation + "deg)";
    }
  }

  function animateConfetti() {
    confettiPieces = confettiPieces.filter(function (c) {
      c.x += c.dx * 0.3;
      c.y += c.dy * 0.5;
      c.rotation += 3;
      if (c.y >= 120) {
        c.node.remove();
        return false;
      }
      return true;
    });
    drawConfetti();
    if (confettiPieces.length > 0) {
      confettiFrame = requestAnimationFrame(animateConfetti);
    }
  }

  function stopConfetti() {
    cancelAnimationFrame(confettiFrame);
    confettiPieces = [];
    el.confetti.innerHTML = "";
  }

  // ---------- Game flow ----------
  function setPhase(phase) {
    clearTimeout(phaseTimer);
    state.phase = phase;

    if (phase === "memorize") {
      phaseTimer = setTimeout(function () {
        setPhase("play");
      }, getMemorizeTime(state.level));
    } else if (phase === "showCorrect") {
      phaseTimer = setTimeout(function () {
        if (state.retryUsed) {
          setPhase("gameOver");
        } else {
          state.retryUsed = true;
          startRound();
        }
      }, SHOW_CORRECT_TIME);
    }
    render();
  }

  function startRound() {
    clearTimeout(phaseTimer);
    state.phase = "memorize";
    el.gameOver.hidden = true;
    el.area.hidden = false;
    // Defer one frame so the game area is laid out first (mobile width=0 bug)
    requestAnimationFrame(function () {
      var w = el.area.clientWidth || 600;
      var h = el.area.clientHeight || 500;
      state.circles = generateCircles(circleCount(), w, h);
      state.nextExpected = 1;
      state.clicked = {};
      el.flash.hidden = true;
      stopConfetti();
      buildCircles();
      restartBar();
      setPhase("memorize");
    });
  }

  function restartBar() {
    el.bar.hidden = true;
    el.bar.style.animationDuration = getMemorizeTime(state.level) + "ms";
    void el.bar.offsetWidth; // reflow to restart the animation
    el.bar.hidden = false;
  }

  function handleCircleClick(circle) {
    if (state.phase !== "play" || state.clicked[circle.id]) return;

    if (circle.number === state.nextExpected) {
      state.clicked[circle.id] = true;

      if (state.nextExpected === circleCount()) {
        // Level complete!
        flash("green");
        playSuccessSound();
        startConfetti(80);
        var newLevel = state.level + 1;
        if (newLevel > state.bestLevel) state.bestLevel = newLevel;
        setPhase("correct");
        phaseTimer = setTimeout(function () {
          state.level = newLevel;
          state.retryUsed = false;
          startRound();
        }, LEVEL_DONE_DELAY);
      } else {
        state.nextExpected++;
        render();
      }
    } else {
      // Wrong click
      flash("red");
      playErrorSound();
      setPhase("showCorrect");
    }
  }

  function handleNewGame() {
    state.level = 1;
    state.retryUsed = false;
    state.bestLevel = 1;
    startRound();
  }

  // ---------- Rendering ----------
  function buildCircles() {
    circleButtons.forEach(function (b) {
      b.remove();
    });
    circleButtons = state.circles.map(function (circle) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.style.left = circle.x - CIRCLE_RADIUS + "px";
      btn.style.top = circle.y - CIRCLE_RADIUS + "px";
      btn.style.width = CIRCLE_RADIUS * 2 + "px";
      btn.style.height = CIRCLE_RADIUS * 2 + "px";
      btn.addEventListener("click", function () {
        handleCircleClick(circle);
      });
      el.area.appendChild(btn);
      return btn;
    });
  }

  function render() {
    var phase = state.phase;
    var showNumbers =
      phase === "memorize" || phase === "showCorrect" || phase === "correct";

    el.level.textContent = state.level;
    el.count.textContent = circleCount();
    el.lastChance.hidden = !state.retryUsed;

    // Phase indicator
    var html = "";
    if (phase === "memorize") {
      html = '<span class="memorize">👀 Jegyezd meg a számok helyét!</span>';
    } else if (phase === "play") {
      html =
        '<span class="play">Kattints sorrendben: <b>' +
        state.nextExpected +
        "</b></span>";
    } else if (phase === "showCorrect") {
      html = '<span class="wrong">❌ Hibás! Íme a helyes sorrend...</span>';
    } else if (phase === "correct") {
      html = '<span class="correct">✅ Szint teljesítve!</span>';
    }
    el.phase.innerHTML = html;

    // Game area vs. game over
    var over = phase === "gameOver";
    el.area.hidden = over;
    el.gameOver.hidden = !over;
    if (over) {
      el.bestLevel.textContent = state.bestLevel;
      el.bestCount.textContent = state.bestLevel + 2;
      return;
    }

    el.bar.hidden = phase !== "memorize";

    state.circles.forEach(function (circle, i) {
      var btn = circleButtons[i];
      if (!btn) return;
      var isClicked = !!state.clicked[circle.id];
      var isHint =
        phase === "showCorrect" && circle.number === state.nextExpected;

      var cls;
      if (isClicked) cls = "done";
      else if (isHint) cls = "hint";
      else if (phase === "play") cls = "playable";
      else if (showNumbers) cls = "shown";
      else cls = "idle";
      btn.className = "circle " + cls;
      btn.disabled = phase !== "play" || isClicked;

      var label = showNumbers || isClicked ? String(circle.number) : "?";
      var span = btn.firstChild;
      if (!span) {
        span = document.createElement("span");
        btn.appendChild(span);
      }
      span.textContent = label;
      span.className = label === "?" ? "q" : "";
    });
  }

  el.newGame.addEventListener("click", handleNewGame);
  startRound();
})();
