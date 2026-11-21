// 分段按鈕的滑動底色：選中的格子換了，深色底塊會滑過去，不是瞬間跳過去
// 兩個頁面共用 (build.py 把這個檔案帶入 page.html 與 artifact-page.html 的 /*SEG-SLIDE*/)
// 適用 .seg、.segs、.mini-segs、.num-seg 裡面的按鈕，選中狀態用 aria-pressed="true" 或 .on 都可以
// 聖遺物頁有些分段按鈕會整個重畫 (innerHTML)，所以記住每組上次的位置，新畫出來時從舊位置滑過去
(function () {
  const SEL = '.seg, .segs, .mini-segs, .num-seg';
  const last = new Map(); // 每組按鈕上次底塊的位置
  const keyOf = (box) => box.id || box.dataset.for || box.getAttribute('aria-label') || '';
  const pressed = (box) => box.querySelector(':scope > button[aria-pressed="true"], :scope > button.on');

  function place(box) {
    let t = box.querySelector(':scope > .seg-thumb');
    const fresh = !t;
    if (fresh) {
      t = document.createElement('span');
      t.className = 'seg-thumb no-anim';
      t.setAttribute('aria-hidden', 'true');
      box.prepend(t);
      box.classList.add('has-thumb');
    }
    lines(box, t);
    const on = pressed(box);
    if (!on || !on.offsetWidth) { t.style.opacity = '0'; return; }
    const pos = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const key = keyOf(box), prev = key && last.get(key);
    const set = (p) => { t.style.transform = `translate(${p.x}px, ${p.y}px)`; t.style.width = p.w + 'px'; t.style.height = p.h + 'px'; };
    if (fresh) {
      // 新的一組：有上次的位置就從那裡滑過去，沒有就直接放好
      set(prev && prev.w ? prev : pos);
      t.style.opacity = '1';
      void t.offsetWidth;
      t.classList.remove('no-anim');
      if (prev && prev.w) set(pos);
    } else {
      t.style.opacity = '1';
      set(pos);
    }
    if (key) last.set(key, pos);
  }

  // 按鈕之間的分隔線改成畫在底塊下面 (按鈕本身的 border-left 變透明)，底塊滑過去時會蓋住分隔線
  function lines(box, t) {
    const btns = [...box.querySelectorAll(':scope > button')];
    let ls = [...box.querySelectorAll(':scope > .seg-line')];
    while (ls.length < btns.length - 1) { const l = document.createElement('span'); l.className = 'seg-line'; l.setAttribute('aria-hidden', 'true'); box.insertBefore(l, t); ls.push(l); }
    while (ls.length > Math.max(0, btns.length - 1)) ls.pop().remove();
    ls.forEach((l, k) => { const b = btns[k + 1]; l.style.transform = `translateX(${b.offsetLeft}px)`; l.style.top = b.offsetTop + 'px'; l.style.height = b.offsetHeight + 'px'; });
  }

  const queue = new Set();
  let raf = 0;
  const schedule = (box) => {
    if (!box) return;
    queue.add(box);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const list = [...queue]; queue.clear(); list.forEach((b) => b.isConnected && place(b)); });
  };

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => schedule(e.target))) : null;
  const watch = (box) => { if (box.dataset.segWatch) return; box.dataset.segWatch = '1'; if (ro) ro.observe(box); schedule(box); };
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches(SEL)) watch(root);
    root.querySelectorAll(SEL).forEach(watch);
  };

  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach(scan);
      const box = m.target.nodeType === 1 && m.target.closest(SEL);
      if (box) schedule(box);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'class', 'hidden'] });
  scan(document.body);
  window.addEventListener('resize', () => document.querySelectorAll(SEL).forEach(schedule));
})();
