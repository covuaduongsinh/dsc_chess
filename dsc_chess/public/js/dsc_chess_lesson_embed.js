/**
 * dsc_chess_lesson_embed.js
 *
 * Quét các trang website Frappe (bao gồm Frappe LMS portal) sau khi đã render,
 * tìm marker văn bản thuần "FEN: ..." / "PGN: ..." trong nội dung bài học,
 * và mount bàn cờ tương tác tại chỗ. Không đụng đến source code app `lms`.
 *
 * Thư viện cm-chessboard (MIT) và chess.js (BSD-2-Clause) được nạp động (lazy)
 * từ jsDelivr CDN, chỉ khi thực sự tìm thấy marker trên trang, để không tốn
 * băng thông/thời gian tải trên các trang không có nội dung cờ vua.
 */
(function () {
  "use strict";

  var CM_CHESSBOARD_URL = "https://cdn.jsdelivr.net/npm/cm-chessboard@8.15.1/src/Chessboard.js";
  var CM_CHESSBOARD_CSS = "https://cdn.jsdelivr.net/npm/cm-chessboard@8.15.1/assets/chessboard.css";
  var CM_ASSETS_URL = "https://cdn.jsdelivr.net/npm/cm-chessboard@8.15.1/assets/";
  var CHESS_JS_URL = "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/esm/chess.js";

  var RE_FEN = /^FEN:\s*(.+)$/i;
  var RE_PGN = /^PGN:\s*([\s\S]+)$/i;

  var mounted = new WeakSet();
  var libsPromise = null;
  var cssInjected = false;

  function injectCssOnce() {
    if (cssInjected) return;
    cssInjected = true;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CM_CHESSBOARD_CSS;
    document.head.appendChild(link);
  }

  function loadLibs() {
    if (!libsPromise) {
      injectCssOnce();
      libsPromise = Promise.all([
        import(/* webpackIgnore: true */ CM_CHESSBOARD_URL),
        import(/* webpackIgnore: true */ CHESS_JS_URL),
      ]).then(function (mods) {
        return { Chessboard: mods[0].Chessboard, Chess: mods[1].Chess };
      });
    }
    return libsPromise;
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  function findMarkerElements(root) {
    var out = [];
    // Chỉ xét node "lá" (children.length === 0) để giảm số phần tử phải kiểm tra
    // và tránh xử lý trùng cha/con. Dùng textContent (KHÔNG dùng innerText — innerText
    // buộc trình duyệt tính lại layout đồng bộ cho từng phần tử, rất tốn kém khi quét
    // hàng trăm node mỗi lần DOM thay đổi, từng gây treo trang biên tập bài học).
    var nodes = root.querySelectorAll("p, div");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children && el.children.length > 0) continue;
      if (mounted.has(el)) continue;
      if (el.closest && el.closest("[data-dsc-chess]")) continue;
      var raw = el.textContent;
      if (!raw || raw.length < 5 || raw.length > 4000) continue;
      // So khớp nhanh trước khi trim/regex đầy đủ để tránh xử lý dư thừa.
      if (raw.indexOf("FEN:") === -1 && raw.indexOf("fen:") === -1 &&
          raw.indexOf("PGN:") === -1 && raw.indexOf("pgn:") === -1) continue;
      var text = raw.trim();
      var m = RE_FEN.exec(text);
      if (m) {
        out.push({ el: el, type: "fen", value: m[1].trim() });
        continue;
      }
      m = RE_PGN.exec(text);
      if (m) {
        out.push({ el: el, type: "pgn", value: m[1].trim() });
      }
    }
    return out;
  }

  function markMounted(el) {
    mounted.add(el);
  }

  function showError(container, message) {
    container.textContent = message;
    container.classList.add("dsc-chess-error");
  }

  function mountBoard(placeholder, fen) {
    markMounted(placeholder);
    placeholder.style.display = "none";
    var box = document.createElement("div");
    box.setAttribute("data-dsc-chess", "board");
    box.className = "dsc-chess-board";
    placeholder.parentNode.insertBefore(box, placeholder.nextSibling);

    loadLibs()
      .then(function (libs) {
        try {
          new libs.Chessboard(box, {
            position: fen,
            assetsUrl: CM_ASSETS_URL,
          });
        } catch (e) {
          showError(box, "Không dựng được sơ đồ thế cờ (FEN không hợp lệ?).");
          console.warn("dsc_chess: lỗi mount FEN board:", e, fen);
        }
      })
      .catch(function (e) {
        showError(box, "Không tải được thư viện bàn cờ (kiểm tra kết nối mạng).");
        console.warn("dsc_chess: lỗi tải thư viện:", e);
      });
  }

  function mountPgnViewer(placeholder, pgnText) {
    markMounted(placeholder);
    placeholder.style.display = "none";

    var wrap = document.createElement("div");
    wrap.setAttribute("data-dsc-chess", "pgn");
    wrap.className = "dsc-chess-pgn";

    var boardBox = document.createElement("div");
    boardBox.className = "dsc-chess-board";
    wrap.appendChild(boardBox);

    var controls = document.createElement("div");
    controls.className = "dsc-chess-controls";
    var btnFirst = document.createElement("button");
    btnFirst.type = "button";
    btnFirst.textContent = "|<";
    var btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.textContent = "<";
    var btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.textContent = ">";
    var btnLast = document.createElement("button");
    btnLast.type = "button";
    btnLast.textContent = ">|";
    var moveLabel = document.createElement("span");
    moveLabel.className = "dsc-chess-move-label";
    controls.appendChild(btnFirst);
    controls.appendChild(btnPrev);
    controls.appendChild(moveLabel);
    controls.appendChild(btnNext);
    controls.appendChild(btnLast);
    wrap.appendChild(controls);

    placeholder.parentNode.insertBefore(wrap, placeholder.nextSibling);

    loadLibs()
      .then(function (libs) {
        var chess;
        var history;
        try {
          chess = new libs.Chess();
          chess.loadPgn(pgnText, { strict: false });
          history = chess.history({ verbose: true });
          if (!history.length) throw new Error("PGN không có nước đi hợp lệ");
        } catch (e) {
          showError(boardBox, "PGN không hợp lệ, không thể xem lại ván cờ.");
          controls.style.display = "none";
          console.warn("dsc_chess: lỗi parse PGN:", e, pgnText);
          return;
        }

        var startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        // Nếu PGN có set-up FEN riêng (hiếm ở movetext thuần), dùng luôn từ chess.js.
        var fens = [startFen].concat(history.map(function (h) { return h.after; }));

        var idx = 0;
        var board;
        try {
          board = new libs.Chessboard(boardBox, {
            position: fens[0],
            assetsUrl: CM_ASSETS_URL,
          });
        } catch (e) {
          showError(boardBox, "Không dựng được bàn cờ.");
          console.warn("dsc_chess: lỗi mount PGN board:", e);
          return;
        }

        function render() {
          board.setPosition(fens[idx], true);
          moveLabel.textContent =
            idx === 0 ? "Bắt đầu" : idx + " / " + history.length + " (" + history[idx - 1].san + ")";
          btnFirst.disabled = btnPrev.disabled = idx === 0;
          btnLast.disabled = btnNext.disabled = idx === fens.length - 1;
        }

        btnFirst.onclick = function () { idx = 0; render(); };
        btnPrev.onclick = function () { if (idx > 0) idx--; render(); };
        btnNext.onclick = function () { if (idx < fens.length - 1) idx++; render(); };
        btnLast.onclick = function () { idx = fens.length - 1; render(); };

        render();
      })
      .catch(function (e) {
        showError(boardBox, "Không tải được thư viện cờ vua (kiểm tra kết nối mạng).");
        console.warn("dsc_chess: lỗi tải thư viện:", e);
      });
  }

  function scan() {
    var found = findMarkerElements(document.body);
    for (var i = 0; i < found.length; i++) {
      var item = found[i];
      try {
        if (item.type === "fen") mountBoard(item.el, item.value);
        else mountPgnViewer(item.el, item.value);
      } catch (e) {
        console.warn("dsc_chess: lỗi không mong muốn khi mount:", e);
      }
    }
  }

  var debouncedScan = debounce(scan, 400);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  try {
    new MutationObserver(debouncedScan).observe(document.body, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    console.warn("dsc_chess: MutationObserver không khởi tạo được:", e);
  }
})();
