/* Simple URL Server — 埋め込みローダー
   使い方: <script src="https://tgh59njvyp-ship-it.github.io/simple-url-server-redesigned/embed.js" data-key="発行キー"></script>
   スクリプトを置いた場所に、公開フォーム（iframe）が挿入されます。 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-key") || "";
  var height = script.getAttribute("data-height") || "620";
  var base = script.src.replace(/embed\.js(\?.*)?$/, "");
  var iframe = document.createElement("iframe");
  iframe.src = base + "embed.html?key=" + encodeURIComponent(key);
  iframe.title = "Simple URL Server — サイト公開フォーム";
  iframe.setAttribute("loading", "lazy");
  iframe.style.cssText = "width:100%;max-width:640px;height:" + parseInt(height, 10) + "px;border:1px solid #e6e1d3;border-radius:12px;background:#fbfaf7;display:block";
  if (script.parentNode) script.parentNode.insertBefore(iframe, script.nextSibling);
})();
