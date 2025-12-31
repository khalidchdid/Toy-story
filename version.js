(function(){
  const V = "19";
  // page
  if (typeof window !== "undefined") window.TOY_STORY_VERSION = V;
  // service worker
  if (typeof self !== "undefined") self.TOY_STORY_VERSION = V;
})();
